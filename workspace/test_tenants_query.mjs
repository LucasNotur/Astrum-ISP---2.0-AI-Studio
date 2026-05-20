import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs, query, where, limit } from "firebase/firestore";
import fs from "fs";

const fbConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(fbConfig);
const auth = getAuth(app);
const db = getFirestore(app, fbConfig.firestoreDatabaseId);

async function run() {
  await signInAnonymously(auth);
  console.log("Logged in");
  const instance = "Astrum";
  const tenantQuery = await getDocs(query(collection(db, "tenants"), where('evolution_instance', '==', instance), limit(1)));
  
  if (tenantQuery.empty) {
      console.log("No tenant found for instance", instance);
  } else {
      console.log("Found tenant:", tenantQuery.docs[0].id);
  }
  process.exit(0);
}
run();
