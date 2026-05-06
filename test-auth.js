import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import fs from 'fs';

const fbConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(fbConfig);
const auth = getAuth();

signInAnonymously(auth).then(() => {
  console.log("SUCCESS");
  process.exit(0);
}).catch(e => {
  console.error("ERROR", e.code);
  process.exit(1);
});
