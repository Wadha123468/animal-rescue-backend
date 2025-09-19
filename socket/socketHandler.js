const jwt = require('jsonwebtoken');
const User = require('../models/User');

const handleSocket = (io) => {
  // Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      const { userId, userEmail, userRole } = socket.handshake.auth;
      
      if (!userId || userId === 'undefined') {
        console.log('❌ Socket auth failed: No user ID provided');
        return next(new Error('Authentication failed: No user ID'));
      }

      // Verify user exists
      const user = await User.findById(userId).select('-password');
      if (!user) {
        console.log('❌ Socket auth failed: User not found');
        return next(new Error('Authentication failed: User not found'));
      }

      // Add user info to socket
      socket.userId = userId;
      socket.userEmail = userEmail;
      socket.userRole = userRole;

      console.log(`✅ Socket authenticated: ${userEmail} (${userRole})`);
      next();

    } catch (error) {
      console.error('❌ Socket auth error:', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Join user-specific room
    if (socket.userId && socket.userId !== 'undefined') {
      socket.join(`user_${socket.userId}`);
      console.log(`User ${socket.id} joined room: user_${socket.userId}`);
    }

    // Join role-based room
    if (socket.userRole) {
      socket.join(`role_${socket.userRole}`);
      console.log(`User ${socket.id} joined room: role_${socket.userRole}`);
    }

    // Handle custom events
    socket.on('join_rescue', (rescueId) => {
      socket.join(`rescue_${rescueId}`);
      console.log(`User ${socket.id} joined rescue room: ${rescueId}`);
    });

    socket.on('leave_rescue', (rescueId) => {
      socket.leave(`rescue_${rescueId}`);
      console.log(`User ${socket.id} left rescue room: ${rescueId}`);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });
};

module.exports = handleSocket;
