#!/usr/bin/env node

const { initializeDatabase } = require('./connection');
const { seedDatabase } = require('./seed');
const logger = require('../utils/logger');

async function initAndSeedDatabase() {
  try {
    console.log('> Initializing GHL System Database...\n');

    // Step 1: Initialize database and create tables
    console.log('> Creating database tables...');
    await initializeDatabase();
    console.log('> Database tables created successfully\n');

    // Step 2: Seed with mock data
    console.log('> Seeding database with mock data...');
    await seedDatabase();
    console.log('> Database seeded successfully\n');

    console.log('> Database initialization complete!');
    console.log('\> Mock data summary:');
    console.log('  • 5 locations (NY, LA, Chicago, Miami, Dallas)');
    console.log('  • 7 sample leads with various statuses');
    console.log('  • Capacity tracking for ±7 days');
    console.log('  • 50 analytics events');
    console.log('  • 30 webhook event logs');
    console.log('  • Complete routing logs\n');

    console.log('> You can now:');
    console.log('  • Start your API server');
    console.log('  • Test lead routing functionality');
    console.log('  • View analytics and capacity data');
    console.log('  • Process webhook events\n');
    
    process.exit(0);
  } catch (error) {
    console.error('> Database initialization failed:', error);
    logger.error('Database initialization failed:', error);
    
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
const shouldSeed = !args.includes('--no-seed');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
    GHL System Database Initialization

    Usage: node init-db.js [options]

    Options:
      --no-seed    Initialize tables only, skip seeding mock data
      --help, -h   Show this help message

    Examples:
      node init-db.js          # Initialize and seed with mock data
      node init-db.js --no-seed # Initialize tables only
    `);
  process.exit(0);
}

// Main execution
if (shouldSeed) {
  initAndSeedDatabase();
} else {
  initializeDatabase()
    .then(() => {
      console.log('> Database initialized (no seed data)');
      process.exit(0);
    })
    .catch(error => {
      console.error('> Database initialization failed:', error);
      process.exit(1);
    });
}
