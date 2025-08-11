// src/database/connection.js
const knex = require('knex');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

const dbConfig = {
  client: process.env.DB_CLIENT || 'sqlite3',
  connection: {
    filename: process.env.DATABASE_URL || path.join(__dirname, '../../database/ghl_system.sqlite')
  },
  useNullAsDefault: true,
  migrations: {
    directory: path.join(__dirname, 'migrations'),
    tableName: 'knex_migrations'
  },
  seeds: {
    directory: path.join(__dirname, 'seeds')
  }
};

const knexInstance = knex(dbConfig);

// Database schema creation
const createTables = async () => {
  try {
    // Locations table
    const locationsExists = await knexInstance.schema.hasTable('locations');
    if (!locationsExists) {
      await knexInstance.schema.createTable('locations', (table) => {
        table.uuid('id').primary().defaultTo(knexInstance.raw('(lower(hex(randomblob(16))))'));
        table.string('name').notNullable();
        table.text('address').notNullable();
        table.string('city');
        table.string('state');
        table.string('zip_code');
        table.decimal('latitude', 10, 8).notNullable();
        table.decimal('longitude', 11, 8).notNullable();
        table.string('phone');
        table.string('email');
        table.boolean('active').defaultTo(true);
        table.string('ghl_location_id');
        table.string('ghl_pipeline_id');
        table.string('ghl_initial_stage_id');
        table.string('ghl_automation_id');
        table.decimal('facebook_performance_score', 3, 2).defaultTo(0);
        table.decimal('google_performance_score', 3, 2).defaultTo(0);
        table.decimal('website_performance_score', 3, 2).defaultTo(0);
        table.integer('max_daily_capacity').defaultTo(100);
        table.string('timezone').defaultTo('America/New_York');
        table.timestamps(true, true);
        
        table.index(['active']);
        table.index(['latitude', 'longitude']);
      });
      logger.info('Created locations table');
    }

    // Leads table
    const leadsExists = await knexInstance.schema.hasTable('leads');
    if (!leadsExists) {
      await knexInstance.schema.createTable('leads', (table) => {
        table.uuid('id').primary().defaultTo(knexInstance.raw('(lower(hex(randomblob(16))))'));
        table.string('first_name');
        table.string('last_name');
        table.string('email').notNullable();
        table.string('phone');
        table.string('zip_code');
        table.string('source').notNullable();
        table.string('utm_source');
        table.string('utm_campaign');
        table.string('utm_medium');
        table.uuid('assigned_location_id');
        table.uuid('backup_location_id');
        table.string('ghl_contact_id');
        table.integer('lead_score').defaultTo(50);
        table.enum('status', ['new', 'assigned', 'contacted', 'qualified', 'converted', 'lost']).defaultTo('new');
        table.json('metadata');
        table.timestamps(true, true);
        
        table.foreign('assigned_location_id').references('locations.id');
        table.foreign('backup_location_id').references('locations.id');
        table.index(['email']);
        table.index(['ghl_contact_id']);
        table.index(['assigned_location_id']);
        table.index(['source']);
        table.index(['status']);
      });
      logger.info('Created leads table');
    }

    // Lead routing logs table
    const routingLogsExists = await knexInstance.schema.hasTable('lead_routing_logs');
    if (!routingLogsExists) {
      await knexInstance.schema.createTable('lead_routing_logs', (table) => {
        table.uuid('id').primary().defaultTo(knexInstance.raw('(lower(hex(randomblob(16))))'));
        table.uuid('lead_id').notNullable();
        table.uuid('original_location_id');
        table.uuid('assigned_location_id').notNullable();
        table.enum('routing_reason', ['optimal_match', 'no_capacity_overflow', 'fallback_routing', 'manual_reassignment']).notNullable();
        table.json('routing_data');
        table.timestamps(true, true);
        
        table.foreign('lead_id').references('leads.id');
        table.foreign('original_location_id').references('locations.id');
        table.foreign('assigned_location_id').references('locations.id');
        table.index(['lead_id']);
        table.index(['assigned_location_id']);
        table.index(['routing_reason']);
      });
      logger.info('Created lead_routing_logs table');
    }

    // Location capacity table
    const capacityExists = await knexInstance.schema.hasTable('location_capacity');
    if (!capacityExists) {
      await knexInstance.schema.createTable('location_capacity', (table) => {
        table.uuid('id').primary().defaultTo(knexInstance.raw('(lower(hex(randomblob(16))))'));
        table.uuid('location_id').notNullable();
        table.date('capacity_date').notNullable();
        table.integer('current_leads').defaultTo(0);
        table.integer('max_capacity').defaultTo(100);
        table.decimal('utilization_rate', 5, 4).defaultTo(0);
        table.timestamps(true, true);
        
        table.foreign('location_id').references('locations.id');
        table.unique(['location_id', 'capacity_date']);
        table.index(['capacity_date']);
      });
      logger.info('Created location_capacity table');
    }

    // Analytics events table
    const analyticsExists = await knexInstance.schema.hasTable('analytics_events');
    if (!analyticsExists) {
      await knexInstance.schema.createTable('analytics_events', (table) => {
        table.uuid('id').primary().defaultTo(knexInstance.raw('(lower(hex(randomblob(16))))'));
        table.enum('event_type', ['lead_created', 'lead_routed', 'stage_progression', 'conversion', 'appointment']).notNullable();
        table.string('contact_id');
        table.uuid('location_id').notNullable();
        table.json('event_data');
        table.timestamp('timestamp').defaultTo(knexInstance.fn.now());
        table.timestamps(true, true);
        
        table.foreign('location_id').references('locations.id');
        table.index(['event_type']);
        table.index(['location_id']);
        table.index(['timestamp']);
      });
      logger.info('Created analytics_events table');
    }

    // Webhook event logs table
    const webhookLogsExists = await knexInstance.schema.hasTable('webhook_event_logs');
    if (!webhookLogsExists) {
      await knexInstance.schema.createTable('webhook_event_logs', (table) => {
        table.uuid('id').primary().defaultTo(knexInstance.raw('(lower(hex(randomblob(16))))'));
        table.string('webhook_id').notNullable();
        table.string('event_type').notNullable();
        table.json('payload');
        table.json('result');
        table.integer('processing_time');
        table.enum('status', ['success', 'failed', 'pending']).notNullable();
        table.text('error_message');
        table.timestamps(true, true);
        
        table.index(['webhook_id']);
        table.index(['event_type']);
        table.index(['status']);
        table.index(['created_at']);
      });
      logger.info('Created webhook_event_logs table');
    }

    logger.info('Database tables created successfully');
  } catch (error) {
    logger.error('Error creating database tables:', error);
    throw error;
  }
};

// Initialize database
const initializeDatabase = async () => {
  try {
    // Ensure database directory exists
    const dbDir = path.dirname(dbConfig.connection.filename);
    await fs.mkdir(dbDir, { recursive: true });

    // Test connection
    await knexInstance.raw('SELECT 1+1 as result');
    logger.info('Database connection established');

    // Create tables
    await createTables();

    return knexInstance;
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Closing database connection...');
  await knexInstance.destroy();
});

module.exports = {
  knex: knexInstance,
  initializeDatabase,
  dbConfig
};
