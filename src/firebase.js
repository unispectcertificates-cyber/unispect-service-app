import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { assertSafeEnvironment } from "./utils/environmentGuard.js";

// storageBucket real do projeto no Firebase:
const firebaseConfig = {
  apiKey: "AIzaSyB3KIjgh7x5MFu-VscddMEV5kPCTkiGoBc",
  authDomain: "unispect-service.firebaseapp.com",
  projectId: "unispect-service",
  storageBucket: "unispect-service.firebasestorage.app",
  messagingSenderId: "1072518189146",
  appId: "1:1072518189146:web:055a375c84b0b0e6ac0863"
};

// Trava rígida de proteção de ambiente executada ANTES de inicializar qualquer serviço
const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const forceEmulator = typeof window !== 'undefined' ? (localStorage.getItem('unispect_use_emulator') !== 'false') : true;

assertSafeEnvironment({
  hostname: typeof window !== 'undefined' ? window.location.hostname : 'localhost',
  projectId: firebaseConfig.projectId,
  isEmulatorActive: isLocal && forceEmulator
});

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const dbFirestore = getFirestore(app);
export const storage = getStorage(app);

// Conexão imediata e estrita com Firebase Emulator
if (typeof window !== 'undefined' && isLocal && forceEmulator) {
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(dbFirestore, '127.0.0.1', 8080);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    console.log('🛡️ [ISOLAMENTO LOCAL ATIVO] Conectado aos emuladores (Auth: 9099, Firestore: 8080, Storage: 9199)');
  } catch (e) {
    console.warn('Firebase emulator connection:', e.message);
  }
}

