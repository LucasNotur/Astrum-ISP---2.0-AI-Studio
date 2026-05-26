import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src/__tests__');
let descriptions = [];

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const match = content.match(/describe\(['"`](.*?)['"`]/);
  if (match) {
    descriptions.push(match[1]);
  }
});

console.log(JSON.stringify(descriptions, null, 2));
