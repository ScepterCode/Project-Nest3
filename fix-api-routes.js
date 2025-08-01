#!/usr/bin/env node

/**
 * Script to fix Next.js 15 API route parameter types
 * Changes { params: { id: string } } to { params: Promise<{ id: string }> }
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

function fixApiRoute(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Pattern 1: { params }: { params: { id: string } }
    const pattern1 = /{\s*params\s*}:\s*{\s*params:\s*{\s*([^}]+)\s*}\s*}/g;
    if (pattern1.test(content)) {
      content = content.replace(pattern1, '{ params }: { params: Promise<{ $1 }> }');
      modified = true;
    }

    // Pattern 2: { params, user }: { params: { id: string }; user: any }
    const pattern2 = /{\s*params,\s*([^}]+)\s*}:\s*{\s*params:\s*{\s*([^}]+)\s*};\s*([^}]+)\s*}/g;
    if (pattern2.test(content)) {
      content = content.replace(pattern2, '{ params, $1 }: { params: Promise<{ $2 }>; $3 }');
      modified = true;
    }

    // Add await for params usage
    const paramsUsagePattern = /const\s+(\w+)\s*=\s*params\.(\w+);/g;
    if (paramsUsagePattern.test(content)) {
      content = content.replace(paramsUsagePattern, (match, varName, paramName) => {
        // Check if we already have resolvedParams
        if (content.includes('const resolvedParams = await params;')) {
          return `const ${varName} = resolvedParams.${paramName};`;
        } else {
          // Add resolvedParams line before this usage
          return `const resolvedParams = await params;\n    const ${varName} = resolvedParams.${paramName};`;
        }
      });
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Fixed: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error fixing ${filePath}:`, error.message);
    return false;
  }
}

// Find all API route files
const apiFiles = glob.sync('app/api/**/route.ts');
let fixedCount = 0;

console.log(`Found ${apiFiles.length} API route files to check...`);

apiFiles.forEach(file => {
  if (fixApiRoute(file)) {
    fixedCount++;
  }
});

console.log(`Fixed ${fixedCount} API route files.`);