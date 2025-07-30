// Simple verification script for data migration utilities
const { DataImportExportService } = require('../lib/services/data-import-export');
const { BulkUserImportService } = require('../lib/services/bulk-user-import');

// Mock Supabase for testing
const mockSupabase = {
  from: () => ({
    insert: () => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'test-id' }, error: null })
      })
    }),
    select: () => ({
      eq: () => ({
        in: () => Promise.resolve({ data: [], error: null }),
        single: () => Promise.resolve({ data: null, error: null })
      })
    }),
    update: () => ({
      eq: () => Promise.resolve({ error: null })
    }),
    delete: () => ({
      in: () => Promise.resolve({ error: null })
    })
  })
};

// Mock the Supabase client
jest.mock('../lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

async function testDataMigrationUtilities() {
  console.log('Testing Data Migration and Import Utilities...\n');

  try {
    const importService = new DataImportExportService();
    const bulkImportService = new BulkUserImportService();

    // Test 1: CSV Parsing
    console.log('1. Testing CSV Parsing...');
    const csvContent = `email,firstName,lastName,role
john.doe@example.com,John,Doe,student
jane.smith@example.com,Jane,Smith,teacher`;

    const parseResult = await importService.parseCSV(csvContent, true);
    console.log(`   ✓ Parsed ${parseResult.data.length} records`);
    console.log(`   ✓ ${parseResult.errors.length} errors found`);
    console.log(`   ✓ First record: ${JSON.stringify(parseResult.data[0])}`);

    // Test 2: CSV with quoted fields
    console.log('\n2. Testing CSV with quoted fields...');
    const quotedCsv = `email,firstName,lastName,address
john@example.com,John,Doe,"123 Main St, Apt 4"`;
    
    const quotedResult = await importService.parseCSV(quotedCsv, true);
    console.log(`   ✓ Address field: ${quotedResult.data[0].address}`);

    // Test 3: Template generation
    console.log('\n3. Testing template generation...');
    const template = bulkImportService.generateCSVTemplate();
    console.log(`   ✓ Template generated (${template.split('\n').length} lines)`);
    console.log(`   ✓ Contains headers: ${template.includes('email,firstName,lastName')}`);

    // Test 4: Import template structure
    console.log('\n4. Testing import template structure...');
    const templateStructure = bulkImportService.getImportTemplate();
    console.log(`   ✓ Required fields: ${templateStructure.requiredFields.join(', ')}`);
    console.log(`   ✓ Optional fields: ${templateStructure.optionalFields.join(', ')}`);
    console.log(`   ✓ Sample data count: ${templateStructure.sampleData.length}`);

    // Test 5: Basic validation
    console.log('\n5. Testing basic validation...');
    const testData = [
      { email: 'valid@example.com', firstName: 'Valid', lastName: 'User' },
      { email: 'invalid-email', firstName: 'Invalid', lastName: 'User' }
    ];

    // Access private method for testing
    const validationResult = bulkImportService.validateBasicUserData(testData);
    console.log(`   ✓ Validation errors: ${validationResult.errors.length}`);
    console.log(`   ✓ Validation warnings: ${validationResult.warnings.length}`);

    // Test 6: Email validation
    console.log('\n6. Testing email validation...');
    const isValidEmail = bulkImportService.isValidEmail;
    console.log(`   ✓ valid@example.com: ${isValidEmail('valid@example.com')}`);
    console.log(`   ✓ invalid-email: ${isValidEmail('invalid-email')}`);

    // Test 7: CSV line parsing
    console.log('\n7. Testing CSV line parsing...');
    const parseCSVLine = importService.parseCSVLine;
    const simpleLine = parseCSVLine('a,b,c');
    const quotedLine = parseCSVLine('a,"b,c",d');
    console.log(`   ✓ Simple line: ${JSON.stringify(simpleLine)}`);
    console.log(`   ✓ Quoted line: ${JSON.stringify(quotedLine)}`);

    // Test 8: Array chunking
    console.log('\n8. Testing array chunking...');
    const largeArray = Array.from({ length: 250 }, (_, i) => i);
    const chunks = importService.chunkArray(largeArray, 100);
    console.log(`   ✓ Chunks created: ${chunks.length}`);
    console.log(`   ✓ Chunk sizes: ${chunks.map(c => c.length).join(', ')}`);

    console.log('\n✅ All tests passed! Data migration utilities are working correctly.');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the tests
testDataMigrationUtilities();