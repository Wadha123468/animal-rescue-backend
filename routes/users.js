const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const User = require('../models/User');
const NGO = require('../models/NGO');
const Rescue = require('../models/Rescue');
const auth = require('../middleware/auth');
const { sendEmail } = require('../utils/emailService');

// @route   GET /api/user/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // If user is NGO, also get NGO profile
    let ngoProfile = null;
    if (user.role === 'ngo') {
      ngoProfile = await NGO.findOne({ user: req.user.id });
    }

    res.json({
      success: true,
      user,
      ngoProfile
    });
  } catch (error) {
    console.error('❌ Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/user/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', [
  auth,
  body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('phone').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage('Invalid phone number format')
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

    const { name, phone } = req.body;
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user fields
    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone || undefined;
    
    await user.save();

    console.log('✅ User profile updated:', user.email);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });

  } catch (error) {
    console.error('❌ Update user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
});

// @route   PUT /api/user/change-password
// @desc    Change user password
// @access  Private
router.put('/change-password', [
  auth,
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Password confirmation does not match');
    }
    return true;
  })
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

    const { currentPassword, newPassword } = req.body;
    
    // Get user with password
    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    console.log('✅ Password changed for user:', user.email);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('❌ Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: error.message
    });
  }
});

// @route   DELETE /api/user/delete-account
// @desc    Delete user account (all user types) with email confirmation
// @access  Private
router.delete('/delete-account', [
  auth,
  body('password').notEmpty().withMessage('Password confirmation is required')
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

    const { password } = req.body;
    
    console.log('🗑️ User requesting account deletion:', req.user.email);

    // Get user with password for verification
    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect password'
      });
    }

    // Store user info for email before deletion
    const userInfo = {
      name: user.name,
      email: user.email,
      role: user.role
    };

    let ngoDeleted = false;
    let ngoName = '';

    // If user is an NGO, delete NGO profile first
    if (user.role === 'ngo') {
      const ngoProfile = await NGO.findOne({ user: user._id });
      if (ngoProfile) {
        ngoName = ngoProfile.organizationName;
        
        // Update any assigned rescues - reassign them as unassigned
        const assignedRescues = await Rescue.updateMany(
          { assignedNGO: ngoProfile._id },
          { 
            $unset: { assignedNGO: 1 },
            status: 'REPORTED',
            $push: {
              updates: {
                message: `NGO account deleted - rescue case is now unassigned and available for other NGOs`,
                updatedBy: 'system',
                updatedAt: new Date(),
                status: 'REPORTED'
              }
            }
          }
        );
        
        await NGO.findByIdAndDelete(ngoProfile._id);
        ngoDeleted = true;
        console.log('✅ NGO profile deleted:', ngoName);
        console.log(`✅ ${assignedRescues.modifiedCount} rescue cases reassigned`);
      }
    }

    // Update any rescues reported by this user (anonymize but preserve data)
    const reportedRescues = await Rescue.updateMany(
      { reportedBy: user._id },
      { 
        $unset: { reportedBy: 1 },
        reporterName: 'Anonymous User (Account Deleted)',
        reporterEmail: 'deleted-user@animalrescue.com',
        $push: {
          updates: {
            message: 'Original reporter deleted their account - rescue data anonymized',
            updatedBy: 'system',
            updatedAt: new Date()
          }
        }
      }
    );

    console.log(`✅ ${reportedRescues.modifiedCount} rescue reports anonymized`);

    // Send account deletion confirmation email before deleting
    try {
      await sendEmail({
        to: userInfo.email,
        template: 'accountDeleted',
        data: {
          userName: userInfo.name,
          ngoDeleted: ngoDeleted,
          ngoName: ngoName,
          homeUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
        }
      });
      console.log('✅ Account deletion confirmation email sent');
    } catch (emailError) {
      console.error('❌ Failed to send deletion confirmation email:', emailError);
      // Continue with deletion even if email fails
    }

    // Delete user account
    await User.findByIdAndDelete(user._id);
    
    console.log('✅ User account deleted:', userInfo.email);

    res.json({
      success: true,
      message: 'Account deleted successfully. A confirmation email has been sent to your email address.'
    });

  } catch (error) {
    console.error('❌ Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account',
      error: error.message
    });
  }
});

// @route   GET /api/user/dashboard-stats
// @desc    Get user dashboard statistics
// @access  Private
router.get('/dashboard-stats', auth, async (req, res) => {
  try {
    let stats = {};

    if (req.user.role === 'user') {
      // Stats for regular users
      const [
        totalReported,
        pendingRescues,
        assignedRescues,
        completedRescues
      ] = await Promise.all([
        Rescue.countDocuments({ reportedBy: req.user.id }),
        Rescue.countDocuments({ reportedBy: req.user.id, status: 'REPORTED' }),
        Rescue.countDocuments({ reportedBy: req.user.id, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } }),
        Rescue.countDocuments({ reportedBy: req.user.id, status: { $in: ['RESCUED', 'COMPLETED'] } })
      ]);

      stats = {
        totalReported,
        pendingRescues,
        assignedRescues,
        completedRescues
      };

    } else if (req.user.role === 'ngo') {
      // Stats for NGOs
      const ngoProfile = await NGO.findOne({ user: req.user.id });
      if (ngoProfile) {
        const [
          totalAssigned,
          activeRescues,
          completedRescues,
          availableCapacity
        ] = await Promise.all([
          Rescue.countDocuments({ assignedNGO: ngoProfile._id }),
          Rescue.countDocuments({ assignedNGO: ngoProfile._id, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } }),
          Rescue.countDocuments({ assignedNGO: ngoProfile._id, status: { $in: ['RESCUED', 'COMPLETED'] } }),
          Promise.resolve(ngoProfile.capacity?.available || 0)
        ]);

        stats = {
          totalAssigned,
          activeRescues,
          completedRescues,
          availableCapacity,
          totalCapacity: ngoProfile.capacity?.total || 0,
          rating: ngoProfile.statistics?.rating || 5.0
        };
      }

    } else if (req.user.role === 'admin') {
      // Stats for admins
      const [
        totalUsers,
        totalNGOs,
        totalRescues,
        pendingNGOs,
        activeRescues
      ] = await Promise.all([
        User.countDocuments(),
        NGO.countDocuments(),
        Rescue.countDocuments(),
        NGO.countDocuments({ 'verification.status': 'pending' }),
        Rescue.countDocuments({ status: { $in: ['REPORTED', 'ASSIGNED', 'IN_PROGRESS'] } })
      ]);

      stats = {
        totalUsers,
        totalNGOs,
        totalRescues,
        pendingNGOs,
        activeRescues
      };
    }

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('❌ Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
      error: error.message
    });
  }
});

// @route   GET /api/user/my-rescues
// @desc    Get user's rescue reports
// @access  Private
router.get('/my-rescues', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    // Build filter
    let filter = { reportedBy: req.user.id };
    
    if (status && status !== 'all') {
      filter.status = status;
    }

    const rescues = await Rescue.find(filter)
      .populate('assignedNGO', 'organizationName user')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Rescue.countDocuments(filter);

    res.json({
      success: true,
      rescues,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Get my rescues error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your rescues',
      error: error.message
    });
  }
});

// @route   GET /api/user/ngo-profile
// @desc    Get NGO profile for current user
// @access  Private (NGO only)
router.get('/ngo-profile', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ngo') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. NGO role required.'
      });
    }

    const ngoProfile = await NGO.findOne({ user: req.user.id })
      .populate('user', 'name email phone')
      .lean();

    if (!ngoProfile) {
      return res.status(404).json({
        success: false,
        message: 'NGO profile not found'
      });
    }

    res.json({
      success: true,
      ngoProfile
    });

  } catch (error) {
    console.error('❌ Get NGO profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch NGO profile',
      error: error.message
    });
  }
});

// @route   PUT /api/user/ngo-profile
// @desc    Update NGO profile
// @access  Private (NGO only)
router.put('/ngo-profile', [
  auth,
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description too long'),
  body('website').optional().isURL().withMessage('Invalid website URL'),
  body('capacity.total').optional().isInt({ min: 1 }).withMessage('Invalid capacity')
], async (req, res) => {
  try {
    if (req.user.role !== 'ngo') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. NGO role required.'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { description, website, capacity, specialties, facilities } = req.body;
    
    const ngoProfile = await NGO.findOne({ user: req.user.id });
    if (!ngoProfile) {
      return res.status(404).json({
        success: false,
        message: 'NGO profile not found'
      });
    }

    // Update fields
    if (description !== undefined) ngoProfile.description = description.trim();
    if (website !== undefined) ngoProfile.website = website || undefined;
    if (specialties && Array.isArray(specialties)) ngoProfile.specialties = specialties;
    if (facilities && Array.isArray(facilities)) ngoProfile.facilities = facilities;
    
    if (capacity && capacity.total) {
      const newTotal = parseInt(capacity.total);
      const currentAnimals = ngoProfile.capacity?.current || 0;
      
      ngoProfile.capacity = {
        total: newTotal,
        current: currentAnimals,
        available: Math.max(0, newTotal - currentAnimals)
      };
    }

    await ngoProfile.save();

    console.log('✅ NGO profile updated:', ngoProfile.organizationName);

    res.json({
      success: true,
      message: 'NGO profile updated successfully',
      ngoProfile
    });

  } catch (error) {
    console.error('❌ Update NGO profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update NGO profile',
      error: error.message
    });
  }
});

// @route   GET /api/users/dashboard
// @desc    Get user dashboard data
// @access  Private
router.get('/dashboard', auth, async (req, res) => {
  try {
    console.log('📊 Fetching dashboard data for user:', req.user.email);

    let dashboardData = {};

    if (req.user.role === 'user') {
      // Dashboard for regular users
      const [myRescues, recentRescues] = await Promise.all([
        Rescue.countDocuments({ reportedBy: req.user.id }),
        Rescue.find({ reportedBy: req.user.id })
          .populate('assignedNGO', 'organizationName')
          .sort({ createdAt: -1 })
          .limit(5)
          .lean()
      ]);

      dashboardData = {
        totalReported: myRescues,
        recentRescues
      };

    } else if (req.user.role === 'ngo') {
      // Dashboard for NGOs
      const ngoProfile = await NGO.findOne({ user: req.user.id });
      
      if (ngoProfile) {
        const [assignedCount, recentAssignments] = await Promise.all([
          Rescue.countDocuments({ assignedNGO: ngoProfile._id }),
          Rescue.find({ assignedNGO: ngoProfile._id })
            .populate('reportedBy', 'name')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean()
        ]);

        dashboardData = {
          totalAssigned: assignedCount,
          recentAssignments,
          ngoProfile: {
            name: ngoProfile.organizationName,
            capacity: ngoProfile.capacity,
            rating: ngoProfile.statistics?.rating || 5.0
          }
        };
      }

    } else if (req.user.role === 'admin') {
      // Dashboard for admins
      const [
        totalUsers,
        totalNGOs,
        totalRescues,
        pendingNGOs
      ] = await Promise.all([
        User.countDocuments(),
        NGO.countDocuments(),
        Rescue.countDocuments(),
        NGO.countDocuments({ 'verification.status': 'pending' })
      ]);

      dashboardData = {
        totalUsers,
        totalNGOs,
        totalRescues,
        pendingNGOs
      };
    }

    res.json({
      success: true,
      dashboard: dashboardData
    });

  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message
    });
  }
});

// Add this route to user.js

// @route   GET /api/users/my-stats
// @desc    Get user's personal statistics
// @access  Private
router.get('/my-stats', auth, async (req, res) => {
  try {
    console.log('📊 Fetching stats for user:', req.user.email, 'Role:', req.user.role);

    let stats = {};

    if (req.user.role === 'user') {
      // Stats for regular users
      const [
        totalReported,
        pendingRescues,
        assignedRescues,
        completedRescues
      ] = await Promise.all([
        Rescue.countDocuments({ reporter: req.user.id }),
        Rescue.countDocuments({ reporter: req.user.id, status: 'reported' }),
        Rescue.countDocuments({ reporter: req.user.id, status: { $in: ['assigned', 'in_progress'] } }),
        Rescue.countDocuments({ reporter: req.user.id, status: { $in: ['rescued', 'completed'] } })
      ]);

      stats = {
        totalReported,
        pendingRescues,
        assignedRescues,
        completedRescues,
        successRate: totalReported > 0 ? ((completedRescues / totalReported) * 100).toFixed(1) : '0'
      };

    } else if (req.user.role === 'ngo') {
      // Stats for NGOs
      const ngoProfile = await NGO.findOne({ user: req.user.id });
      if (ngoProfile) {
        const [
          totalAssigned,
          activeRescues,
          completedRescues
        ] = await Promise.all([
          Rescue.countDocuments({ assignedNGO: ngoProfile._id }),
          Rescue.countDocuments({ assignedNGO: ngoProfile._id, status: { $in: ['assigned', 'in_progress'] } }),
          Rescue.countDocuments({ assignedNGO: ngoProfile._id, status: { $in: ['rescued', 'completed'] } })
        ]);

        stats = {
          totalAssigned,
          activeRescues,
          completedRescues,
          availableCapacity: ngoProfile.capacity?.available || 0,
          totalCapacity: ngoProfile.capacity?.total || 0,
          rating: ngoProfile.statistics?.rating || 5.0,
          successRate: totalAssigned > 0 ? ((completedRescues / totalAssigned) * 100).toFixed(1) : '0'
        };
      } else {
        stats = {
          totalAssigned: 0,
          activeRescues: 0,
          completedRescues: 0,
          availableCapacity: 0,
          totalCapacity: 0,
          rating: 5.0,
          successRate: '0'
        };
      }

    } else if (req.user.role === 'admin') {
      // Stats for admins
      const [
        totalUsers,
        totalNGOs,
        totalRescues,
        pendingNGOs,
        activeRescues
      ] = await Promise.all([
        User.countDocuments(),
        NGO.countDocuments(),
        Rescue.countDocuments(),
        NGO.countDocuments({ 'verification.status': 'pending' }),
        Rescue.countDocuments({ status: { $in: ['reported', 'assigned', 'in_progress'] } })
      ]);

      stats = {
        totalUsers,
        totalNGOs,
        totalRescues,
        pendingNGOs,
        activeRescues
      };
    }

    console.log('✅ Stats prepared:', stats);

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('❌ Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user statistics',
      error: error.message
    });
  }
});



module.exports = router;
