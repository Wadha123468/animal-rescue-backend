const mongoose = require('mongoose');

const rescueSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000
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
      enum: ['cat', 'dog', 'chicken', 'cow', 'horse', 'sheep', 'other']
    },
    age: {
      value: { type: Number },
      unit: { 
        type: String, 
        enum: ['days', 'weeks', 'months', 'years'],
        default: 'months' 
      }
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'unknown']
    },
    size: {
      type: String,
      enum: ['tiny', 'small', 'medium', 'large', 'extra-large']
    },
    color: String,
    medicalCondition: String,
    aiPrediction: {
      species: { type: String },
      confidence: { type: Number, min: 0, max: 1 },
      timestamp: { type: Date },
      modelInfo: {
        architecture: { type: String },
        source: { type: String }
      }
    }
  },
  location: {
    address: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: String,
    coordinates: {
      lat: { type: Number },
      lng: { type: Number }
    },
    landmark: String
  },
  // Fixed: Change assignedNGO to be an embedded object, not ObjectId
  assignedNGO: {
    ngo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NGO'
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    organizationName: String,
    phone: String,
    assignedAt: Date
  },
  status: {
    type: String,
    enum: ['reported', 'under_review', 'assigned', 'in_progress', 'rescued', 'completed', 'cancelled'],
    default: 'reported'
  },
  urgency: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  images: [{
    url: { type: String, required: true },
    filename: String,
    description: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  timeline: [{
    status: {
      type: String,
      enum: ['reported', 'under_review', 'assigned', 'in_progress', 'rescued', 'completed', 'cancelled'],
      required: true
    },
    description: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    timestamp: { type: Date, default: Date.now }
  }],
  tags: [String],
  isPublic: { type: Boolean, default: true },
  priority: { type: Number, default: 0 },
  notes: [{
    content: String,
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
rescueSchema.index({ status: 1, createdAt: -1 });
rescueSchema.index({ 'location.city': 1, 'location.state': 1 });
rescueSchema.index({ 'animal.type': 1, status: 1 });
rescueSchema.index({ reporter: 1 });
rescueSchema.index({ 'assignedNGO.ngo': 1 });

module.exports = mongoose.model('Rescue', rescueSchema);
