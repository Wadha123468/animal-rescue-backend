const mongoose = require('mongoose');
const Rescue = require('../models/Rescue');
require('dotenv').config();

const cleanupCorruptData = async () => {
  try {
    console.log('🧹 Starting database cleanup...');
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find and fix corrupt assignedNGO data
    const corruptRescues = await Rescue.find({
      assignedNGO: { $type: "string" }
    });

    console.log(`📋 Found ${corruptRescues.length} rescues with corrupt assignedNGO data`);

    if (corruptRescues.length > 0) {
      console.log('Corrupt data examples:');
      corruptRescues.slice(0, 3).forEach((rescue, index) => {
        console.log(`${index + 1}. ID: ${rescue._id}, assignedNGO: "${rescue.assignedNGO}"`);
      });

      // Fix the corrupt data
      const result = await Rescue.updateMany(
        { assignedNGO: { $type: "string" } },
        { 
          $unset: { assignedNGO: "" },
          $set: { status: "REPORTED" }
        }
      );

      console.log(`✅ Fixed ${result.modifiedCount} corrupt rescue records`);
    }

    // Also check for any other data issues
    const invalidObjectIds = await Rescue.find({
      $or: [
        { reportedBy: { $type: "string" } },
        { assignedBy: { $type: "string" } }
      ]
    });

    if (invalidObjectIds.length > 0) {
      console.log(`⚠️ Found ${invalidObjectIds.length} rescues with invalid ObjectId references`);
      // You can add cleanup for these as well if needed
    }

    console.log('🎉 Database cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Database cleanup failed:', error);
  } finally {
    await mongoose.disconnect();
  }
};

// Run cleanup
cleanupCorruptData();
