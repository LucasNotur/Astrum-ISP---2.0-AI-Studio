import { adminDb as db } from "./src/lib/firebaseAdmin";

async function clearEvolutionUrl() {
  console.log("Fetching integrations settings...");
  try {
    // Global
    const globalRef = db.collection("settings").doc("integrations");
    const globalDoc = await globalRef.get();
    if (globalDoc.exists && globalDoc.data()?.evolutionUrl?.includes("trycloudflare")) {
      console.log("Clearing global evolutionUrl");
      await globalRef.update({ evolutionUrl: "" });
    }

    // Tenants
    const tenantsSnap = await db.collection("tenants").get();
    for (const tenant of tenantsSnap.docs) {
      const integrationRef = tenant.ref.collection("settings").doc("integrations");
      const doc = await integrationRef.get();
      if (doc.exists && doc.data()?.evolutionUrl?.includes("trycloudflare")) {
        console.log(`Clearing evolutionUrl for tenant ${tenant.id}`);
        await integrationRef.update({ evolutionUrl: "" });
      }
    }
    console.log("Done");
  } catch (err) {
    console.error("Error:", err);
  }
}

clearEvolutionUrl();
