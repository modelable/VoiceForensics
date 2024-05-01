// models/FileControl.js
const mongoose = require('mongoose');

const fileControlSchema = new mongoose.Schema({
  filename: String,
  path: String
});

module.exports = fileControlSchema;
//module.exports = mongoose.model('FileControl', fileControlSchema);
