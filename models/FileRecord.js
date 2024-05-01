// models/FileRecord.js
const mongoose = require('mongoose');

const fileRecordSchema = new mongoose.Schema({
  filename: String,
  path: String,
  results: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Results'
  }]
});

module.exports = fileRecordSchema;
