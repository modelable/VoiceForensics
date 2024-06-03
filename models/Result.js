// models/Result.js
const mongoose = require('mongoose');

const resultsSchema = new mongoose.Schema({
  live_data_prediction: {
    type: Number,
    required: true
  },
  record_data_prediction: {
    type: Number,
    required: true
  },
  MAE_similarity: {
    type: Number,
    required: true
  },
  files_record_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FileRecord',
    required: true
  },
  files_control_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FileControl',
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  }
});

mongoose.set('strictQuery', true);
module.exports = mongoose.model('Result', resultsSchema);
