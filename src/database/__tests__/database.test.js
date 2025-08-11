const { Location, Lead, LocationCapacity, LeadRoutingLog } = require('../models');
const { initializeDatabase } = require('../connection');
const { seedDatabase } = require('../seed');

describe('Database Setup and Models', () => {
  beforeAll(async () => {
    await initializeDatabase();
  });

  describe('Location Model', () => {
    test('should create a location with required fields', async () => {
      const locationData = {
        name: 'Test Location',
        address: '123 Test St, Test City, TS 12345',
        city: 'Test City',
        state: 'TS',
        zip_code: '12345',
        latitude: 40.7128,
        longitude: -74.0060,
        phone: '(555) 123-4567',
        email: 'test@location.com',
        max_daily_capacity: 100
      };

      const location = await Location.query().insert(locationData);
      
      expect(location.id).toBeDefined();
      expect(location.name).toBe('Test Location');
      expect(location.active).toBe(true); // default value
      expect(location.max_daily_capacity).toBe(100);

      // Cleanup
      await Location.query().deleteById(location.id);
    });

    test('should validate required fields', async () => {
      const invalidLocation = {
        name: 'Test Location'
        // missing required fields: address, latitude, longitude
      };

      await expect(Location.query().insert(invalidLocation)).rejects.toThrow();
    });
  });

  describe('Lead Model', () => {
    let testLocation;

    beforeEach(async () => {
      testLocation = await Location.query().insert({
        name: 'Test Location for Leads',
        address: '123 Test St',
        latitude: 40.7128,
        longitude: -74.0060,
        max_daily_capacity: 100
      });
    });

    afterEach(async () => {
      await Lead.query().where('assigned_location_id', testLocation.id).delete();
      await Location.query().deleteById(testLocation.id);
    });

    test('should create a lead with required fields', async () => {
      const leadData = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@test.com',
        phone: '(555) 123-4567',
        source: 'facebook_ads',
        assigned_location_id: testLocation.id,
        lead_score: 85,
        status: 'new'
      };

      const lead = await Lead.query().insert(leadData);
      
      expect(lead.id).toBeDefined();
      expect(lead.email).toBe('john.doe@test.com');
      expect(lead.status).toBe('new');
      expect(lead.lead_score).toBe(85);
    });

    test('should validate email format', async () => {
      const invalidLead = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'invalid-email',
        source: 'facebook_ads'
      };

      await expect(Lead.query().insert(invalidLead)).rejects.toThrow();
    });

    test('should validate status enum values', async () => {
      const invalidLead = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@test.com',
        source: 'facebook_ads',
        status: 'invalid_status'
      };

      await expect(Lead.query().insert(invalidLead)).rejects.toThrow();
    });
  });

  describe('Location Capacity Model', () => {
    let testLocation;

    beforeEach(async () => {
      testLocation = await Location.query().insert({
        name: 'Test Location for Capacity',
        address: '123 Test St',
        latitude: 40.7128,
        longitude: -74.0060,
        max_daily_capacity: 100
      });
    });

    afterEach(async () => {
      await LocationCapacity.query().where('location_id', testLocation.id).delete();
      await Location.query().deleteById(testLocation.id);
    });

    test('should create capacity record', async () => {
      const capacityData = {
        location_id: testLocation.id,
        capacity_date: '2025-08-12',
        current_leads: 25,
        max_capacity: 100,
        utilization_rate: 0.25
      };

      const capacity = await LocationCapacity.query().insert(capacityData);
      
      expect(capacity.id).toBeDefined();
      expect(capacity.current_leads).toBe(25);
      expect(capacity.utilization_rate).toBe(0.25);
    });

    test('should enforce unique constraint on location_id and capacity_date', async () => {
      const capacityData = {
        location_id: testLocation.id,
        capacity_date: '2025-08-12',
        current_leads: 25,
        max_capacity: 100,
        utilization_rate: 0.25
      };

      await LocationCapacity.query().insert(capacityData);
      
      // Try to insert duplicate
      await expect(LocationCapacity.query().insert(capacityData)).rejects.toThrow();
    });
  });

  describe('Lead Routing Log Model', () => {
    let testLocation, testLead;

    beforeEach(async () => {
      testLocation = await Location.query().insert({
        name: 'Test Location for Routing',
        address: '123 Test St',
        latitude: 40.7128,
        longitude: -74.0060,
        max_daily_capacity: 100
      });

      testLead = await Lead.query().insert({
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.routing@test.com',
        source: 'facebook_ads',
        assigned_location_id: testLocation.id
      });
    });

    afterEach(async () => {
      await LeadRoutingLog.query().where('lead_id', testLead.id).delete();
      await Lead.query().deleteById(testLead.id);
      await Location.query().deleteById(testLocation.id);
    });

    test('should create routing log', async () => {
      const routingData = {
        lead_id: testLead.id,
        assigned_location_id: testLocation.id,
        routing_reason: 'optimal_match',
        routing_data: {
          distance: 5.2,
          capacity_utilization: 0.6
        }
      };

      const routingLog = await LeadRoutingLog.query().insert(routingData);
      
      expect(routingLog.id).toBeDefined();
      expect(routingLog.routing_reason).toBe('optimal_match');
      expect(routingLog.routing_data.distance).toBe(5.2);
    });
  });

  describe('Seed Data Integration', () => {
    test('should seed database successfully', async () => {
      await seedDatabase();
      
      // Verify locations were seeded
      const locations = await Location.query();
      expect(locations.length).toBeGreaterThan(0);
      
      // Verify leads were seeded
      const leads = await Lead.query();
      expect(leads.length).toBeGreaterThan(0);
      
      // Verify capacity records were created
      const capacity = await LocationCapacity.query();
      expect(capacity.length).toBeGreaterThan(0);
      
      // Verify routing logs were created
      const routingLogs = await LeadRoutingLog.query();
      expect(routingLogs.length).toBeGreaterThan(0);
    });

    test('should handle relationships correctly', async () => {
      // Get a lead with its location
      const leadWithLocation = await Lead.query()
        .withGraphJoined('assignedLocation')
        .first();
      
      expect(leadWithLocation).toBeDefined();
      expect(leadWithLocation.assignedLocation).toBeDefined();
      expect(leadWithLocation.assignedLocation.name).toBeDefined();

      // Get a location with its leads
      const locationWithLeads = await Location.query()
        .withGraphJoined('leads')
        .first();
      
      expect(locationWithLeads).toBeDefined();
      expect(locationWithLeads.leads).toBeDefined();
      expect(Array.isArray(locationWithLeads.leads)).toBe(true);
    });
  });

  describe('Database Performance', () => {
    test('should query locations efficiently', async () => {
      const startTime = Date.now();
      const activeLocations = await Location.query()
        .where('active', true)
        .orderBy('name');
      const queryTime = Date.now() - startTime;
      
      expect(activeLocations).toBeDefined();
      expect(queryTime).toBeLessThan(100);
    });

    test('should handle complex queries with joins', async () => {
      const startTime = Date.now();
      const results = await Lead.query()
        .withGraphJoined('[assignedLocation, routingLogs]')
        .where('leads.status', 'qualified')
        .limit(10);
      const queryTime = Date.now() - startTime;
      
      expect(results).toBeDefined();
      expect(queryTime).toBeLessThan(200);
    });
  });
});
