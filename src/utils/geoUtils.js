const NodeGeocoder = require('node-geocoder');
const logger = require('./logger');

// Configure geocoder
const options = {
  provider: 'google',
  apiKey: process.env.GOOGLE_MAPS_API_KEY,
  formatter: null
};

const geocoder = NodeGeocoder(options);

// Fallback zip code database for when API is unavailable
const ZIP_CODE_FALLBACKS = {
  '10001': { latitude: 40.7505, longitude: -73.9934 }, // NYC
  '90210': { latitude: 34.0901, longitude: -118.4065 }, // Beverly Hills
  '60601': { latitude: 41.8827, longitude: -87.6233 }, // Chicago
  '77001': { latitude: 29.7749, longitude: -95.3656 }, // Houston
  '85001': { latitude: 33.4484, longitude: -112.0740 }, // Phoenix
  // Add more as needed
};

class GeoUtils {
  /**
   * Get coordinates from zip code
   * @param {string} zipCode - Zip code
   * @returns {Object|null} Coordinates object or null
   */
  async getCoordinatesFromZip(zipCode) {
    if (!zipCode) {
      logger.warn('No zip code provided for geocoding');
      return null;
    }

    // Clean zip code (remove extra characters)
    const cleanZip = zipCode.toString().replace(/[^\d-]/g, '').substring(0, 10);
    const baseZip = cleanZip.split('-')[0]; // Get 5-digit base

    try {
      // Try Google Geocoding API first
      if (process.env.GOOGLE_MAPS_API_KEY) {
        const results = await geocoder.geocode(cleanZip);
        
        if (results && results.length > 0) {
          const { latitude, longitude } = results[0];
          
          if (latitude && longitude) {
            logger.info('Successfully geocoded zip code', {
              zipCode: cleanZip,
              latitude,
              longitude,
              method: 'google_api'
            });
            
            return { latitude, longitude };
          }
        }
      }

      // Fallback to local zip database
      if (ZIP_CODE_FALLBACKS[baseZip]) {
        logger.info('Using fallback coordinates for zip code', {
          zipCode: baseZip,
          method: 'fallback_database'
        });
        
        return ZIP_CODE_FALLBACKS[baseZip];
      }

      // Try a basic US zip code pattern match with rough estimation
      if (this.isValidUSZipCode(baseZip)) {
        const estimated = this.estimateCoordinatesFromZip(baseZip);
        if (estimated) {
          logger.warn('Using estimated coordinates for zip code', {
            zipCode: baseZip,
            method: 'estimation',
            ...estimated
          });
          
          return estimated;
        }
      }

      logger.warn('Could not geocode zip code', { zipCode: cleanZip });
      return null;

    } catch (error) {
      logger.error('Geocoding failed', {
        zipCode: cleanZip,
        error: error.message
      });

      // Try fallback on error
      if (ZIP_CODE_FALLBACKS[baseZip]) {
        return ZIP_CODE_FALLBACKS[baseZip];
      }

      return null;
    }
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * @param {number} lat1 - Latitude 1
   * @param {number} lon1 - Longitude 1
   * @param {number} lat2 - Latitude 2
   * @param {number} lon2 - Longitude 2
   * @returns {number} Distance in miles
   */
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
    
    return Math.round(distance * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Convert degrees to radians
   * @param {number} degrees - Degrees
   * @returns {number} Radians
   */
  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Validate US zip code format
   * @param {string} zipCode - Zip code
   * @returns {boolean} Is valid
   */
  isValidUSZipCode(zipCode) {
    const zipPattern = /^\d{5}(-\d{4})?$/;
    return zipPattern.test(zipCode);
  }

  /**
   * Rough coordinate estimation based on zip code patterns
   * This is a very basic estimation - not accurate for production
   * @param {string} zipCode - 5-digit zip code
   * @returns {Object|null} Estimated coordinates
   */
  estimateCoordinatesFromZip(zipCode) {
    if (!this.isValidUSZipCode(zipCode)) return null;

    const firstDigit = parseInt(zipCode.charAt(0));
    const secondDigit = parseInt(zipCode.charAt(1));

    // Very rough US regional estimation based on first digit
    const regionalEstimates = {
      0: { lat: 42.0, lon: -71.0, name: 'Northeast' }, // MA, CT, RI, etc.
      1: { lat: 40.7, lon: -74.0, name: 'NY/NJ area' },
      2: { lat: 38.9, lon: -77.0, name: 'DC/MD/VA area' },
      3: { lat: 33.7, lon: -84.4, name: 'Southeast' },
      4: { lat: 36.2, lon: -86.8, name: 'Kentucky/Tennessee' },
      5: { lat: 41.9, lon: -87.6, name: 'Great Lakes' },
      6: { lat: 32.8, lon: -96.8, name: 'South Central' },
      7: { lat: 39.1, lon: -94.6, name: 'Plains' },
      8: { lat: 39.7, lon: -104.9, name: 'Mountain' },
      9: { lat: 37.4, lon: -122.1, name: 'West Coast' }
    };

    const estimate = regionalEstimates[firstDigit];
    
    if (estimate) {
      // Add some variance based on second digit for slightly better estimation
      const variance = (secondDigit - 5) * 0.5;
      
      return {
        latitude: estimate.lat + variance,
        longitude: estimate.lon + variance,
        estimated: true,
        region: estimate.name
      };
    }

    return null;
  }

  /**
   * Find locations within radius
   * @param {Object} centerPoint - Center coordinates {latitude, longitude}
   * @param {Array} locations - Array of location objects with lat/lon
   * @param {number} radiusMiles - Radius in miles
   * @returns {Array} Locations within radius with distance
   */
  findLocationsWithinRadius(centerPoint, locations, radiusMiles = 50) {
    const { latitude: centerLat, longitude: centerLon } = centerPoint;
    
    return locations
      .map(location => ({
        ...location,
        distance: this.calculateDistance(
          centerLat,
          centerLon,
          location.latitude,
          location.longitude
        )
      }))
      .filter(location => location.distance <= radiusMiles)
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Get the closest location to coordinates
   * @param {Object} coordinates - Target coordinates
   * @param {Array} locations - Array of locations
   * @returns {Object|null} Closest location with distance
   */
  getClosestLocation(coordinates, locations) {
    if (!locations || locations.length === 0) return null;

    let closest = null;
    let shortestDistance = Infinity;

    locations.forEach(location => {
      const distance = this.calculateDistance(
        coordinates.latitude,
        coordinates.longitude,
        location.latitude,
        location.longitude
      );

      if (distance < shortestDistance) {
        shortestDistance = distance;
        closest = { ...location, distance };
      }
    });

    return closest;
  }

  /**
   * Validate coordinates
   * @param {number} latitude - Latitude
   * @param {number} longitude - Longitude
   * @returns {boolean} Are coordinates valid
   */
  isValidCoordinates(latitude, longitude) {
    return (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      latitude >= -90 && latitude <= 90 &&
      longitude >= -180 && longitude <= 180
    );
  }

  /**
   * Get region name from coordinates (basic US regions)
   * @param {number} latitude - Latitude
   * @param {number} longitude - Longitude
   * @returns {string} Region name
   */
  getRegionFromCoordinates(latitude, longitude) {
    // Basic US regional boundaries
    if (latitude > 39 && longitude > -90) return 'Northeast';
    if (latitude > 36 && longitude > -104) return 'Midwest';
    if (latitude > 25 && latitude <= 36) return 'South';
    if (latitude > 32 && longitude <= -104) return 'West';
    if (latitude <= 32) return 'Southwest';
    
    return 'Unknown';
  }
}

module.exports = new GeoUtils();
