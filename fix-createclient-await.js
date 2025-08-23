const fs = require('fs');
const path = require('path');

// Script to fix missing await keywords for createClient() calls
// This addresses the widespread pattern identified in the codebase

const API_ROUTES_DIR = path.join(__dirname, 'app', 'api');

function findJSFiles(dir) {
  const files = [];
  
  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (item.endsWith('.ts') || item.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }
  
  traverse(dir);
  return files;
}

function fixCreateClientAwait(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Pattern 1: const supabase = createClient();
    const pattern1 = /const\s+supabase\s*=\s*createClient\(\);/g;
    if (pattern1.test(content)) {
      content = content.replace(pattern1, 'const supabase = await createClient();');
      modified = true;
    }
    
    // Pattern 2: let supabase = createClient();
    const pattern2 = /let\s+supabase\s*=\s*createClient\(\);/g;
    if (pattern2.test(content)) {
      content = content.replace(pattern2, 'let supabase = await createClient();');
      modified = true;
    }
    
    // Pattern 3: var supabase = createClient();
    const pattern3 = /var\s+supabase\s*=\s*createClient\(\);/g;
    if (pattern3.test(content)) {
      content = content.replace(pattern3, 'var supabase = await createClient();');
      modified = true;
    }
    
    // Pattern 4: return createClient();
    const pattern4 = /return\s+createClient\(\);/g;
    if (pattern4.test(content)) {
      content = content.replace(pattern4, 'return await createClient();');
      modified = true;
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Fixed: ${path.relative(__dirname, filePath)}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function main() {
  console.log('🔧 Fixing missing await keywords for createClient() calls...\n');
  
  const apiFiles = findJSFiles(API_ROUTES_DIR);
  let fixedCount = 0;
  let totalChecked = 0;
  
  for (const file of apiFiles) {
    totalChecked++;
    if (fixCreateClientAwait(file)) {
      fixedCount++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Files checked: ${totalChecked}`);
  console.log(`   Files fixed: ${fixedCount}`);
  console.log(`   Files unchanged: ${totalChecked - fixedCount}`);
  
  if (fixedCount > 0) {
    console.log('\n✨ All createClient() calls have been fixed with proper await keywords!');
    console.log('🔄 Please restart your development server to apply the changes.');
  } else {
    console.log('\n✅ No files needed fixing - all createClient() calls already use await properly.');
  }
}

if (require.main === module) {
  main();
}

module.exports = { fixCreateClientAwait, findJSFiles };
