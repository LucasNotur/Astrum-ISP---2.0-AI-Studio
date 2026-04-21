const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const endTag = "</AppLayout>\\n  );\\n}";
const endIndex = content.indexOf(endTag);

if (endIndex !== -1) {
    const fixedContent = content.slice(0, endIndex + endTag.length - 1) + "}\\n";
    fs.writeFileSync('src/App.tsx', fixedContent, 'utf8');
    console.log("Truncated successfully");
} else {
    // try simpler
    const lines = content.split('\\n');
    let cutIdx = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("</AppLayout>")) {
            cutIdx = i + 2; // </AppLayout> -> ); -> }
        }
    }
    const fixedLines = lines.slice(0, cutIdx + 1);
    fs.writeFileSync('src/App.tsx', fixedLines.join('\\n'), 'utf8');
    console.log("Truncated successfully via lines");
}
