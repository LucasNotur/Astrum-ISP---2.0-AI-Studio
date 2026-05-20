import fetch from "node-fetch";
const run = async () => {
  const res = await fetch("http://localhost:3000/api/webhook/evolution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instance: "default",
      event: "messages.upsert",
      data: {
        message: { conversation: "Oi, preciso de ajuda" },
        key: {
          remoteJid: "5511999999999@s.whatsapp.net",
          fromMe: false,
          id: "msg123"
        }
      }
    })
  });
  console.log(res.status);
  console.log(await res.text());
};
run();
