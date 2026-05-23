import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true
  }, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = dbInstance;
export const auth = getAuth(app);

// Explicitly set persistence to help circumvent the "Pending promise was never set" error
setPersistence(auth, browserLocalPersistence).catch(console.error);

export const storage = getStorage(app);
