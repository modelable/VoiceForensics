// models/FileControl.js
const mongoose = require('mongoose');

const fileControlSchema = new mongoose.Schema({
  filename: String,
  path: String,
  flag: Number, //0801 추가
  date: {
    type: Date,
    default: Date.now
  }
});

mongoose.set('strictQuery', true);
module.exports = fileControlSchema;
//module.exports = mongoose.model('FileControl', fileControlSchema);
