const fs = require('fs');
const path = require('path');

function getFiles(dir, exts) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        if (!filePath.includes('__tests__') && !filePath.includes('node_modules')) {
          results = results.concat(getFiles(filePath, exts));
        }
      } else {
        if (exts.some(ext => file.endsWith(ext)) && !file.includes('.test.') && !file.includes('.spec.')) {
          results.push(filePath);
        }
      }
    }
  } catch (e) {
  }
  return results;
}

try {
  const allSourceFiles = getFiles('./src', ['.ts', '.tsx']);
  let missing = [];
  for (const file of allSourceFiles) {
    if (file.endsWith('.d.ts') || file.endsWith('main.tsx') || file.endsWith('vite-env.d.ts') || file.endsWith('App.tsx') || file.includes('index.ts') || file.endsWith('types.ts')) continue;
    
    const relativePath = path.relative('./src', file);
    let dirname = path.dirname(relativePath);
    let basename = path.basename(relativePath, path.extname(relativePath));
    
    let testPath1 = path.join('./src/__tests__', dirname, `${basename}.test.ts`);
    let testPath2 = path.join('./src/__tests__', dirname, `${basename}.test.tsx`);
    
    if (!fs.existsSync(testPath1) && !fs.existsSync(testPath2)) {
      missing.push(file);
    }
  }
  console.log(`Missing test for ${missing.length} files:`);
  console.log(missing.join('\n'));
} catch (e) {
  console.error(e);
}
