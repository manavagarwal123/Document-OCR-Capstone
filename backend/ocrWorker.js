const { createWorker } = require('tesseract.js');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs/promises');
const { Document } = require('./models');
const events = require('./events');
const searchEvents = require('./searchEvents');

// Get upload directory from environment or use default
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

const SSE_MAP = new Map();

function registerSSE(jobId, res) {
  SSE_MAP.set(jobId, res);
}

function unregisterSSE(jobId) {
  SSE_MAP.delete(jobId);
}

function emitProgress(jobId, data) {
  const res = SSE_MAP.get(jobId);
  if (!res) {
    console.log(`⚠️ No SSE client registered for jobId: ${jobId}`);
    return;
  }
  try {
    const eventData = `event: progress\ndata: ${JSON.stringify(data)}\n\n`;
    res.write(eventData);
    console.log(`📤 SSE progress sent for ${jobId}:`, data.status || 'update');
  } catch (err) {
    console.error(`❌ Error sending SSE for ${jobId}:`, err);
    // Remove dead connection
    SSE_MAP.delete(jobId);
  }
}

// Convert PDF to multiple images using pdf2pic (more reliable)
async function convertPdfToImages(pdfPath, outputDir, docId) {
  try {
    // Try using pdf2pic first
    try {
      const { fromPath } = require('pdf2pic');
      const options = {
        density: 300, // Higher density for better quality
        saveFilename: `page`,
        savePath: outputDir,
        format: 'png',
        width: 2400, // Increased width for better quality
        height: 3200, // Increased height for better quality
        maintainAspectRatio: true
      };

      const convert = fromPath(pdfPath, options);
      // Get total pages first
      const pageCount = (await convert.bulk(-1)).length;
      console.log(`Total pages in PDF: ${pageCount}`);
      
      // Convert each page individually to better handle errors
      const pages = [];
      for(let i = 1; i <= pageCount; i++) {
        try {
          const result = await convert(i);
          if (result && result.path) {
            pages.push(result);
            console.log(`Converted page ${i}/${pageCount}`);
          } else {
            throw new Error(`Failed to convert page ${i}`);
          }
        } catch (pageError) {
          console.warn(`Warning: Failed to convert page ${i}, skipping:`, pageError);
          // Create an empty image for failed pages to maintain page numbering
          const blankPath = path.join(outputDir, `page-${i}.png`);
          await sharp({
            create: {
              width: 2400,
              height: 3200,
              channels: 4,
              background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
          }).png().toFile(blankPath);
          pages.push({ path: blankPath });
        }
      }
      
      return pages.map((page, index) => page.path || path.join(outputDir, `page-${index + 1}.png`));
      
    } catch (pdf2picError) {
      console.log('pdf2pic failed, trying pdf-poppler...', pdf2picError);
      
      // Fallback to pdf-poppler
      const pdf = require('pdf-poppler');
      const opts = {
        format: 'png',
        out_dir: outputDir,
        out_prefix: 'page',
        page: null, // all pages
        density: 300, // Higher density
        scale: 2.0 // Scale up for better quality
      };

      await pdf.convert(pdfPath, opts);
      
      // Get the generated image files
      const files = await fs.readdir(outputDir);
      const imageFiles = files
        .filter(f => f.startsWith('page') && f.endsWith('.png'))
        .sort((a, b) => {
          // Improved page number extraction
          const getPageNum = (filename) => {
            const matches = filename.match(/[^\d]*(\d+)[^\d]*\.png$/i);
            return matches ? parseInt(matches[1], 10) : 0;
          };
          return getPageNum(a) - getPageNum(b);
        });

      if (imageFiles.length === 0) {
        throw new Error('No pages were converted');
      }

      console.log(`Converted ${imageFiles.length} pages using pdf-poppler`);
      return imageFiles.map(file => path.join(outputDir, file));
    }
  } catch (error) {
    console.error('PDF conversion error:', error);
    throw new Error(`PDF conversion failed: ${error.message}`);
  }
}

// Process single image page with OCR
async function processImagePage(doc, pageIndex, imagePath, language) {
  let worker;
  const pageNumber = pageIndex + 1;
  const docIdStr = doc._id.toString ? doc._id.toString() : String(doc._id);
  
  try {
    emitProgress(docIdStr, { 
      page: pageNumber, 
      status: 'processing',
      step: 'starting'
    });

    worker = createWorker({
      logger: m => {
        if (m.status === 'recognizing text') {
          emitProgress(docIdStr, { 
            page: pageNumber, 
            status: 'processing',
            step: 'ocr',
            ocrProgress: m.progress 
          });
        }
      }
    });

    emitProgress(docIdStr, { 
      page: pageNumber, 
      status: 'processing',
      step: 'loading-model'
    });

    await worker.load();
    await worker.loadLanguage(language);
    await worker.initialize(language);
    
    emitProgress(docIdStr, { 
      page: pageNumber, 
      status: 'processing',
      step: 'preprocessing'
    });

    // Preprocess image for better OCR
    let imageBuffer;
    try {
      imageBuffer = await sharp(imagePath)
        .rotate() // Auto-rotate based on EXIF
        .resize({ 
          width: 2400, // Increased resolution
          height: 3200,
          fit: 'inside',
          withoutEnlargement: true 
        })
        .sharpen() // Add sharpening
        .normalize() // Normalize contrast
        .grayscale() // Convert to grayscale
        .gamma(1.2) // Adjust gamma for better contrast
        .median(1) // Remove noise
        .toBuffer();
    } catch (processingError) {
      console.warn(`Image preprocessing failed for page ${pageNumber}:`, processingError);
      // If preprocessing fails, try minimal processing
      try {
        imageBuffer = await sharp(imagePath)
          .rotate()
          .grayscale()
          .toBuffer();
      } catch (minimalError) {
        console.warn('Minimal preprocessing failed, using original image:', minimalError);
        imageBuffer = await fs.readFile(imagePath);
      }
    }

    emitProgress(docIdStr, { 
      page: pageNumber, 
      status: 'processing',
      step: 'recognizing'
    });

    const { data: { text, confidence, words } } = await worker.recognize(imageBuffer);

    // Generate thumbnail with progress indicator
    try {
      // Thumbnail should be saved in the uploads directory (not in pages subdirectory)
      // Always save thumbnails in the main uploads directory
      const thumbnailPath = path.join(UPLOAD_DIR, `${doc.hash}-page-${pageNumber}.png`);
      await sharp(imagePath)
        .resize(200, 300, { 
          fit: 'inside',
          withoutEnlargement: true
        })
        .toFile(thumbnailPath);
      console.log(`✅ Thumbnail saved: ${thumbnailPath}`);
    } catch (thumbError) {
      console.warn(`⚠️ Thumbnail generation failed for page ${pageNumber}:`, thumbError);
    }

    // Calculate text statistics
    const wordCount = words ? words.length : text.split(/\s+/).filter(Boolean).length;
    const charCount = text.length;
    
    return {
      pageNumber,
      text: text || '',
      confidence: Number(confidence) || 0,
      status: 'done',
      processedAt: new Date(),
      meta: {
        wordCount,
        charCount,
        hasText: wordCount > 0
      }
    };
  } catch (error) {
    console.error(`Error processing page ${pageNumber}:`, error);
    throw error;
  } finally {
    if (worker) {
      try {
        emitProgress(docIdStr, { 
          page: pageNumber, 
          status: 'processing',
          step: 'cleanup'
        });
        await worker.terminate();
      } catch (terminateError) {
        console.warn(`Worker termination warning for page ${pageNumber}:`, terminateError);
      }
    }
  }
}

// Process single image file (non-PDF)
async function processSingleImage(doc, imagePath, language) {
  return await processImagePage(doc, 0, imagePath, language);
}

// Main document processing function
async function processDocument(docId, filePath) {
  // Convert to string for consistent handling
  const docIdStr = docId.toString ? docId.toString() : String(docId);
  
  console.log(`🚀 Starting OCR processing for document ${docIdStr}, file: ${filePath}`);
  
  const doc = await Document.findById(docId);
  if (!doc) {
    console.error(`❌ Document ${docIdStr} not found`);
    return;
  }

  let tempDir;
  
  try {
    doc.status = 'processing';
    doc.updatedAt = new Date();
    await doc.save();
    
    console.log(`📄 Document type: ${doc.mime}, Language: ${doc.language || 'eng'}`);
    emitProgress(docIdStr, { status: 'processing', docId: docIdStr });

    let imagePaths = [];
    tempDir = path.join(path.dirname(filePath), 'pages', docId.toString());

    // Create temporary directory for page images
    await fs.mkdir(tempDir, { recursive: true });

    if (doc.mime === 'application/pdf') {
      // Convert PDF to multiple images
      emitProgress(docIdStr, { status: 'converting_pdf', docId: docIdStr });
      console.log(`Converting PDF to images for document ${docIdStr}`);
      
      imagePaths = await convertPdfToImages(filePath, tempDir, docId);
      console.log(`PDF converted to ${imagePaths.length} pages`);
      
    } else if (doc.mime && doc.mime.startsWith('image/')) {
      // Single image - just use the original file
      imagePaths = [filePath];
    } else {
      throw new Error(`Unsupported file type: ${doc.mime}`);
    }

    // Initialize pages array
    doc.pages = new Array(imagePaths.length).fill(null).map((_, index) => ({
      pageNumber: index + 1,
      text: '',
      confidence: 0,
      status: 'pending',
      processedAt: null
    }));
    await doc.save();

        // Process each page sequentially to avoid memory issues
    let successfulPages = 0;
    let failedPages = 0;
    let totalConfidence = 0;
    
    for (let i = 0; i < imagePaths.length; i++) {
      const pageNum = i + 1;
      const maxRetries = 2; // Number of retries for failed pages
      let attempt = 0;
      let success = false;
      
      while (attempt < maxRetries && !success) {
        attempt++;
        
        emitProgress(docIdStr, { 
          page: pageNum, 
          status: 'starting_ocr', 
          currentPage: pageNum,
          totalPages: imagePaths.length,
          attempt: attempt,
          maxRetries: maxRetries
        });

        console.log(`Processing page ${pageNum}/${imagePaths.length} for document ${docIdStr} (attempt ${attempt}/${maxRetries})`);
        
        try {
          const pageResult = await processImagePage(doc, i, imagePaths[i], doc.language || 'eng');
          
          // Update the specific page
          doc.pages[i] = pageResult;
          doc.updatedAt = new Date();
          
          // Update document progress statistics
          successfulPages++;
          totalConfidence += pageResult.confidence;
          
          await doc.save();

          emitProgress(docIdStr, { 
            page: pageNum, 
            status: 'page_complete', 
            confidence: pageResult.confidence,
            currentPage: pageNum,
            totalPages: imagePaths.length,
            successfulPages,
            failedPages,
            averageConfidence: totalConfidence / successfulPages
          });

          // Notify any live search SSE listeners about this newly indexed page
          try {
            searchEvents.notifyPageProcessed(doc, pageResult);
          } catch (e) {
            console.warn('searchEvents notify error', e);
          }

          console.log(`Completed page ${pageNum} with confidence ${pageResult.confidence}%`);
          success = true;
          
        } catch (pageError) {
          console.error(`Failed to process page ${pageNum} (attempt ${attempt}/${maxRetries}):`, pageError);
          
          if (attempt === maxRetries) {
            // All retries failed, mark page as failed
            failedPages++;
            
            doc.pages[i] = {
              pageNumber: pageNum,
              text: '',
              confidence: 0,
              status: 'failed',
              error: pageError.message,
              processedAt: new Date(),
              attempts: attempt
            };
            await doc.save();
            
            emitProgress(docIdStr, { 
              page: pageNum, 
              status: 'page_failed', 
              error: pageError.message,
              currentPage: pageNum,
              totalPages: imagePaths.length,
              successfulPages,
              failedPages,
              attempt,
              maxRetries
            });
          } else {
            // Will retry
            console.log(`Retrying page ${pageNum}...`);
            // Short delay before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
    }
    
    // Update document with final statistics
    doc.meta = {
      ...doc.meta,
      totalPages: imagePaths.length,
      successfulPages,
      failedPages,
      averageConfidence: successfulPages > 0 ? totalConfidence / successfulPages : 0,
      completedAt: new Date()
    };

    // Check if any pages were successfully processed
    const completedPages = doc.pages.filter(p => p.status === 'done');
    if (completedPages.length === 0) {
      throw new Error('All pages failed to process');
    }

    doc.status = 'done';
    doc.updatedAt = new Date();
    await doc.save();

    const finalProgress = { 
      status: 'done', 
      docId: docIdStr, 
      totalPages: imagePaths.length,
      successfulPages: completedPages.length 
    };
    console.log(`✅ Document processing complete:`, finalProgress);
    emitProgress(docIdStr, finalProgress);

    // Broadcast global stats so connected clients update immediately
    try {
      await events.broadcastStats();
    } catch (e) {
      console.warn('Failed to broadcast stats after document done:', e);
    }

    console.log(`Successfully processed document ${docIdStr} with ${completedPages.length} pages`);

  } catch (err) {
    console.error('Document processing error:', err);
    
    // Update document status to failed
    try {
      const failedDoc = await Document.findById(docId);
      if (failedDoc) {
        failedDoc.status = 'failed';
        failedDoc.updatedAt = new Date();
        await failedDoc.save();
      }
    } catch (saveError) {
      console.error('Failed to update document status:', saveError);
    }
    
    emitProgress(docIdStr, { 
      status: 'failed', 
      docId: docIdStr, 
      error: String(err) 
    });
    
  } finally {
    // Cleanup temporary files
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        console.log(`Cleaned up temporary directory: ${tempDir}`);
      } catch (cleanupError) {
        console.warn('Cleanup warning:', cleanupError);
      }
    }
  }
}

module.exports = { processDocument, registerSSE, unregisterSSE, emitProgress };