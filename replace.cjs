const fs = require('fs');
let code = fs.readFileSync('src/workers/messageWorker.ts', 'utf8');

// fetchProfilePictureUrl
code = code.replace(
  /await fetch\(\s*`\$\{evoUrl\}\/chat\/fetchProfilePictureUrl\/\$\{evoInstance\}`,\s*{\s*method: "POST",\s*headers: {\s*"Content-Type": "application\/json",\s*apikey: evoApiKey,\s*},\s*body: JSON.stringify\({ number: remotePhone \|\| remoteJid }\),\s*}\s*\);/g,
  (match) => match.replace('await fetch', 'await safeEvoFetch').replace(');', ', tenantId, evoInstance);')
);

// getBase64FromMediaMessage
code = code.replace(
  /await fetch\(\s*`\$\{evoUrl\}\/chat\/getBase64FromMediaMessage\/\$\{evoInstance\}`,\s*{\s*method: "POST",\s*headers: {\s*"Content-Type": "application\/json",\s*apikey: evoApiKey,\s*},\s*body: JSON.stringify\({ message: messageData, number: remotePhone \|\| remoteJid }\),\s*}\s*\);/g,
  (match) => match.replace('await fetch', 'await safeEvoFetch').replace(');', ', tenantId, evoInstance);')
);

// All regular fetch for message/sendText and chat/sendPresence
code = code.replace(
  /await fetch\(`\$\{evoUrl\}(.*?)\$\{evoInstance\}`,\s*{\s*method: "POST",\s*headers:(.*?),\s*body:(.*?),\s*}\);/gs,
  (match, path, headers, body) => {
    return `await safeEvoFetch(\`\${evoUrl}${path}\${evoInstance}\`, {
              method: "POST",
              headers:${headers},
              body:${body},
            }, tenantId, evoInstance);`;
  }
);

code = code.replace(
  /const sendResponse = await fetch\(\s*`\$\{evoUrl\}\/message\/sendText\/\$\{evoInstance\}`,\s*{\s*method: "POST",\s*headers: { "Content-Type": "application\/json", apikey: evoApiKey },\s*body: JSON.stringify\({.*?}\),\s*}\s*\);/gs,
  (match) => match.replace('await fetch', 'await safeEvoFetch').replace(');', ', tenantId, evoInstance);')
);

fs.writeFileSync('src/workers/messageWorker.ts', code);
