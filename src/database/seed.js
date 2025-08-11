const { Location, Lead, LocationCapacity, AnalyticsEvent, WebhookEventLog, LeadRoutingLog } = require('./models');
const logger = require('../utils/logger');

const seedData = {
  locations: [
    {
      id: 'loc_ny_001',
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
      ghl_location_id: 'loc_ny_001',
      ghl_pipeline_id: 'pipeline_ny_001',
      ghl_initial_stage_id: 'stage_ny_initial',
      ghl_automation_id: 'auto_ny_001',
      facebook_performance_score: 85.5,
      google_performance_score: 92.3,
      website_performance_score: 78.9,
      timezone: 'America/New_York'
    },
    {
      id: 'loc_la_001',
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
      ghl_location_id: 'loc_la_001',
      ghl_pipeline_id: 'pipeline_la_001',
      ghl_initial_stage_id: 'stage_la_initial',
      ghl_automation_id: 'auto_la_001',
      facebook_performance_score: 79.2,
      google_performance_score: 88.7,
      website_performance_score: 82.1,
      timezone: 'America/Los_Angeles'
    },
    {
      id: 'loc_chi_001',
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
      ghl_location_id: 'loc_chi_001',
      ghl_pipeline_id: 'pipeline_chi_001',
      ghl_initial_stage_id: 'stage_chi_initial',
      ghl_automation_id: 'auto_chi_001',
      facebook_performance_score: 91.8,
      google_performance_score: 86.4,
      website_performance_score: 89.3,
      timezone: 'America/Chicago'
    },
    {
      id: 'loc_miami_001',
      name: 'Miami Beach Location',
      address: '321 Ocean Drive, Miami Beach, FL 33139',
      city: 'Miami Beach',
      state: 'FL',
      zip_code: '33139',
      latitude: 25.7617,
      longitude: -80.1918,
      phone: '(555) 456-7890',
      email: 'miami@fitness.com',
      max_daily_capacity: 80,
      ghl_location_id: 'loc_miami_001',
      ghl_pipeline_id: 'pipeline_miami_001',
      ghl_initial_stage_id: 'stage_miami_initial',
      ghl_automation_id: 'auto_miami_001',
      facebook_performance_score: 87.3,
      google_performance_score: 83.9,
      website_performance_score: 91.2,
      timezone: 'America/New_York'
    },
    {
      id: 'loc_dallas_001',
      name: 'Dallas Location',
      address: '555 Commerce St, Dallas, TX 75201',
      city: 'Dallas',
      state: 'TX',
      zip_code: '75201',
      latitude: 32.7767,
      longitude: -96.7970,
      phone: '(555) 567-8901',
      email: 'dallas@fitness.com',
      max_daily_capacity: 110,
      ghl_location_id: 'loc_dallas_001',
      ghl_pipeline_id: 'pipeline_dallas_001',
      ghl_initial_stage_id: 'stage_dallas_initial',
      ghl_automation_id: 'auto_dallas_001',
      facebook_performance_score: 82.7,
      google_performance_score: 89.1,
      website_performance_score: 85.4,
      timezone: 'America/Chicago'
    }
  ],

  // Mock lead data with various statuses and sources
  leads: [
    {
      assigned_location_id: 'loc_ny_001',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john.doe@email.com',
      phone: '(555) 111-2222',
      zip_code: '10001',
      source: 'facebook_ads',
      utm_source: 'facebook',
      utm_campaign: 'spring_promotion',
      utm_medium: 'social',
      ghl_contact_id: 'contact_001',
      lead_score: 85,
      status: 'qualified',
      metadata: {
        interests: ['weight_training', 'cardio'],
        preferred_time: 'evening',
        budget_range: '$50-100'
      }
    },
    {
      assigned_location_id: 'loc_la_001',
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane.smith@email.com',
      phone: '(555) 222-3333',
      zip_code: '90210',
      source: 'google_ads',
      utm_source: 'google',
      utm_campaign: 'fitness_goals',
      utm_medium: 'search',
      ghl_contact_id: 'contact_002',
      lead_score: 72,
      status: 'contacted',
      metadata: {
        interests: ['yoga', 'pilates'],
        preferred_time: 'morning',
        budget_range: '$75-150'
      }
    },
    {
      assigned_location_id: 'loc_chi_001',
      first_name: 'Mike',
      last_name: 'Johnson',
      email: 'mike.johnson@email.com',
      phone: '(555) 333-4444',
      zip_code: '60601',
      source: 'website_form',
      utm_source: 'organic',
      utm_campaign: 'direct',
      utm_medium: 'website',
      ghl_contact_id: 'contact_003',
      lead_score: 91,
      status: 'converted',
      metadata: {
        interests: ['crossfit', 'strength_training'],
        preferred_time: 'afternoon',
        budget_range: '$100-200'
      }
    },
    {
      assigned_location_id: 'loc_miami_001',
      first_name: 'Sarah',
      last_name: 'Wilson',
      email: 'sarah.wilson@email.com',
      phone: '(555) 444-5555',
      zip_code: '33139',
      source: 'instagram_ads',
      utm_source: 'instagram',
      utm_campaign: 'summer_body',
      utm_medium: 'social',
      ghl_contact_id: 'contact_004',
      lead_score: 68,
      status: 'new',
      metadata: {
        interests: ['dance_fitness', 'nutrition'],
        preferred_time: 'evening',
        budget_range: '$40-80'
      }
    },
    {
      assigned_location_id: 'loc_dallas_001',
      first_name: 'David',
      last_name: 'Brown',
      email: 'david.brown@email.com',
      phone: '(555) 555-6666',
      zip_code: '75201',
      source: 'referral',
      utm_source: 'referral',
      utm_campaign: 'member_referral',
      utm_medium: 'word_of_mouth',
      ghl_contact_id: 'contact_005',
      lead_score: 88,
      status: 'assigned',
      metadata: {
        interests: ['personal_training', 'nutrition_coaching'],
        preferred_time: 'morning',
        budget_range: '$150-300',
        referrer: 'Mike Johnson'
      }
    },
    {
      assigned_location_id: 'loc_ny_001',
      first_name: 'Emily',
      last_name: 'Davis',
      email: 'emily.davis@email.com',
      phone: '(555) 666-7777',
      zip_code: '10001',
      source: 'facebook_ads',
      utm_source: 'facebook',
      utm_campaign: 'new_year_resolution',
      utm_medium: 'social',
      ghl_contact_id: 'contact_006',
      lead_score: 55,
      status: 'lost',
      metadata: {
        interests: ['group_classes'],
        preferred_time: 'weekend',
        budget_range: '$30-60',
        loss_reason: 'price_sensitive'
      }
    },
    {
      assigned_location_id: 'loc_la_001',
      first_name: 'Chris',
      last_name: 'Martinez',
      email: 'chris.martinez@email.com',
      phone: '(555) 777-8888',
      zip_code: '90210',
      source: 'google_ads',
      utm_source: 'google',
      utm_campaign: 'local_fitness',
      utm_medium: 'search',
      ghl_contact_id: 'contact_007',
      lead_score: 79,
      status: 'qualified',
      metadata: {
        interests: ['swimming', 'triathlon_training'],
        preferred_time: 'early_morning',
        budget_range: '$80-120'
      }
    }
  ]
};

// Helper function to get random date within last 30 days
function getRandomDateWithinDays(days = 30) {
  const now = new Date();
  const randomTime = now.getTime() - Math.random() * days * 24 * 60 * 60 * 1000;
  return new Date(randomTime);
}

// Helper function to get random element from array
function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

async function seedDatabase() {
  try {
    logger.info('Starting database seed...');

    // Clear existing data (optional - remove if you want to preserve data)
    logger.info('Clearing existing data...');
    await WebhookEventLog.query().delete();
    await AnalyticsEvent.query().delete();
    await LeadRoutingLog.query().delete();
    await LocationCapacity.query().delete();
    await Lead.query().delete();
    await Location.query().delete();

    // 1. Seed locations
    logger.info('Seeding locations...');
    const locations = [];
    for (const locationData of seedData.locations) {
      const location = await Location.query().insert(locationData);
      locations.push(location);
      logger.info(`Seeded location: ${locationData.name}`);
    }

    // 2. Seed location capacity for current and past dates
    logger.info('Seeding location capacity...');
    for (const location of locations) {
      // Create capacity records for last 7 days and next 7 days
      for (let i = -7; i <= 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        const currentLeads = Math.floor(Math.random() * (location.max_daily_capacity * 0.8));
        const utilizationRate = currentLeads / location.max_daily_capacity;

        await LocationCapacity.query().insert({
          location_id: `${location.id}`,
          capacity_date: dateStr,
          current_leads: currentLeads,
          max_capacity: location.max_daily_capacity,
          utilization_rate: utilizationRate
        });
      }
    }

    // 3. Seed leads and assign them to locations
    logger.info('Seeding leads...');
    const leads = [];
    for (const leadData of seedData.leads) {
      // Find the best location match based on zip code (simplified)
      let assignedLocation = locations.find(loc => 
        loc.zip_code === leadData.zip_code
      ) || getRandomElement(locations);

      // Create the lead
      const lead = await Lead.query().insert({
        ...leadData,
        assigned_location_id: `${assignedLocation.id}`,
        backup_location_id: `${getRandomElement(locations.filter(l => l.id !== assignedLocation.id)).id}`
      });
      leads.push(lead);

      // 4. Create routing log for this lead
      await LeadRoutingLog.query().insert({
        lead_id: `${lead.id}`,
        assigned_location_id: `${assignedLocation.id}`,
        routing_reason: 'optimal_match',
        routing_data: {
          distance: Math.random() * 50, // km
          capacity_utilization: Math.random() * 0.8,
          performance_score: assignedLocation.facebook_performance_score
        }
      });

      logger.info(`Seeded lead: ${leadData.first_name} ${leadData.last_name}`);
    }

    // 5. Seed analytics events
    logger.info('Seeding analytics events...');
    const eventTypes = ['lead_created', 'lead_routed', 'stage_progression', 'conversion', 'appointment'];
    
    for (let i = 0; i < 50; i++) {
      const randomLead = getRandomElement(leads);
      const randomLocation = locations.find(l => l.id === randomLead.assigned_location_id);
      
      await AnalyticsEvent.query().insert({
        event_type: getRandomElement(eventTypes),
        contact_id: randomLead.ghl_contact_id,
        location_id: randomLocation.id || 'loc_la_001',
        event_data: {
          lead_score: randomLead.lead_score,
          source: randomLead.source,
          utm_campaign: randomLead.utm_campaign,
          processing_time: Math.floor(Math.random() * 1000) + 100
        },
        timestamp: getRandomDateWithinDays(14).toISOString()
      });
    }

    // 6. Seed webhook event logs
    logger.info('Seeding webhook event logs...');
    const webhookEvents = [
      'contact.created',
      'contact.updated', 
      'opportunity.created',
      'appointment.created',
      'workflow.completed'
    ];

    for (let i = 0; i < 30; i++) {
      const randomLead = getRandomElement(leads);
      const status = Math.random() > 0.1 ? 'success' : (Math.random() > 0.5 ? 'failed' : 'pending');
      
      await WebhookEventLog.query().insert({
        webhook_id: `webhook_${i + 1}`,
        event_type: getRandomElement(webhookEvents),
        payload: {
          contact_id: randomLead.ghl_contact_id,
          location_id: randomLead.assigned_location_id,
          timestamp: new Date().toISOString()
        },
        result: status === 'success' ? { processed: true, contact_updated: true } : { processed: false, contact_updated: false },
        processing_time: Math.floor(Math.random() * 500) + 50,
        status: status,
        error_message: status === 'failed' ? 'Network timeout' : 'Error Occurred'
      });
    }

    // 7. Update location capacity with actual lead counts
    logger.info('Updating location capacity with actual lead counts...');
    for (const location of locations) {
      const todayStr = new Date().toISOString().split('T')[0];
      const actualLeadCount = await Lead.query()
        .where('assigned_location_id', location.id)
        .whereRaw('DATE(created_at) = ?', [todayStr])
        .resultSize();

      await LocationCapacity.query()
        .where('location_id', location.id)
        .where('capacity_date', todayStr)
        .patch({
          current_leads: actualLeadCount,
          utilization_rate: actualLeadCount / location.max_daily_capacity
        });
    }

    logger.info('Database seed completed successfully!');
    logger.info(`Seeded ${locations.length} locations`);
    logger.info(`Seeded ${leads.length} leads`);
    logger.info('Seeded capacity tracking, analytics events, and webhook logs');

  } catch (error) {
    logger.error('Database seed failed:', error);
    throw error;
  }
}

// Function to seed additional random leads for testing
async function seedAdditionalLeads(count = 10) {
  try {
    logger.info(`Seeding ${count} additional random leads...`);
    
    const locations = await Location.query().where('active', true);
    const firstNames = ['Alex', 'Jordan', 'Casey', 'Morgan', 'Taylor', 'Riley', 'Avery', 'Quinn'];
    const lastNames = ['Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez'];
    const sources = ['facebook_ads', 'google_ads', 'instagram_ads', 'website_form', 'referral'];
    const statuses = ['new', 'assigned', 'contacted', 'qualified', 'converted'];

    for (let i = 0; i < count; i++) {
      const firstName = getRandomElement(firstNames);
      const lastName = getRandomElement(lastNames);
      const assignedLocation = getRandomElement(locations);
      
      const lead = await Lead.query().insert({
        first_name: firstName,
        last_name: lastName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@email.com`,
        phone: `(555) ${String(Math.floor(Math.random() * 900) + 100)}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        zip_code: assignedLocation.zip_code,
        source: getRandomElement(sources),
        utm_source: getRandomElement(['facebook', 'google', 'instagram', 'organic', 'referral']),
        utm_campaign: 'test_campaign_' + i,
        utm_medium: getRandomElement(['social', 'search', 'website', 'word_of_mouth']),
        assigned_location_id: assignedLocation.id,
        ghl_contact_id: `contact_random_${i}_${Date.now()}`,
        lead_score: Math.floor(Math.random() * 40) + 50, // 50-90
        status: getRandomElement(statuses),
        metadata: {
          interests: ['fitness', 'health'],
          preferred_time: getRandomElement(['morning', 'afternoon', 'evening']),
          budget_range: '$50-100'
        }
      });

      // Create routing log
      await LeadRoutingLog.query().insert({
        lead_id: lead.id,
        assigned_location_id: assignedLocation.id,
        routing_reason: 'optimal_match',
        routing_data: {
          distance: Math.random() * 30,
          auto_assigned: true
        }
      });
    }

    logger.info(`Successfully seeded ${count} additional leads`);
  } catch (error) {
    logger.error('Error seeding additional leads:', error);
    throw error;
  }
}

// Main execution
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('> Database seeding completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('> Database seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { 
  seedDatabase, 
  seedAdditionalLeads,
  seedData // Export for testing purposes
};
