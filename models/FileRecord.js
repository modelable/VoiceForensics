// models/FileRecord.js
const mongoose = require('mongoose');

const fileRecordSchema = new mongoose.Schema({
  filename: String,
  path: String
});

module.exports = fileRecordSchema;
//module.exports = mongoose.model('FileRecord', fileRecordSchema);

