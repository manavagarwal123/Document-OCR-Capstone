import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

export default function Upload({ onUploadComplete }){
  const [file, setFile] = useState(null);
  const [language, setLanguage] = useState('eng');
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState(null);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [selectedPage, setSelectedPage] = useState(1);
  const evtSourceRef = useRef();
  const inputRef = useRef();
  const SERVER = 'http://localhost:5001';

  function handleChoose(e){
    const f = e.target.files[0];
    if (f) onFileSelected(f);
  }

  function onFileSelected(f) {
    setFile(f);
    setStatus('');
    setProgress(0);
    setJobId(null);
    setSelectedPage(1);

    // Proper & safe cleanup (prevents removeChild crash)
    if (preview && preview.url) {
      try { URL.revokeObjectURL(preview.url); } catch (err) {}
    }

    if (f.type && f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f);
      setPreview({
        url,
        name: f.name,
        size: f.size,
        pages: [{ pageNumber: 1, thumbnail: url }]
      });
    } else {
      setPreview({ url: null, name: f.name, size: f.size, pages: null });
    }
  }

  function onDrop(e){
    e.preventDefault();
    setDragOver(false);
    const list = e.dataTransfer.files;
    if (list && list[0]) onFileSelected(list[0]);
  }

  useEffect(() => {
    // listen SSE when jobId is set
    if (!jobId) return;
    if (evtSourceRef.current) evtSourceRef.current.close();
    
    // Check if EventSource is supported
    if (typeof EventSource === 'undefined') {
      console.warn('EventSource not supported, falling back to polling');
      // Fallback: poll for updates
      const pollInterval = setInterval(async () => {
        try {
          const docRaw = await axios.get(`${SERVER}/api/doc/${jobId}`).catch(() => null);
          if (docRaw && docRaw.data && docRaw.data.doc) {
            const doc = docRaw.data.doc;
            if (doc.status === 'completed') {
              clearInterval(pollInterval);
              fetchDocSummary(jobId);
              if (onUploadComplete) onUploadComplete();
            } else if (doc.status === 'processing') {
              setStatus('Processing...');
              setProgress(50);
            }
          }
        } catch (e) {
          // ignore polling errors
        }
      }, 2000);
      return () => clearInterval(pollInterval);
    }
    
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    
    function connectSSE() {
      const es = new EventSource(`${SERVER}/api/events/${jobId}`);
      evtSourceRef.current = es;
      
      es.addEventListener('progress', (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.status) setStatus(String(data.status));
          if (data.page && data.ocrProgress !== undefined) {
            setStatus(`Page ${data.page}: ${(data.ocrProgress*100).toFixed(0)}%`);
            setProgress(Math.round((data.ocrProgress||0) * 100));
          }
          if (data.status === 'done') {
            // fetch latest doc to populate preview text/confidence & thumbnails
            fetchDocSummary(jobId);
            // Notify parent to refresh stats
            if (onUploadComplete) {
              onUploadComplete();
            }
            es.close();
          }
          reconnectAttempts = 0; // Reset on successful message
        } catch (e) {
          console.error('Error parsing SSE data:', e);
        }
      });
      
      es.onopen = () => {
        reconnectAttempts = 0; // Reset on successful connection
      };
      
      es.onerror = (error) => {
        console.error('SSE error:', error);
        es.close();
        
        // Attempt to reconnect if not exceeded max attempts
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          setTimeout(() => {
            if (jobId) { // Only reconnect if jobId still exists
              connectSSE();
            }
          }, 1000 * reconnectAttempts); // Exponential backoff
        } else {
          setStatus('Connection lost. Please refresh the page.');
        }
      };
    }
    
    connectSSE();
    
    return () => {
      if (evtSourceRef.current) {
        evtSourceRef.current.close();
        evtSourceRef.current = null;
      }
    };
  }, [jobId, onUploadComplete]); // Include onUploadComplete for completeness

  async function fetchDocSummary(docId){
    try {
      const docRaw = await axios.get(`${SERVER}/api/doc/${docId}`).catch(()=>null);
      if (docRaw && docRaw.data && docRaw.data.doc) {
        const doc = docRaw.data.doc;
        // build pages with absolute thumbnail URLs
        const pages = (doc.pages || []).map(pg => ({
          pageNumber: pg.pageNumber,
          text: pg.text,
          confidence: pg.confidence,
          thumbnail: SERVER + (pg.thumbnail || `/uploads/${doc.hash}-page-${pg.pageNumber}.png`)
        }));
        const firstText = pages.length ? pages[0].text : '';
        setPreview(p => ({ ...(p||{}), name: doc.title || doc.filename, size: doc.size, pages, hash: doc.hash, id: doc._id, text: pages.map(p=>`--- page ${p.pageNumber} ---\n${p.text||''}`).join('\n\n') }));
        setStatus('OCR complete');
        setProgress(100);
        setSelectedPage(1);
      }
    } catch (err) {
      // ignore
    }
  }

  async function onUpload(e){
    e && e.preventDefault();
    if (!file) return alert('Choose a file');
    setStatus('Uploading & enqueueing...');
    setProgress(2);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('language', language);
    fd.append('title', file.name);
    try {
      const res = await axios.post(`${SERVER}/api/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (ev) => {
          if (ev.total) {
            const p = Math.round((ev.loaded * 100) / ev.total * 0.6); // upload portion
            setProgress(p);
          }
        },
        timeout: 120000
      });
      if (res.data && res.data.ok) {
        setStatus('Uploaded, processing started');
        setJobId(res.data.docId);
        // progress will be updated via SSE
      } else {
        setStatus('Error: ' + (res.data && res.data.error ? res.data.error : 'unknown'));
      }
    } catch (err) {
      setStatus('Upload failed: ' + (err.message || 'network error'));
      setPreview(p => ({ ...p, text: `Simulated OCR for ${file.name} — size ${file.size} bytes.`, confidence: 78, id: 'demo-1' }));
      setProgress(100);
    }
  }

  return (
    <div className="panel" aria-live="polite">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>Upload & OCR</h3>
          <div className="sub muted" style={{ marginTop:6 }}>Drop or choose a PDF/image to extract text.</div>
        </div>
        <div style={{ textAlign:'right' }} className="muted" aria-hidden>Language</div>
      </div>

      <div
        className={`dropzone ${dragOver ? 'dragover' : ''}`}
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        role="button"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleChoose}
          style={{ display: 'none' }}
        />
        {preview && preview.url ? (
          <img src={preview.url} alt="preview" style={{ width:120, height:82, objectFit:'cover', borderRadius:8, boxShadow:'0 8px 20px rgba(0,0,0,0.4)' }} />
        ) : (
          <div style={{ fontSize:20, color:'var(--muted)' }}>📄</div>
        )}
        <div style={{ fontWeight:600 }}>{preview ? preview.name : 'Click or Drop a file here'}</div>
        <div className="hint">{preview ? `${Math.round((preview.size||0)/1024)} KB` : 'Images and PDFs supported'}</div>
      </div>

      {/* Multi-page preview section */}
      {preview && preview.pages && preview.pages.length > 0 && (
        <div style={{ marginTop:12 }}>
          <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:8 }}>
            {preview.pages.map(p => (
              <button 
                key={p.pageNumber} 
                onClick={() => setSelectedPage(p.pageNumber)} 
                style={{ 
                  border: selectedPage === p.pageNumber ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.03)', 
                  borderRadius:8, 
                  padding:6, 
                  background:'transparent', 
                  cursor:'pointer' 
                }}
              >
                <img 
                  src={p.thumbnail} 
                  alt={`page-${p.pageNumber}`} 
                  style={{ width:96, height:128, objectFit:'cover', borderRadius:6, display:'block' }} 
                />
                <div style={{ fontSize:12, marginTop:6, color:selectedPage===p.pageNumber ? 'var(--accent)' : 'var(--muted)' }}>
                  Page {p.pageNumber}
                </div>
              </button>
            ))}
          </div>
          <div style={{ marginTop:10, background:'rgba(255,255,255,0.01)', padding:10, borderRadius:8, maxHeight:220, overflow:'auto', whiteSpace:'pre-wrap' }}>
            {preview.pages.find(pg => pg.pageNumber === selectedPage)?.text || 'No text for this page yet'}
          </div>
        </div>
      )}

      {preview && !preview.pages && preview.text && (
        <div className="file-row" style={{ marginTop:12 }}>
          <div className="file-thumb">
            {preview.url ? <img src={preview.url} alt="thumb" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <div style={{ padding:8 }}>PDF</div>}
          </div>
          <div className="file-meta">
            <div style={{ fontWeight:600 }}>{preview.name}</div>
            <div className="muted" style={{ fontSize:13 }}>Size: {Math.round((preview.size||0)/1024)} KB</div>
            {preview.text && <div style={{ marginTop:8, fontSize:13, whiteSpace:'pre-wrap', maxHeight:110, overflow:'auto', background:'rgba(255,255,255,0.01)', padding:8, borderRadius:6 }}>{preview.text}</div>}
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:10, marginTop:12, alignItems:'center' }}>
        <select value={language} onChange={e => setLanguage(e.target.value)} className="search-input" style={{ width:160 }}>
          <option value="eng">English (fast)</option>
          <option value="spa">Spanish</option>
          <option value="deu">German</option>
        </select>
        <button className="btn primary" onClick={onUpload} disabled={!file} aria-disabled={!file}>Upload & OCR</button>
        <button className="btn" onClick={() => { if (evtSourceRef.current) evtSourceRef.current.close(); setFile(null); setPreview(null); setStatus(''); setProgress(0); setJobId(null); setSelectedPage(1); }}>Clear</button>
      </div>

      <div style={{ marginTop:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div className="muted">Status: {status || (progress ? `${progress}%` : 'idle')}</div>
          <div className="muted">Confidence: {preview && preview.pages && preview.pages.find(pg=>pg.pageNumber===selectedPage) ? Math.round(preview.pages.find(pg=>pg.pageNumber===selectedPage).confidence || 0) : (preview && preview.confidence ? Math.round(preview.confidence) : '-')}</div>
        </div>
        <div className="progress-bar" aria-hidden>
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}