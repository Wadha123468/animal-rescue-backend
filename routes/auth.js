const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); // Use jsonwebtoken instead of jwt-simple
const { body, validationResult } = require('express-validator');
const router = express.Router();

const User = require('../models/User');
const NGO = require('../models/NGO');
const auth = require('../middleware/auth');
const { sendEmail, sendBulkEmail } = require('../utils/emailService');

// @route   POST /api/auth/register
// @desc    Register a new user (user or ngo) - with comprehensive email notifications
// @access  Public
router.post('/register', [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['user', 'ngo']).withMessage('Role must be user or ngo'),
  body('phone').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage('Invalid phone number format'),
  
  // NGO specific validations
  body('organizationName').if(body('role').equals('ngo')).notEmpty().withMessage('Organization name is required for NGOs'),
  body('registrationNumber').if(body('role').equals('ngo')).notEmpty().withMessage('Registration number is required for NGOs'),
  body('establishedYear').if(body('role').equals('ngo')).isInt({ min: 1800, max: new Date().getFullYear() }).withMessage('Valid established year is required for NGOs'),
  body('specialties').if(body('role').equals('ngo')).isArray({ min: 1 }).withMessage('At least one specialty is required for NGOs'),
  body('capacity').if(body('role').equals('ngo')).isInt({ min: 1 }).withMessage('Total capacity is required for NGOs')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Registration validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { 
      name, email, password, role, phone, 
      organizationName, registrationNumber, establishedYear, 
      specialties, capacity, description, website, address 
    } = req.body;
    
    console.log('👤 New registration attempt:', { email, role, organizationName });

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('❌ User already exists:', email);
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // For NGOs, check if organization name or registration number already exists
    if (role === 'ngo') {
      const existingNGOByName = await NGO.findOne({ organizationName });
      if (existingNGOByName) {
        return res.status(400).json({
          success: false,
          message: 'An NGO with this organization name already exists'
        });
      }

      const existingNGOByRegNum = await NGO.findOne({ registrationNumber });
      if (existingNGOByRegNum) {
        return res.status(400).json({
          success: false,
          message: 'An NGO with this registration number already exists'
        });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user account
    const userData = {
      name,
      email,
      password: hashedPassword,
      role,
      phone: phone || undefined,
      isActive: true,
      isNewRegistration: role === 'ngo' // Mark NGOs as new registrations
    };

    // Set approval status
// In the NGO registration section, make sure flags are set correctly:
if (role === 'ngo') {
  userData.ngoApprovalStatus = 'pending';
  userData.isApproved = false; // NGOs need approval
  userData.isNewRegistration = true; // IMPORTANT: Set this flag
  console.log('🏢 NEW NGO registration - approval required');
} else {
  userData.ngoApprovalStatus = 'not_applicable';
  userData.isApproved = true; // Regular users are approved immediately
  userData.isNewRegistration = false;
}


    const user = new User(userData);
    await user.save();

    console.log('✅ User account created:', email, 'Role:', role);

    // Handle NGO registration
    if (role === 'ngo') {
      try {
        const ngoData = {
          user: user._id,
          organizationName,
          registrationNumber,
          establishedYear: parseInt(establishedYear),
          specialties: Array.isArray(specialties) ? specialties : [specialties],
          capacity: {
            total: parseInt(capacity.total || capacity),
            current: 0,
            available: parseInt(capacity.total || capacity)
          },
          description: description || '',
          website: website || undefined,
          address: address || {},
          verification: {
            status: 'pending' // New NGOs start with pending verification
          },
          isActive: false, // NGOs start as inactive until approved
          statistics: {
            totalRescues: 0,
            successfulRescues: 0,
            rating: 5.0,
            reviews: 0
          }
        };

        const ngo = new NGO(ngoData);
        await ngo.save();

        console.log('✅ NGO profile created:', organizationName, 'ID:', ngo._id);

        // Send confirmation email to NGO
        try {
          await sendEmail({
            to: user.email,
            template: 'ngoRegistrationSubmitted',
            data: {
              userName: user.name,
              ngoName: ngo.organizationName,
              userEmail: user.email
            }
          });
          console.log('✅ NGO registration confirmation email sent');
        } catch (emailError) {
          console.error('❌ Failed to send NGO confirmation email:', emailError);
        }

        // Notify all admins about new NGO registration
        try {
          await notifyAdminsAboutNewNGO(user, ngo);
        } catch (emailError) {
          console.error('❌ Failed to notify admins:', emailError);
        }

        // Response for NGO registration
        res.status(201).json({
          success: true,
          message: 'NGO registration submitted successfully! Please wait for admin approval before you can login.',
          pendingApproval: true,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            approvalStatus: 'pending'
          },
          ngo: {
            id: ngo._id,
            organizationName: ngo.organizationName,
            registrationNumber: ngo.registrationNumber
          }
        });

      } catch (ngoError) {
        console.error('❌ Failed to create NGO profile:', ngoError);
        // If NGO profile creation fails, delete the user account
        await User.findByIdAndDelete(user._id);
        
        return res.status(500).json({
          success: false,
          message: 'Failed to create NGO profile. Please try again.',
          error: ngoError.message
        });
      }

    } else {
      // Handle regular user registration
      try {
        // Send welcome email to regular user
        await sendEmail({
          to: user.email,
          template: 'userWelcome',
          data: {
            userName: user.name,
            userEmail: user.email,
            dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`
          }
        });
        console.log('✅ Welcome email sent to user');
      } catch (emailError) {
        console.error('❌ Failed to send welcome email:', emailError);
      }

      // Generate JWT token for regular users - FIXED JWT USAGE
      const token = jwt.sign(
        { 
          user: { 
            id: user._id, 
            email: user.email, 
            role: user.role 
          } 
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' } // Token expires in 7 days
      );

      res.status(201).json({
        success: true,
        message: 'Registration successful! Welcome to Animal Rescue Platform.',
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    }

  } catch (error) {
    console.error('❌ Registration error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email or organization details already exist'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message
    });
  }
});

// Helper function to notify admins about new NGO registration
const notifyAdminsAboutNewNGO = async (user, ngo) => {
  try {
    console.log('📧 Notifying admins about new NGO registration:', user.email);
    
    const admins = await User.find({ role: 'admin', isActive: true });
    console.log(`📧 Found ${admins.length} admin(s) to notify`);
    
    if (admins.length === 0) {
      console.log('⚠️ No active admins found to notify');
      return;
    }

    // Prepare admin recipients
    const adminRecipients = admins.map(admin => ({
      email: admin.email,
      adminName: admin.name
    }));

    // Send bulk email to all admins
    const results = await sendBulkEmail({
      recipients: adminRecipients,
      template: 'ngoRegistrationAlert',
      baseData: {
        ngoName: ngo.organizationName,
        ngoEmail: user.email,
        ngoPhone: user.phone || 'Not provided',
        registrationNumber: ngo.registrationNumber,
        establishedYear: ngo.establishedYear,
        registrationDate: new Date(user.createdAt).toLocaleDateString(),
        approvalUrl: `${process.env.FRONTEND_URL}/admin/ngos`
      }
    });

    const successful = results.filter(r => r.success).length;
    console.log(`✅ Admin notifications sent: ${successful}/${admins.length} successful`);
    
  } catch (error) {
    console.error('❌ Failed to notify admins:', error);
    throw error;
  }
};

// @route   POST /api/auth/login
// @desc    Login user - FIXED JWT USAGE
// @access  Public
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;
    console.log('🔐 Login attempt for:', email);

    // Find user
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      console.log('❌ User account is deactivated:', email);
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // For NGOs, check approval status
    if (user.role === 'ngo' && (!user.isApproved || user.ngoApprovalStatus !== 'approved')) {
      console.log('❌ NGO not approved yet:', email);
      return res.status(403).json({
        success: false,
        message: 'Your NGO registration is still pending admin approval. Please wait for approval email.',
        pendingApproval: true
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('❌ Invalid password for:', email);
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token - FIXED JWT USAGE
    const token = jwt.sign(
      { 
        user: { 
          id: user._id, 
          email: user.email, 
          role: user.role 
        } 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' } // Token expires in 7 days
    );

    console.log('✅ Login successful for:', email);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        isApproved: user.isApproved,
        lastLogin: user.lastLogin
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email } = req.body;
    console.log('🔑 Password reset request for:', email);

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({
        success: true,
        message: 'If an account with this email exists, you will receive a password reset link.'
      });
    }

    // Generate reset token - FIXED JWT USAGE
    const resetToken = jwt.sign(
      { 
        user: { id: user._id, email: user.email },
        type: 'password_reset'
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' } // Reset token expires in 1 hour
    );

    // Send password reset email (you can add this template)
    try {
      await sendEmail({
        to: user.email,
        subject: '🔑 Password Reset Request - Animal Rescue Platform',
        template: 'passwordReset', // You can add this template later
        data: {
          userName: user.name,
          resetUrl: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`,
          expiryTime: '1 hour'
        }
      });
      console.log('✅ Password reset email sent');
    } catch (emailError) {
      console.error('❌ Failed to send password reset email:', emailError);
    }

    res.json({
      success: true,
      message: 'If an account with this email exists, you will receive a password reset link.'
    });

  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;
