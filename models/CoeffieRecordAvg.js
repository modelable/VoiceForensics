// models/CoeffieRecordAvg.js
const mongoose = require('mongoose');

const coeffieRecordAvgSchema = new mongoose.Schema({
  MFCID: { type: Number, required: true },
  MFCC1: Number,
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
  timestamp: {
    type: Date,
    default: Date.now
  }
});

mongoose.set('strictQuery', true); // 추가 -> 스키마에 정해진 필드만 핸들, 나머지는 무시 
module.exports = mongoose.model('CoeffieRecordAvg', coeffieRecordAvgSchema, 'coeffie_record_avg');