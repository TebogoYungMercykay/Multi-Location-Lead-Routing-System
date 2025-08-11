// src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./database/connection');

// Import routes
const webhookRoutes = require('./routes/webhook.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const locationRoutes = require('./routes/location.routes');
const dashboardRoutes = require('./routes/dashboard.routes');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use('/api/webhooks', rateLimiter);

// Request logging
app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/webhooks', webhookRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Serve static files for dashboard
app.use('/dashboard', express.static('public/dashboard'));

// Default route
app.get('/', (req, res) => {
  res.json({
    message: 'GHL Multi-Location Lead Routing System API',
    version: '1.0.0',
    endpoints: {
      webhooks: '/api/webhooks',
      analytics: '/api/analytics',
      locations: '/api/locations',
      dashboard: '/api/dashboard',
      health: '/health'
    }
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    logger.info('Database initialized successfully');

    // Start listening
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`, {
        port: PORT,
        environment: process.env.NODE_ENV,
        pid: process.pid
      });
    });

  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason.toString(),
    stack: reason.stack
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

startServer();

module.exports = app;
