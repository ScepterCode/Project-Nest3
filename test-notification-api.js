/**
 * Test script for the notification API endpoint
 * Run this with: node test-notification-api.js
 */

const BASE_URL = 'http://localhost:3000';

// Test data
const testNotifications = [
  {
    type: 'class_created',
    title: 'Class Created Successfully',
    message: 'Your class "Advanced Mathematics" has been created successfully. Class code: MATH101-ABC',
    priority: 'medium',
    action_url: '/dashboard/teacher/classes/123',
    action_label: 'View Class',
    metadata: {
      class_id: '123',
      class_name: 'Advanced Mathematics',
      class_code: 'MATH101-ABC'
    }
  },
  {
    type: 'assignment_created',
    title: 'New Assignment Posted',
    message: 'A new assignment "Calculus Problem Set" has been posted.',
    priority: 'high',
    action_url: '/dashboard/student/assignments/456',
    action_label: 'View Assignment'
  },
  {
    type: 'system_message',
    title: 'System Maintenance',
    message: 'System maintenance scheduled for tonight at 2 AM.',
    priority: 'low'
  }
];

// Invalid test cases
const invalidTestCases = [
  {
    name: 'Missing type',
    data: {
      title: 'Test',
      message: 'Test message'
    }
  },
  {
    name: 'Invalid type',
    data: {
      type: 'invalid_type',
      title: 'Test',
      message: 'Test message'
    }
  },
  {
    name: 'Missing title',
    data: {
      type: 'system_message',
      message: 'Test message'
    }
  },
  {
    name: 'Missing message',
    data: {
      type: 'system_message',
      title: 'Test'
    }
  },
  {
    name: 'Invalid priority',
    data: {
      type: 'system_message',
      title: 'Test',
      message: 'Test message',
      priority: 'invalid_priority'
    }
  },
  {
    name: 'Title too long',
    data: {
      type: 'system_message',
      title: 'A'.repeat(256),
      message: 'Test message'
    }
  },
  {
    name: 'Invalid expires_at',
    data: {
      type: 'system_message',
      title: 'Test',
      message: 'Test message',
      expires_at: 'invalid-date'
    }
  },
  {
    name: 'Past expires_at',
    data: {
      type: 'system_message',
      title: 'Test',
      message: 'Test message',
      expires_at: '2020-01-01T00:00:00Z'
    }
  }
];

async function testNotificationAPI() {
  console.log('🧪 Testing Notification API Endpoint');
  console.log('=====================================\n');

  // Test 1: Valid notification creation
  console.log('📝 Test 1: Valid Notification Creation');
  for (let i = 0; i < testNotifications.length; i++) {
    const notification = testNotifications[i];
    console.log(`\n  Testing notification ${i + 1}: ${notification.type}`);
    
    try {
      const response = await fetch(`${BASE_URL}/api/notifications/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notification)
      });

      const result = await response.json();
      
      if (response.ok) {
        console.log(`  ✅ Success: ${result.message}`);
        console.log(`     Notification ID: ${result.data.notification_id}`);
      } else {
        console.log(`  ❌ Failed: ${result.message || result.error}`);
        if (result.details) {
          console.log(`     Details: ${result.details.join(', ')}`);
        }
      }
    } catch (error) {
      console.log(`  ❌ Network Error: ${error.message}`);
    }
  }

  // Test 2: Invalid data validation
  console.log('\n\n🚫 Test 2: Invalid Data Validation');
  for (const testCase of invalidTestCases) {
    console.log(`\n  Testing: ${testCase.name}`);
    
    try {
      const response = await fetch(`${BASE_URL}/api/notifications/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testCase.data)
      });

      const result = await response.json();
      
      if (response.status === 400) {
        console.log(`  ✅ Correctly rejected: ${result.message}`);
        if (result.details) {
          console.log(`     Validation errors: ${result.details.join(', ')}`);
        }
      } else {
        console.log(`  ❌ Should have been rejected but got status: ${response.status}`);
      }
    } catch (error) {
      console.log(`  ❌ Network Error: ${error.message}`);
    }
  }

  // Test 3: Unsupported methods
  console.log('\n\n🚫 Test 3: Unsupported HTTP Methods');
  const methods = ['GET', 'PUT', 'DELETE'];
  
  for (const method of methods) {
    console.log(`\n  Testing ${method} method`);
    
    try {
      const response = await fetch(`${BASE_URL}/api/notifications/create`, {
        method: method
      });

      const result = await response.json();
      
      if (response.status === 405) {
        console.log(`  ✅ Correctly rejected ${method}: ${result.message}`);
      } else {
        console.log(`  ❌ Should have returned 405 but got: ${response.status}`);
      }
    } catch (error) {
      console.log(`  ❌ Network Error: ${error.message}`);
    }
  }

  // Test 4: Invalid JSON
  console.log('\n\n🚫 Test 4: Invalid JSON');
  try {
    const response = await fetch(`${BASE_URL}/api/notifications/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: 'invalid json{'
    });

    const result = await response.json();
    
    if (response.status === 400 && result.error === 'Invalid JSON') {
      console.log(`  ✅ Correctly rejected invalid JSON: ${result.message}`);
    } else {
      console.log(`  ❌ Should have rejected invalid JSON but got: ${response.status}`);
    }
  } catch (error) {
    console.log(`  ❌ Network Error: ${error.message}`);
  }

  console.log('\n\n🏁 Testing Complete!');
  console.log('\nNote: Authentication tests require a valid session.');
  console.log('Run this script while logged into the application to test authentication.');
}

// Run tests if this script is executed directly
if (require.main === module) {
  testNotificationAPI().catch(console.error);
}

module.exports = { testNotificationAPI };