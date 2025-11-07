// Simple backend: upload -> OCR -> store in MongoDB, and search
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const { fromPath } = require('pdf2pic'); // ✅ for PDF to image
const Tesseract = require('tesseract.js');

const PORT = process.env.PORT || 5001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ocrdb';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '52428800', 10); // 50MB

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ts = Date.now();
    cb(null, `${ts}-${file.originalname.replace(/\s+/g, '_')}`);
  }
});
const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE } });

const app = express();
app.use(cors());
app.use(express.json());

let db;
MongoClient.connect(MONGO_URI, { useUnifiedTopology: true })
  .then(client => {
    db = client.db();
    db.collection('documents').createIndex({ 'pages.text': 'text', title: 'text' });
    console.log('✅ Connected to MongoDB');
  })
  .catch(err => {
    console.error('❌ Mongo connect error', err);
    process.exit(1);
  });

app.get('/', (req, res) => res.json({ ok: true, msg: 'OCR Server Running' }));

// Helper: Convert ALL pages of a PDF to images and return their paths in order
async function pdfToImages(pdfPath, outputDir) {
  console.log('📄 Converting PDF -> multiple PNGs...');
  const options = {
    density: 200,
    saveFilename: 'page',
    savePath: outputDir,
    format: 'png',
    width: 1600,
    height: 2200
  };
  const converter = fromPath(pdfPath, options);
  // Use bulk(-1) to convert all pages; it returns an array of results
  const results = await converter.bulk(-1);
  const paths = results
    .map(r => r && r.path)
    .filter(Boolean);
  if (!paths.length) throw new Error('No pages converted from PDF');
  console.log(`✅ PDF converted: ${paths.length} pages`);
  return paths;
}

// Upload route — handles both images and PDFs
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const filePath = req.file.path;
    const origName = req.file.originalname;
    const language = (req.body.language || 'eng').trim();

    let pages = [];

    if (req.file.mimetype === 'application/pdf') {
      // Convert all pages then OCR each
      const imagePaths = await pdfToImages(filePath, path.dirname(filePath));
      for (let i = 0; i < imagePaths.length; i++) {
        const imgPath = imagePaths[i];
        const { data: { text, confidence } } = await Tesseract.recognize(
          imgPath,
          language,
          { logger: m => console.log(`page ${i+1}`, m.status, m.progress) }
        );
        pages.push({ pageNumber: i + 1, text: text || '', confidence: confidence || 0 });
      }
    } else {
      // Single image path -> preprocess then OCR
      const processedPath = filePath + '.proc.png';
      await sharp(filePath)
        .rotate()
        .resize({ width: 1600, withoutEnlargement: true })
        .grayscale()
        .normalize()
        .toFile(processedPath);
      const { data: { text, confidence } } = await Tesseract.recognize(
        processedPath,
        language,
        { logger: m => console.log(m.status, m.progress) }
      );
      pages = [{ pageNumber: 1, text: text || '', confidence: confidence || 0 }];
      try { fs.unlinkSync(processedPath); } catch (e) {}
    }

    // Save to MongoDB with all pages
    const doc = {
      title: req.body.title || origName,
      originalname: origName,
      filename: path.basename(filePath),
      createdAt: new Date(),
      pages
    };
    const result = await db.collection('documents').insertOne(doc);

    res.json({
      ok: true,
      docId: result.insertedId,
      textPreview: (pages[0]?.text || '').slice(0, 300),
      confidence: pages[0]?.confidence
    });
  } catch (err) {
    console.error('❌ Upload error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Fetch document by ID
app.get('/api/documents/:id', async (req, res) => {
  try {
    const doc = await db.collection('documents').findOne({ _id: new ObjectId(req.params.id) });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search documents
app.get('/api/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(50, parseInt(req.query.pageSize || '10', 10));

    if (!q) {
      return res.json({ results: [], page, pageSize });
    }

    const pipeline = [
      // Match documents containing the search term
      { $match: { $text: { $search: q } } },
      
      // Unwind pages array to search within individual pages
      { $unwind: '$pages' },
      
      // Match pages containing the search term
      {
        $match: {
          'pages.text': { $regex: q, $options: 'i' }
        }
      },

      // Group by page content to deduplicate identical pages
      {
        $group: {
          _id: '$pages.text', // Group by the actual text content
          docId: { $first: '$_id' },
          title: { $first: '$title' },
          filename: { $first: '$filename' },
          pageData: {
            $first: {
              pageNumber: '$pages.pageNumber',
              text: '$pages.text',
              confidence: '$pages.confidence',
              // Create a snippet around the matching text
              snippet: {
                $substrCP: [
                  '$pages.text',
                  {
                    $max: [
                      0,
                      {
                        $subtract: [
                          { $indexOfCP: [{ $toLower: '$pages.text' }, { $toLower: q }] },
                          100
                        ]
                      }
                    ]
                  },
                  300
                ]
              }
            }
          }
        }
      },

      // Reshape the results to match the expected format
      {
        $group: {
          _id: '$docId',
          title: { $first: '$title' },
          filename: { $first: '$filename' },
          pages: {
            $push: '$pageData'
          }
        }
      },
      
      // Sort by relevance
      { $sort: { score: { $meta: 'textScore' } } },
      
      // Pagination
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize }
    ];

    const results = await db.collection('documents').aggregate(pipeline).toArray();
    res.json({ results, page, pageSize });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`));