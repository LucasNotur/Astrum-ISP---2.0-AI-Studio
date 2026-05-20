import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, updateDoc } from "firebase/firestore";
import fs from "fs";

const fbConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(fbConfig);
const db = getFirestore(app);

async function run() {
  const querySnapshot = await getDocs(collection(db, "tenants"));
  querySnapshot.forEach((doc) => {
    console.log(doc.id, " => ", doc.data().evolution_instance);
  });
  
  // also check Astrum instance
  const astrumDoc = await getDocs(collection(db, "tenants"));
  for (const docSnap of astrumDoc.docs) {
    if (docSnap.id === "default" || !docSnap.data().evolution_instance) {
        await updateDoc(docSnap.ref, { evolution_instance: "Astrum" });
        console.log("Updated", docSnap.id, "evolution_instance to Astrum");
    }
  }
}
run();
