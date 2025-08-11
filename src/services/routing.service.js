const geoUtils = require('../utils/geoUtils');
const ghlApiClient = require('../utils/ghlApiClient');
const logger = require('../utils/logger');
const { Location, Lead, LeadRoutingLog, LocationCapacity } = require('../database/models');

class RoutingService {
  /**
   * Intelligent lead routing based on location, capacity, and lead scoring
   * @param {Object} leadData - Lead information
   * @param {string} leadData.zipCode - Lead's zip code
   * @param {string} leadData.source - Lead source (facebook, google, website, etc.)
   * @param {number} leadData.leadScore - Calculated lead score (1-100)
   * @param {string} leadData.ghlContactId - GHL contact ID
   * @returns {Object} Routing result
   */
  async assignLead(leadData) {
    const { zipCode, source, leadScore, ghlContactId } = leadData;
    
    try {
      // Step 1: Get coordinates from zip code
      const coordinates = await geoUtils.getCoordinatesFromZip(zipCode);
      if (!coordinates) {
        throw new Error(`Invalid zip code: ${zipCode}`);
      }

      // Step 2: Find closest locations with capacity
      const availableLocations = await this.findAvailableLocations(
        coordinates, 
        leadScore,
        source
      );

      if (availableLocations.length === 0) {
        return await this.handleNoCapacityScenario(leadData);
      }

      // Step 3: Apply intelligent routing logic
      const selectedLocation = await this.selectOptimalLocation(
        availableLocations,
        leadData
      );

      // Step 4: Assign lead and update systems
      const assignment = await this.executeAssignment(
        leadData,
        selectedLocation,
        'optimal_match'
      );

      logger.info('Lead successfully routed', {
        leadId: assignment.leadId,
        locationId: selectedLocation.id,
        zipCode,
        source
      });

      return {
        success: true,
        locationId: selectedLocation.id,
        locationName: selectedLocation.name,
        reason: 'optimal_match',
        distance: selectedLocation.distance,
        capacityUtilization: selectedLocation.capacityUtilization,
        assignment
      };

    } catch (error) {
      logger.error('Lead routing failed', {
        error: error.message,
        leadData,
        stack: error.stack
      });

      // Fallback to default location
      return await this.fallbackRouting(leadData, error);
    }
  }

  /**
   * Find available locations within radius with capacity
   * @param {Object} coordinates - Lat/lng coordinates
   * @param {number} leadScore - Lead score for priority routing
   * @param {string} source - Lead source for source-specific routing
   * @returns {Array} Available locations sorted by suitability
   */
  async findAvailableLocations(coordinates, leadScore, source) {
    const { latitude, longitude } = coordinates;
    const maxDistance = 50; // miles
    const currentDate = new Date().toDateString();

    // Query locations with capacity data using Haversine formula
    const query = `
      SELECT 
        l.*,
        lc.current_leads,
        lc.max_capacity,
        lc.utilization_rate,
        (
          3959 * acos(
            cos(radians(?)) * cos(radians(l.latitude)) * 
            cos(radians(l.longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(l.latitude))
          )
        ) AS distance
      FROM locations l
      LEFT JOIN location_capacity lc ON l.id = lc.location_id 
        AND lc.capacity_date = ?
      WHERE l.active = true
        AND (
          3959 * acos(
            cos(radians(?)) * cos(radians(l.latitude)) * 
            cos(radians(l.longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(l.latitude))
          )
        ) <= ?
      ORDER BY distance ASC
      LIMIT 5
    `;

    const locations = await Location.query(query, [
      latitude, longitude, latitude, currentDate,
      latitude, longitude, latitude, maxDistance
    ]);

    // Filter locations with available capacity
    const availableLocations = locations.filter(location => {
      const utilizationRate = location.utilization_rate || 0;
      const maxCapacity = location.max_capacity || 100;
      
      // High-value leads get priority (can use up to 90% capacity)
      const maxUtilizationThreshold = leadScore >= 80 ? 0.9 : 0.8;
      
      return utilizationRate < maxUtilizationThreshold;
    });

    // Score and sort locations
    return availableLocations.map(location => ({
      ...location,
      suitabilityScore: this.calculateSuitabilityScore(location, leadScore, source)
    })).sort((a, b) => b.suitabilityScore - a.suitabilityScore);
  }

  /**
   * Calculate location suitability score
   * @param {Object} location - Location data
   * @param {number} leadScore - Lead score
   * @param {string} source - Lead source
   * @returns {number} Suitability score
   */
  calculateSuitabilityScore(location, leadScore, source) {
    let score = 100;

    // Distance penalty (closer is better)
    score -= (location.distance * 2);

    // Capacity utilization penalty (lower utilization preferred)
    const utilizationPenalty = (location.utilization_rate || 0) * 30;
    score -= utilizationPenalty;

    // Lead score bonus (high-value leads get premium locations)
    if (leadScore >= 80 && location.utilization_rate < 0.6) {
      score += 20; // Premium location for high-value leads
    }

    // Source-specific bonuses
    if (source === 'facebook' && location.facebook_performance_score > 0.8) {
      score += 10;
    }

    return Math.max(0, score);
  }

  /**
   * Select optimal location from available options
   * @param {Array} availableLocations - Available locations
   * @param {Object} leadData - Lead data
   * @returns {Object} Selected location
   */
  async selectOptimalLocation(availableLocations, leadData) {
    // For this implementation, select highest scoring location
    // In production, this could include additional business logic:
    // - Team performance metrics
    // - Time zone considerations
    // - Specialized program availability
    // - Historical conversion rates by source

    const selectedLocation = availableLocations[0];

    // Update capacity tracking
    await this.updateLocationCapacity(selectedLocation.id, 1);

    return selectedLocation;
  }

  /**
   * Execute the lead assignment
   * @param {Object} leadData - Lead data
   * @param {Object} selectedLocation - Selected location
   * @param {string} reason - Routing reason
   * @returns {Object} Assignment result
   */
  async executeAssignment(leadData, selectedLocation, reason) {
    const transaction = await Lead.startTransaction();
    
    try {
      // Create lead record
      const lead = await Lead.query(transaction).insert({
        first_name: leadData.firstName,
        last_name: leadData.lastName,
        email: leadData.email,
        phone: leadData.phone,
        zip_code: leadData.zipCode,
        source: leadData.source,
        utm_source: leadData.utmSource,
        utm_campaign: leadData.utmCampaign,
        utm_medium: leadData.utmMedium,
        assigned_location_id: selectedLocation.id,
        ghl_contact_id: leadData.ghlContactId,
        lead_score: leadData.leadScore,
        status: 'assigned',
        metadata: leadData.metadata || {}
      });

      // Log routing decision
      await LeadRoutingLog.query(transaction).insert({
        lead_id: lead.id,
        assigned_location_id: selectedLocation.id,
        routing_reason: reason,
        routing_data: {
          distance: selectedLocation.distance,
          suitabilityScore: selectedLocation.suitabilityScore,
          capacityUtilization: selectedLocation.utilization_rate,
          alternativeLocations: leadData.alternativeLocations || []
        }
      });

      // Update GHL contact with location assignment
      await this.updateGHLContact(leadData.ghlContactId, {
        assigned_location_id: selectedLocation.id,
        assigned_location_name: selectedLocation.name,
        routing_reason: reason,
        distance_miles: selectedLocation.distance
      });

      // Trigger location-specific automation
      await this.triggerLocationAutomation(leadData.ghlContactId, selectedLocation);

      await transaction.commit();

      return {
        leadId: lead.id,
        locationId: selectedLocation.id,
        routingReason: reason
      };

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Handle scenario when no locations have capacity
   * @param {Object} leadData - Lead data
   * @returns {Object} Routing result
   */
  async handleNoCapacityScenario(leadData) {
    logger.warn('No available capacity for lead routing', { leadData });

    // Add to overflow queue
    const overflowLocation = await Location.query()
      .where('name', 'LIKE', '%overflow%')
      .orWhere('name', 'LIKE', '%headquarters%')
      .first();

    if (overflowLocation) {
      const assignment = await this.executeAssignment(
        leadData, 
        overflowLocation, 
        'no_capacity_overflow'
      );

      // Notify admin team
      await this.notifyAdminTeam('capacity_overflow', {
        leadId: assignment.leadId,
        zipCode: leadData.zipCode,
        source: leadData.source
      });

      return {
        success: true,
        locationId: overflowLocation.id,
        reason: 'no_capacity_overflow',
        requiresManualReview: true,
        assignment
      };
    }

    throw new Error('No overflow location configured - critical system issue');
  }

  /**
   * Fallback routing when primary routing fails
   * @param {Object} leadData - Lead data
   * @param {Error} originalError - Original error
   * @returns {Object} Fallback routing result
   */
  async fallbackRouting(leadData, originalError) {
    try {
      // Get default location (usually headquarters or main location)
      const defaultLocation = await Location.query()
        .where('active', true)
        .orderBy('created_at', 'asc')
        .first();

      if (!defaultLocation) {
        throw new Error('No default location available');
      }

      const assignment = await this.executeAssignment(
        leadData,
        defaultLocation,
        'fallback_routing'
      );

      // Log the fallback
      logger.warn('Using fallback routing', {
        leadId: assignment.leadId,
        originalError: originalError.message,
        fallbackLocationId: defaultLocation.id
      });

      // Notify admin of routing issue
      await this.notifyAdminTeam('routing_fallback', {
        leadId: assignment.leadId,
        error: originalError.message,
        leadData
      });

      return {
        success: true,
        locationId: defaultLocation.id,
        reason: 'fallback_routing',
        originalError: originalError.message,
        requiresReview: true,
        assignment
      };

    } catch (fallbackError) {
      logger.error('Fallback routing also failed', {
        originalError: originalError.message,
        fallbackError: fallbackError.message,
        leadData
      });

      return {
        success: false,
        error: 'Complete routing failure',
        originalError: originalError.message,
        fallbackError: fallbackError.message
      };
    }
  }

  /**
   * Update location capacity tracking
   * @param {string} locationId - Location ID
   * @param {number} increment - Capacity increment (positive or negative)
   */
  async updateLocationCapacity(locationId, increment) {
    const today = new Date().toDateString();
    
    await LocationCapacity.query()
      .insert({
        location_id: locationId,
        capacity_date: today,
        current_leads: increment,
        updated_at: new Date()
      })
      .onConflict(['location_id', 'capacity_date'])
      .merge({
        current_leads: LocationCapacity.raw('current_leads + ?', [increment]),
        updated_at: new Date()
      });

    // Recalculate utilization rate
    const capacity = await LocationCapacity.query()
      .where({ location_id: locationId, capacity_date: today })
      .first();

    if (capacity) {
      const utilizationRate = capacity.current_leads / (capacity.max_capacity || 100);
      
      await LocationCapacity.query()
        .where({ location_id: locationId, capacity_date: today })
        .patch({ utilization_rate: utilizationRate });
    }
  }

  /**
   * Update GHL contact with routing information
   * @param {string} ghlContactId - GHL contact ID
   * @param {Object} updateData - Data to update
   */
  async updateGHLContact(ghlContactId, updateData) {
    try {
      const customFields = {};
      
      // Map our data to GHL custom fields
      if (updateData.assigned_location_id) {
        customFields['assigned_location_id'] = updateData.assigned_location_id;
      }
      if (updateData.assigned_location_name) {
        customFields['assigned_location_name'] = updateData.assigned_location_name;
      }
      if (updateData.routing_reason) {
        customFields['routing_reason'] = updateData.routing_reason;
      }
      if (updateData.distance_miles) {
        customFields['distance_miles'] = Math.round(updateData.distance_miles * 10) / 10;
      }

      await ghlApiClient.updateContact(ghlContactId, {
        customFields
      });

    } catch (error) {
      logger.error('Failed to update GHL contact', {
        ghlContactId,
        error: error.message,
        updateData
      });
    }
  }

  /**
   * Trigger location-specific automation in GHL
   * @param {string} ghlContactId - GHL contact ID  
   * @param {Object} location - Location data
   */
  async triggerLocationAutomation(ghlContactId, location) {
    try {
      // Move contact to location-specific pipeline
      if (location.ghl_pipeline_id) {
        await ghlApiClient.updateContactPipeline(ghlContactId, {
          pipelineId: location.ghl_pipeline_id,
          stageId: location.ghl_initial_stage_id || 'new_lead'
        });
      }

      // Trigger location-specific automation
      if (location.ghl_automation_id) {
        await ghlApiClient.triggerAutomation(ghlContactId, location.ghl_automation_id);
      }

      // Add location-specific tags
      const tags = ['routed_automatically', `location_${location.id}`];
      if (location.name) {
        tags.push(`location_${location.name.toLowerCase().replace(/\s+/g, '_')}`);
      }

      await ghlApiClient.addContactTags(ghlContactId, tags);

    } catch (error) {
      logger.error('Failed to trigger location automation', {
        ghlContactId,
        locationId: location.id,
        error: error.message
      });
    }
  }

  /**
   * Notify admin team of routing issues
   * @param {string} alertType - Type of alert
   * @param {Object} alertData - Alert data
   */
  async notifyAdminTeam(alertType, alertData) {
    const notificationService = require('../../services/notification.service');
    
    const message = this.buildAlertMessage(alertType, alertData);
    
    // Send multiple notification types
    await Promise.allSettled([
      notificationService.sendSlackAlert(alertType, message, alertData),
      notificationService.sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: `GHL Routing Alert: ${alertType}`,
        body: message
      }),
      notificationService.sendSMS({
        to: process.env.ADMIN_PHONE,
        body: `GHL Alert: ${alertType} - Check dashboard for details`
      })
    ]);
  }

  /**
   * Build alert message based on type
   * @param {string} alertType - Alert type
   * @param {Object} alertData - Alert data
   * @returns {string} Formatted message
   */
  buildAlertMessage(alertType, alertData) {
    switch (alertType) {
      case 'capacity_overflow':
        return `🚨 CAPACITY OVERFLOW ALERT
        
Lead ID: ${alertData.leadId}
Zip Code: ${alertData.zipCode}
Source: ${alertData.source}
Time: ${new Date().toISOString()}

All locations are at capacity. Lead has been assigned to overflow queue.
Action Required: Review capacity settings or add temporary capacity.`;

      case 'routing_fallback':
        return `⚠️ ROUTING FALLBACK ALERT
        
Lead ID: ${alertData.leadId}
Error: ${alertData.error}
Time: ${new Date().toISOString()}

Primary routing failed, using fallback location.
Action Required: Investigate routing algorithm issues.`;

      default:
        return `Alert: ${alertType}\nData: ${JSON.stringify(alertData, null, 2)}`;
    }
  }

  /**
   * Get routing statistics
   * @param {Object} filters - Optional filters
   * @returns {Object} Routing statistics
   */
  async getRoutingStats(filters = {}) {
    const { startDate, endDate, locationId, source } = filters;
    
    let query = LeadRoutingLog.query()
      .join('leads', 'lead_routing_logs.lead_id', 'leads.id')
      .join('locations', 'lead_routing_logs.assigned_location_id', 'locations.id');

    if (startDate) {
      query = query.where('lead_routing_logs.created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('lead_routing_logs.created_at', '<=', endDate);
    }
    if (locationId) {
      query = query.where('lead_routing_logs.assigned_location_id', locationId);
    }
    if (source) {
      query = query.where('leads.source', source);
    }

    const stats = await query.select(
      'lead_routing_logs.routing_reason',
      'locations.name as location_name',
      'locations.id as location_id'
    ).groupBy('routing_reason', 'locations.id', 'locations.name')
     .count('* as count');

    const totalRoutings = stats.reduce((sum, stat) => sum + parseInt(stat.count), 0);

    return {
      totalRoutings,
      routingByReason: stats.reduce((acc, stat) => {
        acc[stat.routing_reason] = (acc[stat.routing_reason] || 0) + parseInt(stat.count);
        return acc;
      }, {}),
      routingByLocation: stats.reduce((acc, stat) => {
        if (!acc[stat.location_id]) {
          acc[stat.location_id] = {
            name: stat.location_name,
            count: 0
          };
        }
        acc[stat.location_id].count += parseInt(stat.count);
        return acc;
      }, {}),
      successRate: (stats.filter(s => s.routing_reason === 'optimal_match')
        .reduce((sum, s) => sum + parseInt(s.count), 0) / totalRoutings * 100).toFixed(2)
    };
  }

  /**
   * Reassign lead to different location
   * @param {string} leadId - Lead ID
   * @param {string} newLocationId - New location ID
   * @param {string} reason - Reassignment reason
   * @returns {Object} Reassignment result
   */
  async reassignLead(leadId, newLocationId, reason) {
    const transaction = await Lead.startTransaction();
    
    try {
      // Get current lead data
      const lead = await Lead.query(transaction).findById(leadId);
      if (!lead) {
        throw new Error(`Lead not found: ${leadId}`);
      }

      // Get new location
      const newLocation = await Location.query().findById(newLocationId);
      if (!newLocation || !newLocation.active) {
        throw new Error(`Invalid location: ${newLocationId}`);
      }

      // Update lead assignment
      await Lead.query(transaction)
        .findById(leadId)
        .patch({
          assigned_location_id: newLocationId,
          backup_location_id: lead.assigned_location_id // Keep old as backup
        });

      // Log reassignment
      await LeadRoutingLog.query(transaction).insert({
        lead_id: leadId,
        original_location_id: lead.assigned_location_id,
        assigned_location_id: newLocationId,
        routing_reason: reason,
        routing_data: {
          reassignment: true,
          previousLocationId: lead.assigned_location_id,
          timestamp: new Date().toISOString()
        }
      });

      // Update capacity tracking
      await this.updateLocationCapacity(lead.assigned_location_id, -1); // Remove from old
      await this.updateLocationCapacity(newLocationId, 1); // Add to new

      // Update GHL contact
      await this.updateGHLContact(lead.ghl_contact_id, {
        assigned_location_id: newLocationId,
        assigned_location_name: newLocation.name,
        routing_reason: reason
      });

      await transaction.commit();

      logger.info('Lead successfully reassigned', {
        leadId,
        fromLocationId: lead.assigned_location_id,
        toLocationId: newLocationId,
        reason
      });

      return {
        success: true,
        leadId,
        previousLocationId: lead.assigned_location_id,
        newLocationId,
        reason
      };

    } catch (error) {
      await transaction.rollback();
      logger.error('Lead reassignment failed', {
        leadId,
        newLocationId,
        reason,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new RoutingService();
