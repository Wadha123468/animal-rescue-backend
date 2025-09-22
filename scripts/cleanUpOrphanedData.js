const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Rescue = require('../models/Rescue');
const User = require('../models/User');
const NGO = require('../models/NGO');

const cleanupOrphanedData = async () => {
  try {
    console.log('🧹 Cleaning up orphaned rescue data...');
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find and fix orphaned reporters
    const rescuesWithReporters = await Rescue.find({ reporter: { $exists: true } });
    let orphanedReporters = 0;

    for (const rescue of rescuesWithReporters) {
      const reporterExists = await User.findById(rescue.reporter);
      if (!reporterExists) {
        await Rescue.findByIdAndUpdate(rescue._id, {
          $unset: { reporter: "" },
          $set: {
            reporterName: rescue.reporterName || 'Deleted User',
            reporterEmail: rescue.reporterEmail || 'deleted@example.com',
            isOrphaned: true
          }
        });
        orphanedReporters++;
      }
    }

    // Find and fix orphaned NGO assignments
    const rescuesWithNGOs = await Rescue.find({ assignedNGO: { $exists: true, $ne: null } });
    let orphanedNGOs = 0;

    for (const rescue of rescuesWithNGOs) {
      // Handle corrupt objects
      let ngoId = rescue.assignedNGO;
      if (typeof ngoId === 'object' && ngoId._id) {
        ngoId = ngoId._id;
        // Fix the corrupt data
        await Rescue.findByIdAndUpdate(rescue._id, {
          assignedNGO: ngoId
        });
      }

      if (mongoose.Types.ObjectId.isValid(ngoId)) {
        const ngoExists = await NGO.findById(ngoId);
        if (!ngoExists) {
          await Rescue.findByIdAndUpdate(rescue._id, {
            $unset: { assignedNGO: "", assignedBy: "" },
            $set: {
              status: "reported",
              isOrphaned: true,
              isReassignmentNeeded: true
            }
          });
          orphanedNGOs++;
        }
      } else {
        // Invalid ObjectId, remove it
        await Rescue.findByIdAndUpdate(rescue._id, {
          $unset: { assignedNGO: "" },
          $set: { status: "reported" }
        });
        orphanedNGOs++;
      }
    }

    console.log(`✅ Cleanup completed:`);
    console.log(`   - Fixed ${orphanedReporters} orphaned reporters`);
    console.log(`   - Fixed ${orphanedNGOs} orphaned NGO assignments`);

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  } finally {
    await mongoose.disconnect();
  }
};

cleanupOrphanedData();
