const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const lines = content.split('\\n');
let cutIdx = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("</AppLayout>")) {
        cutIdx = i + 2; 
        break; // BREAK ON FIRST OCCURRENCE
    }
}
if (cutIdx !== -1) {
    const fixedLines = lines.slice(0, cutIdx + 1);
    fs.writeFileSync('src/App.tsx', fixedLines.join('\\n'), 'utf8');
    console.log("Truncated successfully at line " + cutIdx);
}
