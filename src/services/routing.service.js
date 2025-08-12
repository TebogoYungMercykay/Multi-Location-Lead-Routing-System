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
    const { zip_code, source, leadScore, ghlContactId } = leadData;
    try {
      // Step 1: Get coordinates from zip code
      const coordinates = await geoUtils.getCoordinatesFromZip(zip_code);
      if (!coordinates) {
        throw new Error(`Invalid zip code: ${zip_code}`);
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
        zip_code,
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
    
    // Fix date format - use YYYY-MM-DD format instead of toDateString()
    const currentDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    try {
      // Simplified approach - get locations and capacity separately
      const locations = await Location.query()
        .where('active', true)
        .whereNotNull('latitude')
        .whereNotNull('longitude');
      
      if (!locations || locations.length === 0) {
        throw new Error('No active locations found');
      }

      // Get capacity data separately with proper date format
      const capacityData = await LocationCapacity.query()
        .where('capacity_date', currentDate);

      console.log('Current date for capacity lookup:', currentDate);
      console.log('Found capacity records:', capacityData.length);

      // Calculate distances and combine with capacity data
      const locationsWithDistance = locations.map(location => {
        const distance = this.calculateDistance(
          latitude, 
          longitude, 
          location.latitude, 
          location.longitude
        );

        // Find capacity data for this location
        const capacity = capacityData.find(c => 
          c.location_id.toString() === location.id.toString()
        ) || {
          current_leads: 0,
          max_capacity: 100,
          utilization_rate: 0.0
        };

        return {
          ...location,
          distance,
          current_leads: capacity.current_leads || 0,
          max_capacity: capacity.max_capacity || 100,
          utilization_rate: capacity.utilization_rate || 0.0
        };
      });

      // Filter by distance
      const nearbyLocations = locationsWithDistance.filter(location => 
        location.distance <= maxDistance
      );

      if (nearbyLocations.length === 0) {
        throw new Error(`No locations found within ${maxDistance} miles`);
      }

      // Filter by capacity availability
      const availableLocations = nearbyLocations.filter(location => {
        const utilizationRate = location.utilization_rate || 0;
        const maxUtilizationThreshold = leadScore >= 80 ? 0.9 : 0.8;
        return utilizationRate < maxUtilizationThreshold;
      });

      // If no locations have capacity, return the closest ones anyway for overflow handling
      const locationsToReturn = availableLocations.length > 0 ? availableLocations : nearbyLocations.slice(0, 3);

      // Score and sort locations
      return locationsToReturn.map(location => ({
        ...location,
        suitabilityScore: this.calculateSuitabilityScore(location, leadScore, source)
      })).sort((a, b) => b.suitabilityScore - a.suitabilityScore);

    } catch (error) {
      console.error('Error in findAvailableLocations:', error);
      throw error;
    }
  }

  async ensureCapacityRecord(locationId) {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const existing = await LocationCapacity.query()
        .where({
          location_id: String(locationId),
          capacity_date: today
        })
        .first();
        
      if (!existing) {
        await LocationCapacity.query().insert({
          location_id: String(locationId),
          capacity_date: today,
          current_leads: 0,
          max_capacity: 100,
          utilization_rate: 0.0,
          created_at: new Date(),
          updated_at: new Date()
        });
        console.log(`Created capacity record for location ${locationId}`);
      }
    } catch (error) {
      console.error('Error ensuring capacity record:', error);
    }
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Radius of Earth in miles
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return Math.round(distance * 100) / 100;
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
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
    
    console.log("Location: ", selectedLocation);
    logger.info("--- Debug --> Works 1 ----");
    // Update capacity tracking
    await this.updateLocationCapacity(selectedLocation.id, 1);
    logger.info("--- Debug --> Works 2 ----");

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
      console.log('Executing assignment with data:', {
        leadData: {
          firstName: leadData.firstName,
          lastName: leadData.lastName,
          zipCode: leadData.zip_code
        },
        locationId: selectedLocation.id,
        reason
      });

      // Create lead record with explicit type conversions
      const leadInsertData = {
        first_name: String(leadData.firstName || ''),
        last_name: String(leadData.lastName || ''),
        email: String(leadData.email || ''),
        phone: String(leadData.phone || ''),
        zip_code: String(leadData.zip_code || ''),
        source: String(leadData.source || ''),
        utm_source: String(leadData.utmSource || ''),
        utm_campaign: String(leadData.utmCampaign || ''),
        utm_medium: String(leadData.utmMedium || ''),
        assigned_location_id: String(selectedLocation.id),
        ghl_contact_id: String(leadData.ghlContactId || ''),
        lead_score: parseInt(leadData.leadScore) || 50,
        status: 'assigned',
        metadata: leadData.metadata || {},
        created_at: new Date(),
        updated_at: new Date()
      };

      const lead = await Lead.query(transaction).insert(leadInsertData);
      console.log('Lead created with ID:', lead.id);

      // Log routing decision with explicit string conversion
      const routingLogData = {
        lead_id: String(lead.id),
        assigned_location_id: String(selectedLocation.id),
        routing_reason: String(reason),
        routing_data: {
          distance: selectedLocation.distance || 0,
          suitabilityScore: selectedLocation.suitabilityScore || 0,
          capacityUtilization: selectedLocation.utilization_rate || 0,
          alternativeLocations: leadData.alternativeLocations || []
        },
        created_at: new Date(),
        updated_at: new Date()
      };

      await LeadRoutingLog.query(transaction).insert(routingLogData);
      console.log('Routing log created');

      // Update GHL contact (don't let this fail the assignment)
      try {
        await this.updateGHLContact(leadData.ghlContactId, {
          assigned_location_id: String(selectedLocation.id),
          assigned_location_name: String(selectedLocation.name || ''),
          routing_reason: String(reason),
          distance_miles: selectedLocation.distance || 0
        });
      } catch (ghlError) {
        console.warn('GHL update failed, but continuing with assignment:', ghlError.message);
      }

      // Trigger location-specific automation (don't let this fail the assignment)
      try {
        await this.triggerLocationAutomation(leadData.ghlContactId, selectedLocation);
      } catch (automationError) {
        console.warn('Automation trigger failed, but continuing with assignment:', automationError.message);
      }

      await transaction.commit();
      console.log('Assignment completed successfully');

      return {
        leadId: String(lead.id),
        locationId: String(selectedLocation.id),
        routingReason: String(reason)
      };

    } catch (error) {
      await transaction.rollback();
      console.error('Assignment failed:', error);
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
      logger.warn(originalError);
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
    const today = new Date().toISOString().split('T')[0];
      try {
      // Check if record exists first
      const existingCapacity = await LocationCapacity.query()
        .where({
          location_id: locationId.toString(),
          capacity_date: today
        })
        .first();

      if (existingCapacity) {
        // Update existing record
        const newLeadCount = Math.max(0, (existingCapacity.current_leads || 0) + increment);
        const utilizationRate = newLeadCount / (existingCapacity.max_capacity || 100);

        await LocationCapacity.query()
          .where({
            location_id: locationId.toString(),
            capacity_date: today
          })
          .patch({
            current_leads: newLeadCount,
            utilization_rate: utilizationRate,
            updated_at: today
          });
      } else {
        // Create new record
        const newLeadCount = Math.max(0, increment);
        const maxCapacity = 100; // Default capacity
        const utilizationRate = newLeadCount / maxCapacity;

        await LocationCapacity.query().insert({
          location_id: locationId.toString(),
          capacity_date: today,
          current_leads: newLeadCount,
          max_capacity: maxCapacity,
          utilization_rate: utilizationRate,
          created_at: today,
          updated_at: today
        });
      }

      console.log(`Updated capacity for location ${locationId}: ${increment > 0 ? '+' : ''}${increment}`);
      
    } catch (error) {
      console.error('Error updating location capacity:', error);
      // Don't throw here - capacity tracking shouldn't break lead assignment
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
    const notificationService = require('./notification.service');
    
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
        return ` CAPACITY OVERFLOW ALERT
        
    Lead ID: ${alertData.leadId}
    Zip Code: ${alertData.zipCode}
    Source: ${alertData.source}
    Time: ${new Date().toISOString()}

    All locations are at capacity. Lead has been assigned to overflow queue.
    Action Required: Review capacity settings or add temporary capacity.`;

          case 'routing_fallback':
            return ` ROUTING FALLBACK ALERT
            
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
    const { LeadRoutingLog } = require('../database/models');
    const { startDate, endDate, locationId, source } = filters;
    
    try {
      // Build base query with proper joins
      let query = LeadRoutingLog.query()
        .leftJoin('leads', 'lead_routing_logs.lead_id', 'leads.id')
        .leftJoin('locations', 'lead_routing_logs.assigned_location_id', 'locations.id')
        .where('locations.active', true);

      // Apply filters
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

      // Get routing statistics with proper grouping
      const stats = await query
        .select(
          'lead_routing_logs.routing_reason',
          'locations.name as location_name',
          'locations.id as location_id'
        )
        .groupBy('lead_routing_logs.routing_reason', 'locations.id', 'locations.name')
        .count('lead_routing_logs.id as count');

      // Handle empty results
      if (!stats || stats.length === 0) {
        return {
          totalRoutings: 0,
          routingByReason: {},
          routingByLocation: {},
          successRate: '0.00'
        };
      }

      const totalRoutings = stats.reduce((sum, stat) => sum + parseInt(stat.count), 0);

      // Build routing by reason aggregation
      const routingByReason = stats.reduce((acc, stat) => {
        const reason = stat.routing_reason || 'unknown';
        acc[reason] = (acc[reason] || 0) + parseInt(stat.count);
        return acc;
      }, {});

      // Build routing by location aggregation
      const routingByLocation = stats.reduce((acc, stat) => {
        const locationId = stat.location_id;
        if (locationId) {
          if (!acc[locationId]) {
            acc[locationId] = {
              name: stat.location_name || 'Unknown Location',
              count: 0
            };
          }
          acc[locationId].count += parseInt(stat.count);
        }
        return acc;
      }, {});

      // Calculate success rate (optimal_match percentage)
      const optimalMatches = stats
        .filter(s => s.routing_reason === 'optimal_match')
        .reduce((sum, s) => sum + parseInt(s.count), 0);
      
      const successRate = totalRoutings > 0 
        ? (optimalMatches / totalRoutings * 100).toFixed(2)
        : '0.00';

      return {
        totalRoutings,
        routingByReason,
        routingByLocation,
        successRate,
        // Additional helpful metrics
        avgRoutingsPerLocation: totalRoutings > 0 && Object.keys(routingByLocation).length > 0
          ? (totalRoutings / Object.keys(routingByLocation).length).toFixed(2)
          : '0.00',
        reasonDistribution: Object.keys(routingByReason).map(reason => ({
          reason,
          count: routingByReason[reason],
          percentage: ((routingByReason[reason] / totalRoutings) * 100).toFixed(2)
        }))
      };

    } catch (error) {
      console.error('Error getting routing stats:', error);
      throw new Error('Failed to retrieve routing statistics');
    }
  }

  // /**
  //  * Get routing performance by time period
  //  * @param {string} period - 'day', 'week', 'month'
  //  * @param {Object} filters - Optional filters
  //  */
  // async getRoutingTrends(period = 'day', filters = {}) {
  //   const { LeadRoutingLog } = require('../database/models');
  //   const { startDate, endDate, locationId } = filters;
    
  //   let dateFormat;
  //   switch (period) {
  //     case 'week':
  //       dateFormat = '%Y-%u'; // Year-Week
  //       break;
  //     case 'month':
  //       dateFormat = '%Y-%m'; // Year-Month
  //       break;
  //     default:
  //       dateFormat = '%Y-%m-%d'; // Year-Month-Day
  //   }
    
  //   let query = LeadRoutingLog.query()
  //     .leftJoin('locations', 'lead_routing_logs.assigned_location_id', 'locations.id')
  //     .where('locations.active', true);
      
  //   if (startDate) query = query.where('lead_routing_logs.created_at', '>=', startDate);
  //   if (endDate) query = query.where('lead_routing_logs.created_at', '<=', endDate);
  //   if (locationId) query = query.where('lead_routing_logs.assigned_location_id', locationId);
    
  //   const results = await query
  //     .select(
  //       LeadRoutingLog.knex().raw(`DATE_FORMAT(lead_routing_logs.created_at, '${dateFormat}') as period`),
  //       'lead_routing_logs.routing_reason'
  //     )
  //     .groupBy('period', 'lead_routing_logs.routing_reason')
  //     .count('lead_routing_logs.id as count')
  //     .orderBy('period');
      
  //   return results;
  // }

  // /**
  //  * Get location capacity utilization
  //  */
  // async getCapacityUtilization(locationId = null) {
  //   const { LocationCapacity, Location } = require('../database/models');
    
  //   let query = LocationCapacity.query()
  //     .leftJoin('locations', 'location_capacity.location_id', 'locations.id')
  //     .where('locations.active', true);
      
  //   if (locationId) {
  //     query = query.where('location_capacity.location_id', locationId);
  //   }
    
  //   const results = await query
  //     .select(
  //       'location_capacity.location_id',
  //       'locations.name as location_name',
  //       'location_capacity.capacity_date',
  //       'location_capacity.current_leads',
  //       'location_capacity.max_capacity',
  //       'location_capacity.utilization_rate'
  //     )
  //     .orderBy('location_capacity.capacity_date', 'desc');
      
  //   return results;
  // }

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
