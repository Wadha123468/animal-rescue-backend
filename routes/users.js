const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const NGO = require('../models/NGO');
const Rescue = require('../models/Rescue');
const auth = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/users/dashboard
// @desc    Get user dashboard data
// @access  Private
router.get('/dashboard', auth, async (req, res) => {
  try {
    console.log('📊 Fetching dashboard for user:', req.user.email, 'Role:', req.user.role);

    let dashboardData = {};

    if (req.user.role === 'user') {
      // User dashboard data
      const [myRescues, totalReported, successfulRescues] = await Promise.all([
        Rescue.find({ reporter: req.user.id })
          .populate('assignedNGO.ngo', 'organizationName')
          .sort({ createdAt: -1 })
          .limit(5)
          .lean(),
        Rescue.countDocuments({ reporter: req.user.id }),
        Rescue.countDocuments({ 
          reporter: req.user.id, 
          status: { $in: ['rescued', 'completed'] } 
        })
      ]);

      dashboardData = {
        user: {
          name: req.user.name,
          role: req.user.role
        },
        recentRescues: myRescues,
        stats: {
          totalReported,
          successfulRescues,
          activeRescues: myRescues.filter(r => ['reported', 'under_review', 'assigned', 'in_progress'].includes(r.status)).length,
          successRate: totalReported > 0 ? Math.round((successfulRescues / totalReported) * 100) : 0
        }
      };

    } else if (req.user.role === 'ngo') {
      // NGO dashboard data
      const ngoProfile = await NGO.findOne({ user: req.user.id });
      
      if (ngoProfile) {
        const [assignedRescues, totalHandled] = await Promise.all([
          Rescue.find({ 'assignedNGO.ngo': ngoProfile._id })
            .populate('reporter', 'name email')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean(),
          Rescue.countDocuments({ 'assignedNGO.ngo': ngoProfile._id })
        ]);

        dashboardData = {
          user: {
            name: req.user.name,
            role: req.user.role
          },
          ngoProfile: {
            organizationName: ngoProfile.organizationName,
            capacity: ngoProfile.capacity,
            statistics: ngoProfile.statistics,
            specialties: ngoProfile.specialties
          },
          recentRescues: assignedRescues,
          stats: {
            totalHandled,
            successfulRescues: ngoProfile.statistics.successfulRescues,
            rating: ngoProfile.statistics.rating,
            currentCapacity: ngoProfile.capacity.current,
            totalCapacity: ngoProfile.capacity.total,
            availableCapacity: ngoProfile.capacity.available
          }
        };
      } else {
        dashboardData = {
          user: {
            name: req.user.name,
            role: req.user.role
          },
          ngoProfile: null,
          recentRescues: [],
          stats: {
            totalHandled: 0,
            successfulRescues: 0,
            rating: 0,
            currentCapacity: 0,
            totalCapacity: 0,
            availableCapacity: 0
          }
        };
      }
    } else if (req.user.role === 'admin') {
      // Admin dashboard data
      const [totalUsers, totalNGOs, totalRescues, recentRescues] = await Promise.all([
        User.countDocuments(),
        NGO.countDocuments({ 'verification.status': 'verified' }),
        Rescue.countDocuments(),
        Rescue.find()
          .populate('reporter', 'name email')
          .populate('assignedNGO.ngo', 'organizationName')
          .sort({ createdAt: -1 })
          .limit(10)
          .lean()
      ]);

      dashboardData = {
        user: {
          name: req.user.name,
          role: req.user.role
        },
        recentRescues,
        stats: {
          totalUsers,
          totalNGOs,
          totalRescues,
          pendingVerifications: await NGO.countDocuments({ 'verification.status': 'pending' })
        }
      };
    }

    console.log('✅ Dashboard data prepared for user:', req.user.email);

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

// @route   GET /api/users/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    console.log('👤 Fetching profile for user:', req.user.id);
    
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      profile: user
    });
  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', [
  auth,
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage('Invalid phone number format'),
  body('website').optional().isURL().withMessage('Website must be a valid URL')
], async (req, res) => {
  try {
    console.log('👤 Updating profile for user:', req.user.id);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      name,
      email,
      phone,
      address,
      bio,
      website,
      socialMedia
    } = req.body;

    // Check if email is already taken by another user
    const existingUser = await User.findOne({ email, _id: { $ne: req.user.id } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email is already taken by another user'
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        name,
        email,
        phone,
        address,
        bio,
        website,
        socialMedia,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).select('-password');

    console.log('✅ Profile updated for user:', updatedUser.email);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: updatedUser
    });

  } catch (error) {
    console.error('❌ Update profile error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
});

// @route   GET /api/users/my-stats
// @desc    Get user statistics
// @access  Private
router.get('/my-stats', auth, async (req, res) => {
  try {
    console.log('📊 Fetching stats for user:', req.user.id);
    
    let stats = {};

    if (req.user.role === 'user') {
      // User statistics
      const [totalReported, successfulRescues] = await Promise.all([
        Rescue.countDocuments({ reporter: req.user.id }),
        Rescue.countDocuments({ 
          reporter: req.user.id, 
          status: { $in: ['rescued', 'completed'] } 
        })
      ]);

      stats = {
        totalReported,
        successfulRescues,
        successRate: totalReported > 0 ? Math.round((successfulRescues / totalReported) * 100) : 0
      };

    } else if (req.user.role === 'ngo') {
      // NGO statistics
      const ngo = await NGO.findOne({ user: req.user.id });
      if (ngo) {
        const totalHandled = await Rescue.countDocuments({ 'assignedNGO.ngo': ngo._id });
        
        stats = {
          totalHandled,
          successfulRescues: ngo.statistics.successfulRescues,
          successRate: ngo.statistics.totalRescues > 0 
            ? Math.round((ngo.statistics.successfulRescues / ngo.statistics.totalRescues) * 100) 
            : 0,
          rating: ngo.statistics.rating,
          capacity: ngo.capacity
        };
      }

    } else if (req.user.role === 'admin') {
      // Admin statistics
      const [totalUsers, activeNGOs, totalRescues, successfulRescues] = await Promise.all([
        User.countDocuments(),
        NGO.countDocuments({ isActive: true, 'verification.status': 'verified' }),
        Rescue.countDocuments(),
        Rescue.countDocuments({ status: { $in: ['rescued', 'completed'] } })
      ]);

      stats = {
        platformUsers: totalUsers,
        activeNGOs,
        platformRescues: totalRescues,
        platformSuccessRate: totalRescues > 0 ? Math.round((successfulRescues / totalRescues) * 100) : 0
      };
    }

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('❌ Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

module.exports = router;
