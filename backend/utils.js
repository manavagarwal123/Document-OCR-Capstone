const crypto = require('crypto');
const fs = require('fs/promises');

async function fileHash(path) {
  const data = await fs.readFile(path);
  return crypto.createHash('sha256').update(data).digest('hex');
}

module.exports = { fileHash };