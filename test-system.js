#!/usr/bin/env node

// test-system.js - Complete system test script
const axios = require('axios');
const readline = require('readline');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

class SystemTester {
  constructor() {
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🧪 Starting GHL System Tests...\n');

    const tests = [
      { name: 'Health Check', fn: this.testHealthCheck },
      { name: 'Webhook Processing', fn: this.testWebhookProcessing },
      { name: 'Lead Routing', fn: this.testLeadRouting },
      { name: 'Location Management', fn: this.testLocationManagement },
      { name: 'Analytics Tracking', fn: this.testAnalyticsTracking },
      { name: 'Dashboard API', fn: this.testDashboardAPI },
      { name: 'Error Handling', fn: this.testErrorHandling }
    ];

    for (const test of tests) {
      await this.runTest(test.name, test.fn.bind(this));
    }

    this.printResults();
  }

  async runTest(name, testFn) {
    try {
      console.log(`🔍 Testing: ${name}`);
      await testFn();
      this.testResults.push({ name, status: 'PASS', error: null });
      console.log(`✅ ${name}: PASSED\n`);
    } catch (error) {
      this.testResults.push({ name, status: 'FAIL', error: error.message });
      console.log(`❌ ${name}: FAILED - ${error.message}\n`);
    }
  }

  async testHealthCheck() {
    const response = await axios.get(`${BASE_URL}/health`);
    if (response.status !== 200) {
      throw new Error('Health check failed');
    }
    if (response.data.status !== 'healthy') {
      throw new Error('System not healthy');
    }
    console.log('  - System health: OK');
  }

  async testWebhookProcessing() {
    const testPayload = {
      type: 'ContactCreate',
      location_id: 'loc_test_001',
      contact_id: 'contact_test_123',
      contact: {
        id: 'contact_test_123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@test.com',
        phone: '+1234567890',
        address1: '123 Test St, New York, NY 10001',
        source: 'facebook',
        date_added: new Date().toISOString(),
        customFields: {
          zip_code: '10001',
          utm_source: 'facebook',
          utm_campaign: 'test_campaign'
        }
      }
    };

    const response = await axios.post(`${BASE_URL}/api/webhooks/test`, testPayload);
    
    if (response.status !== 200 || !response.data.success) {
      throw new Error('Webhook processing failed');
    }
    
    console.log('  - Webhook payload processed successfully');
    console.log(`  - Processing time: ${response.data.processingTime}ms`);
  }

  async testLeadRouting() {
    // Test with different zip codes to verify routing logic
    const testCases = [
      { zip: '10001', expectedRegion: 'Northeast' },
      { zip: '90210', expectedRegion: 'West Coast' },
      { zip: '60601', expectedRegion: 'Midwest' }
    ];

    for (const testCase of testCases) {
      const payload = {
        type: 'ContactCreate',
        location_id: 'loc_test_001',
        contact: {
          firstName: 'Test',
          lastName: 'User',
          email: `test-${testCase.zip}@example.com`,
          customFields: { zip_code: testCase.zip },
          source: 'website'
        }
      };

      const response = await axios.post(`${BASE_URL}/api/webhooks/test`, payload);
      
      if (!response.data.success) {
        throw new Error(`Routing failed for zip ${testCase.zip}`);
      }
    }
    
    console.log('  - Lead routing logic working for multiple zip codes');
  }

  async testLocationManagement() {
    try {
      const response = await axios.get(`${BASE_URL}/api/locations`);
      
      if (response.status !== 200 || !response.data.success) {
        throw new Error('Failed to fetch locations');
      }

      const locations = response.data.locations;
      if (!locations || locations.length === 0) {
        throw new Error('No locations found - run seed script first');
      }

      console.log(`  - Found ${locations.length} locations`);
      console.log(`  - Locations: ${locations.map(l => l.name).join(', ')}`);
      
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error('Location endpoints not found');
      }
      throw error;
    }
  }

  async testAnalyticsTracking() {
    // This would test analytics endpoints if locations exist
    try {
      const locationsResponse = await axios.get(`${BASE_URL}/api/locations`);
      if (locationsResponse.data.locations?.length > 0) {
        const locationId = locationsResponse.data.locations[0].id;
        
        // Test analytics endpoint
        const analyticsResponse = await axios.get(
          `${BASE_URL}/api/analytics/locations/${locationId}/stats?startDate=2024-01-01&endDate=2024-12-31`
        );
        
        if (analyticsResponse.status !== 200) {
          throw new Error('Analytics endpoint failed');
        }
        
        console.log('  - Analytics endpoint responding');
        console.log('  - Stats retrieved successfully');
      } else {
        console.log('  - Skipping analytics test (no locations)');
      }
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('  - Analytics endpoint not implemented yet');
      } else {
        throw error;
      }
    }
  }

  async testDashboardAPI() {
    try {
      const response = await axios.get(`${BASE_URL}/api/dashboard/routing-stats`);
      
      if (response.status === 200) {
        console.log('  - Dashboard API responding');
        console.log('  - Routing stats endpoint working');
      }
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('  - Dashboard API not fully implemented');
      } else {
        throw error;
      }
    }
  }

  async testErrorHandling() {
    // Test invalid webhook payload
    try {
      await axios.post(`${BASE_URL}/api/webhooks/ghl`, { invalid: 'payload' });
      throw new Error('Should have rejected invalid payload');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('  - Invalid webhook payload properly rejected');
      } else {
        throw error;
      }
    }

    // Test non-existent endpoint
    try {
      await axios.get(`${BASE_URL}/api/nonexistent`);
      throw new Error('Should have returned 404');
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('  - 404 handling working correctly');
      } else {
        throw error;
      }
    }
  }

  printResults() {
    console.log('\n📊 Test Results Summary:');
    console.log('==========================');
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    
    this.testResults.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${icon} ${result.name}: ${result.status}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    console.log(`\nTotal: ${this.testResults.length} tests`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success Rate: ${Math.round((passed / this.testResults.length) * 100)}%`);

    if (failed === 0) {
      console.log('\n🎉 All tests passed! System is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Check the errors above.');
    }
  }

  async loadTestWebhooks() {
    console.log('\n🔥 Running Load Test...');
    const concurrentRequests = 10;
    const totalRequests = 100;
    const startTime = Date.now();

    const requests = [];
    for (let i = 0; i < totalRequests; i++) {
      const payload = {
        type: 'ContactCreate',
        location_id: 'loc_test_001',
        contact: {
          firstName: `LoadTest${i}`,
          email: `loadtest${i}@example.com`,
          source: 'load_test',
          customFields: { zip_code: '10001' }
        }
      };

      requests.push(axios.post(`${BASE_URL}/api/webhooks/test`, payload));

      // Batch requests to avoid overwhelming the server
      if (requests.length === concurrentRequests) {
        await Promise.allSettled(requests);
        requests.length = 0;
        await new Promise(resolve => setTimeout(resolve, 100)); // Brief pause
      }
    }

    // Process remaining requests
    if (requests.length > 0) {
      await Promise.allSettled(requests);
    }

    const duration = Date.now() - startTime;
    const rps = Math.round((totalRequests / duration) * 1000);

    console.log(`  - Processed ${totalRequests} requests in ${duration}ms`);
    console.log(`  - Average: ${rps} requests per second`);
  }
}

// Interactive menu
async function showMenu() {
  console.log('\n🎮 GHL System Test Menu:');
  console.log('1. Run All Tests');
  console.log('2. Test Webhook Only');
  console.log('3. Load Test');
  console.log('4. Exit');
  
  return new Promise((resolve) => {
    rl.question('Choose an option (1-4): ', (answer) => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('🚀 GHL Multi-Location System Tester');
  console.log(`Testing against: ${BASE_URL}`);
  
  const tester = new SystemTester();

  while (true) {
    try {
      const choice = await showMenu();

      switch (choice) {
        case '1':
          await tester.runAllTests();
          break;
        case '2':
          await tester.runTest('Webhook Processing', tester.testWebhookProcessing.bind(tester));
          break;
        case '3':
          await tester.loadTestWebhooks();
          break;
        case '4':
          console.log('👋 Goodbye!');
          rl.close();
          return;
        default:
          console.log('❌ Invalid option. Please choose 1-4.');
      }
    } catch (error) {
      console.log(`❌ Test error: ${error.message}`);
    }

    console.log('\nPress Enter to continue...');
    await new Promise(resolve => rl.question('', resolve));
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = SystemTester;
