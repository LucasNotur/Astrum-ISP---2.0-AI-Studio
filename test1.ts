import { adminDb } from "./src/lib/firebaseAdmin.ts";
async function run() {
  const q = await adminDb.collection("tenants").get();
  for (const doc of q.docs) {
    console.log(doc.id, doc.data().evolution_instance);
  }
}
run();
