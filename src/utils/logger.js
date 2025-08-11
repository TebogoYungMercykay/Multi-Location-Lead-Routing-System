// src/utils/logger.js
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

winston.addColors(colors);

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => {
      const { timestamp, level, message, ...meta } = info;
      const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
      return `${timestamp} [${level}]: ${message}${metaStr}`;
    }
  )
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports
const transports = [
  // Console transport
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || 'info',
    format: consoleFormat
  }),
  
  // File transport for errors
  new winston.transports.File({
    level: 'error',
    filename: path.join(logsDir, 'error.log'),
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }),
  
  // File transport for all logs
  new winston.transports.File({
    level: 'info',
    filename: path.join(logsDir, 'app.log'),
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  })
];

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  transports,
  exitOnError: false,
  
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log')
    })
  ],
  
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log')
    })
  ]
});

// Add webhook-specific logging methods
logger.webhook = (webhookId, level, message, meta = {}) => {
  logger.log(level, message, {
    ...meta,
    webhookId,
    component: 'webhook'
  });
};

logger.routing = (message, meta = {}) => {
  logger.info(message, {
    ...meta,
    component: 'routing'
  });
};

logger.analytics = (message, meta = {}) => {
  logger.info(message, {
    ...meta,
    component: 'analytics'
  });
};

logger.ghl = (message, meta = {}) => {
  logger.info(message, {
    ...meta,
    component: 'ghl-api'
  });
};

// Performance logging
logger.performance = (operation, duration, meta = {}) => {
  logger.info(`Performance: ${operation}`, {
    ...meta,
    duration: `${duration}ms`,
    component: 'performance'
  });
};

module.exports = logger;
