// models/CoeffieRecord.js
const mongoose = require('mongoose');

const coeffieRecordSchema = new mongoose.Schema({
  MFCID: { type: Number, required: true },
  MFCC1: Number,
  MFCC2: Number,
  MFCC3: Number,
  MFCC4: Number,
  MFCC5: Number,
  MFCC6: Number,
  MFCC7: Number,
  MFCC8: Number,
  MFCC9: Number,
  MFCC10: Number,
  MFCC11: Number,
  MFCC12: Number,
  files_record_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FileRecord'
  },
  date: {
    type: Date,
    default: Date.now
  }
});

module.exports = coeffieRecordSchema;
//module.exports = mongoose.model('CoeffieRecord', coeffieRecordSchema);
