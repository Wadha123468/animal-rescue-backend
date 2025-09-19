const express = require('express');
const { body, validationResult } = require('express-validator');
const Rescue = require('../models/Rescue');
const User = require('../models/User');
const NGO = require('../models/NGO');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { sendEmail } = require('../utils/emailService');

const router = express.Router();

// IMPORTANT: Specific routes MUST come BEFORE parameterized routes
// Place all specific routes (like 'my-reports', 'my-assignments') before routes with parameters (like ':id')

// @route   GET /api/rescues/my-reports
// @desc    Get rescues reported by current user
// @access  Private (User only)
router.get('/my-reports', auth, async (req, res) => {
  try {
    if (req.user.role !== 'user') {
      return res.status(403).json({
        success: false,
        message: 'Only regular users can access their reports'
      });
    }

    console.log('📋 Fetching reports for user:', req.user.email);

    const { status, page = 1, limit = 50 } = req.query;

    let query = { reporter: req.user.id };

    if (status && status !== 'all') {
      query.status = status;
    }

    const rescues = await Rescue.find(query)
      .populate('assignedNGO.ngo', 'organizationName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Rescue.countDocuments(query);

    console.log(`✅ Found ${rescues.length} reports for user: ${req.user.email}`);

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
    console.error('❌ Get user reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your reports',
      error: error.message
    });
  }
});

// @route   GET /api/rescues/my-assignments
// @desc    Get rescues assigned to current NGO
// @access  Private (NGO only)
router.get('/my-assignments', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ngo') {
      return res.status(403).json({
        success: false,
        message: 'Only NGOs can access assignments'
      });
    }

    console.log('📋 Fetching assignments for NGO user:', req.user.email);

    // Find the NGO profile for this user
    const ngoProfile = await NGO.findOne({ user: req.user.id });
    
    if (!ngoProfile) {
      return res.status(400).json({
        success: false,
        message: 'NGO profile not found'
      });
    }

    const { status, page = 1, limit = 50 } = req.query;

    // Build query for rescues assigned to this NGO
    let query = { 'assignedNGO.ngo': ngoProfile._id };

    if (status && status !== 'all') {
      query.status = status;
    }

    const rescues = await Rescue.find(query)
      .populate('reporter', 'name email phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Rescue.countDocuments(query);

    console.log(`✅ Found ${rescues.length} assignments for NGO: ${ngoProfile.organizationName}`);

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
    console.error('❌ Get assignments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assignments',
      error: error.message
    });
  }
});

// @route   GET /api/rescues/stats/platform
// @desc    Get platform-wide statistics
// @access  Public
router.get('/stats/platform', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalRescues,
      activeNGOs,
      successfulRescues,
      rescuesToday,
      rescuesThisMonth,
      activeRescues,
      animalTypeStats
    ] = await Promise.all([
      Rescue.countDocuments(),
      NGO.countDocuments({ 'verification.status': 'verified', isActive: true }),
      Rescue.countDocuments({ status: { $in: ['rescued', 'completed'] } }),
      Rescue.countDocuments({ createdAt: { $gte: today } }),
      Rescue.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Rescue.countDocuments({ status: { $in: ['reported', 'under_review', 'assigned', 'in_progress'] } }),
      Rescue.aggregate([
        {
          $group: {
            _id: '$animal.type',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        }
      ])
    ]);

    const successRate = totalRescues > 0 ? Math.round((successfulRescues / totalRescues) * 100) : 0;

    res.json({
      success: true,
      stats: {
        totalRescues,
        activeNGOs,
        successfulRescues,
        activeRescues,
        successRate,
        rescuesToday,
        rescuesThisMonth,
        animalTypeStats,
        lastUpdated: new Date()
      }
    });

  } catch (error) {
    console.error('❌ Platform stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch platform statistics',
      error: error.message
    });
  }
});

// @route   GET /api/rescues
// @desc    Get rescue cases with filtering and pagination
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    console.log('🔍 Fetching rescues for user:', req.user.email, 'Role:', req.user.role);
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter object based on user role
    let filter = {};
    
    if (req.user.role === 'user') {
      // Users can see their own rescues and public active ones
      filter.$or = [
        { reporter: req.user.id }, // Their own rescues (all statuses)
        { 
          isPublic: true,
          status: { $nin: ['cancelled'] } // Others' rescues (except cancelled)
        }
      ];
    } else if (req.user.role === 'ngo') {
      // NGOs can only see rescues for animals they specialize in
      const ngoProfile = await NGO.findOne({ user: req.user.id });
      
      if (!ngoProfile) {
        return res.status(400).json({
          success: false,
          message: 'NGO profile not found'
        });
      }

      console.log('🏢 NGO Specialties:', ngoProfile.specialties);

      // Filter by NGO specialties and status
      const animalFilter = ngoProfile.specialties.includes('all') 
        ? {} 
        : { 'animal.type': { $in: ngoProfile.specialties } };

      filter = {
        isPublic: true,
        ...animalFilter,
        $or: [
          // Rescues assigned to this NGO (all statuses)
          { 'assignedNGO.ngo': ngoProfile._id },
          // Available rescues (not assigned, not completed/cancelled/rescued)
          { 
            $and: [
              { assignedNGO: { $exists: false } },
              { status: { $in: ['reported', 'under_review'] } }
            ]
          }
        ]
      };
    } else if (req.user.role === 'admin') {
      // Admins can see all rescues
      filter = {};
    }

    // Apply additional query filters
    if (req.query.status) {
      if (req.query.status === 'available') {
        // Special filter for available rescues
        filter.status = { $in: ['reported', 'under_review'] };
        filter.assignedNGO = { $exists: false };
      } else {
        filter.status = req.query.status;
      }
    }
    
    if (req.query.urgency) {
      filter.urgency = req.query.urgency;
    }
    
    if (req.query.animal) {
      filter['animal.type'] = req.query.animal;
    }
    
    if (req.query.city) {
      filter['location.city'] = new RegExp(req.query.city, 'i');
    }

    if (req.query.state) {
      filter['location.state'] = new RegExp(req.query.state, 'i');
    }

    console.log('📊 Final filter applied:', JSON.stringify(filter, null, 2));

    // Get rescues with population
    const rescues = await Rescue.find(filter)
      .populate('reporter', 'name email phone avatar')
      .populate('assignedNGO.ngo', 'organizationName')
      .sort({ 
        urgency: { critical: 4, high: 3, medium: 2, low: 1 }[req.query.urgency] ? -1 : 0,
        createdAt: -1 
      })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const totalRescues = await Rescue.countDocuments(filter);
    const totalPages = Math.ceil(totalRescues / limit);

    console.log(`✅ Found ${rescues.length} rescues out of ${totalRescues} total`);

    res.json({
      success: true,
      rescues,
      pagination: {
        currentPage: page,
        totalPages,
        totalRescues,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('❌ Get rescues error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rescue cases',
      error: error.message
    });
  }
});

// @route   POST /api/rescues
// @desc    Create a new rescue case
// @access  Private (Users)
router.post('/', [
  auth,
  body('title').trim().isLength({ min: 5, max: 100 }).withMessage('Title must be 5-100 characters'),
  body('description').trim().isLength({ min: 5, max: 1000 }).withMessage('Description must be 5-1000 characters'),
  body('animal.type').isIn(['cat', 'dog', 'chicken', 'cow', 'horse', 'sheep', 'other']).withMessage('Invalid animal type'),
  body('location.city').notEmpty().withMessage('City is required'),
  body('location.coordinates.lat').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('location.coordinates.lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  body('urgency').isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid urgency level')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    console.log('📝 Creating rescue case for user:', req.user.email);

    const {
      title,
      description,
      animal,
      location,
      urgency,
      images = [],
      tags = []
    } = req.body;

    // Process AI prediction correctly
    let processedAnimal = { ...animal };
    if (animal.aiPrediction) {
      processedAnimal.aiPrediction = {
        species: animal.aiPrediction.species || 'Unknown',
        confidence: Number(animal.aiPrediction.confidence) || 0,
        timestamp: animal.aiPrediction.timestamp || new Date().toISOString(),
        modelInfo: animal.aiPrediction.modelInfo || {
          architecture: 'MobileNetV2',
          source: 'trained_model'
        }
      };
      console.log('🤖 AI Prediction processed:', processedAnimal.aiPrediction);
    }

    // Calculate priority based on urgency and other factors
    const priorityMap = { critical: 4, high: 3, medium: 2, low: 1 };
    const priority = priorityMap[urgency] || 2;

    // Create rescue case
    const rescue = new Rescue({
      title,
      description,
      reporter: req.user.id,
      animal: processedAnimal,
      location,
      urgency,
      priority,
      images,
      tags,
      status: 'reported',
      isPublic: true,
      timeline: [{
        status: 'reported',
        description: 'Rescue case reported',
        updatedBy: req.user.id,
        timestamp: new Date()
      }]
    });

    await rescue.save();
    
    // Populate reporter information
    await rescue.populate('reporter', 'name email phone');

    console.log('✅ Rescue case created:', rescue._id);

    // Send email notifications to relevant NGOs
    try {
      await sendNewRescueEmails(rescue, animal.type, location);
    } catch (emailError) {
      console.error('❌ Email sending error:', emailError);
      // Don't fail the rescue creation if email fails
    }

    // Emit real-time notification to relevant NGOs
    const io = req.app.get('io');
    if (io) {
      // Find NGOs that specialize in this animal type
      const relevantNGOs = await NGO.find({
        isActive: true,
        'verification.status': 'verified',
        $or: [
          { specialties: animal.type },
          { specialties: 'all' }
        ]
      }).populate('user', '_id');

      // Notify relevant NGOs
      relevantNGOs.forEach(ngo => {
        io.to(`user_${ngo.user._id}`).emit('new_rescue_available', {
          rescue: rescue.toObject(),
          message: `New ${animal.type} rescue available in ${location.city}`
        });
      });

      // General broadcast
      io.emit('new_rescue', {
        rescue: rescue.toObject(),
        message: `New ${animal.type} rescue case reported in ${location.city}`
      });
    }

    res.status(201).json({
      success: true,
      message: 'Rescue case created successfully',
      rescue
    });

  } catch (error) {
    console.error('❌ Create rescue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create rescue case',
      error: error.message
    });
  }
});

// @route   PUT /api/rescues/:id/assign
// @desc    Assign rescue to NGO (NGO takes the rescue)
// @access  Private (NGO only)
router.put('/:id/assign', auth, async (req, res) => {
  try {
    // Check if user is NGO
    if (req.user.role !== 'ngo') {
      return res.status(403).json({
        success: false,
        message: 'Only NGOs can take rescue cases'
      });
    }

    console.log('🚑 NGO attempting to take rescue:', {
      rescueId: req.params.id,
      userId: req.user.id,
      userEmail: req.user.email
    });

    // Find the rescue case
    const rescue = await Rescue.findById(req.params.id).populate('reporter', 'name email');
    if (!rescue) {
      return res.status(404).json({
        success: false,
        message: 'Rescue case not found'
      });
    }

    // Check if rescue is available for assignment
    if (!['reported', 'under_review'].includes(rescue.status)) {
      return res.status(400).json({
        success: false,
        message: 'This rescue case is not available for assignment'
      });
    }

    if (rescue.assignedNGO && rescue.assignedNGO.ngo) {
      return res.status(400).json({
        success: false,
        message: 'This rescue case is already assigned to another NGO'
      });
    }

    // Find the NGO profile for this user
    const ngoProfile = await NGO.findOne({ user: req.user.id }).populate('user', 'name email phone');
    
    if (!ngoProfile) {
      console.error('❌ NGO profile not found for user:', req.user.id);
      return res.status(400).json({
        success: false,
        message: 'NGO profile not found. Please complete your NGO registration first.'
      });
    }

    if (!ngoProfile.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Your NGO profile is not active'
      });
    }

    if (ngoProfile.verification.status !== 'verified') {
      return res.status(400).json({
        success: false,
        message: 'Your NGO must be verified before taking rescue cases'
      });
    }

    // Check if NGO has capacity
    if (ngoProfile.capacity.available <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Your NGO is at full capacity. Please free up space before taking new rescues.'
      });
    }

    // Check if NGO specializes in this animal type
    const animalType = rescue.animal.type;
    if (!ngoProfile.specialties.includes(animalType) && !ngoProfile.specialties.includes('all')) {
      return res.status(400).json({
        success: false,
        message: `Your NGO doesn't specialize in ${animalType} rescues`
      });
    }

    // Assign the rescue (using proper schema structure)
    rescue.assignedNGO = {
      ngo: ngoProfile._id,
      user: ngoProfile.user._id,
      organizationName: ngoProfile.organizationName,
      phone: ngoProfile.user.phone,
      assignedAt: new Date()
    };
    
    rescue.status = 'assigned';
    
    // Add timeline entry
    rescue.timeline.push({
      status: 'assigned',
      description: `Assigned to ${ngoProfile.organizationName}`,
      updatedBy: req.user.id,
      timestamp: new Date()
    });

    await rescue.save();

    // Update NGO capacity
    ngoProfile.capacity.current += 1;
    ngoProfile.capacity.available = ngoProfile.capacity.total - ngoProfile.capacity.current;
    await ngoProfile.save();

    console.log('✅ Rescue assigned successfully:', {
      rescueId: rescue._id,
      ngoName: ngoProfile.organizationName
    });

    // Send email notification to the user who reported the rescue
    try {
      await sendRescueAssignedEmail(rescue, ngoProfile);
    } catch (emailError) {
      console.error('❌ Email sending error:', emailError);
      // Don't fail the assignment if email fails
    }

    // Emit real-time notification
    const io = req.app.get('io');
    if (io) {
      // Notify the reporter
      io.to(`user_${rescue.reporter._id}`).emit('rescue_assigned', {
        rescue: rescue.toObject(),
        ngo: ngoProfile.organizationName,
        message: `Your rescue case has been assigned to ${ngoProfile.organizationName}`
      });

      // Notify all users about the status change
      io.emit('rescue_updated', {
        rescueId: rescue._id,
        status: 'assigned',
        assignedNGO: ngoProfile.organizationName
      });
    }

    // Populate the rescue for response
    await rescue.populate('reporter', 'name email phone');

    res.json({
      success: true,
      message: 'Rescue case assigned successfully',
      rescue
    });

  } catch (error) {
    console.error('❌ Assign rescue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign rescue case',
      error: error.message
    });
  }
});

// @route   GET /api/rescues/:id
// @desc    Get single rescue case
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    console.log('🔍 Fetching rescue details for ID:', req.params.id);
    
    const rescue = await Rescue.findById(req.params.id)
      .populate('reporter', 'name email phone avatar address')
      .populate('assignedNGO.ngo', 'organizationName user')
      .populate('timeline.updatedBy', 'name role');

    if (!rescue) {
      console.log('❌ Rescue not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Rescue case not found'
      });
    }

    // Check if user has permission to view this rescue
    const canView = req.user.role === 'admin' ||
      rescue.reporter._id.toString() === req.user.id ||
      rescue.isPublic ||
      (rescue.assignedNGO && rescue.assignedNGO.user && rescue.assignedNGO.user.toString() === req.user.id);

    if (!canView) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this rescue case'
      });
    }

    console.log('✅ Rescue found:', rescue.title);

    res.json({
      success: true,
      rescue
    });

  } catch (error) {
    console.error('❌ Get rescue error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid rescue ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch rescue case',
      error: error.message
    });
  }
});

// @route   PUT /api/rescues/:id/status
// @desc    Update rescue status
// @access  Private (Assigned NGO only)
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status, description } = req.body;

    // Validate status
    const validStatuses = ['reported', 'under_review', 'assigned', 'in_progress', 'rescued', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const rescue = await Rescue.findById(req.params.id).populate('reporter', 'name email');
    if (!rescue) {
      return res.status(404).json({
        success: false,
        message: 'Rescue case not found'
      });
    }

    // Check permissions
    const canUpdate = req.user.role === 'admin' || 
      (req.user.role === 'ngo' && rescue.assignedNGO?.user?.toString() === req.user.id) ||
      (req.user.role === 'user' && rescue.reporter._id.toString() === req.user.id);

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this rescue case'
      });
    }

    // Update status
    const oldStatus = rescue.status;
    rescue.status = status;

    // Add timeline entry
    rescue.timeline.push({
      status,
      description: description || `Status updated from ${oldStatus} to ${status}`,
      updatedBy: req.user.id,
      timestamp: new Date()
    });

    // Update NGO capacity and statistics if rescue is completed
    if ((oldStatus === 'assigned' || oldStatus === 'in_progress') && 
        ['rescued', 'completed', 'cancelled'].includes(status)) {
      
      if (rescue.assignedNGO && rescue.assignedNGO.ngo) {
        const ngoProfile = await NGO.findById(rescue.assignedNGO.ngo);
        if (ngoProfile) {
          ngoProfile.capacity.current = Math.max(0, ngoProfile.capacity.current - 1);
          ngoProfile.capacity.available = ngoProfile.capacity.total - ngoProfile.capacity.current;
          
          // Update statistics
          ngoProfile.statistics.totalRescues += 1;
          if (status === 'rescued' || status === 'completed') {
            ngoProfile.statistics.successfulRescues += 1;
          }
          
          // Recalculate rating based on success rate
          const successRate = ngoProfile.statistics.totalRescues > 0 
            ? (ngoProfile.statistics.successfulRescues / ngoProfile.statistics.totalRescues)
            : 1;
          ngoProfile.statistics.rating = Math.round((successRate * 5) * 10) / 10; // Round to 1 decimal
          
          await ngoProfile.save();
        }
      }
    }

    await rescue.save();

    console.log('✅ Rescue status updated:', {
      rescueId: rescue._id,
      oldStatus,
      newStatus: status,
      updatedBy: req.user.email
    });

    // Send email notification to reporter about status update
    try {
      await sendStatusUpdateEmail(rescue, oldStatus, status);
    } catch (emailError) {
      console.error('❌ Email sending error:', emailError);
    }

    // Emit real-time notification
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${rescue.reporter._id}`).emit('rescue_updated', {
        rescue: rescue.toObject(),
        message: `Rescue status updated to ${status}`
      });

      io.emit('rescue_status_changed', {
        rescueId: rescue._id,
        status,
        description
      });
    }

    // Populate the rescue for response
    await rescue.populate('reporter', 'name email phone');

    res.json({
      success: true,
      message: 'Status updated successfully',
      rescue
    });

  } catch (error) {
    console.error('❌ Update status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update status',
      error: error.message
    });
  }
});

// Email sending functions
const sendNewRescueEmails = async (rescue, animalType, location) => {
  try {
    // Find NGOs that specialize in this animal type
    const relevantNGOs = await NGO.find({
      isActive: true,
      'verification.status': 'verified',
      $or: [
        { specialties: animalType },
        { specialties: 'all' }
      ]
    }).populate('user', 'name email');

    console.log(`📧 Sending new rescue emails to ${relevantNGOs.length} NGOs`);

    // Send emails to all relevant NGOs
    const emailPromises = relevantNGOs.map(ngo => {
      const emailData = {
        to: ngo.user.email,
        subject: `🚨 New ${animalType} rescue case in ${location.city}`,
        template: 'newRescueAlert',
        data: {
          ngoName: ngo.organizationName,
          rescueTitle: rescue.title,
          animalType: animalType,
          location: `${location.city}, ${location.state}`,
          urgency: rescue.urgency,
          description: rescue.description,
          reporterName: rescue.reporter.name,
          rescueUrl: `${process.env.FRONTEND_URL}/rescues/${rescue._id}`
        }
      };
      
      return sendEmail(emailData);
    });

    await Promise.allSettled(emailPromises);
    console.log('✅ New rescue emails sent successfully');

  } catch (error) {
    console.error('❌ Error sending new rescue emails:', error);
    throw error;
  }
};

const sendRescueAssignedEmail = async (rescue, ngoProfile) => {
  try {
    const emailData = {
      to: rescue.reporter.email,
      subject: `✅ Your rescue case has been assigned - ${rescue.title}`,
      template: 'rescueAssigned',
      data: {
        reporterName: rescue.reporter.name,
        rescueTitle: rescue.title,
        ngoName: ngoProfile.organizationName,
        ngoPhone: ngoProfile.user.phone,
        ngoEmail: ngoProfile.user.email,
        animalType: rescue.animal.type,
        location: `${rescue.location.city}, ${rescue.location.state}`,
        rescueUrl: `${process.env.FRONTEND_URL}/rescues/${rescue._id}`
      }
    };

    await sendEmail(emailData);
    console.log('✅ Rescue assigned email sent to reporter');

  } catch (error) {
    console.error('❌ Error sending rescue assigned email:', error);
    throw error;
  }
};

const sendStatusUpdateEmail = async (rescue, oldStatus, newStatus) => {
  try {
    const emailData = {
      to: rescue.reporter.email,
      subject: `📋 Status Update: ${rescue.title}`,
      template: 'statusUpdate',
      data: {
        reporterName: rescue.reporter.name,
        rescueTitle: rescue.title,
        oldStatus: oldStatus.replace('_', ' ').toUpperCase(),
        newStatus: newStatus.replace('_', ' ').toUpperCase(),
        animalType: rescue.animal.type,
        rescueUrl: `${process.env.FRONTEND_URL}/rescues/${rescue._id}`
      }
    };

    await sendEmail(emailData);
    console.log('✅ Status update email sent to reporter');

  } catch (error) {
    console.error('❌ Error sending status update email:', error);
    throw error;
  }
};

module.exports = router;
