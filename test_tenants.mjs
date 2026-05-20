import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs, doc, setDoc } from "firebase/firestore";
import fs from "fs";

const fbConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(fbConfig);
const auth = getAuth(app);
const db = getFirestore(app, fbConfig.firestoreDatabaseId);

async function run() {
  await signInAnonymously(auth);
  
  // ensure the tenant Astrum exists
  await setDoc(doc(db, "tenants", "default"), { 
    evolution_instance: "Astrum",
    whatsapp_health: {
      status: "open"
    }
  }, { merge: true });

  console.log("Updated default tenant to have evolution_instance: Astrum");
  process.exit(0);
}
run();
