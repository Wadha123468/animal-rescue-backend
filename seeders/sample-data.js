const mongoose = require('mongoose');
const User = require('../models/User');
const NGO = require('../models/NGO');
const Rescue = require('../models/Rescue');
require('dotenv').config();

const createSampleData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/animal_rescue_db');
    console.log('Connected to MongoDB');

    // Create admin user if doesn't exist
    let admin = await User.findOne({ email: 'admin@animalrescue.com' });
    if (!admin) {
      admin = new User({
        name: 'System Administrator',
        email: 'admin@animalrescue.com',
        password: 'admin123',
        role: 'admin',
        phone: '+1234567890',
        isVerified: true,
        isActive: true
      });
      await admin.save();
      console.log('✅ Admin user created');
    }

    // Create sample user
    let user = await User.findOne({ email: 'user@example.com' });
    if (!user) {
      user = new User({
        name: 'John Doe',
        email: 'user@example.com',
        password: 'password123',
        role: 'user',
        phone: '+1234567891',
        isVerified: true,
        isActive: true,
        address: {
          city: 'New York',
          state: 'NY'
        }
      });
      await user.save();
      console.log('✅ Sample user created');
    }

    // Create sample NGO user
    let ngoUser = await User.findOne({ email: 'ngo@example.com' });
    if (!ngoUser) {
      ngoUser = new User({
        name: 'NGO Representative',
        email: 'ngo@example.com',
        password: 'password123',
        role: 'ngo',
        phone: '+1234567892',
        isVerified: true,
        isActive: true,
        address: {
          city: 'New York',
          state: 'NY'
        }
      });
      await ngoUser.save();
      console.log('✅ Sample NGO user created');
    }

    // Create NGO profile if doesn't exist
    let ngo = await NGO.findOne({ user: ngoUser._id });
    if (!ngo) {
      ngo = new NGO({
        user: ngoUser._id,
        organizationName: 'Animal Care Foundation',
        registrationNumber: 'NGO12345',
        establishedYear: 2020,
        description: 'We are dedicated to rescuing and caring for animals in need.',
        specialties: ['cat', 'dog', 'all'],
        serviceAreas: [
          { city: 'New York', state: 'NY', radius: 50 },
          { city: 'Brooklyn', state: 'NY', radius: 30 }
        ],
        capacity: {
          total: 20,
          current: 0,
          available: 20
        },
        facilities: ['Veterinary Care', 'Surgery', 'Rehabilitation', 'Adoption Center'],
        staff: {
          veterinarians: 3,
          volunteers: 15,
          fullTime: 5,
          partTime: 8
        },
        verification: {
          status: 'verified',
          verifiedBy: admin._id,
          verifiedAt: new Date()
        },
        statistics: {
          totalRescues: 25,
          successfulRescues: 23,
          rating: 4.8
        },
        isActive: true
      });
      await ngo.save();
      console.log('✅ Sample NGO profile created');
    }

    // Create sample rescue cases if they don't exist
    const rescueCount = await Rescue.countDocuments();
    if (rescueCount === 0) {
      const sampleRescues = [
        {
          title: 'Injured cat needs immediate help',
          description: 'Found an injured cat near the park. It appears to have a broken leg and needs urgent medical attention.',
          reporter: user._id,
          animal: {
            type: 'cat',
            size: 'small',
            gender: 'female',
            color: 'orange and white',
            medicalCondition: 'Broken leg, appears malnourished'
          },
          location: {
            address: '123 Park Avenue',
            city: 'New York',
            state: 'NY',
            coordinates: { lat: 40.7589, lng: -73.9851 }
          },
          urgency: 'high',
          status: 'reported',
          isPublic: true,
          timeline: [{
            status: 'reported',
            description: 'Rescue case reported',
            updatedBy: user._id,
            timestamp: new Date()
          }]
        },
        {
          title: 'Stray dog in need of shelter',
          description: 'There is a friendly stray dog that has been wandering around our neighborhood for days. It looks hungry and needs care.',
          reporter: user._id,
          animal: {
            type: 'dog',
            size: 'medium',
            gender: 'male',
            color: 'brown',
            medicalCondition: 'Appears healthy but malnourished'
          },
          location: {
            address: '456 Main Street',
            city: 'New York',
            state: 'NY',
            coordinates: { lat: 40.7505, lng: -73.9934 }
          },
          urgency: 'medium',
          status: 'reported',
          isPublic: true,
          timeline: [{
            status: 'reported',
            description: 'Rescue case reported',
            updatedBy: user._id,
            timestamp: new Date()
          }]
        }
      ];

      await Rescue.insertMany(sampleRescues);
      console.log('✅ Sample rescue cases created');
    }

    console.log('\n🎉 Sample data setup complete!');
    console.log('\nLogin credentials:');
    console.log('👑 Admin: admin@animalrescue.com / admin123');
    console.log('👤 User: user@example.com / password123');
    console.log('🏢 NGO: ngo@example.com / password123');

  } catch (error) {
    console.error('Error creating sample data:', error);
  } finally {
    mongoose.connection.close();
  }
};

createSampleData();
