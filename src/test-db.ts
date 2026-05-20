import { adminDb } from "./lib/firebaseAdmin.ts";
async function run() {
  const t = await adminDb.collection("tickets").where("tenantId", "==", "default").orderBy("createdAt", "desc").limit(10).get();
  console.log(`Found ${t.size} tickets for tenant default`);
  for (const doc of t.docs) {
    console.log("Ticket ID:", doc.id, doc.data());
    const m = await doc.ref.collection("messages").get();
    console.log("   Messages count:", m.size);
    m.docs.forEach(mm => console.log("   -", mm.data().text));
  }
}
run();
