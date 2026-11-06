import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

// storageBucket real do projeto no Firebase:
const firebaseConfig = {
  apiKey: "AIzaSyB3KIjgh7x5MFu-VscddMEV5kPCTkiGoBc",
  authDomain: "unispect-service.firebaseapp.com",
  projectId: "unispect-service",
  storageBucket: "unispect-service.firebasestorage.app",
  messagingSenderId: "1072518189146",
  appId: "1:1072518189146:web:055a375c84b0b0e6ac0863"
};

const app = initializeApp(firebaseConfig);
export const dbFirestore = getFirestore(app);
export const storage = getStorage(app);

// Conexão com Firebase Emulator habilitada por padrão para ambiente local
if (typeof window !== 'undefined') {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const forceDisable = localStorage.getItem('unispect_use_emulator') === 'false';
  if (isLocal && !forceDisable) {
    try {
      const emulatorHost = window.location.hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost';
      connectFirestoreEmulator(dbFirestore, emulatorHost, 8080);
      connectStorageEmulator(storage, emulatorHost, 9199);
      window.__UNISPECT_EMULATOR_CONNECTED__ = true;
      console.log(` Conectado ao Firebase Emulator local (Firestore: ${emulatorHost}:8080, Storage: ${emulatorHost}:9199)`);
    } catch (e) {
      console.warn('Firebase emulator connection:', e.message);
    }
  }
}
