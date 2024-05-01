// models/FileRecord.js
const mongoose = require('mongoose');

const fileRecordSchema = new mongoose.Schema({
  filename: String,
  path: String,
  coeffieRecords: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CoeffieRecord'
  }],
  results: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Results'
  }]
});

module.exports = fileRecordSchema;
