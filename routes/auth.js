const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const NGO = require('../models/NGO'); // ← ADD THIS MISSING IMPORT
const auth = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register a new user (user or ngo) - with approval for new NGOs
// @access  Public
router.post('/register', [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['user', 'ngo']).withMessage('Role must be user or ngo'),
  body('phone').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage('Invalid phone number format')
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

    const { name, email, password, role, phone } = req.body;
    console.log('👤 New registration attempt:', { email, role });

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('❌ User already exists:', email);
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
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
      isNewRegistration: true // Mark as new registration
    };

    // Set approval status - NEW NGOs need approval, regular users don't
    if (role === 'ngo') {
      userData.ngoApprovalStatus = 'pending';
      userData.isApproved = false; // NEW NGOs start as not approved
      console.log('🏢 NEW NGO registration - approval required');
    } else {
      userData.ngoApprovalStatus = 'not_applicable';
      userData.isApproved = true; // Regular users are approved immediately
    }

    const user = new User(userData);
    await user.save();

    console.log('✅ User account created:', email, 'Role:', role, 'Approval Status:', userData.ngoApprovalStatus);

    // Handle responses based on role
    if (role === 'ngo') {
      // For NEW NGOs, don't provide JWT token yet - they must wait for approval
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
        }
      });

      // Notify admins about new NGO registration
      try {
        await notifyAdminsAboutNewNGO(user);
      } catch (emailError) {
        console.error('❌ Failed to notify admins:', emailError);
      }

    } else {
      // For regular users, provide token immediately
      const token = jwt.sign(
        { user: { id: user._id, email: user.email, role: user.role } },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      res.status(201).json({
        success: true,
        message: 'Registration successful',
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
        message: 'Email already exists'
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
const notifyAdminsAboutNewNGO = async (user) => {
  try {
    console.log('📧 Notifying admins about new NGO registration:', user.email);
    
    const admins = await User.find({ role: 'admin', isActive: true });
    console.log(`📧 Found ${admins.length} admin(s) to notify`);
    
    const { sendEmail } = require('../utils/emailService');
    
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: '🏢 New NGO Registration Awaiting Approval',
        template: 'ngoRegistrationAlert',
        data: {
          adminName: admin.name,
          ngoName: user.name,
          ngoEmail: user.email,
          ngoPhone: user.phone || 'Not provided',
          registrationDate: new Date(user.createdAt).toLocaleDateString(),
          approvalUrl: `${process.env.FRONTEND_URL}/admin/ngos`
        }
      });
      
      console.log('✅ Admin notification sent to:', admin.email);
    }
  } catch (error) {
    console.error('❌ Failed to notify admins:', error);
  }
};


// @route   POST /api/auth/login
// @desc    Authenticate user & get token - with backward compatibility
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
    const user = await User.findOne({ email });
    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      console.log('❌ Inactive account:', email);
      return res.status(400).json({
        success: false,
        message: 'Account has been deactivated. Please contact support.'
      });
    }

    // Check password first (before approval check)
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('❌ Invalid password for:', email);
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // For NGOs, check approval status with backward compatibility
    if (user.role === 'ngo') {
      // Backward compatibility: if no approval status set, assume approved (existing NGO)
      const approvalStatus = user.ngoApprovalStatus || 'approved';
      const isApproved = user.isApproved !== undefined ? user.isApproved : true;
      
      console.log(`🏢 NGO login check - Status: ${approvalStatus}, Approved: ${isApproved}, New: ${user.isNewRegistration}`);
      
      // Only block NEW NGOs that haven't been approved yet
      if (user.isNewRegistration && (approvalStatus !== 'approved' || !isApproved)) {
        console.log('❌ NEW NGO not approved yet:', email, 'Status:', approvalStatus);
        
        let message = 'Your NGO account is pending admin approval. Please wait for approval email.';
        if (approvalStatus === 'rejected') {
          message = 'Your NGO registration was rejected. Please contact support or register again.';
        }
        
        return res.status(403).json({
          success: false,
          message,
          approvalStatus: approvalStatus,
          pendingApproval: approvalStatus === 'pending'
        });
      }

      // For existing NGOs or approved new NGOs, update their status to ensure consistency
      if (!user.isNewRegistration && (!user.ngoApprovalStatus || user.ngoApprovalStatus !== 'approved')) {
        console.log('📝 Updating existing NGO approval status:', email);
        user.ngoApprovalStatus = 'approved';
        user.isApproved = true;
        await user.save();
      }
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = jwt.sign(
      { user: { id: user._id, email: user.email, role: user.role } },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log('✅ Login successful for:', email, 'Role:', user.role);

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
        isActive: user.isActive,
        approvalStatus: user.role === 'ngo' ? (user.ngoApprovalStatus || 'approved') : 'not_applicable'
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
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
