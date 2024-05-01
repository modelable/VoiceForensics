// models/FileControl.js
const mongoose = require('mongoose');

const fileControlSchema = new mongoose.Schema({
  filename: String,
  path: String,
  coeffieControls: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CoeffieControl'
  }],
  results: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Results'
  }]
});

module.exports = fileControlSchema;
