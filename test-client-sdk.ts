import { db } from "./src/lib/firebase.ts";
import { collection, addDoc, getDocs, query, where, limit } from "firebase/firestore";

const run = async () => {
  try {
    const q = query(collection(db, "tenants"), limit(1));
    const snap = await getDocs(q);
    console.log("Success! Docs:", snap.size);
  } catch (e) {
    console.error("Error:", e.message);
  }
};
run();
