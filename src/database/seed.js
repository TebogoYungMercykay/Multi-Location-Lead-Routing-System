// src/database/seed.js
const { Location, LocationCapacity } = require('./models');
const logger = require('../utils/logger');

const seedData = {
  locations: [
    {
      name: 'Headquarters - New York',
      address: '123 Main St, New York, NY 10001',
      city: 'New York',
      state: 'NY',
      zip_code: '10001',
      latitude: 40.7589,
      longitude: -73.9851,
      phone: '(555) 123-4567',
      email: 'ny@fitness.com',
      max_daily_capacity: 150,
      ghl_location_id: 'loc_ny_001'
    },
    {
      name: 'Los Angeles Location',
      address: '456 Ocean Ave, Los Angeles, CA 90210',
      city: 'Los Angeles',
      state: 'CA',
      zip_code: '90210',
      latitude: 34.0522,
      longitude: -118.2437,
      phone: '(555) 234-5678',
      email: 'la@fitness.com',
      max_daily_capacity: 120,
      ghl_location_id: 'loc_la_001'
    },
    {
      name: 'Chicago Location',
      address: '789 Lake St, Chicago, IL 60601',
      city: 'Chicago',
      state: 'IL',
      zip_code: '60601',
      latitude: 41.8781,
      longitude: -87.6298,
      phone: '(555) 345-6789',
      email: 'chi@fitness.com',
      max_daily_capacity: 100,
      ghl_location_id: 'loc_chi_001'
    }
  ]
};

async function seedDatabase() {
  try {
    logger.info('Starting database seed...');

    // Seed locations
    for (const locationData of seedData.locations) {
      const existing = await Location.query().where('name', locationData.name).first();
      
      if (!existing) {
        const location = await Location.query().insert(locationData);
        
        // Initialize capacity tracking
        await LocationCapacity.query().insert({
          location_id: location.id,
          capacity_date: new Date().toISOString().split('T')[0],
          current_leads: 0,
          max_capacity: locationData.max_daily_capacity,
          utilization_rate: 0
        });
        
        logger.info(`Seeded location: ${locationData.name}`);
      }
    }

    logger.info('Database seed completed successfully');
  } catch (error) {
    logger.error('Database seed failed:', error);
    throw error;
  }
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { seedDatabase };
