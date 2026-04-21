import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp({ projectId: cfg.projectId });
const db = getFirestore(app);
db.settings({ databaseId: cfg.firestoreDatabaseId || '(default)' });
async function test() {
  try {
    const doc = await db.collection('settings').doc('integrations').get();
    console.log('Admin Read:', doc.exists);
  } catch (e) {
    console.error('Admin Error:', e.message);
  }
}
test();
