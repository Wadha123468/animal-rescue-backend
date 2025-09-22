const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const Rescue = require('../models/Rescue');
const NGO = require('../models/NGO');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendEmail, sendBulkEmail } = require('../utils/emailService');




// Helper function to notify suitable NGOs about new rescue
const notifySuitableNGOs = async (rescue, reporter) => {
  try {
    console.log('📧 Finding suitable NGOs for rescue:', rescue._id);

    // Find NGOs that can handle this animal type and are active
    const suitableNGOs = await NGO.find({
      'verification.status': 'verified',
      isActive: true,
      $or: [
        { specialties: { $in: [rescue.animalType] } },
        { specialties: { $in: ['all'] } }
      ]
    })
    .populate('user', 'name email')
    .limit(10) // Limit to prevent spam
    .lean();

    console.log(`📧 Found ${suitableNGOs.length} suitable NGOs`);

    if (suitableNGOs.length === 0) {
      console.log('⚠️ No suitable NGOs found for this rescue');
      return;
    }

    // Prepare NGO recipients
    const ngoRecipients = suitableNGOs.map(ngo => ({
      email: ngo.user.email,
      ngoName: ngo.organizationName
    }));

    // Send bulk notification to suitable NGOs
    const results = await sendBulkEmail({
      recipients: ngoRecipients,
      template: 'newRescueAlert',
      baseData: {
        assignmentType: 'reported and available for',
        rescueTitle: rescue.title,
        animalType: rescue.animalType,
        location: rescue.location,
        urgency: rescue.urgency,
        description: rescue.description,
        reporterName: reporter.name,
        reportedDate: rescue.createdAt.toLocaleDateString(),
        rescueUrl: `${process.env.FRONTEND_URL}/rescues/${rescue._id}`
      }
    });

    const successful = results.filter(r => r.success).length;
    console.log(`✅ NGO notifications sent: ${successful}/${suitableNGOs.length} successful`);

  } catch (error) {
    console.error('❌ Failed to notify NGOs:', error);
    throw error;
  }
};




// Add these routes BEFORE the router.get('/:id') route to prevent conflicts

// @route   GET /api/rescues/my-reports
// @desc    Get user's own reported rescues
// @access  Private (User only)
router.get('/my-reports', auth, async (req, res) => {
  try {
    console.log('📋 Fetching reports for user:', req.user.email);

    const { page = 1, limit = 20, status } = req.query;

    // Build filter for user's own reports
    let filter = { reporter: req.user.id };
    
    if (status && status !== 'all') {
      filter.status = status;
    }

    console.log('📋 My reports filter:', JSON.stringify(filter));

    // Get user's reported rescues
    const reports = await Rescue.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    console.log(`✅ Found ${reports.length} reports by user`);

    // Populate data manually
    const populatedReports = [];
    
    for (const rescue of reports) {
      const populatedRescue = { 
        ...rescue,
        animalType: rescue.animal?.type || 'unknown'
      };

      // Add reporter info (user's own info)
      populatedRescue.reportedBy = {
        _id: req.user.id,
        name: req.user.name,
        email: req.user.email
      };

      // Populate assignedNGO if present
      if (rescue.assignedNGO) {
        try {
          const ngo = await NGO.findById(rescue.assignedNGO).select('organizationName user').lean();
          if (ngo) {
            populatedRescue.assignedNGO = {
              _id: ngo._id,
              organizationName: ngo.organizationName
            };
            
            // Get NGO user info
            if (ngo.user) {
              try {
                const ngoUser = await User.findById(ngo.user).select('name email phone').lean();
                if (ngoUser) {
                  populatedRescue.assignedNGO.user = ngoUser;
                }
              } catch (userError) {
                console.log('NGO user not found:', userError);
              }
            }
          } else {
            populatedRescue.assignedNGO = {
              organizationName: 'Deleted NGO',
              isDeleted: true
            };
          }
        } catch (ngoError) {
          console.log('NGO lookup error:', ngoError);
          populatedRescue.assignedNGO = null;
        }
      }

      populatedReports.push(populatedRescue);
    }

    // Get total count
    const total = await Rescue.countDocuments(filter);

    res.json({
      success: true,
      reports: populatedReports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Get my reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your reports',
      error: error.message
    });
  }
});

// @route   GET /api/rescues/my-assignments
// @desc    Get NGO's assigned rescues
// @access  Private (NGO only)
router.get('/my-assignments', auth, async (req, res) => {
  try {
    console.log('🚑 Fetching assignments for NGO user:', req.user.email);

    if (req.user.role !== 'ngo') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. NGO role required.'
      });
    }

    const { page = 1, limit = 20, status } = req.query;

    // Find the NGO profile
    const ngoProfile = await NGO.findOne({ user: req.user.id });
    if (!ngoProfile) {
      return res.status(404).json({
        success: false,
        message: 'NGO profile not found'
      });
    }

    console.log('🏢 NGO profile found:', ngoProfile.organizationName);

    // Build filter for assigned rescues
    let filter = { assignedNGO: ngoProfile._id };
    
    if (status && status !== 'all') {
      filter.status = status;
    }

    // Get rescues assigned to this NGO
    const assignments = await Rescue.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    console.log(`✅ Found ${assignments.length} assigned rescues`);

    // Populate data manually
    const populatedAssignments = [];
    
    for (const rescue of assignments) {
      const populatedRescue = { 
        ...rescue,
        animalType: rescue.animal?.type || 'unknown'
      };

      // Populate reporter
      if (rescue.reporter) {
        try {
          const reporter = await User.findById(rescue.reporter).select('name email phone').lean();
          if (reporter) {
            populatedRescue.reportedBy = reporter;
          } else {
            populatedRescue.reportedBy = {
              name: 'Deleted User',
              email: 'deleted@example.com'
            };
          }
        } catch (error) {
          console.log('Reporter not found:', error);
          populatedRescue.reportedBy = {
            name: 'Unknown User',
            email: 'unknown@example.com'
          };
        }
      }

      // Add NGO info
      populatedRescue.assignedNGO = {
        _id: ngoProfile._id,
        organizationName: ngoProfile.organizationName
      };

      populatedAssignments.push(populatedRescue);
    }

    // Get total count
    const total = await Rescue.countDocuments(filter);

    res.json({
      success: true,
      assignments: populatedAssignments,
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


// @route   POST /api/rescues
// @desc    Create a new rescue case - FIXED FOR YOUR DATA STRUCTURE
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    console.log('🚑 New rescue submission from:', req.user.email);
    console.log('📋 Rescue data received:', JSON.stringify(req.body, null, 2));

    const {
      title,
      description,
      animal,
      location,
      urgency,
      tags = [],
      images = []
    } = req.body;

    // Manual validation for your data structure
    const errors = [];
    
    if (!title || title.trim().length < 3) {
      errors.push({ field: 'title', message: 'Title must be at least 3 characters' });
    }
    
    if (!description || description.trim().length < 10) {
      errors.push({ field: 'description', message: 'Description must be at least 10 characters' });
    }
    
    if (!animal || !animal.type) {
      errors.push({ field: 'animal.type', message: 'Animal type is required' });
    }
    
    if (!location || (!location.address && !location.city)) {
      errors.push({ field: 'location', message: 'Location address or city is required' });
    }
    
    if (!urgency || !['low', 'medium', 'high', 'critical'].includes(urgency)) {
      errors.push({ field: 'urgency', message: 'Valid urgency level is required' });
    }

    if (errors.length > 0) {
      console.log('❌ Validation errors:', errors);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    // Get user information for the rescue
    const user = await User.findById(req.user.id).select('name email phone');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prepare rescue data according to your schema
    const rescueData = {
      title: title.trim(),
      description: description.trim(),
      reporter: req.user.id, // Your schema uses 'reporter' not 'reportedBy'
      
      // Animal data structure matching your schema
      animal: {
        type: animal.type,
        age: animal.age || { category: 'unknown', estimated: null },
        gender: animal.gender || 'unknown',
        size: animal.size || 'medium',
        color: animal.color || '',
        medicalCondition: animal.medicalCondition || ''
      },
      
      // Location data structure matching your schema
      location: {
        address: location.address || '',
        city: location.city || '',
        state: location.state || '',
        zipCode: location.zipCode || '',
        coordinates: location.coordinates || { latitude: null, longitude: null },
        landmark: location.landmark || '',
        description: location.description || `${location.address || ''} ${location.city || ''}`.trim()
      },
      
      urgency: urgency,
      status: 'reported', // Your schema uses lowercase
      assignedNGO: null,
      
      images: images || [],
      tags: tags || [],
      priority: urgency === 'critical' ? 10 : urgency === 'high' ? 8 : urgency === 'medium' ? 5 : 3,
      isPublic: true,
      
      // Timeline entry
      timeline: [{
        event: 'Rescue Reported',
        description: `Rescue case reported by ${user.name}`,
        timestamp: new Date(),
        updatedBy: req.user.id
      }],

      // AI prediction if provided
      aiPrediction: animal.aiPrediction || {
        confidence: 0,
        suggestions: [],
        medicalAssessment: ''
      }
    };

    console.log('🔄 Processed rescue data:', JSON.stringify(rescueData, null, 2));

    // Create the rescue
    const rescue = new Rescue(rescueData);
    await rescue.save();

    console.log('✅ Rescue created successfully:', rescue._id);

    // Populate the rescue for response
    const populatedRescue = await Rescue.findById(rescue._id)
      .populate('reporter', 'name email phone')
      .lean();

    res.status(201).json({
      success: true,
      message: 'Rescue case reported successfully!',
      rescue: populatedRescue
    });

  } catch (error) {
    console.error('❌ Create rescue error:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create rescue case',
      error: error.message
    });
  }
});


// @route   GET /api/rescues
// @desc    Get all rescues with filtering - FIXED FOR CORRUPT DATA
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { status, animalType, urgency, page = 1, limit = 20 } = req.query;
    
    console.log('📋 Rescue request from user:', req.user.email, 'Role:', req.user.role);

    // STEP 1: Clean up corrupt assignedNGO data
    try {
      await Rescue.updateMany(
        { assignedNGO: { $type: "object", $not: { $type: "objectId" } } },
        { $unset: { assignedNGO: "" }, $set: { status: "reported" } }
      );
    } catch (cleanupError) {
      console.log('Cleanup attempted but continuing...');
    }

    // STEP 2: Build filter
    let filter = {};
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (animalType && animalType !== 'all') {
      filter['animal.type'] = animalType;
    }
    
    if (urgency && urgency !== 'all') {
      filter.urgency = urgency;
    }

    // STEP 3: Role-based filtering
    if (req.user.role === 'user') {
      filter.reporter = req.user.id;
    } else if (req.user.role === 'ngo') {
      try {
        const ngoProfile = await NGO.findOne({ user: req.user.id });
        if (ngoProfile) {
          filter.$or = [
            { assignedNGO: ngoProfile._id },
            { assignedNGO: { $exists: false } },
            { assignedNGO: null }
          ];
        } else {
          filter.$or = [
            { assignedNGO: { $exists: false } },
            { assignedNGO: null }
          ];
        }
      } catch (ngoError) {
        console.error('NGO profile error:', ngoError);
        filter.$or = [
          { assignedNGO: { $exists: false } },
          { assignedNGO: null }
        ];
      }
    }

    console.log('📋 Final filter:', JSON.stringify(filter));

    // STEP 4: Query rescues
    const rescues = await Rescue.find(filter)
      .sort({ createdAt: -1, priority: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    console.log(`✅ Found ${rescues.length} rescues`);

    // STEP 5: Safe population with orphan handling
    const populatedRescues = [];
    
    for (const rescue of rescues) {
      const populatedRescue = { 
        ...rescue,
        animalType: rescue.animal?.type || 'unknown'
      };

      // SAFE: Populate reporter with orphan handling
      if (rescue.reporter) {
        try {
          const reporter = await User.findById(rescue.reporter).select('name email').lean();
          if (reporter) {
            populatedRescue.reportedBy = reporter;
            populatedRescue.reporterName = reporter.name;
            populatedRescue.reporterEmail = reporter.email;
          } else {
            // ORPHANED REPORTER: User was deleted
            console.log(`⚠️ Orphaned reporter for rescue ${rescue._id}: ${rescue.reporter}`);
            populatedRescue.reportedBy = {
              name: 'Deleted User',
              email: 'deleted@example.com'
            };
            populatedRescue.reporterName = 'Deleted User';
            populatedRescue.reporterEmail = 'deleted@example.com';
            populatedRescue.isOrphaned = true;
          }
        } catch (error) {
          console.log('Reporter lookup error:', error);
          populatedRescue.reportedBy = {
            name: 'Unknown User',
            email: 'unknown@example.com'
          };
          populatedRescue.reporterName = 'Unknown User';
          populatedRescue.reporterEmail = 'unknown@example.com';
        }
      }

      // SAFE: Populate assignedNGO with orphan handling
      if (rescue.assignedNGO && typeof rescue.assignedNGO === 'object') {
        // Check if it's a valid ObjectId or corrupt object
        const assignedNGOId = rescue.assignedNGO._id || 
                              (rescue.assignedNGO.toString && rescue.assignedNGO.toString().match(/^[0-9a-fA-F]{24}$/)) ? 
                              rescue.assignedNGO : null;

        if (assignedNGOId) {
          try {
            const ngo = await NGO.findById(assignedNGOId).select('organizationName user').lean();
            if (ngo) {
              populatedRescue.assignedNGO = {
                _id: ngo._id,
                organizationName: ngo.organizationName
              };
              
              // Get NGO user info
              if (ngo.user) {
                try {
                  const ngoUser = await User.findById(ngo.user).select('name email phone').lean();
                  if (ngoUser) {
                    populatedRescue.assignedNGO.user = ngoUser;
                  }
                } catch (userError) {
                  console.log('NGO user lookup error:', userError);
                }
              }
            } else {
              // ORPHANED NGO: NGO was deleted
              console.log(`⚠️ Orphaned NGO assignment for rescue ${rescue._id}: ${assignedNGOId}`);
              populatedRescue.assignedNGO = {
                _id: assignedNGOId,
                organizationName: 'Deleted NGO',
                isDeleted: true
              };
              populatedRescue.isOrphaned = true;
            }
          } catch (ngoError) {
            console.log('NGO lookup error:', ngoError);
            populatedRescue.assignedNGO = null;
          }
        } else {
          // Completely corrupt assignedNGO data
          console.log(`🔧 Fixing corrupt assignedNGO for rescue ${rescue._id}`);
          await Rescue.findByIdAndUpdate(rescue._id, {
            $unset: { assignedNGO: "" },
            status: "reported"
          });
          populatedRescue.assignedNGO = null;
        }
      }

      populatedRescues.push(populatedRescue);
    }

    // STEP 6: Get total count
    const total = await Rescue.countDocuments(filter);

    res.json({
      success: true,
      rescues: populatedRescues,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Get rescues error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rescues',
      error: error.message
    });
  }
});

// @route   GET /api/rescues/:id
// @desc    Get single rescue by ID with full details
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const rescueId = req.params.id;
    console.log('🔍 Fetching rescue details for ID:', rescueId, 'by user:', req.user.email);

    // Validate ObjectId format
    if (!rescueId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rescue ID format'
      });
    }

    // Find the rescue
    const rescue = await Rescue.findById(rescueId).lean();
    
    if (!rescue) {
      return res.status(404).json({
        success: false,
        message: 'Rescue not found'
      });
    }

    console.log('📋 Found rescue:', rescue.title);

    // Check permissions
    let hasAccess = false;
    
    if (req.user.role === 'admin') {
      hasAccess = true;
    } else if (req.user.role === 'user') {
      // Users can see their own reports or public rescues
      hasAccess = rescue.reporter?.toString() === req.user.id || rescue.isPublic;
    } else if (req.user.role === 'ngo') {
      // NGOs can see rescues assigned to them or unassigned public rescues
      try {
        const ngoProfile = await NGO.findOne({ user: req.user.id });
        if (ngoProfile) {
          hasAccess = (rescue.assignedNGO?.toString() === ngoProfile._id.toString()) ||
                     (!rescue.assignedNGO && rescue.isPublic);
        } else {
          hasAccess = !rescue.assignedNGO && rescue.isPublic;
        }
      } catch (ngoError) {
        console.error('NGO lookup error:', ngoError);
        hasAccess = !rescue.assignedNGO && rescue.isPublic;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have permission to view this rescue.'
      });
    }

    // Populate the rescue with full details
    const populatedRescue = { 
      ...rescue,
      animalType: rescue.animal?.type || 'unknown'
    };

    // SAFE: Populate reporter with orphan handling
    if (rescue.reporter) {
      try {
        const reporter = await User.findById(rescue.reporter).select('name email phone').lean();
        if (reporter) {
          populatedRescue.reportedBy = reporter;
        } else {
          // ORPHANED REPORTER: User was deleted
          console.log(`⚠️ Orphaned reporter for rescue ${rescue._id}: ${rescue.reporter}`);
          populatedRescue.reportedBy = {
            name: 'Deleted User',
            email: 'deleted@example.com'
          };
          populatedRescue.isOrphaned = true;
        }
      } catch (error) {
        console.log('Reporter lookup error:', error);
        populatedRescue.reportedBy = {
          name: 'Unknown User',
          email: 'unknown@example.com'
        };
      }
    }

    // SAFE: Populate assignedNGO with orphan handling
    if (rescue.assignedNGO) {
      try {
        const ngo = await NGO.findById(rescue.assignedNGO).select('organizationName user description').lean();
        if (ngo) {
          populatedRescue.assignedNGO = {
            _id: ngo._id,
            organizationName: ngo.organizationName,
            description: ngo.description
          };
          
          // Get NGO user info
          if (ngo.user) {
            try {
              const ngoUser = await User.findById(ngo.user).select('name email phone').lean();
              if (ngoUser) {
                populatedRescue.assignedNGO.user = ngoUser;
              }
            } catch (userError) {
              console.log('NGO user lookup error:', userError);
            }
          }
        } else {
          // ORPHANED NGO: NGO was deleted
          console.log(`⚠️ Orphaned NGO assignment for rescue ${rescue._id}: ${rescue.assignedNGO}`);
          populatedRescue.assignedNGO = {
            _id: rescue.assignedNGO,
            organizationName: 'Deleted NGO',
            isDeleted: true
          };
          populatedRescue.isOrphaned = true;
        }
      } catch (ngoError) {
        console.log('NGO lookup error:', ngoError);
        populatedRescue.assignedNGO = null;
      }
    }

    // Populate timeline entries with user info
    if (rescue.timeline && Array.isArray(rescue.timeline)) {
      const populatedTimeline = [];
      
      for (const entry of rescue.timeline) {
        const populatedEntry = { ...entry };
        
        if (entry.updatedBy) {
          try {
            const updatedByUser = await User.findById(entry.updatedBy).select('name email').lean();
            if (updatedByUser) {
              populatedEntry.updatedByUser = updatedByUser;
            } else {
              populatedEntry.updatedByUser = { name: 'Deleted User', email: 'deleted@example.com' };
            }
          } catch (error) {
            populatedEntry.updatedByUser = { name: 'Unknown User', email: 'unknown@example.com' };
          }
        }
        
        populatedTimeline.push(populatedEntry);
      }
      
      populatedRescue.timeline = populatedTimeline;
    }

    console.log('✅ Rescue details prepared successfully');

    res.json({
      success: true,
      rescue: populatedRescue
    });

  } catch (error) {
    console.error('❌ Get rescue details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rescue details',
      error: error.message
    });
  }
});



// @route   PUT /api/rescues/:id/accept
// @desc    Accept rescue case (NGO only)
// @access  Private (NGO)
router.put('/:id/accept', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ngo') {
      return res.status(403).json({
        success: false,
        message: 'Only NGOs can accept rescue cases'
      });
    }

    const rescue = await Rescue.findById(req.params.id).populate('reportedBy', 'name email');
    if (!rescue) {
      return res.status(404).json({
        success: false,
        message: 'Rescue not found'
      });
    }

    if (rescue.assignedNGO) {
      return res.status(400).json({
        success: false,
        message: 'This rescue has already been assigned to another NGO'
      });
    }

    // Get NGO profile
    const ngoProfile = await NGO.findOne({ user: req.user.id });
    if (!ngoProfile) {
      return res.status(404).json({
        success: false,
        message: 'NGO profile not found'
      });
    }

    if (ngoProfile.verification?.status !== 'verified' || !ngoProfile.isActive) {
      return res.status(403).json({
        success: false,
        message: 'NGO is not verified or active'
      });
    }

    // Assign rescue to NGO
    rescue.assignedNGO = ngoProfile._id;
    rescue.status = 'ASSIGNED';
    rescue.assignedAt = new Date();
    await rescue.save();

    console.log('✅ Rescue accepted by NGO:', ngoProfile.organizationName);

    // Send notification to reporter
    if (rescue.reportedBy && rescue.reportedBy.email) {
      try {
        await sendEmail({
          to: rescue.reportedBy.email,
          template: 'rescueAssigned',
          data: {
            reporterName: rescue.reportedBy.name,
            rescueTitle: rescue.title,
            animalType: rescue.animalType,
            ngoName: ngoProfile.organizationName,
            ngoEmail: req.user.email,
            ngoPhone: req.user.phone || 'Not provided',
            rescueUrl: `${process.env.FRONTEND_URL}/rescues/${rescue._id}`
          }
        });
        console.log('✅ Rescue assignment email sent to reporter');
      } catch (emailError) {
        console.error('❌ Failed to send assignment email:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'Rescue case accepted successfully',
      rescue
    });

  } catch (error) {
    console.error('❌ Accept rescue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept rescue',
      error: error.message
    });
  }
});

// @route   PUT /api/rescues/:id/status
// @desc    Update rescue status with notifications
// @access  Private
router.put('/:id/status', [
  auth,
  body('status').isIn(['REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'RESCUED', 'COMPLETED', 'CANCELLED']).withMessage('Invalid status'),
  body('message').optional().trim().isLength({ max: 500 }).withMessage('Message too long')
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

    const { status, message } = req.body;
    
    const rescue = await Rescue.findById(req.params.id)
      .populate('reportedBy', 'name email')
      .populate('assignedNGO', 'organizationName user');

    if (!rescue) {
      return res.status(404).json({
        success: false,
        message: 'Rescue not found'
      });
    }

    // Check permissions
    const isOwner = rescue.reportedBy?._id?.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';
    let isAssignedNGO = false;

    if (req.user.role === 'ngo') {
      const ngoProfile = await NGO.findOne({ user: req.user.id });
      isAssignedNGO = rescue.assignedNGO?._id?.toString() === ngoProfile?._id?.toString();
    }

    if (!isOwner && !isAdmin && !isAssignedNGO) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const previousStatus = rescue.status;
    rescue.status = status;
    
    if (message) {
      if (!rescue.updates) rescue.updates = [];
      rescue.updates.push({
        message: message.trim(),
        updatedBy: req.user.id,
        updatedAt: new Date(),
        status: status
      });
    }

    await rescue.save();

    console.log('✅ Rescue status updated:', rescue._id, 'from', previousStatus, 'to', status);

    // Send status update email to reporter (if not the one updating)
    if (rescue.reportedBy && rescue.reportedBy.email && rescue.reportedBy._id.toString() !== req.user.id) {
      try {
        await sendEmail({
          to: rescue.reportedBy.email,
          template: 'statusUpdate',
          data: {
            reporterName: rescue.reportedBy.name,
            rescueTitle: rescue.title,
            animalType: rescue.animalType,
            oldStatus: previousStatus,
            newStatus: status,
            updateMessage: message,
            assignedNGO: rescue.assignedNGO?.organizationName,
            rescueUrl: `${process.env.FRONTEND_URL}/rescues/${rescue._id}`
          }
        });
        console.log('✅ Status update email sent to reporter');
      } catch (emailError) {
        console.error('❌ Failed to send status update email:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'Rescue status updated successfully',
      rescue
    });

  } catch (error) {
    console.error('❌ Update rescue status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update rescue status',
      error: error.message
    });
  }
});

// @route   PUT /api/rescues/:id/cancel
// @desc    Cancel rescue case
// @access  Private
router.put('/:id/cancel', [
  auth,
  body('reason').trim().isLength({ min: 10, max: 500 }).withMessage('Cancellation reason is required (10-500 characters)')
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

    const { reason } = req.body;
    
    const rescue = await Rescue.findById(req.params.id)
      .populate('reportedBy', 'name email')
      .populate('assignedNGO', 'organizationName user');

    if (!rescue) {
      return res.status(404).json({
        success: false,
        message: 'Rescue not found'
      });
    }

    // Check permissions - only reporter or assigned NGO can cancel
    const isOwner = rescue.reportedBy?._id?.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';
    let isAssignedNGO = false;

    if (req.user.role === 'ngo') {
      const ngoProfile = await NGO.findOne({ user: req.user.id });
      isAssignedNGO = rescue.assignedNGO?._id?.toString() === ngoProfile?._id?.toString();
    }

    if (!isOwner && !isAdmin && !isAssignedNGO) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const previousStatus = rescue.status;
    rescue.status = 'CANCELLED';
    rescue.cancelledAt = new Date();
    rescue.cancelledBy = req.user.id;
    rescue.cancellationReason = reason.trim();

    // Add update entry
    if (!rescue.updates) rescue.updates = [];
    rescue.updates.push({
      message: `Rescue cancelled: ${reason.trim()}`,
      updatedBy: req.user.id,
      updatedAt: new Date(),
      status: 'CANCELLED'
    });

    await rescue.save();

    console.log('✅ Rescue cancelled:', rescue._id);

    // Notify relevant parties about cancellation
    const notifications = [];

    // Notify reporter if cancelled by NGO
    if (isAssignedNGO && rescue.reportedBy && rescue.reportedBy.email) {
      notifications.push({
        email: rescue.reportedBy.email,
        name: rescue.reportedBy.name,
        role: 'reporter'
      });
    }

    // Notify NGO if cancelled by reporter
    if (isOwner && rescue.assignedNGO && rescue.assignedNGO.user) {
      const ngoUser = await User.findById(rescue.assignedNGO.user);
      if (ngoUser) {
        notifications.push({
          email: ngoUser.email,
          name: ngoUser.name,
          role: 'ngo',
          ngoName: rescue.assignedNGO.organizationName
        });
      }
    }

    // Send cancellation notifications
    for (const recipient of notifications) {
      try {
        await sendEmail({
          to: recipient.email,
          template: 'statusUpdate',
          data: {
            reporterName: recipient.name,
            rescueTitle: rescue.title,
            animalType: rescue.animalType,
            oldStatus: previousStatus,
            newStatus: 'CANCELLED',
            updateMessage: `Rescue cancelled by ${req.user.name}: ${reason.trim()}`,
            assignedNGO: rescue.assignedNGO?.organizationName,
            rescueUrl: `${process.env.FRONTEND_URL}/rescues/${rescue._id}`
          }
        });
        console.log('✅ Cancellation email sent to:', recipient.email);
      } catch (emailError) {
        console.error('❌ Failed to send cancellation email:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'Rescue cancelled successfully',
      rescue
    });

  } catch (error) {
    console.error('❌ Cancel rescue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel rescue',
      error: error.message
    });
  }
});

// @route   DELETE /api/rescues/:id
// @desc    Delete rescue case (Admin only)
// @access  Private (Admin)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can delete rescue cases'
      });
    }

    const rescue = await Rescue.findById(req.params.id);
    if (!rescue) {
      return res.status(404).json({
        success: false,
        message: 'Rescue not found'
      });
    }

    await Rescue.findByIdAndDelete(req.params.id);

    console.log('✅ Rescue deleted by admin:', rescue._id);

    res.json({
      success: true,
      message: 'Rescue case deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete rescue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete rescue',
      error: error.message
    });
  }
});

// @route   GET /api/rescues/stats/summary
// @desc    Get rescue statistics summary
// @access  Private
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const [
      totalRescues,
      reportedRescues,
      assignedRescues,
      completedRescues,
      cancelledRescues
    ] = await Promise.all([
      Rescue.countDocuments(),
      Rescue.countDocuments({ status: 'REPORTED' }),
      Rescue.countDocuments({ status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } }),
      Rescue.countDocuments({ status: { $in: ['RESCUED', 'COMPLETED'] } }),
      Rescue.countDocuments({ status: 'CANCELLED' })
    ]);

    const stats = {
      totalRescues,
      reportedRescues,
      assignedRescues,
      completedRescues,
      cancelledRescues,
      successRate: totalRescues > 0 ? ((completedRescues / totalRescues) * 100).toFixed(1) : 0
    };

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('❌ Get rescue stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rescue statistics',
      error: error.message
    });
  }
});

module.exports = router;
