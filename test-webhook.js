fetch("http://localhost:3000/api/webhook/evolution", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    event: "messages.upsert",
    data: {
      message: { extendedTextMessage: { text: "Teste de sincronismo ao vivo" } },
      key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false }
    }
  })
}).then(async r => {
  console.log(r.status);
  console.log(await r.text());
});
