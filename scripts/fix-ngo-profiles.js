const mongoose = require('mongoose');
const User = require('../models/User');
const NGO = require('../models/NGO');
require('dotenv').config();

const fixNGOProfiles = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/animal_rescue_db');
    console.log('Connected to MongoDB');

    // Find all NGO users without NGO profiles
    const ngoUsers = await User.find({ role: 'ngo' });
    console.log(`Found ${ngoUsers.length} NGO users`);

    for (const user of ngoUsers) {
      const existingNGO = await NGO.findOne({ user: user._id });
      
      if (!existingNGO) {
        console.log(`Creating NGO profile for: ${user.email}`);
        
        const ngo = new NGO({
          user: user._id,
          organizationName: `${user.name}'s Organization`,
          registrationNumber: `NGO${user._id.toString().substring(0, 8).toUpperCase()}`,
          establishedYear: new Date().getFullYear(),
          description: 'Animal rescue organization',
          specialties: ['all'],
          serviceAreas: [{
            city: user.address?.city || 'Unknown',
            state: user.address?.state || 'Unknown',
            radius: 50
          }],
          capacity: {
            total: 20,
            current: 0,
            available: 20
          },
          facilities: ['Veterinary Care', 'Adoption Center'],
          verification: {
            status: 'verified',
            verifiedBy: user._id,
            verifiedAt: new Date()
          },
          statistics: {
            totalRescues: 0,
            successfulRescues: 0,
            rating: 5.0
          },
          isActive: true
        });

        await ngo.save();
        console.log('✅ NGO profile created for:', user.email);
      } else {
        console.log('✅ NGO profile already exists for:', user.email);
      }
    }

    console.log('🎉 NGO profile fix completed!');
  } catch (error) {
    console.error('❌ Error fixing NGO profiles:', error);
  } finally {
    mongoose.connection.close();
  }
};

fixNGOProfiles();
