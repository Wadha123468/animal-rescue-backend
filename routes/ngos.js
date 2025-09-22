const express = require('express');
const { body, validationResult } = require('express-validator');
const NGO = require('../models/NGO');
const User = require('../models/User');
const Rescue = require('../models/Rescue');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

const router = express.Router();

// IMPORTANT: Specific routes MUST come BEFORE parameterized routes
// Place all specific routes (like 'my-profile') before routes with parameters (like ':id')

// routes/ngos.js

// @route   GET /api/ngos/my-profile
// @desc    Get current NGO's profile
// @access  Private (NGO only)
router.get('/my-profile', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ngo') {
      return res.status(403).json({ success: false, message: 'NGO access required' });
    }

    console.log('🏢 Fetching NGO profile for user:', req.user.id, req.user.email);

    const ngoProfile = await NGO.findOne({ user: req.user.id })
      .populate('user', 'name email phone')
      .lean();

    if (!ngoProfile) {
      return res.status(404).json({ 
        success: false, 
        message: 'NGO profile not found' 
      });
    }

    console.log('✅ NGO profile found:', ngoProfile.organizationName);

    res.json({
      success: true,
      ngoProfile
    });
  } catch (error) {
    console.error('❌ Get NGO profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch NGO profile' 
    });
  }
});

// @route   POST /api/ngos/my-profile
// @desc    Create new NGO profile
// @access  Private (NGO only)
router.post('/my-profile', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ngo') {
      return res.status(403).json({ success: false, message: 'NGO access required' });
    }

    // Check if profile already exists
    const existingProfile = await NGO.findOne({ user: req.user.id });
    if (existingProfile) {
      return res.status(400).json({ 
        success: false, 
        message: 'NGO profile already exists. Use PUT to update.' 
      });
    }

    console.log('🆕 Creating NGO profile for user:', req.user.email);

    const ngoProfile = new NGO({
      user: req.user.id,
      ...req.body,
      statistics: {
        totalRescues: 0,
        successfulRescues: 0,
        rating: 5.0
      }
    });

    await ngoProfile.save();

    console.log('✅ NGO profile created:', ngoProfile.organizationName);

    res.status(201).json({
      success: true,
      message: 'NGO profile created successfully',
      ngoProfile
    });
  } catch (error) {
    console.error('❌ Create NGO profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create NGO profile',
      error: error.message 
    });
  }
});

// @route   PUT /api/ngos/my-profile
// @desc    Update NGO profile
// @access  Private (NGO only)
router.put('/my-profile', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ngo') {
      return res.status(403).json({ success: false, message: 'NGO access required' });
    }

    console.log('🔄 Updating NGO profile for user:', req.user.email);

    const ngoProfile = await NGO.findOneAndUpdate(
      { user: req.user.id },
      { $set: req.body },
      { new: true, upsert: true }
    );

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



// @route   PUT /api/ngos/my-profile
// @desc    Update NGO profile
// @access  Private (NGO only)
router.put('/my-profile', [
  auth,
  body('organizationName').trim().isLength({ min: 2, max: 100 }).withMessage('Organization name must be 2-100 characters'),
  body('registrationNumber').trim().isLength({ min: 1 }).withMessage('Registration number is required'),
  body('specialties').isArray({ min: 1 }).withMessage('At least one specialty is required'),
  body('capacity.total').isInt({ min: 1 }).withMessage('Total capacity must be at least 1')
], async (req, res) => {
  try {
    console.log('🏢 Updating NGO profile for user:', req.user.id);
    
    if (req.user.role !== 'ngo') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. NGO role required.'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };

    // If capacity.current is greater than new total, adjust it
    if (updateData.capacity && updateData.capacity.total) {
      const existingNGO = await NGO.findOne({ user: req.user.id });
      if (existingNGO && existingNGO.capacity.current > updateData.capacity.total) {
        updateData.capacity.current = updateData.capacity.total;
      }
      updateData.capacity.available = updateData.capacity.total - (updateData.capacity.current || 0);
    }

    const ngo = await NGO.findOneAndUpdate(
      { user: req.user.id },
      updateData,
      { new: true, upsert: true, runValidators: true }
    ).populate('user', 'name email phone');

    console.log('✅ NGO profile updated:', ngo.organizationName);

    res.json({
      success: true,
      message: 'NGO profile updated successfully',
      ngo
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

// @route   GET /api/ngos
// @desc    Get all NGOs with filtering
// @access  Public
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      city,
      state,
      specialty,
      verified = true
    } = req.query;

    const filter = {
      isActive: true
    };

    if (verified === 'true') {
      filter['verification.status'] = 'verified';
    }

    if (city) {
      filter['serviceAreas.city'] = new RegExp(city, 'i');
    }

    if (state) {
      filter['serviceAreas.state'] = new RegExp(state, 'i');
    }

    if (specialty && specialty !== 'all') {
      filter.specialties = { $in: [specialty, 'all'] };
    }

    const ngos = await NGO.find(filter)
      .populate('user', 'name email phone')
      .sort({ 'statistics.rating': -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await NGO.countDocuments(filter);

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
    console.error('Get NGOs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch NGOs',
      error: error.message
    });
  }
});

// @route   GET /api/ngos/stats
// @desc    Get NGO statistics
// @access  Public
router.get('/stats', async (req, res) => {
  try {
    const [
      totalNGOs,
      verifiedNGOs,
      activeRescues,
      completedRescues
    ] = await Promise.all([
      NGO.countDocuments(),
      NGO.countDocuments({ 'verification.status': 'verified', isActive: true }),
      Rescue.countDocuments({ status: { $in: ['assigned', 'in_progress'] } }),
      Rescue.countDocuments({ status: { $in: ['rescued', 'completed'] } })
    ]);

    res.json({
      success: true,
      stats: {
        totalNGOs,
        verifiedNGOs,
        activeRescues,
        completedRescues
      }
    });

  } catch (error) {
    console.error('Get NGO stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch NGO statistics'
    });
  }
});

// @route   GET /api/ngos/:id
// @desc    Get NGO by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    console.log('🏢 Fetching NGO by ID:', req.params.id);

    const ngo = await NGO.findById(req.params.id)
      .populate('user', 'name email phone')
      .lean();

    if (!ngo) {
      return res.status(404).json({
        success: false,
        message: 'NGO not found'
      });
    }

    // Get recent rescues handled by this NGO
    const recentRescues = await Rescue.find({ 'assignedNGO.ngo': ngo._id })
      .populate('reporter', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.json({
      success: true,
      ngo: {
        ...ngo,
        recentRescues
      }
    });

  } catch (error) {
    console.error('Get NGO by ID error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid NGO ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch NGO details',
      error: error.message
    });
  }
});

// @route   PUT /api/ngos/:id/verify
// @desc    Verify NGO (Admin only)
// @access  Private (Admin only)
router.put('/:id/verify', [auth, authorize('admin')], async (req, res) => {
  try {
    const ngo = await NGO.findByIdAndUpdate(
      req.params.id,
      {
        'verification.status': 'verified',
        'verification.verifiedBy': req.user.id,
        'verification.verifiedAt': new Date()
      },
      { new: true }
    ).populate('user', 'name email');

    if (!ngo) {
      return res.status(404).json({
        success: false,
        message: 'NGO not found'
      });
    }

    res.json({
      success: true,
      message: 'NGO verified successfully',
      ngo
    });

  } catch (error) {
    console.error('Verify NGO error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify NGO'
    });
  }
});

// @route   PUT /api/ngos/:id/reject
// @desc    Reject NGO verification (Admin only)
// @access  Private (Admin only)
router.put('/:id/reject', [auth, authorize('admin')], async (req, res) => {
  try {
    const { reason } = req.body;

    const ngo = await NGO.findByIdAndUpdate(
      req.params.id,
      {
        'verification.status': 'rejected',
        'verification.rejectionReason': reason,
        'verification.verifiedBy': req.user.id,
        'verification.verifiedAt': new Date()
      },
      { new: true }
    ).populate('user', 'name email');

    if (!ngo) {
      return res.status(404).json({
        success: false,
        message: 'NGO not found'
      });
    }

    res.json({
      success: true,
      message: 'NGO verification rejected',
      ngo
    });

  } catch (error) {
    console.error('Reject NGO error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject NGO verification'
    });
  }
});



module.exports = router;
