#!/usr/bin/env node

const { Location, Lead, LocationCapacity, AnalyticsEvent, WebhookEventLog, LeadRoutingLog } = require('./models');
const { knex } = require('./connection');
const logger = require('../utils/logger');

async function verifyDatabase() {
  try {
    console.log('> Verifying database setup and data...\n');

    // Check table existence and counts
    const tables = [
      { name: 'locations', model: Location },
      { name: 'leads', model: Lead },
      { name: 'location_capacity', model: LocationCapacity },
      { name: 'lead_routing_logs', model: LeadRoutingLog },
      { name: 'analytics_events', model: AnalyticsEvent },
      { name: 'webhook_event_logs', model: WebhookEventLog }
    ];

    console.log('> Table Status:');
    console.log('─'.repeat(50));

    for (const table of tables) {
      try {
        const count = await table.model.query().resultSize();
        const hasTable = await knex.schema.hasTable(table.name);
        console.log(`${table.name.padEnd(20)} | ${count.toString().padStart(3)} records`);
      } catch (error) {
        console.log(`> ${table.name.padEnd(20)} | Error: ${error.message}`);
      }
    }

    console.log('\n> Location Details:');
    console.log('─'.repeat(70));
    const locations = await Location.query().select('name', 'city', 'state', 'max_daily_capacity', 'active');
    locations.forEach(loc => {
      console.log(`${loc.name.padEnd(25)} | ${loc.city}, ${loc.state} | Capacity: ${loc.max_daily_capacity}`);
    });

    console.log('\n> Lead Status Distribution:');
    console.log('─'.repeat(40));
    const leadStatusCounts = await Lead.query()
      .select('status')
      .count('* as count')
      .groupBy('status');
    
    leadStatusCounts.forEach(row => {
      console.log(`${row.status.padEnd(12)} | ${row.count} leads`);
    });

    console.log('\n> Lead Sources:');
    console.log('─'.repeat(35));
    const sourceCounts = await Lead.query()
      .select('source')
      .count('* as count')
      .groupBy('source');
    
    sourceCounts.forEach(row => {
      console.log(`${row.source.padEnd(15)} | ${row.count} leads`);
    });

    // Check today's capacity utilization
    console.log('\n> Today\'s Capacity Utilization:');
    console.log('─'.repeat(60));
    const today = new Date().toISOString().split('T')[0];
    const capacityData = await LocationCapacity.query()
      .where('capacity_date', today)
      .withGraphJoined('location')
      .select('location.name', 'current_leads', 'max_capacity', 'utilization_rate');

    capacityData.forEach(cap => {
      const percentage = Math.round(cap.utilization_rate * 100);
      const bar = '>'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
      console.log(`${cap.name.padEnd(25)} | ${cap.current_leads}/${cap.max_capacity} | ${bar} ${percentage}%`);
    });

    // Recent analytics events
    console.log('\n> Recent Analytics Events (Last 5):');
    console.log('─'.repeat(65));
    const recentEvents = await AnalyticsEvent.query()
      .withGraphJoined('location')
      .select('event_type', 'location.name as location_name', 'timestamp')
      .orderBy('timestamp', 'desc')
      .limit(5);

    recentEvents.forEach(event => {
      const date = new Date(event.timestamp).toLocaleDateString();
      const time = new Date(event.timestamp).toLocaleTimeString();
      console.log(`> ${event.event_type.padEnd(18)} | ${event.location_name.padEnd(15)} | ${date} ${time}`);
    });

    // Webhook status
    console.log('\n> Webhook Event Status:');
    console.log('─'.repeat(40));
    const webhookStats = await WebhookEventLog.query()
      .select('status')
      .count('* as count')
      .groupBy('status');

    webhookStats.forEach(stat => {
      console.log(`${stat.status.padEnd(12)} | ${stat.count} events`);
    });

    console.log('\n> Database verification complete!');
    console.log('\n> Next steps:');
    console.log('  • Test API endpoints with this data');
    console.log('  • Verify lead routing logic');
    console.log('  • Check GHL integration points');
    console.log('  • Monitor capacity management\n');

  } catch (error) {
    console.error('> Database verification failed:', error);
    logger.error('Database verification failed:', error);
  } finally {
    await knex.destroy();
    process.exit(0);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
    GHL System Database Verification

    Usage: node verify-db.js [options]

    Options:
      --help, -h   Show this help message

    This script checks:
      • Table existence and record counts
      • Location data and capacity
      • Lead distribution by status and source
      • Recent analytics events
      • Webhook event status
    `);
  process.exit(0);
}

// Main execution
verifyDatabase();
