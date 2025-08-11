const express = require('express');
const webhookController = require('../controllers/webhook.controller');
const { validateWebhookPayload } = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GHL Webhook endpoint
 * POST /api/webhooks/ghl
 */
router.post('/ghl', validateWebhookPayload, webhookController.handleGHLWebhook);

/**
 * Test webhook endpoint for development
 * POST /api/webhooks/test
 */
router.post('/test', async (req, res) => {
  try {
    logger.info('Test webhook received', { payload: req.body });
    
    // Simulate webhook processing
    const result = await webhookController.handleGHLWebhook(req, res);
    
    if (!res.headersSent) {
      res.status(200).json({
        success: true,
        message: 'Test webhook processed',
        payload: req.body
      });
    }
  } catch (error) {
    logger.error('Test webhook failed', { error: error.message });
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Test webhook processing failed'
      });
    }
  }
});

/**
 * Webhook health check
 * GET /api/webhooks/health
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'webhook-handler'
  });
});

module.exports = router;
