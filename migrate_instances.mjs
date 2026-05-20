import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import fs from "fs";

const fbConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(fbConfig);
const auth = getAuth(app);
const db = getFirestore(app, fbConfig.firestoreDatabaseId);

async function run() {
  await signInAnonymously(auth);
  console.log("Logged in");
  
  // get integration settings
  const snap = await getDoc(doc(db, "settings", "integrations"));
  if (snap.exists()) {
    const keys = snap.data();
    let instances = [];
    if (keys.whatsappInstances) {
      instances = JSON.parse(keys.whatsappInstances).map(i => i.instanceName);
    } else if (keys.evolutionInstance) {
      instances.push(keys.evolutionInstance);
    }
    await setDoc(doc(db, "tenants", "default"), { 
        evolution_instances: instances
    }, { merge: true });
    console.log("Migrated instances:", instances);
  }
  process.exit(0);
}
run();
