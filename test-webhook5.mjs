import fetch from "node-fetch";
const run = async () => {
  const res = await fetch("http://localhost:3000/api/webhook/evolution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instance: "Astrum",
      event: "messages.upsert",
      data: {
        message: { conversation: "queria saber mais sobre como ta funcionando a internet" },
        key: {
          remoteJid: "5521984425440@s.whatsapp.net",
          fromMe: false,
          id: "msg_test_12345_" + Math.random()
        }
      }
    })
  });
  console.log(res.status);
  console.log(await res.text());
};
run();
