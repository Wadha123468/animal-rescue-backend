const mongoose = require('mongoose');

const rescueSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  animal: {
    type: {
      type: String,
      required: true,
      enum: ['dog', 'cat', 'cow', 'horse', 'sheep', 'chicken', 'wildlife', 'other']
    },
    age: {
      category: String,
      estimated: Number
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'unknown'],
      default: 'unknown'
    },
    size: {
      type: String,
      enum: ['small', 'medium', 'large'],
      default: 'medium'
    },
    color: String,
    medicalCondition: String
  },
  location: {
    address: String,
    description: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  urgency: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['reported', 'assigned', 'in_progress', 'rescued', 'completed', 'cancelled'],
    default: 'reported'
  },
  assignedNGO: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NGO',
    default: null
  },
  images: [{
    url: String,
    description: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  timeline: [{
    event: String,
    description: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  priority: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  tags: [String],
  isPublic: {
    type: Boolean,
    default: true
  },
  aiPrediction: {
    confidence: Number,
    suggestions: [String],
    medicalAssessment: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Rescue', rescueSchema);
