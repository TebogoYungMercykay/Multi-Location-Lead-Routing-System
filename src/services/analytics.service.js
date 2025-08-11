const { AnalyticsEvent } = require('../database/models');
const logger = require('../utils/logger');

class AnalyticsService {
  async trackStageProgression(progressionData) {
    return await this.trackEvent('stage_progression', progressionData);
  }

  async trackConversion(conversionData) {
    return await this.trackEvent('conversion', conversionData);
  }

  async trackAppointment(appointmentData) {
    return await this.trackEvent('appointment', appointmentData);
  }

  async trackEvent(eventType, eventData) {
    try {
      const event = await AnalyticsEvent.query().insert({
        event_type: eventType,
        contact_id: eventData.contactId,
        location_id: eventData.locationId,
        event_data: eventData,
        timestamp: eventData.timestamp || new Date()
      });

      logger.analytics(`${eventType} event tracked`, {
        eventId: event.id,
        contactId: eventData.contactId,
        locationId: eventData.locationId
      });

      return event;
    } catch (error) {
      logger.error('Failed to track analytics event', {
        eventType,
        eventData,
        error: error.message
      });
      throw error;
    }
  }

  async getLocationStats(locationId, dateRange) {
    const { startDate, endDate } = dateRange;
    
    const events = await AnalyticsEvent.query()
      .where('location_id', locationId)
      .whereBetween('timestamp', [startDate, endDate])
      .select('event_type')
      .count('* as count')
      .groupBy('event_type');

    return events.reduce((acc, event) => {
      acc[event.event_type] = parseInt(event.count);
      return acc;
    }, {});
  }
}

module.exports = new AnalyticsService();
