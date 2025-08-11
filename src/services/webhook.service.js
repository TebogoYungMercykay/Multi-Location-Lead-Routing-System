// src/webhooks/webhook.service.js
const { WebhookEventLog } = require('../database/models');
const logger = require('../utils/logger');

class WebhookService {
  async logWebhookEvent(eventData) {
    try {
      const log = await WebhookEventLog.query().insert({
        webhook_id: eventData.webhookId,
        event_type: eventData.eventType,
        payload: eventData.payload,
        result: eventData.result,
        processing_time: eventData.processingTime,
        status: eventData.status,
        error_message: eventData.error?.message
      });

      return log;
    } catch (error) {
      logger.error('Failed to log webhook event', {
        webhookId: eventData.webhookId,
        error: error.message
      });
    }
  }

  async getWebhookStats(filters = {}) {
    const { startDate, endDate, eventType, status } = filters;
    
    let query = WebhookEventLog.query();

    if (startDate) query = query.where('created_at', '>=', startDate);
    if (endDate) query = query.where('created_at', '<=', endDate);
    if (eventType) query = query.where('event_type', eventType);
    if (status) query = query.where('status', status);

    const stats = await query
      .select('event_type', 'status')
      .count('* as count')
      .groupBy('event_type', 'status');

    return stats;
  }
}

module.exports = new WebhookService();
