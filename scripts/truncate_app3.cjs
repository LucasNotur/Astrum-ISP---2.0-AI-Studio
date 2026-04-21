const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');
const searchStr = "</AppLayout>";
let idx = content.indexOf(searchStr);
let cutIdx = content.indexOf("}", idx);
let newContent = content.substring(0, cutIdx + 1) + "\\n";
fs.writeFileSync('src/App.tsx', newContent, 'utf8');
console.log("File now has lengths: " + newContent.split('\\n').length);
