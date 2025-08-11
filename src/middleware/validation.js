// src/middleware/validation.js
const Joi = require('joi');
const logger = require('../utils/logger');

const webhookPayloadSchema = Joi.object({
  type: Joi.string().required(),
  contact_id: Joi.string(),
  location_id: Joi.string().required(),
  contact: Joi.object().optional(),
  opportunity: Joi.object().optional(),
  appointment: Joi.object().optional(),
  changes: Joi.object().optional()
});

const validateWebhookPayload = (req, res, next) => {
  try {
    const { error, value } = webhookPayloadSchema.validate(req.body);
    
    if (error) {
      logger.warn('Invalid webhook payload', {
        error: error.details[0].message,
        payload: req.body
      });
      
      return res.status(400).json({
        success: false,
        error: 'Invalid webhook payload',
        details: error.details[0].message
      });
    }
    
    req.validatedBody = value;
    next();
  } catch (err) {
    logger.error('Webhook validation error', {
      error: err.message,
      payload: req.body
    });
    
    res.status(500).json({
      success: false,
      error: 'Validation processing failed'
    });
  }
};

module.exports = {
  validateWebhookPayload
};
