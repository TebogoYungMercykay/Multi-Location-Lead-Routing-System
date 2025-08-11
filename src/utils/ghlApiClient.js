const axios = require('axios');
const logger = require('./logger');

class GHLApiClient {
  constructor() {
    this.baseURL = process.env.GHL_API_DOMAIN || 'https://services.leadconnectorhq.com';
    this.clientId = process.env.GHL_APP_CLIENT_ID;
    this.clientSecret = process.env.GHL_APP_CLIENT_SECRET;
    this.accessTokens = new Map(); // Store access tokens by location ID
    this.tokenRefreshPromises = new Map(); // Prevent concurrent refresh requests
  }

  /**
   * Get access token for a location
   * @param {string} locationId - GHL location ID
   * @returns {string} Access token
   */
  async getAccessToken(locationId) {
    // Check if we have a valid token
    const tokenData = this.accessTokens.get(locationId);
    
    if (tokenData && tokenData.expiresAt > Date.now() + 60000) { // 1 minute buffer
      return tokenData.token;
    }

    // Check if refresh is already in progress
    if (this.tokenRefreshPromises.has(locationId)) {
      return await this.tokenRefreshPromises.get(locationId);
    }

    // Start token refresh
    const refreshPromise = this.refreshAccessToken(locationId);
    this.tokenRefreshPromises.set(locationId, refreshPromise);

    try {
      const token = await refreshPromise;
      this.tokenRefreshPromises.delete(locationId);
      return token;
    } catch (error) {
      this.tokenRefreshPromises.delete(locationId);
      throw error;
    }
  }

  /**
   * Refresh access token for location
   * @param {string} locationId - GHL location ID
   * @returns {string} New access token
   */
  async refreshAccessToken(locationId) {
    try {
      // In production, you'd get this from your OAuth flow storage
      // For now, using a mock implementation
      const refreshToken = await this.getStoredRefreshToken(locationId);
      
      const response = await axios.post(`${this.baseURL}/oauth/token`, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret
      });

      const { access_token, expires_in, refresh_token } = response.data;
      
      // Store new token
      this.accessTokens.set(locationId, {
        token: access_token,
        expiresAt: Date.now() + (expires_in * 1000)
      });

      // Store new refresh token if provided
      if (refresh_token) {
        await this.storeRefreshToken(locationId, refresh_token);
      }

      logger.ghl('Access token refreshed', { locationId });
      return access_token;

    } catch (error) {
      logger.error('Failed to refresh access token', {
        locationId,
        error: error.message
      });
      throw new Error(`Authentication failed for location ${locationId}`);
    }
  }

  /**
   * Make authenticated API request
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @param {string} locationId - GHL location ID
   * @returns {Object} API response
   */
  async makeRequest(method, endpoint, data = null, locationId = null) {
    try {
      let headers = {
        'Content-Type': 'application/json'
      };

      // Add authorization if location ID provided
      if (locationId) {
        const accessToken = await this.getAccessToken(locationId);
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers,
        timeout: 30000
      };

      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        config.data = data;
      } else if (data && method === 'GET') {
        config.params = data;
      }

      const response = await axios(config);
      
      logger.ghl(`API request successful: ${method} ${endpoint}`, {
        locationId,
        status: response.status
      });

      return response.data;

    } catch (error) {
      const status = error.response?.status;
      const errorData = error.response?.data;

      logger.error(`GHL API request failed: ${method} ${endpoint}`, {
        locationId,
        status,
        error: error.message,
        errorData
      });

      // Handle specific error cases
      if (status === 401) {
        // Token expired, try to refresh and retry once
        if (locationId && !error.config?.retried) {
          this.accessTokens.delete(locationId); // Clear invalid token
          error.config.retried = true;
          return this.makeRequest(method, endpoint, data, locationId);
        }
      }

      throw error;
    }
  }

  /**
   * Update contact in GHL
   * @param {string} contactId - GHL contact ID
   * @param {Object} updateData - Data to update
   * @param {string} locationId - GHL location ID
   * @returns {Object} Updated contact data
   */
  async updateContact(contactId, updateData, locationId = null) {
    return await this.makeRequest(
      'PUT',
      `/contacts/${contactId}`,
      updateData,
      locationId
    );
  }

  /**
   * Update contact pipeline stage
   * @param {string} contactId - GHL contact ID
   * @param {Object} pipelineData - Pipeline data
   * @param {string} locationId - GHL location ID
   * @returns {Object} Response data
   */
  async updateContactPipeline(contactId, pipelineData, locationId = null) {
    const { pipelineId, stageId } = pipelineData;
    
    return await this.makeRequest(
      'POST',
      `/contacts/${contactId}/workflow`,
      {
        workflowId: pipelineId,
        eventStartStep: stageId
      },
      locationId
    );
  }

  /**
   * Add tags to contact
   * @param {string} contactId - GHL contact ID
   * @param {Array} tags - Array of tag names
   * @param {string} locationId - GHL location ID
   * @returns {Object} Response data
   */
  async addContactTags(contactId, tags, locationId = null) {
    return await this.makeRequest(
      'POST',
      `/contacts/${contactId}/tags`,
      { tags },
      locationId
    );
  }

  /**
   * Trigger automation for contact
   * @param {string} contactId - GHL contact ID
   * @param {string} automationId - Automation/workflow ID
   * @param {string} locationId - GHL location ID
   * @returns {Object} Response data
   */
  async triggerAutomation(contactId, automationId, locationId = null) {
    return await this.makeRequest(
      'POST',
      `/contacts/${contactId}/workflow/${automationId}`,
      {},
      locationId
    );
  }

  /**
   * Create opportunity
   * @param {Object} opportunityData - Opportunity data
   * @param {string} locationId - GHL location ID
   * @returns {Object} Created opportunity
   */
  async createOpportunity(opportunityData, locationId = null) {
    return await this.makeRequest(
      'POST',
      '/opportunities',
      opportunityData,
      locationId
    );
  }

  /**
   * Update opportunity
   * @param {string} opportunityId - Opportunity ID
   * @param {Object} updateData - Update data
   * @param {string} locationId - GHL location ID
   * @returns {Object} Updated opportunity
   */
  async updateOpportunity(opportunityId, updateData, locationId = null) {
    return await this.makeRequest(
      'PUT',
      `/opportunities/${opportunityId}`,
      updateData,
      locationId
    );
  }

  /**
   * Create appointment
   * @param {Object} appointmentData - Appointment data
   * @param {string} locationId - GHL location ID
   * @returns {Object} Created appointment
   */
  async createAppointment(appointmentData, locationId = null) {
    return await this.makeRequest(
      'POST',
      '/appointments',
      appointmentData,
      locationId
    );
  }

  /**
   * Send SMS
   * @param {Object} smsData - SMS data
   * @param {string} locationId - GHL location ID
   * @returns {Object} Response data
   */
  async sendSMS(smsData, locationId = null) {
    return await this.makeRequest(
      'POST',
      '/conversations/messages',
      {
        type: 'SMS',
        ...smsData
      },
      locationId
    );
  }

  /**
   * Send email
   * @param {Object} emailData - Email data
   * @param {string} locationId - GHL location ID
   * @returns {Object} Response data
   */
  async sendEmail(emailData, locationId = null) {
    return await this.makeRequest(
      'POST',
      '/conversations/messages',
      {
        type: 'Email',
        ...emailData
      },
      locationId
    );
  }

  /**
   * Get contact by ID
   * @param {string} contactId - GHL contact ID
   * @param {string} locationId - GHL location ID
   * @returns {Object} Contact data
   */
  async getContact(contactId, locationId = null) {
    return await this.makeRequest(
      'GET',
      `/contacts/${contactId}`,
      null,
      locationId
    );
  }

  /**
   * Search contacts
   * @param {Object} searchParams - Search parameters
   * @param {string} locationId - GHL location ID
   * @returns {Object} Search results
   */
  async searchContacts(searchParams, locationId = null) {
    return await this.makeRequest(
      'GET',
      '/contacts',
      searchParams,
      locationId
    );
  }

  /**
   * Get location info
   * @param {string} locationId - GHL location ID
   * @returns {Object} Location data
   */
  async getLocation(locationId) {
    return await this.makeRequest(
      'GET',
      `/locations/${locationId}`,
      null,
      locationId
    );
  }

  /**
   * Mock method to get stored refresh token
   * In production, this would retrieve from secure storage
   * @param {string} locationId - Location ID
   * @returns {string} Refresh token
   */
  async getStoredRefreshToken(locationId) {
    // Mock implementation - in production, retrieve from secure storage
    return 'mock_refresh_token_' + locationId;
  }

  /**
   * Mock method to store refresh token
   * In production, this would store in secure storage
   * @param {string} locationId - Location ID
   * @param {string} refreshToken - Refresh token
   */
  async storeRefreshToken(locationId, refreshToken) {
    // Mock implementation - in production, store in secure storage
    logger.ghl('Refresh token stored', { locationId });
  }

  /**
   * Bulk update contacts
   * @param {Array} updates - Array of contact updates
   * @param {string} locationId - GHL location ID
   * @returns {Object} Bulk operation results
   */
  async bulkUpdateContacts(updates, locationId = null) {
    const results = [];
    const batchSize = 10; // Process in batches to avoid rate limits

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
      const batchPromises = batch.map(update => 
        this.updateContact(update.contactId, update.data, locationId)
          .catch(error => ({ error: error.message, contactId: update.contactId }))
      );

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to respect rate limits
      if (i + batchSize < updates.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      total: updates.length,
      successful: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      results
    };
  }
}

module.exports = new GHLApiClient();
