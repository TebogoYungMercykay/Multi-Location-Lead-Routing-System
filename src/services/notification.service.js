// src/services/notification.service.js
const axios = require('axios');
const twilio = require('twilio');
const logger = require('../utils/logger');

class NotificationService {
  constructor() {
    this.twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }

  async sendSlackAlert(alertType, message, data) {
    if (!process.env.SLACK_WEBHOOK_URL) return;

    try {
      const payload = {
        text: `🚨 GHL System Alert: ${alertType}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: message
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Environment: ${process.env.NODE_ENV} | Time: ${new Date().toISOString()}`
              }
            ]
          }
        ]
      };

      await axios.post(process.env.SLACK_WEBHOOK_URL, payload);
      logger.info('Slack alert sent', { alertType });
    } catch (error) {
      logger.error('Failed to send Slack alert', { 
        alertType, 
        error: error.message 
      });
    }
  }

  async sendEmail({ to, subject, body }) {
    // Mock email implementation - replace with your email service
    logger.info('Email notification sent', { to, subject });
    return { success: true, provider: 'mock' };
  }

  async sendSMS({ to, body }) {
    if (!this.twilioClient) return { success: false, error: 'Twilio not configured' };

    try {
      const message = await this.twilioClient.messages.create({
        body,
        from: process.env.TWILIO_PHONE_NUMBER,
        to
      });

      logger.info('SMS sent', { to, messageId: message.sid });
      return { success: true, messageId: message.sid };
    } catch (error) {
      logger.error('Failed to send SMS', { to, error: error.message });
      return { success: false, error: error.message };
    }
  }
}

module.exports = new NotificationService();
