import fs from 'fs';
fetch('http://localhost:3000/api/webhook/evolution', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    event: "messages.upsert",
    data: {
      message: {
        key: {
          remoteJid: "5511999999999@s.whatsapp.net",
          fromMe: false
        },
        message: {
          conversation: "Teste do agente AI"
        }
      }
    }
  })
}).then(res => res.text()).then(console.log).catch(console.error);
