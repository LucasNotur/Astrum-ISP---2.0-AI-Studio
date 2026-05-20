const { initializeApp, applicationDefault } = require("firebase-admin/app");
try {
  initializeApp({ credential: applicationDefault() });
  console.log("Success applicationDefault");
} catch(e) {
  console.log("Error:", e.message);
}
