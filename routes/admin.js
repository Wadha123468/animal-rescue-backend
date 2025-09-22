const express = require('express');
const router = express.Router();

const User = require('../models/User');
const NGO = require('../models/NGO');
const Rescue = require('../models/Rescue');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { sendEmail, sendBulkEmail } = require('../utils/emailService');

// @route   GET /api/admin/ngos
// @desc    Get all NGOs with filtering (for admin)
// @access  Private (Admin only)
router.get('/ngos', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('👑 Admin fetching NGOs');
    
    const { status, search, page = 1, limit = 50 } = req.query;
    
    // Build filter
    let filter = {};
    
    if (status && status !== 'all') {
      filter['verification.status'] = status;
    }
    
    if (search) {
      filter.$or = [
        { organizationName: { $regex: search, $options: 'i' } },
        { registrationNumber: { $regex: search, $options: 'i' } }
      ];
    }

    console.log('📊 NGO filter:', JSON.stringify(filter));

    const ngos = await NGO.find(filter)
      .populate('user', 'name email phone createdAt isNewRegistration')
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

// @route   PUT /api/admin/ngos/:id/approve
// @desc    Approve NGO registration
// @access  Private (Admin only)
router.put('/ngos/:id/approve', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('✅ Admin approving NGO:', req.params.id);
    
    const ngo = await NGO.findById(req.params.id).populate('user');
    if (!ngo) {
      return res.status(404).json({
        success: false,
        message: 'NGO not found'
      });
    }

    // Update NGO status
    ngo.verification = {
      status: 'verified',
      verifiedAt: new Date(),
      verifiedBy: req.user.id
    };
    ngo.isActive = true;
    await ngo.save();

    // Update user status
    const user = ngo.user;
    user.ngoApprovalStatus = 'approved';
    user.isApproved = true;
    user.isNewRegistration = false; // No longer a new registration
    await user.save();

    console.log('✅ NGO approved successfully');

    // Send approval email to NGO
    try {
      await sendEmail({
        to: user.email,
        template: 'ngoApproved',
        data: {
          userName: user.name,
          ngoName: ngo.organizationName,
          loginUrl: `${process.env.FRONTEND_URL}/login`,
          dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`
        }
      });
      console.log('✅ NGO approval email sent');
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
// @desc    Reject NGO registration
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

    const ngo = await NGO.findById(req.params.id).populate('user');
    if (!ngo) {
      return res.status(404).json({
        success: false,
        message: 'NGO not found'
      });
    }

    // Update NGO status
    ngo.verification = {
      status: 'rejected',
      rejectedAt: new Date(),
      rejectedBy: req.user.id,
      rejectionReason: reason.trim()
    };
    ngo.isActive = false;
    await ngo.save();

    // Update user status
    const user = ngo.user;
    user.ngoApprovalStatus = 'rejected';
    user.isApproved = false;
    await user.save();

    console.log('✅ NGO rejected successfully');

    // Send rejection email to NGO
    try {
      await sendEmail({
        to: user.email,
        template: 'ngoRejected',
        data: {
          userName: user.name,
          ngoName: ngo.organizationName,
          rejectionReason: reason.trim(),
          supportEmail: 'support@animalrescue.com',
          reapplyUrl: `${process.env.FRONTEND_URL}/register`
        }
      });
      console.log('✅ NGO rejection email sent');
    } catch (emailError) {
      console.error('❌ Failed to send rejection email:', emailError);
    }

    res.json({
      success: true,
      message: 'NGO rejected successfully',
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

// @route   DELETE /api/admin/users/:id
// @desc    Delete user with orphan handling
// @access  Private (Admin only)
router.delete('/users/:id', [auth, authorize('admin')], async (req, res) => {
  try {
    const { deleteAssociatedData = false } = req.query;
    const userId = req.params.id;
    
    console.log('🗑️ Admin deleting user:', userId, 'Delete associated data:', deleteAssociatedData);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Handle user's rescue reports
    const userRescues = await Rescue.find({ reporter: userId });
    console.log(`📋 Found ${userRescues.length} rescues reported by this user`);

    if (deleteAssociatedData === 'true') {
      // Option 1: Delete all associated rescues
      await Rescue.deleteMany({ reporter: userId });
      console.log('🗑️ Deleted all associated rescues');
    } else {
      // Option 2: Keep rescues but anonymize them (RECOMMENDED)
      await Rescue.updateMany(
        { reporter: userId },
        {
          $unset: { reporter: "" },
          $set: {
            reporterName: 'Anonymous User (Account Deleted)',
            reporterEmail: 'deleted@example.com',
            isOrphaned: true
          }
        }
      );
      console.log('🔄 Anonymized rescues from deleted user');
    }

    // If user is an NGO, handle NGO profile
    if (user.role === 'ngo') {
      const ngoProfile = await NGO.findOne({ user: userId });
      if (ngoProfile) {
        // Reassign or unassign rescues assigned to this NGO
        const assignedRescues = await Rescue.find({ assignedNGO: ngoProfile._id });
        console.log(`🏢 Found ${assignedRescues.length} rescues assigned to this NGO`);

        await Rescue.updateMany(
          { assignedNGO: ngoProfile._id },
          {
            $unset: { assignedNGO: "", assignedBy: "" },
            $set: { 
              status: "reported",
              isReassignmentNeeded: true
            },
            $push: {
              timeline: {
                event: 'NGO Deleted - Unassigned',
                description: `Rescue unassigned due to NGO account deletion: ${ngoProfile.organizationName}`,
                timestamp: new Date(),
                updatedBy: req.user.id
              }
            }
          }
        );

        // Delete NGO profile
        await NGO.findByIdAndDelete(ngoProfile._id);
        console.log('🗑️ Deleted NGO profile');
      }
    }

    // Delete user account
    await User.findByIdAndDelete(userId);

    console.log('✅ User deleted successfully');

    res.json({
      success: true,
      message: 'User deleted successfully',
      orphanedRescues: userRescues.length,
      deletedAssociatedData: deleteAssociatedData === 'true'
    });

  } catch (error) {
    console.error('❌ Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message
    });
  }
});

// @route   DELETE /api/admin/ngos/:id
// @desc    Delete NGO with rescue reassignment
// @access  Private (Admin only)
router.delete('/ngos/:id', [auth, authorize('admin')], async (req, res) => {
  try {
    const { deleteUser = false } = req.query;
    const ngoId = req.params.id;
    
    console.log('🗑️ Admin deleting NGO:', ngoId, 'Delete user too:', deleteUser);

    const ngo = await NGO.findById(ngoId).populate('user');
    if (!ngo) {
      return res.status(404).json({
        success: false,
        message: 'NGO not found'
      });
    }

    // Handle assigned rescues
    const assignedRescues = await Rescue.find({ assignedNGO: ngoId });
    console.log(`🚑 Found ${assignedRescues.length} rescues assigned to this NGO`);

    if (assignedRescues.length > 0) {
      await Rescue.updateMany(
        { assignedNGO: ngoId },
        {
          $unset: { assignedNGO: "", assignedBy: "" },
          $set: { 
            status: "reported",
            isReassignmentNeeded: true
          },
          $push: {
            timeline: {
              event: 'NGO Deleted - Requires Reassignment',
              description: `Previous NGO deleted: ${ngo.organizationName}. Rescue needs new assignment.`,
              timestamp: new Date(),
              updatedBy: req.user.id
            }
          }
        }
      );
      console.log('🔄 Unassigned all rescues from deleted NGO');
    }

    // Delete NGO
    await NGO.findByIdAndDelete(ngoId);

    // Optionally delete user account
    if (deleteUser === 'true' && ngo.user) {
      await User.findByIdAndDelete(ngo.user._id);
      console.log('🗑️ Also deleted user account');
    }

    console.log('✅ NGO deleted successfully');

    res.json({
      success: true,
      message: 'NGO deleted successfully',
      unassignedRescues: assignedRescues.length,
      deletedUserAccount: deleteUser === 'true'
    });

  } catch (error) {
    console.error('❌ Delete NGO error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete NGO',
      error: error.message
    });
  }
});


// @route   GET /api/admin/rescues/unassigned
// @desc    Get unassigned rescues for assignment
// @access  Private (Admin only)
router.get('/rescues/unassigned', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('🚨 Admin fetching unassigned rescues');

    const unassignedRescues = await Rescue.find({
      $or: [
        { assignedNGO: { $exists: false } },
        { assignedNGO: null }
      ],
      status: { $in: ['REPORTED', 'ASSIGNED'] }
    })
    .populate('reportedBy', 'name email')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

    console.log(`✅ Found ${unassignedRescues.length} unassigned rescues`);

    res.json({
      success: true,
      rescues: unassignedRescues,
      count: unassignedRescues.length
    });

  } catch (error) {
    console.error('❌ Admin get unassigned rescues error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unassigned rescues',
      error: error.message
    });
  }
});

// @route   PUT /api/admin/rescues/:id/assign
// @desc    Assign rescue to NGO (Admin assignment)
// @access  Private (Admin only)
router.put('/rescues/:id/assign', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('🚨 Admin assigning rescue:', req.params.id, 'to NGO:', req.body.ngoId);
    
    const { ngoId } = req.body;
    
    if (!ngoId) {
      return res.status(400).json({
        success: false,
        message: 'NGO ID is required'
      });
    }
    
    const rescue = await Rescue.findById(req.params.id).populate('reportedBy', 'name email');
    if (!rescue) {
      return res.status(404).json({
        success: false,
        message: 'Rescue not found'
      });
    }

    const ngo = await NGO.findById(ngoId).populate('user', 'name email');
    if (!ngo) {
      return res.status(404).json({
        success: false,
        message: 'NGO not found'
      });
    }

    // Check if NGO is verified and active
    if (ngo.verification?.status !== 'verified' || !ngo.isActive) {
      return res.status(400).json({
        success: false,
        message: 'NGO is not verified or active'
      });
    }

    // Assign rescue to NGO
    rescue.assignedNGO = ngoId;
    rescue.status = 'ASSIGNED';
    rescue.assignedAt = new Date();
    rescue.assignedBy = req.user.id; // Track who assigned it
    await rescue.save();

    console.log('✅ Rescue assigned successfully');

    // Send notification email to NGO
    try {
      await sendEmail({
        to: ngo.user.email,
        template: 'newRescueAlert',
        data: {
          ngoName: ngo.organizationName,
          assignmentType: 'assigned by admin',
          rescueTitle: rescue.title,
          animalType: rescue.animalType,
          location: rescue.location,
          urgency: rescue.urgency,
          description: rescue.description,
          reporterName: rescue.reportedBy?.name || 'Anonymous',
          reportedDate: rescue.createdAt.toLocaleDateString(),
          rescueUrl: `${process.env.FRONTEND_URL}/rescues/${rescue._id}`
        }
      });
      console.log('✅ Rescue assignment email sent to NGO');
    } catch (emailError) {
      console.error('❌ Failed to send assignment email to NGO:', emailError);
    }

    // Send notification email to reporter
    if (rescue.reportedBy && rescue.reportedBy.email) {
      try {
        await sendEmail({
          to: rescue.reportedBy.email,
          template: 'rescueAssigned',
          data: {
            reporterName: rescue.reportedBy.name,
            rescueTitle: rescue.title,
            animalType: rescue.animalType,
            ngoName: ngo.organizationName,
            ngoEmail: ngo.user.email,
            ngoPhone: ngo.user.phone || 'Not provided',
            rescueUrl: `${process.env.FRONTEND_URL}/rescues/${rescue._id}`
          }
        });
        console.log('✅ Rescue assignment email sent to reporter');
      } catch (emailError) {
        console.error('❌ Failed to send assignment email to reporter:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'Rescue assigned successfully',
      rescue
    });

  } catch (error) {
    console.error('❌ Admin assign rescue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign rescue',
      error: error.message
    });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users with filtering
// @access  Private (Admin only)
router.get('/users', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('👥 Admin fetching users');
    
    const { role, search, page = 1, limit = 50 } = req.query;
    
    // Build filter
    let filter = {};
    
    if (role && role !== 'all') {
      filter.role = role;
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    console.log('📊 User filter:', JSON.stringify(filter));

    const users = await User.find(filter)
      .select('-password') // Don't send passwords
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await User.countDocuments(filter);

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
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isActive = true;
    await user.save();

    console.log('✅ User activated:', user.email);

    res.json({
      success: true,
      message: 'User activated successfully',
      user: user
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
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isActive = false;
    await user.save();

    console.log('✅ User deactivated:', user.email);

    res.json({
      success: true,
      message: 'User deactivated successfully',
      user: user
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

// @route   GET /api/admin/stats
// @desc    Get admin dashboard statistics
// @access  Private (Admin only)
router.get('/stats', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('📊 Admin fetching dashboard stats');

    const [
      totalUsers,
      totalNGOs,
      totalRescues,
      pendingNGOs,
      activeRescues,
      recentUsers
    ] = await Promise.all([
      User.countDocuments(),
      NGO.countDocuments(),
      Rescue.countDocuments(),
      NGO.countDocuments({ 'verification.status': 'pending' }),
      Rescue.countDocuments({ status: { $in: ['REPORTED', 'ASSIGNED', 'IN_PROGRESS'] } }),
      User.find().sort({ createdAt: -1 }).limit(5).select('name email role createdAt')
    ]);

    const stats = {
      totalUsers,
      totalNGOs,
      totalRescues,
      pendingNGOs,
      activeRescues,
      recentUsers
    };

    console.log('✅ Admin stats fetched:', stats);

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('❌ Admin get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin stats',
      error: error.message
    });
  }
});

// @route   GET /api/admin/analytics
// @desc    Get admin analytics data - FIXED FOR ACTUAL SCHEMA
// @access  Private (Admin only)
router.get('/analytics', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('📊 Admin fetching analytics - matched to actual schema');

    // Get basic counts
    const [totalUsers, totalNGOs, totalRescues, pendingNGOs] = await Promise.all([
      User.countDocuments().catch(() => 0),
      NGO.countDocuments().catch(() => 0),
      Rescue.countDocuments().catch(() => 0),
      NGO.countDocuments({ 'verification.status': 'pending' }).catch(() => 0)
    ]);

    console.log('Basic counts:', { totalUsers, totalNGOs, totalRescues, pendingNGOs });

    // Get ALL rescue data with CORRECT field names
    let allRescues = [];
    try {
      allRescues = await Rescue.find({})
        .select('status animal.type urgency assignedNGO reporter title location createdAt')
        .lean();
      console.log('📋 Sample rescue data:', allRescues.slice(0, 2));
    } catch (e) {
      console.error('Failed to get rescue data:', e);
    }

    // Analyze actual data using CORRECT field paths
    let statusCounts = {};
    let animalCounts = {};
    let urgencyCounts = {};

    allRescues.forEach(rescue => {
      // Count statuses (your field: status)
      const status = rescue.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      // Count animal types (your field: animal.type)
      const animalType = rescue.animal?.type || 'unknown';
      animalCounts[animalType] = (animalCounts[animalType] || 0) + 1;

      // Count urgency levels (your field: urgency)
      const urgency = rescue.urgency || 'unknown';
      urgencyCounts[urgency] = (urgencyCounts[urgency] || 0) + 1;
    });

    console.log('📊 Actual data analysis:');
    console.log('Status counts:', statusCounts);
    console.log('Animal counts:', animalCounts);
    console.log('Urgency counts:', urgencyCounts);

    // Calculate metrics based on your status values
    const activeStatuses = ['reported', 'assigned', 'in_progress', 'REPORTED', 'ASSIGNED', 'IN_PROGRESS'];
    const completedStatuses = ['completed', 'rescued', 'successful', 'COMPLETED', 'RESCUED', 'SUCCESSFUL'];
    
    let activeRescues = 0;
    let completedRescues = 0;

    Object.entries(statusCounts).forEach(([status, count]) => {
      if (activeStatuses.includes(status)) {
        activeRescues += count;
      } else if (completedStatuses.includes(status)) {
        completedRescues += count;
      }
    });

    const successRate = totalRescues > 0 ? ((completedRescues / totalRescues) * 100).toFixed(1) : '0';

    // Get recent activity with CORRECT field structure
    let recentActivity = [];
    try {
      const recentRescues = await Rescue.find()
        .select('title animal.type location status reporter createdAt')
        .populate('reporter', 'name')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
      
      recentActivity = recentRescues.map(rescue => ({
        _id: rescue._id,
        title: rescue.title || 'Untitled Rescue',
        animalType: rescue.animal?.type || 'Unknown',
        location: rescue.location?.address || rescue.location?.description || 'Unknown Location',
        status: rescue.status || 'unknown',
        reporterName: rescue.reporter?.name || 'Anonymous',
        createdAt: rescue.createdAt,
        timeAgo: rescue.createdAt ? getTimeAgo(new Date(rescue.createdAt)) : 'Unknown'
      }));
      
      console.log('Recent activity:', recentActivity.length, 'items');
    } catch (e) {
      console.error('Recent activity failed:', e);
    }

    const analytics = {
      totals: {
        users: totalUsers,
        ngos: totalNGOs,
        rescues: totalRescues,
        pendingNGOs: pendingNGOs,
        activeRescues: activeRescues,
        completedRescues: completedRescues,
        successRate: successRate
      },
      rescuesByStatus: statusCounts,
      rescuesByAnimal: animalCounts,
      rescuesByUrgency: urgencyCounts,
      recentActivity: recentActivity,
      dataAnalysis: {
        uniqueStatuses: Object.keys(statusCounts),
        uniqueAnimals: Object.keys(animalCounts),
        uniqueUrgencies: Object.keys(urgencyCounts),
        totalDataPoints: allRescues.length,
        schemaNote: 'Using animal.type field for animal types'
      },
      timestamp: new Date().toISOString()
    };

    console.log('✅ Analytics prepared with correct schema mapping');

    res.json({
      success: true,
      analytics
    });

  } catch (error) {
    console.error('❌ Analytics error:', error);
    
    res.json({
      success: true,
      analytics: {
        totals: {
          users: 0,
          ngos: 0,
          rescues: 0,
          pendingNGOs: 0,
          activeRescues: 0,
          completedRescues: 0,
          successRate: '0'
        },
        rescuesByStatus: { error: 'Unable to load status data' },
        rescuesByAnimal: { error: 'Unable to load animal data' },
        rescuesByUrgency: { error: 'Unable to load urgency data' },
        recentActivity: [],
        error: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Helper function for time ago
const getTimeAgo = (date) => {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${diffDays} days ago`;
};



// EMERGENCY DATABASE REPAIR ROUTE
router.post('/repair-database', [auth, authorize('admin')], async (req, res) => {
  try {
    console.log('🔧 EMERGENCY: Repairing database corruption');

    const repairs = [];

    // Fix 1: Corrupt assignedNGO in rescues
    const rescueRepair = await Rescue.updateMany(
      { assignedNGO: { $type: "string" } },
      { 
        $unset: { assignedNGO: "" },
        $set: { status: "REPORTED", updatedAt: new Date() }
      }
    );
    repairs.push(`Fixed ${rescueRepair.modifiedCount} corrupt rescue assignedNGO fields`);

    // Fix 2: Corrupt reportedBy in rescues
    const reporterRepair = await Rescue.updateMany(
      { reportedBy: { $type: "string" } },
      { 
        $unset: { reportedBy: "" },
        reporterName: "System User (Repaired)"
      }
    );
    repairs.push(`Fixed ${reporterRepair.modifiedCount} corrupt rescue reportedBy fields`);

    // Fix 3: Any other ObjectId string fields
    const userRepair = await NGO.updateMany(
      { user: { $type: "string" } },
      { $unset: { user: "" } }
    );
    repairs.push(`Fixed ${userRepair.modifiedCount} corrupt NGO user references`);

    console.log('✅ Database repair completed:', repairs);

    res.json({
      success: true,
      message: 'Database repair completed successfully!',
      repairs,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Database repair failed:', error);
    res.status(500).json({
      success: false,
      message: 'Database repair failed',
      error: error.message
    });
  }
});



module.exports = router;
