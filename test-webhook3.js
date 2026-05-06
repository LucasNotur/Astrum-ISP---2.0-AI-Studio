import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import fs from 'fs';

const fbConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(fbConfig);
const auth = getAuth();
const db = getFirestore(app);

async function test() {
  try {
    await signInAnonymously(auth);
    const keysDoc = await getDoc(doc(db, "settings", "integration_keys"));
    if (!keysDoc.exists()) {
      console.log("No integration keys found.");
      return;
    }
    const data = keysDoc.data();
    const evoUrl = data.evolutionUrl;
    const evoApiKey = data.evolutionApiKey;
    const evoInstance = data.evolutionInstance;
    
    console.log("Found keys, URL:", evoUrl, "Instance:", evoInstance);

    const webhookUrl = "https://ais-dev-6csw5lpiggvuc7gub5drm5-366063768648.us-west2.run.app/api/webhook/evolution";

    const paths = [
       { path: `/webhook/instance/${evoInstance}`, body: { webhook: { enabled: true, url: webhookUrl, byEvents: false, base64: false, events: ["MESSAGES_UPSERT", "SEND_MESSAGE"] } } },
       { path: `/webhook/set/${evoInstance}`, body: { enabled: true, url: webhookUrl, webhookByEvents: false, webhookBase64: false, events: ["MESSAGES_UPSERT", "SEND_MESSAGE"] } },
       { path: `/webhook/set/${evoInstance}`, body: { enabled: true, url: webhookUrl, webhook_by_events: false, webhook_base64: false, events: ["MESSAGES_UPSERT", "SEND_MESSAGE"] } }
    ];

    for (const p of paths) {
      console.log(`\nTrying POST ${p.path} with body:`, JSON.stringify(p.body));
      const res = await fetch(`${evoUrl.replace(/\/$/, '')}${p.path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": evoApiKey
        },
        body: JSON.stringify(p.body)
      });
      const text = await res.text();
      console.log(`Status: ${res.status}`);
      console.log(`Response: ${text.substring(0, 500)}`);
      if (res.ok) break;
    }
    process.exit(0);
  } catch (e) {
    console.error("ERROR", e.message);
  }
}
test();
