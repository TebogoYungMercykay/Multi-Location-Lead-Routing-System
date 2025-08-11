const webhookService = require('./webhook.service');
const routingService = require('../services/routing.service');
const analyticsService = require('../services/analytics.service');
const logger = require('../utils/logger');

class WebhookController {
  /**
   * Handle GHL webhook events
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async handleGHLWebhook(req, res) {
    const startTime = Date.now();
    const webhookId = req.headers['x-webhook-id'] || `webhook_${Date.now()}`;
    
    try {
      const payload = req.body;
      const eventType = payload.type;
      
      logger.info('GHL webhook received', {
        webhookId,
        eventType,
        contactId: payload.contact_id,
        locationId: payload.location_id
      });

      // Validate webhook signature (in production)
      if (!this.validateWebhookSignature(req)) {
        logger.warn('Invalid webhook signature', { webhookId });
        return res.status(401).json({ error: 'Invalid signature' });
      }

      let result;
      
      // Route webhook based on event type
      switch (eventType) {
        case 'ContactCreate':
          result = await this.handleContactCreate(payload, webhookId);
          break;
          
        case 'ContactUpdate':
          result = await this.handleContactUpdate(payload, webhookId);
          break;
          
        case 'ContactDelete':
          result = await this.handleContactDelete(payload, webhookId);
          break;
          
        case 'OpportunityCreate':
        case 'OpportunityStatusUpdate':
          result = await this.handleOpportunityUpdate(payload, webhookId);
          break;
          
        case 'AppointmentCreate':
        case 'AppointmentUpdate':
          result = await this.handleAppointmentUpdate(payload, webhookId);
          break;
          
        case 'TaskCreate':
        case 'TaskUpdate':
          result = await this.handleTaskUpdate(payload, webhookId);
          break;
          
        default:
          logger.info('Unhandled webhook event type', { eventType, webhookId });
          result = { processed: false, reason: 'unhandled_event_type' };
      }

      // Log webhook processing result
      await webhookService.logWebhookEvent({
        webhookId,
        eventType,
        payload,
        result,
        processingTime: Date.now() - startTime,
        status: 'success'
      });

      res.status(200).json({
        success: true,
        webhookId,
        processed: result.processed,
        processingTime: Date.now() - startTime
      });

    } catch (error) {
      logger.error('Webhook processing failed', {
        webhookId,
        error: error.message,
        stack: error.stack,
        payload: req.body
      });

      // Log failed webhook
      await webhookService.logWebhookEvent({
        webhookId,
        eventType: req.body.type,
        payload: req.body,
        result: { error: error.message },
        processingTime: Date.now() - startTime,
        status: 'failed'
      });

      res.status(500).json({
        success: false,
        webhookId,
        error: 'Webhook processing failed'
      });
    }
  }

  /**
   * Handle contact creation - trigger lead routing
   * @param {Object} payload - Webhook payload
   * @param {string} webhookId - Webhook ID for tracking
   * @returns {Object} Processing result
   */
  async handleContactCreate(payload, webhookId) {
    try {
      const contact = payload.contact;
      
      // Extract lead data from GHL contact
      const leadData = {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        zipCode: contact.customFields?.zip_code || 
                 this.extractZipFromAddress(contact.address1),
        source: contact.source || 'unknown',
        utmSource: contact.customFields?.utm_source,
        utmCampaign: contact.customFields?.utm_campaign,
        utmMedium: contact.customFields?.utm_medium,
        ghlContactId: contact.id,
        leadScore: await this.calculateLeadScore(contact),
        metadata: {
          ghlLocationId: payload.location_id,
          originalPayload: payload,
          webhookId
        }
      };

      // Only route if not already assigned
      if (!contact.customFields?.assigned_location_id) {
        const routingResult = await routingService.assignLead(leadData);
        
        if (routingResult.success) {
          logger.info('Contact routed successfully', {
            contactId: contact.id,
            locationId: routingResult.locationId,
            webhookId
          });
        }
        
        return {
          processed: true,
          action: 'lead_routed',
          routingResult
        };
      }
      
      return {
        processed: true,
        action: 'already_assigned',
        locationId: contact.customFields.assigned_location_id
      };
      
    } catch (error) {
      logger.error('Contact create handling failed', {
        contactId: payload.contact?.id,
        webhookId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle contact updates - track changes and update analytics
   * @param {Object} payload - Webhook payload
   * @param {string} webhookId - Webhook ID
   * @returns {Object} Processing result
   */
  async handleContactUpdate(payload, webhookId) {
    const contact = payload.contact;
    const changes = payload.changes || {};
    
    // Track stage progression
    if (changes.pipeline_stage) {
      await analyticsService.trackStageProgression({
        contactId: contact.id,
        locationId: contact.customFields?.assigned_location_id,
        fromStage: changes.pipeline_stage.from,
        toStage: changes.pipeline_stage.to,
        timestamp: new Date()
      });
    }

    // Update lead score if relevant fields changed
    if (this.shouldRecalculateScore(changes)) {
      const newScore = await this.calculateLeadScore(contact);
      await routingService.updateLeadScore(contact.id, newScore);
    }

    return {
      processed: true,
      action: 'contact_updated',
      changes: Object.keys(changes)
    };
  }

  /**
   * Handle opportunity updates - track conversions
   * @param {Object} payload - Webhook payload
   * @param {string} webhookId - Webhook ID
   * @returns {Object} Processing result
   */
  async handleOpportunityUpdate(payload, webhookId) {
    const opportunity = payload.opportunity;
    
    // Track conversion if opportunity is won
    if (opportunity.status === 'won' || opportunity.stage === 'closed_won') {
      await analyticsService.trackConversion({
        contactId: opportunity.contact_id,
        locationId: opportunity.location_id,
        opportunityValue: opportunity.monetary_value,
        source: opportunity.source,
        timestamp: new Date()
      });
    }

    return {
      processed: true,
      action: 'opportunity_tracked',
      status: opportunity.status
    };
  }

  /**
   * Handle appointment updates - track show rates
   * @param {Object} payload - Webhook payload
   * @param {string} webhookId - Webhook ID
   * @returns {Object} Processing result
   */
  async handleAppointmentUpdate(payload, webhookId) {
    const appointment = payload.appointment;
    
    await analyticsService.trackAppointment({
      contactId: appointment.contact_id,
      locationId: appointment.location_id,
      appointmentType: appointment.appointment_type,
      status: appointment.status,
      scheduledTime: appointment.start_time,
      timestamp: new Date()
    });

    return {
      processed: true,
      action: 'appointment_tracked',
      status: appointment.status
    };
  }

  /**
   * Calculate lead score based on contact data
   * @param {Object} contact - GHL contact data
   * @returns {number} Lead score (1-100)
   */
  async calculateLeadScore(contact) {
    let score = 50; // Base score

    // Source scoring
    const sourceScores = {
      'facebook': 70,
      'google': 80,
      'website': 75,
      'referral': 90,
      'walk_in': 85,
      'unknown': 40
    };
    score = sourceScores[contact.source?.toLowerCase()] || 40;

    // Demographics scoring
    if (contact.email && this.isValidEmail(contact.email)) score += 10;
    if (contact.phone && this.isValidPhone(contact.phone)) score += 10;
    
    // Engagement scoring
    if (contact.customFields?.utm_campaign) score += 5;
    if (contact.customFields?.referrer_url) score += 5;
    
    // Time-based scoring (recent leads score higher)
    const hoursOld = (Date.now() - new Date(contact.date_added)) / (1000 * 60 * 60);
    if (hoursOld < 1) score += 15;
    else if (hoursOld < 24) score += 10;
    else if (hoursOld < 72) score += 5;

    // Geographic scoring (local zip codes score higher)
    if (contact.customFields?.zip_code) {
      const isLocalZip = await this.isLocalZipCode(contact.customFields.zip_code);
      if (isLocalZip) score += 10;
    }

    return Math.min(100, Math.max(1, Math.round(score)));
  }

  /**
   * Validate webhook signature (implement based on GHL documentation)
   * @param {Object} req - Express request
   * @returns {boolean} Signature validity
   */
  validateWebhookSignature(req) {
    // In production, implement proper signature validation
    // const signature = req.headers['x-ghl-signature'];
    // const payload = JSON.stringify(req.body);
    // const expectedSignature = crypto
    //   .createHmac('sha256', process.env.GHL_WEBHOOK_SECRET)
    //   .update(payload)
    //   .digest('hex');
    // return signature === expectedSignature;
    
    return true;
  }

  /**
   * Extract zip code from address string
   * @param {string} address - Address string
   * @returns {string|null} Zip code
   */
  extractZipFromAddress(address) {
    if (!address) return null;
    const zipMatch = address.match(/\b\d{5}(-\d{4})?\b/);
    return zipMatch ? zipMatch[0] : null;
  }

  /**
   * Check if email is valid
   * @param {string} email - Email address
   * @returns {boolean} Validity
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Check if phone is valid
   * @param {string} phone - Phone number
   * @returns {boolean} Validity
   */
  isValidPhone(phone) {
    const phoneRegex = /^[\+]?[1-9]?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
  }

  /**
   * Check if zip code is in local service area
   * @param {string} zipCode - Zip code
   * @returns {boolean} Is local
   */
  async isLocalZipCode(zipCode) {
    // In production, check against location service areas
    return true; // Placeholder
  }

  /**
   * Check if contact changes require score recalculation
   * @param {Object} changes - Contact changes
   * @returns {boolean} Should recalculate
   */
  shouldRecalculateScore(changes) {
    const scoringFields = ['source', 'email', 'phone', 'pipeline_stage'];
    return scoringFields.some(field => changes[field]);
  }
}

module.exports = new WebhookController();
