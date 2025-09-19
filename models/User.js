const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['user', 'ngo', 'admin'],
    default: 'user'
  },
  phone: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^\+?[1-9]\d{1,14}$/.test(v);
      },
      message: 'Invalid phone number format'
    }
  },
  // NGO approval status - backward compatible
  ngoApprovalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'not_applicable'],
    default: function() {
      // Backward compatibility: existing NGOs are approved, new ones are pending
      return this.role === 'ngo' ? 'approved' : 'not_applicable';
    }
  },
  
  // Whether the user account is approved - backward compatible
  isApproved: {
    type: Boolean,
    default: function() {
      // Backward compatibility: existing NGOs are approved by default
      return true;
    }
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  avatar: {
    type: String
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: { type: String, default: 'India' }
  },
  lastLogin: Date,
  emailVerified: {
    type: Boolean,
    default: false
  },
  // Track if this is a new registration (for approval workflow)
  isNewRegistration: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);
