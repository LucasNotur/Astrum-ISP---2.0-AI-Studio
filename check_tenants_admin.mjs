import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const fbConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp({
  projectId: fbConfig.projectId
});
const db = getFirestore(app);
db.settings({ databaseId: fbConfig.firestoreDatabaseId });

async function run() {
  const querySnapshot = await db.collection("tenants").get();
  querySnapshot.forEach((doc) => {
    console.log(doc.id, " => ", doc.data().evolution_instance);
  });
  
  // also check Astrum instance
  for (const docSnap of querySnapshot.docs) {
    if (docSnap.id === "default" || !docSnap.data().evolution_instance) {
        await docSnap.ref.update({ evolution_instance: "Astrum" });
        console.log("Updated", docSnap.id, "evolution_instance to Astrum");
    }
  }
}
run();
