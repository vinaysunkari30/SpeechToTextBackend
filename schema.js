import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
   name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true
  },
})

const transcriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  audioFile: {
    data: Buffer,
    contentType: String
  },
  transcriptionText: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

const User = mongoose.model('User', userSchema);
const Transcription = mongoose.model('Transcription', transcriptionSchema);
export {User, Transcription}
