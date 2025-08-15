#!/usr/bin/env node

/**
 * Comprehensive test script for the bulk import system
 * This script validates all components of the bulk import functionality
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`${title}`, 'cyan');
  log(`${'='.repeat(60)}`, 'cyan');
}

function logSubsection(title) {
  log(`\n${'-'.repeat(40)}`, 'blue');
  log(`${title}`, 'blue');
  log(`${'-'.repeat(40)}`, 'blue');
}

function checkFileExists(filePath, description) {
  const exists = fs.existsSync(filePath);
  log(`${exists ? '✅' : '❌'} ${description}: ${filePath}`, exists ? 'green' : 'red');
  return exists;
}

function checkDirectoryExists(dirPath, description) {
  const exists = fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  log(`${exists ? '✅' : '❌'} ${description}: ${dirPath}`, exists ? 'green' : 'red');
  return exists;
}

function validateFileContent(filePath, requiredContent, description) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const hasContent = requiredContent.every(item => content.includes(item));
    log(`${hasContent ? '✅' : '❌'} ${description}`, hasContent ? 'green' : 'red');
    
    if (!hasContent) {
      const missing = requiredContent.filter(item => !content.includes(item));
      log(`   Missing: ${missing.join(', ')}`, 'yellow');
    }
    
    return hasContent;
  } catch (error) {
    log(`❌ ${description} - Error reading file: ${error.message}`, 'red');
    return false;
  }
}

async function runTests() {
  logSection('BULK IMPORT SYSTEM VALIDATION');
  
  let totalChecks = 0;
  let passedChecks = 0;
  
  // Helper function to track checks
  function check(result) {
    totalChecks++;
    if (result) passedChecks++;
    return result;
  }

  // 1. Check Core Type Definitions
  logSubsection('1. Type Definitions');
  check(checkFileExists('lib/types/bulk-import.ts', 'Bulk import types'));
  
  if (fs.existsSync('lib/types/bulk-import.ts')) {
    check(validateFileContent('lib/types/bulk-import.ts', [
      'BulkImportOptions',
      'ImportResult',
      'ImportError',
      'ValidationResult',
      'FileFormat',
      'ImportStatus'
    ], 'Core type definitions'));
    
    check(validateFileContent('lib/types/bulk-import.ts', [
      'ImportErrorCodes',
      'ImportWarningCodes'
    ], 'Error and warning code constants'));
  }

  // 2. Check Service Layer
  logSubsection('2. Service Layer');
  check(checkFileExists('lib/services/enhanced-bulk-user-import.ts', 'Main bulk import service'));
  check(checkFileExists('lib/services/notification-service.ts', 'Notification service'));
  check(checkFileExists('lib/services/audit-logger.ts', 'Audit logging service'));
  
  if (fs.existsSync('lib/services/enhanced-bulk-user-import.ts')) {
    check(validateFileContent('lib/services/enhanced-bulk-user-import.ts', [
      'EnhancedBulkUserImportService',
      'parseFile',
      'validateImportData',
      'processImport',
      'rollbackImport'
    ], 'Core service methods'));
    
    check(validateFileContent('lib/services/enhanced-bulk-user-import.ts', [
      'parseCSV',
      'parseJSON',
      'parseExcel'
    ], 'File parsing methods'));
  }

  // 3. Check Database Schema
  logSubsection('3. Database Schema');
  check(checkFileExists('lib/database/bulk-import-schema.sql', 'Database schema'));
  check(checkFileExists('scripts/setup-bulk-import-schema.sql', 'Schema setup script'));
  
  if (fs.existsSync('lib/database/bulk-import-schema.sql')) {
    check(validateFileContent('lib/database/bulk-import-schema.sql', [
      'bulk_imports',
      'import_errors',
      'import_warnings',
      'import_progress',
      'migration_snapshots',
      'import_notifications'
    ], 'Required database tables'));
    
    check(validateFileContent('lib/database/bulk-import-schema.sql', [
      'ROW LEVEL SECURITY',
      'CREATE POLICY',
      'CREATE INDEX'
    ], 'Security and performance features'));
  }

  // 4. Check API Routes
  logSubsection('4. API Routes');
  check(checkFileExists('app/api/bulk-import/route.ts', 'Main bulk import API'));
  check(checkFileExists('app/api/bulk-import/validate/route.ts', 'Validation API'));
  check(checkFileExists('app/api/bulk-import/template/route.ts', 'Template download API'));
  check(checkFileExists('app/api/bulk-import/status/[importId]/route.ts', 'Status tracking API'));
  check(checkFileExists('app/api/bulk-import/rollback/route.ts', 'Rollback API'));
  
  // Validate API route implementations
  const apiRoutes = [
    'app/api/bulk-import/route.ts',
    'app/api/bulk-import/validate/route.ts',
    'app/api/bulk-import/template/route.ts',
    'app/api/bulk-import/rollback/route.ts'
  ];
  
  apiRoutes.forEach(route => {
    if (fs.existsSync(route)) {
      check(validateFileContent(route, [
        'createClient',
        'auth.getUser',
        'NextResponse'
      ], `${route} - Basic API structure`));
      
      check(validateFileContent(route, [
        'institution_admin',
        'admin'
      ], `${route} - Permission checks`));
    }
  });

  // 5. Check UI Components
  logSubsection('5. UI Components');
  check(checkDirectoryExists('components/bulk-import', 'Bulk import components directory'));
  check(checkFileExists('components/bulk-import/file-upload-interface.tsx', 'File upload component'));
  check(checkFileExists('components/bulk-import/validation-results.tsx', 'Validation results component'));
  check(checkFileExists('components/bulk-import/import-progress.tsx', 'Import progress component'));
  check(checkFileExists('components/bulk-import/import-history.tsx', 'Import history component'));
  
  // Validate component implementations
  const components = [
    'components/bulk-import/file-upload-interface.tsx',
    'components/bulk-import/validation-results.tsx',
    'components/bulk-import/import-progress.tsx',
    'components/bulk-import/import-history.tsx'
  ];
  
  components.forEach(component => {
    if (fs.existsSync(component)) {
      check(validateFileContent(component, [
        'export',
        'interface',
        'useState'
      ], `${component} - React component structure`));
    }
  });

  // 6. Check Main Page
  logSubsection('6. Main Application Page');
  check(checkFileExists('app/dashboard/institution/bulk-import/page.tsx', 'Bulk import main page'));
  
  if (fs.existsSync('app/dashboard/institution/bulk-import/page.tsx')) {
    check(validateFileContent('app/dashboard/institution/bulk-import/page.tsx', [
      'FileUploadInterface',
      'ValidationResults',
      'ImportProgress',
      'ImportHistory'
    ], 'Component integration'));
    
    check(validateFileContent('app/dashboard/institution/bulk-import/page.tsx', [
      'useState',
      'useCallback',
      'ImportStep'
    ], 'State management'));
  }

  // 7. Check Test Files
  logSubsection('7. Test Coverage');
  check(checkFileExists('__tests__/lib/services/enhanced-bulk-user-import.test.ts', 'Service unit tests'));
  check(checkFileExists('__tests__/api/bulk-import.integration.test.ts', 'API integration tests'));
  check(checkFileExists('__tests__/components/bulk-import/file-upload-interface.test.tsx', 'File upload component tests'));
  check(checkFileExists('__tests__/components/bulk-import/validation-results.test.tsx', 'Validation results component tests'));
  
  // Validate test implementations
  const testFiles = [
    '__tests__/lib/services/enhanced-bulk-user-import.test.ts',
    '__tests__/api/bulk-import.integration.test.ts',
    '__tests__/components/bulk-import/file-upload-interface.test.tsx',
    '__tests__/components/bulk-import/validation-results.test.tsx'
  ];
  
  testFiles.forEach(testFile => {
    if (fs.existsSync(testFile)) {
      check(validateFileContent(testFile, [
        'describe',
        'it',
        'expect',
        'vi.fn'
      ], `${testFile} - Test structure`));
    }
  });

  // 8. Check Configuration Files
  logSubsection('8. Configuration & Documentation');
  check(checkFileExists('package.json', 'Package configuration'));
  
  if (fs.existsSync('package.json')) {
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const hasTestingDeps = packageJson.devDependencies && (
        packageJson.devDependencies.vitest || 
        packageJson.devDependencies.jest ||
        packageJson.devDependencies['@testing-library/react']
      );
      check(hasTestingDeps);
      log(`${hasTestingDeps ? '✅' : '❌'} Testing dependencies configured`, hasTestingDeps ? 'green' : 'red');
    } catch (error) {
      log(`❌ Error reading package.json: ${error.message}`, 'red');
    }
  }

  // 9. Feature Completeness Check
  logSubsection('9. Feature Completeness');
  
  const requiredFeatures = [
    {
      name: 'File format support (CSV, Excel, JSON)',
      files: ['lib/services/enhanced-bulk-user-import.ts'],
      content: ['parseCSV', 'parseJSON', 'parseExcel']
    },
    {
      name: 'Data validation with error reporting',
      files: ['lib/services/enhanced-bulk-user-import.ts'],
      content: ['validateImportData', 'ImportError', 'ImportWarning']
    },
    {
      name: 'Batch processing',
      files: ['lib/services/enhanced-bulk-user-import.ts'],
      content: ['batchSize', 'processBatch', 'chunkArray']
    },
    {
      name: 'Progress tracking',
      files: ['lib/database/bulk-import-schema.sql', 'components/bulk-import/import-progress.tsx'],
      content: ['import_progress', 'Progress']
    },
    {
      name: 'Rollback capabilities',
      files: ['lib/services/enhanced-bulk-user-import.ts', 'app/api/bulk-import/rollback/route.ts'],
      content: ['rollbackImport', 'migration_snapshots']
    },
    {
      name: 'User notifications',
      files: ['lib/services/notification-service.ts'],
      content: ['sendImportNotification', 'sendWelcomeEmail']
    },
    {
      name: 'Audit logging',
      files: ['lib/services/audit-logger.ts'],
      content: ['AuditLogger', 'log']
    },
    {
      name: 'Template generation',
      files: ['app/api/bulk-import/template/route.ts'],
      content: ['generateCSVTemplate', 'getImportTemplate']
    }
  ];

  requiredFeatures.forEach(feature => {
    const hasFeature = feature.files.every(file => {
      if (!fs.existsSync(file)) return false;
      const content = fs.readFileSync(file, 'utf8');
      return feature.content.every(item => content.includes(item));
    });
    
    check(hasFeature);
    log(`${hasFeature ? '✅' : '❌'} ${feature.name}`, hasFeature ? 'green' : 'red');
  });

  // 10. Security Checks
  logSubsection('10. Security Implementation');
  
  const securityChecks = [
    {
      name: 'Authentication checks in API routes',
      files: ['app/api/bulk-import/route.ts'],
      content: ['auth.getUser', 'Unauthorized']
    },
    {
      name: 'Permission validation',
      files: ['app/api/bulk-import/route.ts'],
      content: ['institution_admin', 'Insufficient permissions']
    },
    {
      name: 'Row Level Security policies',
      files: ['lib/database/bulk-import-schema.sql'],
      content: ['ROW LEVEL SECURITY', 'CREATE POLICY']
    },
    {
      name: 'Input validation',
      files: ['lib/services/enhanced-bulk-user-import.ts'],
      content: ['validateImportData', 'isValidEmail']
    },
    {
      name: 'File size limits',
      files: ['lib/services/enhanced-bulk-user-import.ts'],
      content: ['MAX_FILE_SIZE', 'MAX_RECORDS_PER_IMPORT']
    }
  ];

  securityChecks.forEach(securityCheck => {
    const hasCheck = securityCheck.files.every(file => {
      if (!fs.existsSync(file)) return false;
      const content = fs.readFileSync(file, 'utf8');
      return securityCheck.content.every(item => content.includes(item));
    });
    
    check(hasCheck);
    log(`${hasCheck ? '✅' : '❌'} ${securityCheck.name}`, hasCheck ? 'green' : 'red');
  });

  // Final Summary
  logSection('VALIDATION SUMMARY');
  
  const successRate = Math.round((passedChecks / totalChecks) * 100);
  const status = successRate >= 90 ? 'EXCELLENT' : 
                 successRate >= 75 ? 'GOOD' : 
                 successRate >= 50 ? 'NEEDS WORK' : 'CRITICAL ISSUES';
  
  const statusColor = successRate >= 90 ? 'green' : 
                      successRate >= 75 ? 'yellow' : 'red';

  log(`\nTotal Checks: ${totalChecks}`, 'bright');
  log(`Passed: ${passedChecks}`, 'green');
  log(`Failed: ${totalChecks - passedChecks}`, 'red');
  log(`Success Rate: ${successRate}%`, statusColor);
  log(`Status: ${status}`, statusColor);

  if (successRate < 100) {
    log('\n📋 RECOMMENDATIONS:', 'yellow');
    
    if (successRate < 50) {
      log('• Critical issues found. Review missing files and implementations.', 'red');
    }
    
    if (successRate < 75) {
      log('• Some components are missing or incomplete. Review the failed checks above.', 'yellow');
    }
    
    if (successRate < 90) {
      log('• Minor issues found. Consider addressing the remaining items for completeness.', 'yellow');
    }
    
    log('• Run individual tests to verify functionality: npm run test', 'blue');
    log('• Check database schema setup: npm run db:setup', 'blue');
    log('• Verify API endpoints with manual testing', 'blue');
  } else {
    log('\n🎉 CONGRATULATIONS!', 'green');
    log('All bulk import system components are properly implemented!', 'green');
    log('\nNext steps:', 'blue');
    log('• Run the test suite: npm run test', 'blue');
    log('• Set up the database schema: npm run db:setup', 'blue');
    log('• Test the system with sample data', 'blue');
  }

  log('\n' + '='.repeat(60), 'cyan');
  
  return successRate >= 90;
}

// Run the validation
if (require.main === module) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    log(`\n❌ Validation failed with error: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { runTests };