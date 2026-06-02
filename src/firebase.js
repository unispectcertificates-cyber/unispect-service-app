import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

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
