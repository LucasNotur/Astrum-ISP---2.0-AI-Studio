const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'src/pages');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx')).map(f => path.join(dir, f));

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  const regex = /<header[^>]*>\s*<h1 className="text-3xl font-bold tracking-tight".*?<\/h1>\s*<p className="text-(zinc|sm).*?<\/p>\s*<\/header>/sg;
  const regex2 = /<div[^>]*>\s*<h1 className="text-3xl font-bold tracking-tight.*?".*?<\/h1>\s*<p className="text-(zinc|sm).*?<\/p>\s*<\/div>/sg;

  const originalLength = content.length;
  content = content.replace(regex, '');
  content = content.replace(regex2, '');
  if (content.length !== originalLength) {
    fs.writeFileSync(file, content);
    console.log(`Cleaned headers in ${path.basename(file)}`);
  }
});
console.log('Done cleaning headers');
