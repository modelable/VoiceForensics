// models/FileRecord.js
const mongoose = require('mongoose');

const fileRecordSchema = new mongoose.Schema({
  filename: String,
  path: String,
  date: {
    type: Date,
    default: Date.now
  }
});

mongoose.set('strictQuery', true);
module.exports = fileRecordSchema;
//module.exports = mongoose.model('FileRecord', fileRecordSchema);

