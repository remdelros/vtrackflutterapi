const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const violatorRoutes = require('./routes/violators');
const violationRecordRoutes = require('./routes/violationRecords');
const violationListRoutes = require('./routes/violationList');
const paymentRoutes = require('./routes/payments');
const locationRoutes = require('./routes/locations');
const teamRoutes = require('./routes/teams');
const userRoutes = require('./routes/users');

// Import middleware
const { testConnection } = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files (for uploaded evidence files)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Test database connection on startup
testConnection();

// API Routes
const apiVersion = process.env.API_VERSION || 'v1';
app.use(`/api/${apiVersion}/auth`, authRoutes);
app.use(`/api/${apiVersion}/violators`, violatorRoutes);
app.use(`/api/${apiVersion}/violation-records`, violationRecordRoutes);
app.use(`/api/${apiVersion}/violation-list`, violationListRoutes);
app.use(`/api/${apiVersion}/payments`, paymentRoutes);
app.use(`/api/${apiVersion}/locations`, locationRoutes);
app.use(`/api/${apiVersion}/teams`, teamRoutes);
app.use(`/api/${apiVersion}/users`, userRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: apiVersion
  });
});

// Test endpoint without authentication
app.get('/api/test-violators', async (req, res) => {
  try {
    const { executeQuery } = require('./config/database');
    const violators = await executeQuery('SELECT * FROM violators LIMIT 5');
    res.json({
      success: true,
      data: violators
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'VTrack Flutter API',
    status: 'Server is running!',
    version: apiVersion,
    endpoints: {
      auth: `/api/${apiVersion}/auth`,
      violators: `/api/${apiVersion}/violators`,
      violationRecords: `/api/${apiVersion}/violation-records`,
      violationList: `/api/${apiVersion}/violation-list`,
      payments: `/api/${apiVersion}/payments`,
      locations: `/api/${apiVersion}/locations`,
      teams: `/api/${apiVersion}/teams`,
      users: `/api/${apiVersion}/users`
    },
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 VTrack API Server is running on port ${PORT}`);
  console.log(`📱 API available at: http://localhost:${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/`);
});

module.exports = app;
