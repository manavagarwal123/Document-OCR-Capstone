const { Document, Stats } = require('./models');

// Simple broadcaster for global stats SSE
const STATS_CLIENTS = new Set();

function registerStatsSSE(res) {
  STATS_CLIENTS.add(res);
}

function unregisterStatsSSE(res) {
  STATS_CLIENTS.delete(res);
}

async function broadcastStats() {
  try {
    const documentCount = await Document.countDocuments();
    const documents = await Document.find({}, 'pages').lean();
    const pageCount = documents.reduce((total, doc) => total + (doc.pages ? doc.pages.length : 0), 0);
    let statsDoc = await Stats.findOne();
    if (!statsDoc) statsDoc = { searchCount: 0 };
    const payload = {
      documents: documentCount,
      pages: pageCount,
      searches: statsDoc.searchCount || 0
    };

    const data = JSON.stringify(payload);
    for (const res of STATS_CLIENTS) {
      try {
        res.write(`event: stats\ndata: ${data}\n\n`);
      } catch (err) {
        // ignore individual client errors
      }
    }
  } catch (err) {
    console.error('broadcastStats error:', err);
  }
}

module.exports = { registerStatsSSE, unregisterStatsSSE, broadcastStats };
