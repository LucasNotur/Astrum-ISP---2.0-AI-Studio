import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const fbConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(fbConfig);
const auth = getAuth(app);
const db = getFirestore(app, fbConfig.firestoreDatabaseId);

async function run() {
  await signInAnonymously(auth);
  const qStr = await getDocs(collection(db, "tenants"));
  for(const r of qStr.docs) {
     console.log(r.id, "=>", r.data().evolution_instance);
  }
  process.exit(0);
}
run();
