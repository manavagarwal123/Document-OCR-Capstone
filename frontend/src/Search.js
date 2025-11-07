import React, { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import axios from 'axios';

const Search = forwardRef(function Search(props, ref){
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('');
  const [stats, setStats] = useState({ documents: 0, pages: 0, searches: 0 });
  const SERVER = 'https://document-ocr-capstone-production.up.railway.app';
  const searchSSERef = useRef(null);

  // Fetch stats on mount and subscribe to server-sent events for realtime updates.
  const statsSSERef = useRef(null);
  useEffect(() => {
    fetchStats();

    // If EventSource is supported, use SSE for real-time stats
    if (typeof EventSource !== 'undefined') {
      try {
        const es = new EventSource(`${SERVER}/api/events/stats`);
        statsSSERef.current = es;
        es.addEventListener('stats', (ev) => {
          try {
            const data = JSON.parse(ev.data || '{}');
            if (data && typeof data === 'object') setStats(data);
          } catch (e) {
            // ignore parse errors
          }
        });
        es.onerror = (err) => {
          console.error('Stats SSE error', err);
          // fallback to polling if SSE fails
          try { es.close(); } catch (e) {}
        };
        return () => { try { es.close(); } catch (e) {} };
      } catch (err) {
        // fallback to polling
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
      }
    }

    // fallback polling if EventSource not available
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchStats() {
    try {
      const res = await axios.get(`${SERVER}/api/stats`);
      if (res.data && res.data.ok && res.data.stats) {
        setStats(res.data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }

  // Expose refreshStats method to parent via ref
  useImperativeHandle(ref, () => ({
    refreshStats: fetchStats
  }));

  function escapeHtml(str){
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function highlight(text, q){
    if (!q) return escapeHtml(text);
    try {
      const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
      return escapeHtml(text).replace(re, '<mark>$1</mark>');
    } catch {
      return escapeHtml(text);
    }
  }

  async function doSearch(e){
    e && e.preventDefault();
    if (!q) {
      setStatus('Enter a search term');
      setResults([]);
      return;
    }
    setStatus('Searching...');
    try {
      const res = await axios.get(`${SERVER}/api/search?q=` + encodeURIComponent(q));
      const results = res.data.results || [];
      setResults(results);
      setStatus(results.length ? `Found matches in ${results.length} document(s)` : 'No matches found');
      
      // Refresh stats after search
      fetchStats();
      // open SSE for live matches for this query
      try {
        if (searchSSERef.current) {
          try { searchSSERef.current.close(); } catch(_) {}
          searchSSERef.current = null;
        }
        if (typeof EventSource !== 'undefined') {
          const es = new EventSource(`${SERVER}/api/events/search?q=${encodeURIComponent(q)}`);
          es.addEventListener('match', (ev) => {
            try {
              const payload = JSON.parse(ev.data || '{}');
              if (!payload || !payload._id) return;
              setResults(prev => {
                // merge payload into prev results
                const foundIndex = prev.findIndex(x => String(x._id) === String(payload._id));
                const pageObj = payload.page;
                if (foundIndex === -1) {
                  return [{ _id: payload._id, title: payload.title, filename: payload.filename, pages: [pageObj] }, ...prev];
                } else {
                  const clone = [...prev];
                  const doc = { ...clone[foundIndex] };
                  const existingPage = (doc.pages || []).some(p => p.pageNumber === pageObj.pageNumber);
                  if (!existingPage) {
                    doc.pages = [...(doc.pages || []), pageObj];
                    clone[foundIndex] = doc;
                  }
                  return clone;
                }
              });
              setStatus(s => s || 'Live matches streaming...');
            } catch (err) {
              // ignore
            }
          });
          es.onerror = (err) => {
            // close on error to allow reconnect logic from server later
            try { es.close(); } catch(_) {}
          };
          searchSSERef.current = es;
        }
      } catch (err) {
        // ignore SSE setup errors
      }
    } catch (err) {
      setStatus('Search failed: ' + (err.message || 'network'));
      setResults([]);
    }
  }

  // Clear results when query is cleared to avoid showing stale matches
  function onChangeQuery(val){
    setQ(val);
    if (!val) {
      if (searchSSERef.current) {
        try { searchSSERef.current.close(); } catch (e) {}
        searchSSERef.current = null;
      }
      setResults([]);
      setStatus('');
    }
  }

  // cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (searchSSERef.current) {
        try { searchSSERef.current.close(); } catch (e) {}
        searchSSERef.current = null;
      }
    };
  }, []);

  return (
    <div className="panel" aria-live="polite">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <h3 style={{ margin:0 }}>Search Documents</h3>
          <div className="sub muted" style={{ marginTop:6 }}>Find text inside uploaded documents.</div>
        </div>
      </div>

      <form onSubmit={doSearch} style={{ marginTop:12, display:'flex', gap:8 }}>
        <input className="search-input" value={q} onChange={e => onChangeQuery(e.target.value)} placeholder="Enter keywords..." />
        <button className="btn primary">Search</button>
      </form>

      {/* Real-time Stats */}
      <div className="stats-container" style={{ marginTop: 20 }}>
        <div className="stat-card">
          <div className="stat-value">{stats.documents}</div>
          <div className="stat-label">Documents</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.pages}</div>
          <div className="stat-label">Pages</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.searches}</div>
          <div className="stat-label">Searches</div>
        </div>
      </div>

      <div style={{ marginTop:12 }}>
        <div className="muted" style={{ marginBottom:8 }}>{status}</div>
        <div className="results">
          {results.length === 0 ? (
            <div className="muted">No results — try uploading a document or change your query.</div>
          ) : (
            results.map(d => (
              <div className="result-card" key={d._id || d.id || d.title}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:12 }}>
                  <div style={{ fontWeight:700 }}>{d.title || d.filename || 'Document'}</div>
                  <div className="muted" style={{ fontSize:13 }}>{d._id || d.id ? String(d._id || d.id).slice(0,8) : ''}</div>
                </div>

                {/* Multi-page results display */}
                {d.pages && d.pages.map(p => (
                  <div key={p.pageNumber} style={{ marginTop:10, background:'rgba(255,255,255,0.05)', padding:12, borderRadius:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div className="muted" style={{ fontSize:12 }}>Page {p.pageNumber}</div>
                      <div className="muted" style={{ fontSize:12 }}>Confidence: {Math.round(p.confidence || 0)}%</div>
                    </div>
                    <div style={{ marginTop:8, whiteSpace:'pre-wrap', fontSize:14, lineHeight:'1.5' }}>
                      <div dangerouslySetInnerHTML={{ __html: highlight(p.snippet || '', q) }} />
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
});

export default Search;