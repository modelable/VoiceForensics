const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  filename: String,
  path: String
});

const File = mongoose.model('File', fileSchema);

module.exports = File;