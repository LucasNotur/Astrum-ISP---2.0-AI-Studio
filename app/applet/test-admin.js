import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp({ projectId: cfg.projectId });
const db = getFirestore(app);
db.settings({ databaseId: cfg.firestoreDatabaseId });
db.collection('settings').doc('integrations').get()
  .then(doc => console.log('Admin Read:', doc.exists))
  .catch(err => console.error('Admin Error:', err.message));
