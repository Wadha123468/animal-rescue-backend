const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const createAdminUser = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/animal_rescue_db');
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@animalrescue.com' });
    
    if (existingAdmin) {
      console.log('Admin user already exists');
      return;
    }

    // Create admin user
    const adminUser = new User({
      name: 'System Administrator',
      email: 'admin@animalrescue.com',
      password: 'admin123',
      role: 'admin',
      phone: '+1234567890',
      isVerified: true,
      isActive: true,
      address: {
        street: 'Admin Street',
        city: 'Admin City',
        state: 'Admin State'
      }
    });

    await adminUser.save();
    console.log('✅ Admin user created successfully!');
    console.log('Email: wadhas157@gmail.com');
    console.log('Password: wadha1234');
    
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    mongoose.connection.close();
  }
};

createAdminUser();
