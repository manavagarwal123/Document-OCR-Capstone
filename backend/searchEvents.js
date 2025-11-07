// Manage SSE clients that are listening for live search matches.
const SEARCH_CLIENTS = new Set();

function registerSearchSSE(res, query) {
  // store the response and normalized query
  const entry = { res, query: (query || '').toLowerCase() };
  SEARCH_CLIENTS.add(entry);
  return entry;
}

function unregisterSearchSSE(entry) {
  if (!entry) return;
  SEARCH_CLIENTS.delete(entry);
}

// Called by the OCR worker when a page is processed. It will check each
// registered query and send a 'match' event to those whose query appears
// in the page text or document title.
function notifyPageProcessed(doc, page) {
  try {
    if (!doc || !page) return;
    const title = (doc.title || '').toLowerCase();
    const text = (page.text || '').toLowerCase();

    for (const client of SEARCH_CLIENTS) {
      try {
        const q = client.query;
        if (!q) continue;
        if (title.includes(q) || text.includes(q)) {
          // build snippet around first match
          const idx = text.indexOf(q);
          let snippet = page.text || '';
          if (idx >= 0) {
            const start = Math.max(0, idx - 60);
            const end = Math.min(snippet.length, idx + q.length + 200);
            snippet = (start > 0 ? '...' : '') + snippet.substring(start, end) + (end < (page.text||'').length ? '...' : '');
          } else if (title.includes(q)) {
            snippet = (page.text || '').slice(0, 200);
          }

          const payload = {
            _id: String(doc._id || doc.id),
            title: doc.title || doc.filename || 'Document',
            filename: doc.filename,
            page: {
              pageNumber: page.pageNumber,
              confidence: page.confidence,
              snippet,
              thumbnail: `/uploads/${doc.hash}-page-${page.pageNumber}.png`
            }
          };

          try {
            client.res.write(`event: match\ndata: ${JSON.stringify(payload)}\n\n`);
          } catch (e) {
            // ignore per-client write errors
          }
        }
      } catch (err) {
        // swallow per-client errors
        console.warn('notifyPageProcessed client error', err);
      }
    }
  } catch (err) {
    console.error('notifyPageProcessed error', err);
  }
}

module.exports = { registerSearchSSE, unregisterSearchSSE, notifyPageProcessed };
