const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },

    files_record_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileRecord'
    },

    files_control_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileControl'
    }
})

mongoose.set('strictQuery', true);
//module.exports = UserSchema;
module.exports = mongoose.model('User', UserSchema);
