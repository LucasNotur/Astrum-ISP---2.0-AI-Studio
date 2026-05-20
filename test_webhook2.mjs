import fetch from "node-fetch";

async function run() {
  const url = "http://localhost:3000/api/webhook/evolution";
  const payload = {
    event: "messages.upsert",
    instance: "Astrum",
    data: {
      message: { extendedTextMessage: { text: "oi ai, testando" } },
      remoteJid: "5511999999999@s.whatsapp.net",
      key: { id: "AAABBBCCC", fromMe: false }
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  console.log(res.status, await res.text());
}
run();
