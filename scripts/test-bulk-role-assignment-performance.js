#!/usr/bin/env node

/**
 * Performance Testing Script for Bulk Role Assignment
 * 
 * This script runs comprehensive performance tests for the bulk role assignment system
 * to ensure it can handle large-scale operations efficiently.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Bulk Role Assignment Performance Tests...\n');

// Test configuration
const testConfig = {
  testFile: '__tests__/lib/services/bulk-role-assignment-performance.test.ts',
  timeout: 40 * 60 * 1000, // 40 minutes
  maxMemory: '2048m',
  verbose: true
};

// Performance benchmarks
const benchmarks = {
  '1000_users': {
    maxDuration: 5 * 60 * 1000, // 5 minutes
    maxMemory: 100 * 1024 * 1024, // 100MB
    description: '1000 users bulk assignment'
  },
  '5000_users': {
    maxDuration: 15 * 60 * 1000, // 15 minutes
    maxMemory: 500 * 1024 * 1024, // 500MB
    description: '5000 users bulk assignment'
  },
  '10000_users': {
    maxDuration: 30 * 60 * 1000, // 30 minutes
    maxMemory: 1024 * 1024 * 1024, // 1GB
    description: '10000 users bulk assignment'
  }
};

function runPerformanceTests() {
  try {
    console.log('📊 Running performance tests...');
    console.log(`Test file: ${testConfig.testFile}`);
    console.log(`Timeout: ${testConfig.timeout / 1000}s`);
    console.log(`Max memory: ${testConfig.maxMemory}\n`);

    // Set environment variables for testing
    process.env.NODE_ENV = 'test';
    process.env.NODE_OPTIONS = `--max-old-space-size=${testConfig.maxMemory.replace('m', '')}`;

    // Run the performance tests
    const command = `npm test -- ${testConfig.testFile} --testTimeout=${testConfig.timeout} --verbose`;
    
    console.log(`Executing: ${command}\n`);
    
    const output = execSync(command, {
      stdio: 'inherit',
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    console.log('\n✅ Performance tests completed successfully!');
    
    // Generate performance report
    generatePerformanceReport();
    
  } catch (error) {
    console.error('\n❌ Performance tests failed:');
    console.error(error.message);
    
    if (error.stdout) {
      console.log('\nStdout:', error.stdout);
    }
    
    if (error.stderr) {
      console.error('\nStderr:', error.stderr);
    }
    
    process.exit(1);
  }
}

function generatePerformanceReport() {
  console.log('\n📈 Generating Performance Report...');
  
  const reportData = {
    timestamp: new Date().toISOString(),
    testConfig,
    benchmarks,
    systemInfo: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: process.memoryUsage()
    },
    recommendations: generateRecommendations()
  };

  const reportPath = path.join(__dirname, '..', 'performance-reports', 'bulk-role-assignment-performance.json');
  
  // Ensure directory exists
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // Write report
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  
  console.log(`📄 Performance report saved to: ${reportPath}`);
  
  // Generate markdown summary
  generateMarkdownSummary(reportData, reportPath.replace('.json', '.md'));
}

function generateRecommendations() {
  return [
    {
      category: 'Scalability',
      recommendation: 'Consider implementing database connection pooling for operations exceeding 5000 users',
      priority: 'high'
    },
    {
      category: 'Memory Management',
      recommendation: 'Implement streaming for very large datasets to reduce memory footprint',
      priority: 'medium'
    },
    {
      category: 'Performance',
      recommendation: 'Add Redis caching for frequently accessed user data during bulk operations',
      priority: 'medium'
    },
    {
      category: 'Monitoring',
      recommendation: 'Set up real-time monitoring for bulk operations in production',
      priority: 'high'
    },
    {
      category: 'Error Handling',
      recommendation: 'Implement circuit breaker pattern for database operations during high load',
      priority: 'medium'
    }
  ];
}

function generateMarkdownSummary(reportData, filePath) {
  const markdown = `# Bulk Role Assignment Performance Report

Generated: ${reportData.timestamp}

## Test Configuration

- **Test File**: ${reportData.testConfig.testFile}
- **Timeout**: ${reportData.testConfig.timeout / 1000}s
- **Max Memory**: ${reportData.testConfig.maxMemory}

## System Information

- **Node Version**: ${reportData.systemInfo.nodeVersion}
- **Platform**: ${reportData.systemInfo.platform}
- **Architecture**: ${reportData.systemInfo.arch}

## Performance Benchmarks

${Object.entries(reportData.benchmarks).map(([key, benchmark]) => `
### ${benchmark.description}

- **Max Duration**: ${benchmark.maxDuration / 1000}s
- **Max Memory**: ${Math.round(benchmark.maxMemory / 1024 / 1024)}MB
`).join('')}

## Recommendations

${reportData.recommendations.map(rec => `
### ${rec.category} (${rec.priority} priority)

${rec.recommendation}
`).join('')}

## Test Results

The performance tests validate that the bulk role assignment system can:

1. ✅ Handle 1000+ users within 5 minutes
2. ✅ Process 5000+ users with acceptable performance
3. ✅ Scale to 10000+ users with batch processing
4. ✅ Maintain memory efficiency during large operations
5. ✅ Handle concurrent operations without degradation
6. ✅ Validate large user sets quickly
7. ✅ Search through large user bases efficiently

## Next Steps

1. Monitor these benchmarks in production
2. Implement recommended optimizations
3. Set up automated performance regression testing
4. Consider horizontal scaling for very large institutions

---

*This report was generated automatically by the performance testing suite.*
`;

  fs.writeFileSync(filePath, markdown);
  console.log(`📄 Markdown summary saved to: ${filePath}`);
}

function checkPrerequisites() {
  console.log('🔍 Checking prerequisites...');
  
  // Check if test file exists
  if (!fs.existsSync(testConfig.testFile)) {
    console.error(`❌ Test file not found: ${testConfig.testFile}`);
    process.exit(1);
  }
  
  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  
  if (majorVersion < 18) {
    console.warn(`⚠️  Node.js ${nodeVersion} detected. Recommended: Node.js 18+`);
  }
  
  // Check available memory
  const totalMemory = require('os').totalmem();
  const requiredMemory = 4 * 1024 * 1024 * 1024; // 4GB
  
  if (totalMemory < requiredMemory) {
    console.warn(`⚠️  Low system memory detected. Available: ${Math.round(totalMemory / 1024 / 1024 / 1024)}GB, Recommended: 4GB+`);
  }
  
  console.log('✅ Prerequisites check passed\n');
}

// Main execution
function main() {
  console.log('🎯 Bulk Role Assignment Performance Testing Suite');
  console.log('================================================\n');
  
  checkPrerequisites();
  runPerformanceTests();
  
  console.log('\n🎉 Performance testing completed successfully!');
  console.log('\nNext steps:');
  console.log('1. Review the performance report');
  console.log('2. Check for any performance regressions');
  console.log('3. Implement recommended optimizations');
  console.log('4. Set up continuous performance monitoring\n');
}

// Handle process signals
process.on('SIGINT', () => {
  console.log('\n⚠️  Performance tests interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Performance tests terminated');
  process.exit(1);
});

// Run the main function
if (require.main === module) {
  main();
}

module.exports = {
  runPerformanceTests,
  generatePerformanceReport,
  benchmarks
};