// models/CoeffieControl.js
const mongoose = require('mongoose');

const coefieControlSchema = new mongoose.Schema({
  MFCID: { type: Number, required: true },
  MFCC1: Number,
  MFCC2: Number,
  MFCC3: Number,
  MFCC4: Number,
  MFCC5: Number,
  MFCC6: Number,
  MFCC7: Number,
  MFCC8: Number,
  MFCC9: Number,
  MFCC10: Number,
  MFCC11: Number,
  MFCC12: Number,
  fileControl: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FileControl'
  }
});

module.exports = coefieControlSchema;
