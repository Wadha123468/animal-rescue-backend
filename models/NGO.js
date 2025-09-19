const mongoose = require('mongoose');

const ngoSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  organizationName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  registrationNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  establishedYear: {
    type: Number,
    required: true,
    min: 1800,
    max: new Date().getFullYear()
  },
  description: {
    type: String,
    maxlength: 1000
  },
  website: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Website must be a valid URL'
    }
  },
  specialties: {
    type: [String],
    enum: ['cat', 'dog', 'chicken', 'cow', 'horse', 'sheep', 'all'],
    required: true,
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'At least one specialty is required'
    }
  },
  serviceAreas: [{
    city: { type: String, required: true },
    state: { type: String, required: true },
    radius: { type: Number, default: 50, min: 1, max: 500 }
  }],
  capacity: {
    total: { type: Number, required: true, min: 1 },
    current: { type: Number, default: 0, min: 0 },
    available: { type: Number, default: 0, min: 0 }
  },
  facilities: {
    type: [String],
    enum: [
      'Veterinary Care',
      'Surgery Facilities', 
      'Adoption Center',
      'Quarantine Area',
      'Rehabilitation Center',
      'Foster Care Program',
      'Emergency Response Team',
      'Transportation Service',
      'Medical Equipment',
      'Pharmacy'
    ]
  },
  contactInfo: {
    primaryContact: String,
    emergencyContact: String,
    email: String,
    address: String
  },
  operatingHours: {
    weekdays: {
      open: { type: String, default: '09:00' },
      close: { type: String, default: '18:00' }
    },
    weekends: {
      open: { type: String, default: '10:00' },
      close: { type: String, default: '16:00' }
    },
    emergency24x7: { type: Boolean, default: false }
  },
  verification: {
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending' // ← Default is now pending
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    verifiedAt: Date,
    rejectionReason: String,
    documents: [{
      type: { type: String },
      url: String,
      uploadedAt: { type: Date, default: Date.now }
    }]
  },
  statistics: {
    totalRescues: { type: Number, default: 0 },
    successfulRescues: { type: Number, default: 0 },
    rating: { type: Number, default: 5.0, min: 1, max: 5 },
    reviews: { type: Number, default: 0 }
  },
  bankDetails: {
    accountName: String,
    accountNumber: String,
    bankName: String,
    ifscCode: String
  },
  isActive: { type: Boolean, default: false }, // ← Default is now false
  socialMedia: {
    facebook: String,
    twitter: String,
    instagram: String,
    linkedin: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save middleware to calculate available capacity
ngoSchema.pre('save', function(next) {
  if (this.capacity && this.capacity.total !== undefined && this.capacity.current !== undefined) {
    this.capacity.available = this.capacity.total - this.capacity.current;
  }
  next();
});

// Virtual for approval status
ngoSchema.virtual('approvalStatus').get(function() {
  return this.verification.status;
});

// Method to check if NGO can accept rescues
ngoSchema.methods.canAcceptRescues = function() {
  return this.isActive && 
         this.verification.status === 'verified' && 
         this.capacity.available > 0;
};

// Static method to find approved NGOs
ngoSchema.statics.findApproved = function(filter = {}) {
  return this.find({
    ...filter,
    isActive: true,
    'verification.status': 'verified'
  });
};

module.exports = mongoose.model('NGO', ngoSchema);
