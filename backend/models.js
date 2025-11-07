const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const PageSchema = new mongoose.Schema({
  pageNumber: { type: Number, required: true },
  text: { type: String, default: '' },
  confidence: { type: Number, default: 0 },
  status: { type: String, enum: ['pending','processing','done','failed'], default: 'pending' },
  processedAt: Date
}, { _id: false });

const DocumentSchema = new mongoose.Schema({
  title: String,
  filename: String,
  size: Number,
  mime: String,
  hash: { type: String, index: true },
  uploader: String,
  ocrLanguage: { type: String, default: 'eng' },
  status: { type: String, enum: ['queued','processing','done','failed'], default: 'queued' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
  pages: [PageSchema],
  meta: mongoose.Mixed
});

// Text index over title and pages.text for basic search
DocumentSchema.index({ title: 'text', 'pages.text': 'text' });

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Method to compare password
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const StatsSchema = new mongoose.Schema({
  searchCount: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
}, { collection: 'stats' });

module.exports = {
  Document: mongoose.model('Document', DocumentSchema),
  User: mongoose.model('User', UserSchema),
  Stats: mongoose.model('Stats', StatsSchema)
};