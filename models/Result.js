// models/Results.js
const mongoose = require('mongoose');

const resultsSchema = new mongoose.Schema({
  files_control_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FileControl'
  },
  files_record_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FileRecord'
  },
  bool: Boolean,
  percent: Number
});

module.exports = resultsSchema;
//module.exports = mongoose.model('Results', resultsSchema);
