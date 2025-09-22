const mongoose = require('mongoose');
const User = require('../models/User');
const NGO = require('../models/NGO');
require('dotenv').config();

const debugRegistration = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 Connected to MongoDB');

    // Check recent NGO user registrations
    console.log('\n📋 Recent NGO User Registrations (last 24 hours):');
    const recentNGOUsers = await User.find({ 
      role: 'ngo',
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }).sort({ createdAt: -1 });

    for (const user of recentNGOUsers) {
      console.log(`\n👤 User: ${user.email}`);
      console.log(`   Created: ${user.createdAt}`);
      console.log(`   NGO Approval Status: ${user.ngoApprovalStatus || 'undefined'}`);
      console.log(`   Is Approved: ${user.isApproved}`);
      console.log(`   Is New Registration: ${user.isNewRegistration || 'undefined'}`);
      
      // Check if NGO profile exists
      const ngoProfile = await NGO.findOne({ user: user._id });
      if (ngoProfile) {
        console.log(`   🏢 NGO Profile: ${ngoProfile.organizationName}`);
        console.log(`   Verification Status: ${ngoProfile.verification?.status || 'undefined'}`);
        console.log(`   Is Active: ${ngoProfile.isActive}`);
      } else {
        console.log(`   ❌ NO NGO PROFILE FOUND!`);
      }
    }

    // Check all NGO profiles with pending status
    console.log('\n⏳ All Pending NGO Profiles:');
    const pendingNGOs = await NGO.find({ 
      'verification.status': 'pending' 
    }).populate('user', 'name email createdAt isNewRegistration');
    
    if (pendingNGOs.length === 0) {
      console.log('   No pending NGO profiles found');
    } else {
      for (const ngo of pendingNGOs) {
        console.log(`\n🏢 ${ngo.organizationName}`);
        console.log(`   User: ${ngo.user?.email}`);
        console.log(`   Created: ${ngo.createdAt}`);
        console.log(`   Status: ${ngo.verification.status}`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Debug error:', error);
    process.exit(1);
  }
};

debugRegistration();
