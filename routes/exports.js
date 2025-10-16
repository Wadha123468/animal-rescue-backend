const express = require('express');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');
const auth = require('../middleware/auth');
const Rescue = require('../models/Rescue');
const User = require('../models/User');
const NGO = require('../models/NGO');

const router = express.Router();

// @route   GET /api/exports/rescue/:id
// @desc    Export single rescue report (PDF/CSV) - CONTINUOUS CONTENT FLOW
// @access  Private
router.get('/rescue/:id', auth, async (req, res) => {
  try {
    const { format = 'pdf' } = req.query;
    const rescueId = req.params.id;
    const axios = require('axios'); // For fetching images from URLs

    console.log(`📊 Export request: ${format.toUpperCase()} for rescue ${rescueId} by ${req.user.email} (${req.user.role})`);

    // Get rescue with full population
    const rescue = await Rescue.findById(rescueId)
      .populate('reporter', 'name email phone')
      .populate('assignedNGO', 'organizationName contactEmail')
      .lean();

    if (!rescue) {
      console.log(`❌ Rescue not found: ${rescueId}`);
      return res.status(404).json({
        success: false,
        message: 'Rescue not found'
      });
    }

    // Populate timeline entries with user info
    let populatedTimeline = [];
    if (rescue.timeline && Array.isArray(rescue.timeline)) {
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
    }
    rescue.timeline = populatedTimeline;

    // Permission check (same as before)
    let hasAccess = false;
    
    if (req.user.role === 'admin') {
      hasAccess = true;
    } else if (req.user.role === 'user') {
      hasAccess = rescue.reporter && rescue.reporter._id.toString() === req.user.id;
    } else if (req.user.role === 'ngo') {
      try {
        const ngoProfile = await NGO.findOne({ user: req.user.id });
        if (ngoProfile) {
          const isAssignedToNGO = rescue.assignedNGO && rescue.assignedNGO._id.toString() === ngoProfile._id.toString();
          const isUnassignedPublic = !rescue.assignedNGO && rescue.isPublic !== false;
          hasAccess = isAssignedToNGO || isUnassignedPublic;
        }
      } catch (ngoError) {
        console.error('❌ NGO lookup error:', ngoError);
        hasAccess = false;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have permission to export this rescue report.'
      });
    }

    if (format === 'csv') {
      // CSV Export (same as before)
      const timelineText = rescue.timeline?.map((entry, index) => 
        `${index + 1}. ${new Date(entry.timestamp).toLocaleDateString()}: ${entry.event}${entry.description ? ' - ' + entry.description : ''} (by ${entry.updatedByUser?.name || 'System'})`
      ).join(' | ') || 'No timeline entries';

      const csvData = [{
        'Rescue ID': rescue._id,
        'Title': rescue.title,
        'Description': rescue.description,
        'Animal Type': rescue.animal?.type || 'Unknown',
        'Animal Size': rescue.animal?.size || 'Unknown',
        'Animal Gender': rescue.animal?.gender || 'Unknown',
        'Medical Condition': rescue.animal?.medicalCondition || 'None',
        'AI Classification': rescue.animal?.aiPrediction?.species || 'Not classified',
        'AI Confidence': rescue.animal?.aiPrediction?.confidence ? `${Math.round(rescue.animal.aiPrediction.confidence * 100)}%` : 'N/A',
        'Location Address': rescue.location?.address || '',
        'Location City': rescue.location?.city || '',
        'Location State': rescue.location?.state || '',
        'Full Location': `${rescue.location?.address || ''}${rescue.location?.address ? ', ' : ''}${rescue.location?.city || ''}${rescue.location?.city && rescue.location?.state ? ', ' : ''}${rescue.location?.state || ''}`.trim() || 'Not specified',
        'Urgency': rescue.urgency,
        'Status': rescue.status,
        'Reporter': rescue.reporter?.name || 'Unknown',
        'Reporter Email': rescue.reporter?.email || 'Unknown',
        'Assigned NGO': rescue.assignedNGO?.organizationName || 'Not assigned',
        'Timeline': timelineText,
        'Images Count': rescue.images?.length || 0,
        'Created Date': new Date(rescue.createdAt).toLocaleDateString(),
        'Last Updated': new Date(rescue.updatedAt).toLocaleDateString()
      }];

      const { Parser } = require('json2csv');
      const parser = new Parser();
      const csv = parser.parse(csvData);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="rescue-report-${rescueId}.csv"`);
      return res.send(csv);
      
    } else {
      // PDF Export WITH CONTINUOUS FLOW
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 50 });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="rescue-report-${rescueId}.pdf"`);
      doc.pipe(res);

      // Helper function to check if we need a new page and handle it
      const checkPageBreak = (currentY, neededSpace = 50) => {
        if (currentY + neededSpace > 750) { // 750 leaves 42px margin at bottom
          doc.addPage();
          return 50; // New page starts at y=50
        }
        return currentY;
      };

      // Helper function to convert base64 to buffer
      const base64ToBuffer = (base64String) => {
        try {
          const base64Data = base64String.replace(/^data:image\/[a-z]+;base64,/, '');
          return Buffer.from(base64Data, 'base64');
        } catch (error) {
          console.error('Error converting base64 to buffer:', error);
          return null;
        }
      };

      // Helper function to add image to PDF
      const addImageToPDF = async (doc, imageUrl, x, y, maxWidth = 200, maxHeight = 150) => {
        try {
          let imageBuffer;

          if (imageUrl.startsWith('data:image/')) {
            imageBuffer = base64ToBuffer(imageUrl);
          } else if (imageUrl.startsWith('http')) {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            imageBuffer = Buffer.from(response.data);
          } else {
            console.log('Unsupported image format:', imageUrl.substring(0, 50));
            return y;
          }

          if (imageBuffer) {
            const imageOptions = {
              fit: [maxWidth, maxHeight],
              align: 'left',
              valign: 'top'
            };
            
            doc.image(imageBuffer, x, y, imageOptions);
            return y + maxHeight + 10;
          }
        } catch (error) {
          console.error('Error adding image to PDF:', error);
          doc.fontSize(10)
            .fillColor('#666666')
            .text('Image could not be loaded', x, y)
            .fillColor('#000000');
          return y + 20;
        }
        return y;
      };

      // Header
      doc.fontSize(20).text('Animal Rescue Report', 50, 50);
      doc.fontSize(12).text(`Report ID: ${rescue._id}`, 50, 80);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 95);
      doc.text(`Generated by: ${req.user.name || req.user.email} (${req.user.role.toUpperCase()})`, 50, 110);
      doc.moveTo(50, 125).lineTo(550, 125).stroke();

      let y = 145;

      // IMAGES SECTION
      if (rescue.images && rescue.images.length > 0) {
        y = checkPageBreak(y, 25); // Check space for header
        doc.fontSize(16).text('Animal Photos', 50, y);
        y += 25;
        
        console.log(`🖼️ Processing ${rescue.images.length} images`);
        
        // Process images in batches of 2 per row
        for (let i = 0; i < rescue.images.length; i += 2) {
          const image1 = rescue.images[i];
          const image2 = rescue.images[i + 1];
          
          // Check if we need space for images (175px for image + labels)
          y = checkPageBreak(y, 175);
          
          // Add first image
          if (image1 && image1.url) {
            console.log(`📸 Adding image ${i + 1}: ${image1.filename || 'unnamed'}`);
            doc.fontSize(10).text(`${i + 1}. ${image1.filename || `Image ${i + 1}`}`, 50, y);
            if (image1.description) {
              doc.text(`Description: ${image1.description}`, 50, y + 12);
            }
            y += 25;
            
            const newY = await addImageToPDF(doc, image1.url, 50, y, 200, 150);
            
            // Add second image (if exists) next to first one
            if (image2 && image2.url) {
              console.log(`📸 Adding image ${i + 2}: ${image2.filename || 'unnamed'}`);
              const image2Y = y; // Same Y as first image
              doc.fontSize(10).text(`${i + 2}. ${image2.filename || `Image ${i + 2}`}`, 300, image2Y - 25);
              if (image2.description) {
                doc.text(`Description: ${image2.description}`, 300, image2Y - 13);
              }
              
              await addImageToPDF(doc, image2.url, 300, image2Y, 200, 150);
            }
            
            y = newY + 20; // Space between rows
          }
        }
        
        y += 30; // Extra space after images section
      }

      // BASIC INFORMATION
      y = checkPageBreak(y, 80); // Estimate space needed
      doc.fontSize(16).text('Basic Information', 50, y);
      y += 25;
      doc.fontSize(11)
        .text(`Title: ${rescue.title}`, 50, y)
        .text(`Status: ${rescue.status.toUpperCase()}`, 350, y);
      y += 20;
      doc.text(`Urgency: ${rescue.urgency.toUpperCase()}`, 50, y)
        .text(`Created: ${new Date(rescue.createdAt).toLocaleDateString()}`, 350, y);
      y += 25;

      doc.fontSize(11).text(`Description:`, 50, y);
      y += 15;
      
      // Handle long descriptions that might need page break
      const descriptionHeight = Math.ceil(rescue.description.length / 70) * 12;
      y = checkPageBreak(y, descriptionHeight);
      doc.text(rescue.description, 50, y, { width: 500, align: 'justify' });
      y += descriptionHeight + 20;

      // ANIMAL INFORMATION
      y = checkPageBreak(y, 100); // Estimate space needed
      doc.fontSize(16).text('Animal Information', 50, y);
      y += 25;
      doc.fontSize(11)
        .text(`Type: ${rescue.animal?.type || 'Unknown'}`, 50, y)
        .text(`Size: ${rescue.animal?.size || 'Unknown'}`, 200, y)
        .text(`Gender: ${rescue.animal?.gender || 'Unknown'}`, 350, y);
      y += 20;
      doc.text(`Color: ${rescue.animal?.color || 'Not specified'}`, 50, y);
      y += 20;

      if (rescue.animal?.aiPrediction) {
        doc.text(`AI Classification: ${rescue.animal.aiPrediction.species} (${Math.round(rescue.animal.aiPrediction.confidence * 100)}% confidence)`, 50, y);
        y += 20;
      }

      if (rescue.animal?.medicalCondition) {
        const medicalHeight = Math.ceil(rescue.animal.medicalCondition.length / 70) * 12;
        y = checkPageBreak(y, medicalHeight);
        doc.text(`Medical Condition: ${rescue.animal.medicalCondition}`, 50, y, { width: 500 });
        y += medicalHeight + 20;
      }

      // LOCATION INFORMATION
      y = checkPageBreak(y, 80);
      doc.fontSize(16).text('Location Information', 50, y);
      y += 25;
      doc.fontSize(11).text(`Address: ${rescue.location?.address || 'Not specified'}`, 50, y);
      y += 15;
      doc.text(`City: ${rescue.location?.city || 'Unknown'}`, 50, y)
        .text(`State: ${rescue.location?.state || 'Unknown'}`, 250, y);
      y += 20;

      if (rescue.location?.coordinates?.latitude) {
        doc.text(`Coordinates: ${rescue.location.coordinates.latitude}, ${rescue.location.coordinates.longitude}`, 50, y);
        y += 20;
      }

      // REPORTER INFORMATION
      y = checkPageBreak(y, 50);
      doc.fontSize(16).text('Reporter Information', 50, y);
      y += 25;
      doc.fontSize(11)
        .text(`Name: ${rescue.reporter?.name || 'Unknown'}`, 50, y)
        .text(`Email: ${rescue.reporter?.email || 'Unknown'}`, 300, y);
      y += 25;

      // NGO INFORMATION
      if (rescue.assignedNGO) {
        y = checkPageBreak(y, 60);
        doc.fontSize(16).text('Assigned NGO', 50, y);
        y += 25;
        doc.fontSize(11).text(`Organization: ${rescue.assignedNGO.organizationName}`, 50, y);
        y += 20;
        if (rescue.assignedNGO.contactEmail) {
          doc.text(`Contact: ${rescue.assignedNGO.contactEmail}`, 50, y);
          y += 20;
        }
      }

      // TIMELINE SECTION - SMART PAGE MANAGEMENT
      if (rescue.timeline && rescue.timeline.length > 0) {
        console.log(`📏 Timeline starts at Y: ${y}`);
        
        // Check if we can fit timeline header + at least first entry
        y = checkPageBreak(y, 70);
        
        doc.fontSize(16).text('Timeline & Progress Updates', 50, y);
        y += 25;
        
        rescue.timeline.forEach((entry, index) => {
          // Calculate space needed for this entry
          let entryHeight = 15; // Base height for date + event
          if (entry.description) entryHeight += 12;
          if (entry.updatedByUser) entryHeight += 12;
          entryHeight += 8; // spacing
          if (index < rescue.timeline.length - 1) entryHeight += 12; // separator line
          
          console.log(`📏 Entry ${index + 1} needs ${entryHeight}px at Y: ${y}`);
          
          // Check if this entry fits on current page
          y = checkPageBreak(y, entryHeight);
          
          doc.fontSize(11)
            .fillColor('#2563eb')
            .text(`${new Date(entry.timestamp).toLocaleDateString()} ${new Date(entry.timestamp).toLocaleTimeString()}:`, 50, y);
          
          doc.fillColor('#000000')
            .text(`${entry.event}`, 180, y, { width: 370 });
          
          y += 15;
          
          if (entry.description) {
            doc.fontSize(10)
              .fillColor('#374151')
              .text(`${entry.description}`, 70, y, { width: 450 });
            y += 12;
          }
          
          if (entry.updatedByUser) {
            doc.fontSize(9)
              .fillColor('#6b7280')
              .text(`Updated by: ${entry.updatedByUser.name}`, 70, y);
            y += 12;
          }
          
          y += 8;
          
          if (index < rescue.timeline.length - 1) {
            doc.strokeColor('#e5e7eb')
              .moveTo(70, y)
              .lineTo(520, y)
              .stroke();
            y += 12;
          }
          
          console.log(`📏 After entry ${index + 1}: Y = ${y}`);
        });
      }

      console.log('📊 Sending PDF export with continuous content flow');
      doc.end();
    }

  } catch (error) {
    console.error('❌ Export rescue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export rescue report',
      error: error.message
    });
  }
});





// @route   GET /api/exports/dashboard
// @desc    Export user/NGO dashboard data
// @access  Private
router.get('/dashboard', auth, async (req, res) => {
  try {
    const { format = 'csv' } = req.query;
    let filter = {};

    // Role-based filtering
    if (req.user.role === 'user') {
      filter.reporter = req.user.id;
    } else if (req.user.role === 'ngo') {
      const ngoProfile = await NGO.findOne({ user: req.user.id });
      if (ngoProfile) {
        filter.assignedNGO = ngoProfile._id;
      }
    }

    const rescues = await Rescue.find(filter)
      .populate('reporter', 'name email')
      .populate('assignedNGO', 'organizationName')
      .sort({ createdAt: -1 })
      .lean();

    if (format === 'csv') {
      const csvData = rescues.map(rescue => ({
        'Rescue ID': rescue._id,
        'Title': rescue.title,
        'Animal Type': rescue.animal?.type || 'Unknown',
        'Status': rescue.status,
        'Urgency': rescue.urgency,
        'Location': `${rescue.location?.city || ''}, ${rescue.location?.state || ''}`.trim(),
        'AI Classification': rescue.animal?.aiPrediction?.species || 'Not classified',
        'Created Date': new Date(rescue.createdAt).toLocaleDateString(),
        'Reporter': rescue.reporter?.name || 'Unknown',
        'Assigned NGO': rescue.assignedNGO?.organizationName || 'Not assigned'
      }));

      const parser = new Parser();
      const csv = parser.parse(csvData);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${req.user.role}-dashboard-${Date.now()}.csv"`);
      res.send(csv);
    } else {
      res.json({
        success: true,
        data: rescues,
        count: rescues.length
      });
    }

  } catch (error) {
    console.error('Export dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export dashboard data'
    });
  }
});

// @route   GET /api/exports/admin/overview
// @desc    Export comprehensive admin report
// @access  Admin only
router.get('/admin/overview', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { format = 'pdf' } = req.query;

    // Gather comprehensive data
    const [
      totalRescues,
      totalUsers,
      totalNGOs,
      rescuesByStatus,
      rescuesByUrgency,
      rescuesByAnimalType,
      recentRescues,
      aiClassificationStats
    ] = await Promise.all([
      Rescue.countDocuments(),
      User.countDocuments({ role: 'user' }),
      NGO.countDocuments(),
      Rescue.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Rescue.aggregate([
        { $group: { _id: '$urgency', count: { $sum: 1 } } }
      ]),
      Rescue.aggregate([
        { $group: { _id: '$animal.type', count: { $sum: 1 } } }
      ]),
      Rescue.find()
        .populate('reporter', 'name email')
        .populate('assignedNGO', 'organizationName')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Rescue.aggregate([
        { $match: { 'animal.aiPrediction.species': { $exists: true } } },
        { $group: { _id: '$animal.aiPrediction.species', count: { $sum: 1 } } }
      ])
    ]);

    if (format === 'csv') {
      // Create summary CSV
      const summaryData = [
        { Metric: 'Total Rescues', Value: totalRescues },
        { Metric: 'Total Users', Value: totalUsers },
        { Metric: 'Total NGOs', Value: totalNGOs },
        ...rescuesByStatus.map(item => ({ Metric: `${item._id} Status`, Value: item.count })),
        ...rescuesByUrgency.map(item => ({ Metric: `${item._id} Urgency`, Value: item.count })),
        ...rescuesByAnimalType.map(item => ({ Metric: `${item._id} Animals`, Value: item.count }))
      ];

      const parser = new Parser();
      const csv = parser.parse(summaryData);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="admin-overview-${Date.now()}.csv"`);
      res.send(csv);
    } else {
      // Generate comprehensive PDF report
      const doc = new PDFDocument({ margin: 50 });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="admin-overview-${Date.now()}.pdf"`);
      doc.pipe(res);

      // Header
      doc.fontSize(24).text('Animal Rescue System - Admin Overview', 50, 50);
      doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 80);
      doc.moveTo(50, 100).lineTo(550, 100).stroke();

      let y = 120;

      // Summary Statistics
      doc.fontSize(18).text('Summary Statistics', 50, y);
      y += 30;
      
      doc.fontSize(12)
        .text(`Total Rescue Cases: ${totalRescues}`, 50, y)
        .text(`Total Users: ${totalUsers}`, 200, y)
        .text(`Total NGOs: ${totalNGOs}`, 350, y);
      y += 40;

      // Status Breakdown
      doc.fontSize(16).text('Cases by Status', 50, y);
      y += 25;
      rescuesByStatus.forEach(item => {
        doc.fontSize(11).text(`${item._id}: ${item.count} cases`, 70, y);
        y += 18;
      });
      y += 20;

      // Urgency Breakdown
      doc.fontSize(16).text('Cases by Urgency', 50, y);
      y += 25;
      rescuesByUrgency.forEach(item => {
        doc.fontSize(11).text(`${item._id}: ${item.count} cases`, 70, y);
        y += 18;
      });
      y += 20;

      // Animal Type Breakdown
      doc.fontSize(16).text('Cases by Animal Type', 50, y);
      y += 25;
      rescuesByAnimalType.forEach(item => {
        doc.fontSize(11).text(`${item._id}: ${item.count} cases`, 70, y);
        y += 18;
      });
      y += 20;

      // AI Classification Stats
      if (aiClassificationStats.length > 0) {
        doc.fontSize(16).text('AI Classification Statistics', 50, y);
        y += 25;
        aiClassificationStats.forEach(item => {
          doc.fontSize(11).text(`${item._id}: ${item.count} classifications`, 70, y);
          y += 18;
        });
        y += 20;
      }

      // Recent Rescues
      if (y > 600) {
        doc.addPage();
        y = 50;
      }
      doc.fontSize(16).text('Recent Rescue Cases', 50, y);
      y += 25;
      
      recentRescues.forEach((rescue, index) => {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(11)
          .text(`${index + 1}. ${rescue.title}`, 70, y)
          .text(`Status: ${rescue.status}`, 400, y);
        y += 15;
        doc.text(`Animal: ${rescue.animal?.type || 'Unknown'}`, 70, y)
          .text(`Date: ${new Date(rescue.createdAt).toLocaleDateString()}`, 400, y);
        y += 20;
      });

      doc.end();
    }

  } catch (error) {
    console.error('Admin overview export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export admin overview'
    });
  }
});

module.exports = router;
