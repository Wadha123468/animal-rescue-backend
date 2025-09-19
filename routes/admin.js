const express = require('express');
const User = require('../models/User');
const NGO = require('../models/NGO');
const Rescue = require('../models/Rescue');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

const router = express.Router();

// @route   GET /api/admin/users
// @desc    Get all users with filtering
// @access  Private (Admin only)
router.get('/users', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('👥 Admin fetching users');
    
    const { role, search, status, page = 1, limit = 20 } = req.query;
    
    // Build filter
    let filter = {};
    
    if (role && role !== 'all') {
      filter.role = role;
    }
    
    if (status && status !== 'all') {
      filter.isActive = status === 'active';
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    console.log('📊 User filter:', JSON.stringify(filter));

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await User.countDocuments(filter);

    // Get additional stats for each user
    for (let user of users) {
      if (user.role === 'user') {
        user.stats = {
          totalReported: await Rescue.countDocuments({ reporter: user._id }),
          successfulRescues: await Rescue.countDocuments({ 
            reporter: user._id, 
            status: { $in: ['rescued', 'completed'] } 
          })
        };
      } else if (user.role === 'ngo') {
        const ngoProfile = await NGO.findOne({ user: user._id });
        user.ngoProfile = ngoProfile ? {
          organizationName: ngoProfile.organizationName,
          verificationStatus: ngoProfile.verification.status,
          totalRescues: ngoProfile.statistics.totalRescues
        } : null;
      }
    }

    console.log(`✅ Found ${users.length} users out of ${total} total`);

    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Admin get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

// @route   PUT /api/admin/users/:id/activate
// @desc    Activate user account
// @access  Private (Admin only)
router.put('/users/:id/activate', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('✅ Admin activating user:', req.params.id);

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isActive = true;
    user.updatedAt = new Date();
    await user.save();

    console.log('✅ User activated:', user.email);

    res.json({
      success: true,
      message: 'User activated successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      }
    });

  } catch (error) {
    console.error('❌ Admin activate user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to activate user',
      error: error.message
    });
  }
});

// @route   PUT /api/admin/users/:id/deactivate
// @desc    Deactivate user account
// @access  Private (Admin only)
router.put('/users/:id/deactivate', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('❌ Admin deactivating user:', req.params.id);

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't allow deactivating other admins
    if (user.role === 'admin' && user._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Cannot deactivate other admin accounts'
      });
    }

    user.isActive = false;
    user.updatedAt = new Date();
    await user.save();

    // If it's an NGO, deactivate their NGO profile too
    if (user.role === 'ngo') {
      await NGO.findOneAndUpdate(
        { user: user._id },
        { isActive: false, updatedAt: new Date() }
      );
    }

    console.log('❌ User deactivated:', user.email);

    res.json({
      success: true,
      message: 'User deactivated successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      }
    });

  } catch (error) {
    console.error('❌ Admin deactivate user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate user',
      error: error.message
    });
  }
});

// @route   DELETE /api/admin/users/:id
// @desc    Delete user account permanently
// @access  Private (Admin only)
router.delete('/users/:id', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('🗑️ Admin deleting user:', req.params.id);

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't allow deleting other admins
    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete admin accounts'
      });
    }

    // If it's an NGO, delete their NGO profile and reassign rescues
    if (user.role === 'ngo') {
      const ngoProfile = await NGO.findOne({ user: user._id });
      if (ngoProfile) {
        // Reassign active rescues to unassigned status
        await Rescue.updateMany(
          { 'assignedNGO.ngo': ngoProfile._id, status: { $in: ['assigned', 'in_progress'] } },
          { 
            $unset: { assignedNGO: 1 },
            status: 'under_review',
            $push: {
              timeline: {
                status: 'under_review',
                description: 'NGO account deleted - reassigning rescue',
                updatedBy: req.user.id,
                timestamp: new Date()
              }
            }
          }
        );
        
        // Delete NGO profile
        await NGO.findByIdAndDelete(ngoProfile._id);
      }
    }

    // Delete user's reported rescues or reassign them to admin
    const userRescues = await Rescue.find({ reporter: user._id });
    for (let rescue of userRescues) {
      // You can either delete the rescues or reassign them
      // For data integrity, let's reassign to admin
      rescue.reporter = req.user.id; // Assign to current admin
      rescue.timeline.push({
        status: rescue.status,
        description: `Original reporter account deleted - reassigned to admin`,
        updatedBy: req.user.id,
        timestamp: new Date()
      });
      await rescue.save();
    }

    // Delete the user
    await User.findByIdAndDelete(user._id);

    console.log('🗑️ User deleted successfully:', user.email);

    res.json({
      success: true,
      message: 'User deleted successfully',
      details: {
        deletedUser: user.email,
        reassignedRescues: userRescues.length
      }
    });

  } catch (error) {
    console.error('❌ Admin delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message
    });
  }
});

// @route   GET /api/admin/ngos
// @desc    Get all NGOs with filtering
// @access  Private (Admin only)
router.get('/ngos', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('🏢 Admin fetching NGOs');
    
    const { status, search, page = 1, limit = 20 } = req.query;
    
    // Build filter
    let filter = {};
    
    if (status && status !== 'all') {
      if (status === 'pending') {
        filter['verification.status'] = 'pending';
      } else if (status === 'verified') {
        filter['verification.status'] = 'verified';
      } else if (status === 'rejected') {
        filter['verification.status'] = 'rejected';
      }
    }
    
    if (search) {
      filter.$or = [
        { organizationName: { $regex: search, $options: 'i' } },
        { registrationNumber: { $regex: search, $options: 'i' } }
      ];
    }

    console.log('📊 NGO filter:', JSON.stringify(filter));

    const ngos = await NGO.find(filter)
      .populate('user', 'name email phone isActive createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await NGO.countDocuments(filter);

    console.log(`✅ Found ${ngos.length} NGOs out of ${total} total`);

    res.json({
      success: true,
      ngos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Admin get NGOs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch NGOs',
      error: error.message
    });
  }
});

// @route   PUT /api/admin/ngos/:id/verify
// @desc    Verify NGO
// @access  Private (Admin only)
router.put('/ngos/:id/verify', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('✅ Admin verifying NGO:', req.params.id);

    const ngo = await NGO.findById(req.params.id).populate('user', 'name email');
    if (!ngo) {
      return res.status(404).json({
        success: false,
        message: 'NGO not found'
      });
    }

    ngo.verification = {
      status: 'verified',
      verifiedBy: req.user.id,
      verifiedAt: new Date()
    };
    ngo.isActive = true;
    ngo.updatedAt = new Date();

    await ngo.save();

    console.log('✅ NGO verified:', ngo.organizationName);

    res.json({
      success: true,
      message: 'NGO verified successfully',
      ngo
    });

  } catch (error) {
    console.error('❌ Admin verify NGO error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify NGO',
      error: error.message
    });
  }
});

// @route   PUT /api/admin/ngos/:id/reject
// @desc    Reject NGO verification
// @access  Private (Admin only)
router.put('/ngos/:id/reject', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('❌ Admin rejecting NGO:', req.params.id);
    
    const { reason } = req.body;
    
    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required (minimum 10 characters)'
      });
    }

    const ngo = await NGO.findById(req.params.id).populate('user', 'name email');
    if (!ngo) {
      return res.status(404).json({
        success: false,
        message: 'NGO not found'
      });
    }

    ngo.verification = {
      status: 'rejected',
      verifiedBy: req.user.id,
      verifiedAt: new Date(),
      rejectionReason: reason.trim()
    };
    ngo.isActive = false;
    ngo.updatedAt = new Date();

    await ngo.save();

    console.log('❌ NGO rejected:', ngo.organizationName, 'Reason:', reason);

    res.json({
      success: true,
      message: 'NGO verification rejected',
      ngo
    });

  } catch (error) {
    console.error('❌ Admin reject NGO error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject NGO',
      error: error.message
    });
  }
});

// @route   DELETE /api/admin/ngos/:id
// @desc    Delete NGO permanently
// @access  Private (Admin only)
router.delete('/ngos/:id', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('🗑️ Admin deleting NGO:', req.params.id);

    const ngo = await NGO.findById(req.params.id).populate('user', 'name email');
    if (!ngo) {
      return res.status(404).json({
        success: false,
        message: 'NGO not found'
      });
    }

    // Reassign active rescues to unassigned status
    const reassignedRescues = await Rescue.updateMany(
      { 'assignedNGO.ngo': ngo._id, status: { $in: ['assigned', 'in_progress'] } },
      { 
        $unset: { assignedNGO: 1 },
        status: 'under_review',
        $push: {
          timeline: {
            status: 'under_review',
            description: `NGO (${ngo.organizationName}) deleted - reassigning rescue`,
            updatedBy: req.user.id,
            timestamp: new Date()
          }
        }
      }
    );

    // Delete NGO
    await NGO.findByIdAndDelete(ngo._id);

    // Optionally delete the associated user account
    if (req.query.deleteUser === 'true') {
      await User.findByIdAndDelete(ngo.user._id);
    }

    console.log('🗑️ NGO deleted successfully:', ngo.organizationName);

    res.json({
      success: true,
      message: 'NGO deleted successfully',
      details: {
        deletedNGO: ngo.organizationName,
        reassignedRescues: reassignedRescues.modifiedCount
      }
    });

  } catch (error) {
    console.error('❌ Admin delete NGO error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete NGO',
      error: error.message
    });
  }
});

// @route   GET /api/admin/analytics
// @desc    Get platform analytics
// @access  Private (Admin only)
router.get('/analytics', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('📈 Admin fetching analytics');
    
    const { range = '30d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (range) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get overview stats
    const [
      totalUsers,
      newUsers,
      totalRescues,
      newRescues,
      activeNGOs,
      verifiedNGOs,
      successfulRescues,
      activeRescues
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startDate } }),
      Rescue.countDocuments(),
      Rescue.countDocuments({ createdAt: { $gte: startDate } }),
      NGO.countDocuments({ isActive: true, 'verification.status': 'verified' }),
      NGO.countDocuments({ 'verification.status': 'verified' }),
      Rescue.countDocuments({ status: { $in: ['rescued', 'completed'] } }),
      Rescue.countDocuments({ status: { $in: ['reported', 'assigned', 'in_progress'] } })
    ]);

    const successRate = totalRescues > 0 ? Math.round((successfulRescues / totalRescues) * 100) : 0;

    // Get top performing NGOs
    const topNGOs = await NGO.find({ 
      'verification.status': 'verified',
      'statistics.totalRescues': { $gt: 0 }
    })
      .select('organizationName statistics')
      .sort({ 'statistics.rating': -1, 'statistics.totalRescues': -1 })
      .limit(5)
      .lean();

    // Get animal type distribution
    const animalTypes = await Rescue.aggregate([
      {
        $group: {
          _id: '$animal.type',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get recent activity (simplified)
    const recentActivity = [
      {
        icon: '👥',
        title: 'New Users',
        description: `${newUsers} users joined in the last ${range}`,
        time: 'Recent'
      },
      {
        icon: '🚑',
        title: 'New Rescues',
        description: `${newRescues} rescue cases reported`,
        time: 'Recent'
      },
      {
        icon: '🏢',
        title: 'Active NGOs',
        description: `${activeNGOs} NGOs currently active`,
        time: 'Current'
      }
    ];

    const analytics = {
      overview: {
        totalUsers,
        newUsers,
        totalRescues,
        newRescues,
        activeNGOs,
        verifiedNGOs,
        successfulRescues,
        activeRescues,
        successRate,
        ngoGrowth: Math.round((verifiedNGOs / Math.max(totalUsers, 1)) * 100)
      },
      topNGOs: topNGOs.map(ngo => ({
        _id: ngo._id,
        organizationName: ngo.organizationName,
        totalRescues: ngo.statistics.totalRescues,
        rating: ngo.statistics.rating
      })),
      animalTypes,
      recentActivity
    };

    console.log('✅ Analytics prepared');

    res.json({
      success: true,
      analytics,
      timeRange: range,
      generatedAt: new Date()
    });

  } catch (error) {
    console.error('❌ Admin analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
});

// @route   GET /api/admin/stats
// @desc    Get admin dashboard stats
// @access  Private (Admin only)
router.get('/stats', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('📊 Admin fetching dashboard stats');

    const [
      totalUsers,
      activeUsers,
      totalNGOs,
      verifiedNGOs,
      pendingNGOs,
      totalRescues,
      activeRescues,
      successfulRescues,
      recentUsers,
      criticalRescues
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      NGO.countDocuments(),
      NGO.countDocuments({ 'verification.status': 'verified' }),
      NGO.countDocuments({ 'verification.status': 'pending' }),
      Rescue.countDocuments(),
      Rescue.countDocuments({ status: { $in: ['reported', 'assigned', 'in_progress'] } }),
      Rescue.countDocuments({ status: { $in: ['rescued', 'completed'] } }),
      User.find().select('name email role createdAt').sort({ createdAt: -1 }).limit(5).lean(),
      Rescue.countDocuments({ urgency: 'critical', status: { $in: ['reported', 'assigned'] } })
    ]);

    const successRate = totalRescues > 0 ? Math.round((successfulRescues / totalRescues) * 100) : 0;

    const stats = {
      totalUsers,
      activeUsers,
      totalNGOs,
      verifiedNGOs,
      pendingNGOs,
      totalRescues,
      activeRescues,
      successfulRescues,
      successRate,
      recentUsers,
      criticalRescues
    };

    console.log('✅ Admin stats prepared');

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('❌ Admin stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin stats',
      error: error.message
    });
  }
});

// Add these routes to your existing admin.js file

// @route   PUT /api/admin/ngos/:id/approve
// @desc    Approve NGO account
// @access  Private (Admin only)
router.put('/ngos/:id/approve', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('✅ Admin approving NGO:', req.params.id);

    const ngo = await NGO.findById(req.params.id).populate('user', 'name email');
    if (!ngo) {
      return res.status(404).json({
        success: false,
        message: 'NGO not found'
      });
    }

    // Update NGO verification
    ngo.verification = {
      status: 'verified',
      verifiedBy: req.user.id,
      verifiedAt: new Date()
    };
    ngo.isActive = true;
    ngo.updatedAt = new Date();
    await ngo.save();

    // Update user approval status
    const user = await User.findById(ngo.user._id);
    if (user) {
      user.isApproved = true;
      user.ngoApprovalStatus = 'approved';
      await user.save();
    }

    console.log('✅ NGO approved:', ngo.organizationName);

    // Send approval email
    try {
      await sendEmail({
        to: ngo.user.email,
        subject: '🎉 Your NGO has been approved!',
        template: 'ngoApproved',
        data: {
          ngoName: ngo.organizationName,
          userName: ngo.user.name,
          loginUrl: `${process.env.FRONTEND_URL}/login`,
          dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`
        }
      });
    } catch (emailError) {
      console.error('❌ Failed to send approval email:', emailError);
    }

    res.json({
      success: true,
      message: 'NGO approved successfully',
      ngo
    });

  } catch (error) {
    console.error('❌ Admin approve NGO error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve NGO',
      error: error.message
    });
  }
});

// @route   PUT /api/admin/ngos/:id/reject
// @desc    Reject NGO account
// @access  Private (Admin only)
router.put('/ngos/:id/reject', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('❌ Admin rejecting NGO:', req.params.id);
    
    const { reason } = req.body;
    
    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required (minimum 10 characters)'
      });
    }

    const ngo = await NGO.findById(req.params.id).populate('user', 'name email');
    if (!ngo) {
      return res.status(404).json({
        success: false,
        message: 'NGO not found'
      });
    }

    // Update NGO verification
    ngo.verification = {
      status: 'rejected',
      verifiedBy: req.user.id,
      verifiedAt: new Date(),
      rejectionReason: reason.trim()
    };
    ngo.isActive = false;
    ngo.updatedAt = new Date();
    await ngo.save();

    // Update user approval status
    const user = await User.findById(ngo.user._id);
    if (user) {
      user.isApproved = false;
      user.ngoApprovalStatus = 'rejected';
      await user.save();
    }

    console.log('❌ NGO rejected:', ngo.organizationName, 'Reason:', reason);

    // Send rejection email
    try {
      await sendEmail({
        to: ngo.user.email,
        subject: '❌ Your NGO registration was not approved',
        template: 'ngoRejected',
        data: {
          ngoName: ngo.organizationName,
          userName: ngo.user.name,
          rejectionReason: reason,
          supportEmail: 'support@animalrescue.com',
          reapplyUrl: `${process.env.FRONTEND_URL}/register`
        }
      });
    } catch (emailError) {
      console.error('❌ Failed to send rejection email:', emailError);
    }

    res.json({
      success: true,
      message: 'NGO registration rejected',
      ngo
    });

  } catch (error) {
    console.error('❌ Admin reject NGO error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject NGO',
      error: error.message
    });
  }
});

// @route   GET /api/admin/pending-ngos
// @desc    Get NGOs pending approval
// @access  Private (Admin only)
router.get('/pending-ngos', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('📋 Admin fetching pending NGOs');

    const pendingNGOs = await NGO.find({ 
      'verification.status': 'pending' 
    })
    .populate('user', 'name email phone createdAt')
    .sort({ createdAt: -1 })
    .lean();

    console.log(`✅ Found ${pendingNGOs.length} pending NGOs`);

    res.json({
      success: true,
      ngos: pendingNGOs,
      count: pendingNGOs.length
    });

  } catch (error) {
    console.error('❌ Get pending NGOs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending NGOs',
      error: error.message
    });
  }
});

// @route   PUT /api/admin/ngos/:id/approve
// @desc    Approve NEW NGO registration
// @access  Private (Admin only)
router.put('/ngos/:id/approve', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('✅ Admin approving NGO:', req.params.id);

    const ngo = await NGO.findById(req.params.id).populate('user', 'name email isNewRegistration');
    if (!ngo) {
      return res.status(404).json({
        success: false,
        message: 'NGO not found'
      });
    }

    // Update NGO verification status
    ngo.verification = {
      status: 'verified',
      verifiedBy: req.user.id,
      verifiedAt: new Date()
    };
    ngo.isActive = true;
    ngo.updatedAt = new Date();
    await ngo.save();

    // Update user approval status
    const user = await User.findById(ngo.user._id);
    if (user) {
      user.isApproved = true;
      user.ngoApprovalStatus = 'approved';
      await user.save();
      
      console.log('✅ NGO user permanently approved:', user.email);
    }

    console.log('✅ NGO approved and activated:', ngo.organizationName);

    // Send approval email only for NEW registrations
    if (ngo.user.isNewRegistration) {
      try {
        const { sendEmail } = require('../utils/emailService');
        await sendEmail({
          to: ngo.user.email,
          subject: '🎉 Your NGO has been approved - Welcome to Animal Rescue Platform!',
          template: 'ngoApproved',
          data: {
            ngoName: ngo.organizationName,
            userName: ngo.user.name,
            loginUrl: `${process.env.FRONTEND_URL}/login`,
            dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`
          }
        });
        
        console.log('✅ Approval email sent to:', ngo.user.email);
      } catch (emailError) {
        console.error('❌ Failed to send approval email:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'NGO approved successfully. They can now login freely.',
      ngo: {
        ...ngo.toObject(),
        approvalStatus: 'approved'
      }
    });

  } catch (error) {
    console.error('❌ Admin approve NGO error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve NGO',
      error: error.message
    });
  }
});

// @route   PUT /api/admin/ngos/:id/reject
// @desc    Reject NEW NGO registration
// @access  Private (Admin only)
router.put('/ngos/:id/reject', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('❌ Admin rejecting NGO:', req.params.id);
    
    const { reason } = req.body;
    
    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required (minimum 10 characters)'
      });
    }

    const ngo = await NGO.findById(req.params.id).populate('user', 'name email isNewRegistration');
    if (!ngo) {
      return res.status(404).json({
        success: false,
        message: 'NGO not found'
      });
    }

    // Update NGO verification status
    ngo.verification = {
      status: 'rejected',
      verifiedBy: req.user.id,
      verifiedAt: new Date(),
      rejectionReason: reason.trim()
    };
    ngo.isActive = false;
    ngo.updatedAt = new Date();
    await ngo.save();

    // Update user approval status
    const user = await User.findById(ngo.user._id);
    if (user) {
      user.isApproved = false;
      user.ngoApprovalStatus = 'rejected';
      await user.save();
    }

    console.log('❌ NGO rejected:', ngo.organizationName, 'Reason:', reason);

    // Send rejection email only for NEW registrations
    if (ngo.user.isNewRegistration) {
      try {
        const { sendEmail } = require('../utils/emailService');
        await sendEmail({
          to: ngo.user.email,
          subject: '❌ Your NGO registration status',
          template: 'ngoRejected',
          data: {
            ngoName: ngo.organizationName,
            userName: ngo.user.name,
            rejectionReason: reason,
            supportEmail: 'support@animalrescue.com',
            reapplyUrl: `${process.env.FRONTEND_URL}/register`
          }
        });
        
        console.log('✅ Rejection email sent to:', ngo.user.email);
      } catch (emailError) {
        console.error('❌ Failed to send rejection email:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'NGO registration rejected',
      ngo: {
        ...ngo.toObject(),
        rejectionReason: reason
      }
    });

  } catch (error) {
    console.error('❌ Admin reject NGO error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject NGO',
      error: error.message
    });
  }
});

// @route   GET /api/admin/ngos
// @desc    Get all NGOs with filtering (shows pending for approval)
// @access  Private (Admin only)
router.get('/ngos', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('🏢 Admin fetching NGOs');
    
    const { status, search, page = 1, limit = 20 } = req.query;
    
    // Build filter
    let filter = {};
    
    if (status && status !== 'all') {
      if (status === 'pending') {
        filter['verification.status'] = 'pending';
      } else if (status === 'verified') {
        filter['verification.status'] = 'verified';
      } else if (status === 'rejected') {
        filter['verification.status'] = 'rejected';
      }
    }
    
    if (search) {
      filter.$or = [
        { organizationName: { $regex: search, $options: 'i' } },
        { registrationNumber: { $regex: search, $options: 'i' } }
      ];
    }

    console.log('📊 NGO filter:', JSON.stringify(filter));

    const ngos = await NGO.find(filter)
      .populate('user', 'name email phone isActive createdAt isNewRegistration')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await NGO.countDocuments(filter);

    // Add additional flags for frontend
    const enhancedNGOs = ngos.map(ngo => ({
      ...ngo,
      isNewRegistration: ngo.user?.isNewRegistration || false,
      needsApproval: ngo.verification?.status === 'pending' && ngo.user?.isNewRegistration
    }));

    console.log(`✅ Found ${ngos.length} NGOs out of ${total} total`);

    res.json({
      success: true,
      ngos: enhancedNGOs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Admin get NGOs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch NGOs',
      error: error.message
    });
  }
});


module.exports = router;
