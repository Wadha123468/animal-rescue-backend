const mongoose = require('mongoose');
const User = require('../models/User');
const NGO = require('../models/NGO');
require('dotenv').config();

const fixBrokenRegistration = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 Connected to MongoDB');

    // Find NGO users without NGO profiles
    const ngoUsersWithoutProfile = await User.find({ role: 'ngo' });
    
    for (const user of ngoUsersWithoutProfile) {
      const existingProfile = await NGO.findOne({ user: user._id });
      
      if (!existingProfile) {
        console.log(`❌ Found NGO user without profile: ${user.email}`);
        
        // Create a basic NGO profile for them
        const ngoProfile = new NGO({
          user: user._id,
          organizationName: user.name + "'s Organization", // Temporary name
          registrationNumber: 'TEMP' + Date.now(),
          establishedYear: 2025,
          specialties: ['all'],
          capacity: { total: 10, current: 0, available: 10 },
          verification: { status: 'pending' },
          isActive: false,
          statistics: { totalRescues: 0, successfulRescues: 0, rating: 5.0, reviews: 0 }
        });
        
        await ngoProfile.save();
        
        // Update user status
        user.ngoApprovalStatus = 'pending';
        user.isApproved = false;
        user.isNewRegistration = true;
        await user.save();
        
        console.log(`✅ Created NGO profile for: ${user.email}`);
      }
    }

    console.log('✅ Fix completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fix error:', error);
    process.exit(1);
  }
};

fixBrokenRegistration();
