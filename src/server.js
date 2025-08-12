require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

let logger;
try {
  logger = require('./utils/logger');
} catch (error) {
  // Fallback logger if utils/logger doesn't exist
  logger = {
    info: (msg, meta) => console.log(`[INFO] ${msg}`, meta || ''),
    error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta || ''),
    warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta || ''),
    debug: (msg, meta) => console.debug(`[DEBUG] ${msg}`, meta || '')
  };
  logger.warn('Using fallback logger - utils/logger not found');
}

const app = express();
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

console.log('> Starting GHL Multi-Location System...');
logger.info('Server initialization started');

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  next();
});

// Health check endpoint (always works)
app.get('/health', (req, res) => {
  logger.info('Health check requested');
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: 'checking...'
  });
});

// Basic route that doesn't depend on database
app.get('/', (req, res) => {
  logger.info('Root endpoint accessed');
  res.json({
    message: 'GHL Multi-Location Lead Routing System API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      webhooks: '/api/webhooks (requires database)',
      analytics: '/api/analytics (requires database)',
      locations: '/api/locations (requires database)',
      dashboard: '/api/dashboard (requires database)'
    },
    database: 'initializing...'
  });
});

// Test endpoint to verify basic functionality
app.get('/test', (req, res) => {
  logger.info('Test endpoint accessed');
  res.json({
    message: 'Server is working!',
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      DATABASE_URL: process.env.DATABASE_URL ? 'configured' : 'not configured',
      DB_CLIENT: process.env.DB_CLIENT || 'not configured'
    }
  });
});

// Function to safely initialize middleware
async function initializeMiddleware() {
  logger.info('Initializing middleware...');
  
  try {
    const rateLimiter = require('./middleware/rateLimiter');
    app.use('/api/webhooks', rateLimiter);
    logger.info('> Rate limiter middleware loaded');
  } catch (error) {
    logger.warn('> Rate limiter middleware not found, skipping');
  }
}

async function initializeRoutes() {
  logger.info('Initializing routes...');
  logger.info('Current directory:', process.cwd());
  logger.info('Server file location:', __dirname);
  
  const routeConfigs = [
    { path: '/api/webhooks', file: './routes/webhook.routes.js', name: 'webhook' },
    { path: '/api/analytics', file: './routes/analytics.routes.js', name: 'analytics' },
    { path: '/api/locations', file: './routes/location.routes.js', name: 'location' },
    { path: '/api/dashboard', file: './routes/dashboard.routes.js', name: 'dashboard' }
  ];

  for (const config of routeConfigs) {
    try {
      logger.info(`Attempting to load: ${config.file}`);
      
      // Try to resolve the path first
      const resolvedPath = require.resolve(config.file);
      logger.info(`Resolved to: ${resolvedPath}`);
      
      const routeModule = require(config.file);
      
      // Check what we actually got
      logger.info(`Module type: ${typeof routeModule}`);
      logger.info(`Is function: ${typeof routeModule === 'function'}`);
      
      app.use(config.path, routeModule);
      logger.info(`✓ ${config.name} routes loaded successfully at ${config.path}`);
    } catch (error) {
      logger.error(`✗ Failed to load ${config.name} routes:`);
      logger.error(`  File: ${config.file}`);
      logger.error(`  Error: ${error.message}`);
      logger.error(`  Stack: ${error.stack}`);
      
      // Create a fallback route
      app.use(config.path, (req, res) => {
        res.status(503).json({
          error: `${config.name} routes not available`,
          message: `Route file ${config.file} could not be loaded`,
          details: error.message
        });
      });
    }
  }
}

// Function to safely initialize database
async function initializeDatabase() {
  logger.info('Attempting database initialization...');
  
  try {
    const { initializeDatabase } = require('./database/connection');
    await initializeDatabase();
    logger.info('> Database initialized successfully');
    return true;
  } catch (error) {
    logger.error('> Database initialization failed:', {
      message: error.message,
      stack: error.stack
    });
    
    // Add a route to show database status
    app.get('/api/db-status', (req, res) => {
      res.status(503).json({
        error: 'Database not available',
        message: error.message,
        suggestion: 'Run: npm run db:init'
      });
    });
    
    return false;
  }
}

// Serve static files if directory exists
try {
  const publicPath = path.join(__dirname, '../public/dashboard');
  if (require('fs').existsSync(publicPath)) {
    app.use('/dashboard', express.static(publicPath));
    logger.info('> Static files served from /dashboard');
  } else {
    logger.info('> Public dashboard directory not found, skipping static files');
  }
} catch (error) {
  logger.warn('> Could not set up static file serving');
}

// Initialize error handler middleware (should be after routes but before 404)
function initializeErrorHandler() {
  try {
    const errorHandler = require('./middleware/errorHandler');
    app.use(errorHandler);
    logger.info('> Error handler middleware loaded');
  } catch (error) {
    logger.warn('> Error handler middleware not found, using default');
    // Fallback error handler
    app.use((error, req, res, next) => {
      logger.error('Unhandled error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    });
  }
}

// 404 handler - MUST BE LAST!
function initialize404Handler() {
  app.use('*', (req, res) => {
    logger.info(`404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
      error: 'Endpoint not found',
      path: req.originalUrl,
      method: req.method,
      availableEndpoints: [
        '/',
        '/health', 
        '/test',
        '/api/webhooks',
        '/api/analytics', 
        '/api/locations',
        '/api/dashboard'
      ]
    });
  });
}

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server function with comprehensive error handling
async function startServer() {
  try {
    console.log('> Initializing server components...');
    
    // Step 1: Initialize middleware (before routes)
    await initializeMiddleware();
    
    // Step 2: Initialize routes
    await initializeRoutes();
    
    // Step 3: Initialize database (non-blocking)
    const dbInitialized = await initializeDatabase();
    
    if (!dbInitialized) {
      logger.warn('> Server starting without database - some features will be limited');
    }
    
    // Step 4: Initialize error handler (after routes, before 404)
    initializeErrorHandler();
    
    // Step 5: Initialize 404 handler (MUST BE LAST!)
    initialize404Handler();
    
    // Step 6: Start listening
    const server = app.listen(PORT, () => {
      console.log(`
    > GHL Multi-Location System Started Successfully!

    > Server Details:
      • Port: ${PORT}
      • Environment: ${process.env.NODE_ENV || 'development'}
      • Process ID: ${process.pid}
      • Database: ${dbInitialized ? ' Connected' : ' Not available'}

    > Available Endpoints:
      • http://localhost:${PORT}/          - API info
      • http://localhost:${PORT}/health    - Health check
      • http://localhost:${PORT}/test      - Basic test
      ${dbInitialized ? '• http://localhost:' + PORT + '/api/*      - API endpoints' : '• API endpoints will be available after database setup'}

    > Quick Setup:
      ${!dbInitialized ? '• Run: npm run db:init (to set up database)' : ''}
      • Check: npm run db:verify
      • Monitor: tail -f logs/app.log (if logging to file)

    Server is ready to receive requests!
      `);
      
      logger.info('Server started successfully');
      console.log();
      console.log(`\x1b[34m> Server running on http://localhost:${PORT}\x1b[0m`);
      console.log(`\x1b[34m> Environment: ${process.env.NODE_ENV || 'development'}\x1b[0m`);
      console.log(`\x1b[34m> PID: ${process.pid}\x1b[0m`);
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. Try a different port or stop the existing process.`);
      } else {
        logger.error('Server error:', error);
      }
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server:', {
      message: error.message,
      stack: error.stack
    });
    console.error('> Server startup failed:', error.message);
    process.exit(1);
  }
}

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', {
    reason: reason?.toString(),
    stack: reason?.stack
  });
  console.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    message: error.message,
    stack: error.stack
  });
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Add debug info
logger.info('Starting server with configuration:', {
  nodeEnv: process.env.NODE_ENV,
  port: PORT,
  databaseUrl: process.env.DATABASE_URL ? 'configured' : 'not set',
  // dbClient: process.env.DB_CLIENT || 'not set'
});

startServer();

module.exports = app;
