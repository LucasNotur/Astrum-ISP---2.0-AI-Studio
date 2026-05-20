import { adminDb } from "./lib/firebaseAdmin.ts";
import "../server.ts"; // loads the app
setTimeout(async () => {
    const res = await fetch("http://127.0.0.1:3000/api/webhook/evolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instance: "Astrum",
          event: "messages.upsert",
          data: {
            message: { conversation: "queria saber mais sobre como ta funcionando a internet" },
            key: {
              remoteJid: "5521999999999@s.whatsapp.net",
              fromMe: false,
              id: "msg_test_local_" + Math.random()
            }
          }
        })
    });
    console.log("webhook res:", await res.text());
    setTimeout(async () => {
       const t = await adminDb.collection("tickets").where("phone_number", "==", "5521999999999@s.whatsapp.net").get();
       console.log("Found tickets:", t.size);
       for (const doc of t.docs) {
         console.log(doc.data());
       }
       process.exit(0);
    }, 4000); // give it time to process
}, 2000);
