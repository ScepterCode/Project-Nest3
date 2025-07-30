#!/usr/bin/env node

/**
 * Cron job script for processing scheduled role notifications
 * 
 * This script should be run periodically (e.g., every hour) to:
 * - Send temporary role expiration reminders
 * - Send pending role request reminders to admins
 * - Process expired role requests
 * - Clean up old notifications
 * 
 * Usage:
 *   node scripts/process-role-notifications.js
 * 
 * Environment variables:
 *   - CRON_SECRET: Secret token for authenticating cron jobs
 *   - NEXT_PUBLIC_SITE_URL: Base URL of the application
 */

const https = require('https');
const http = require('http');

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error('Error: CRON_SECRET environment variable is required');
  process.exit(1);
}

function makeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    
    const req = protocol.request(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (error) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function processRoleNotifications() {
  const url = `${SITE_URL}/api/roles/notifications/process`;
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  };

  try {
    console.log(`[${new Date().toISOString()}] Starting role notification processing...`);
    
    const response = await makeRequest(url, options);
    
    if (response.status === 200) {
      console.log(`[${new Date().toISOString()}] ✅ Role notifications processed successfully`);
      console.log(`Response:`, response.data);
    } else {
      console.error(`[${new Date().toISOString()}] ❌ Failed to process role notifications`);
      console.error(`Status: ${response.status}`);
      console.error(`Response:`, response.data);
      process.exit(1);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error processing role notifications:`, error.message);
    process.exit(1);
  }
}

async function processGeneralNotifications() {
  const url = `${SITE_URL}/api/notifications/process`;
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  };

  try {
    console.log(`[${new Date().toISOString()}] Starting general notification processing...`);
    
    const response = await makeRequest(url, options);
    
    if (response.status === 200) {
      console.log(`[${new Date().toISOString()}] ✅ General notifications processed successfully`);
    } else {
      console.log(`[${new Date().toISOString()}] ⚠️  General notification processing endpoint not available or failed`);
      console.log(`Status: ${response.status}`);
    }
  } catch (error) {
    console.log(`[${new Date().toISOString()}] ⚠️  General notification processing not available:`, error.message);
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] 🚀 Starting notification processing job`);
  console.log(`Site URL: ${SITE_URL}`);
  
  try {
    // Process role-specific notifications
    await processRoleNotifications();
    
    // Process general notifications (if endpoint exists)
    await processGeneralNotifications();
    
    console.log(`[${new Date().toISOString()}] ✅ Notification processing job completed successfully`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Notification processing job failed:`, error.message);
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log(`[${new Date().toISOString()}] 🛑 Received SIGINT, shutting down gracefully`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(`[${new Date().toISOString()}] 🛑 Received SIGTERM, shutting down gracefully`);
  process.exit(0);
});

// Run the main function
main().catch((error) => {
  console.error(`[${new Date().toISOString()}] ❌ Unhandled error:`, error);
  process.exit(1);
});