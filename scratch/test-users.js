import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB3KIjgh7x5MFu-VscddMEV5kPCTkiGoBc",
  authDomain: "unispect-service.firebaseapp.com",
  projectId: "unispect-service",
  storageBucket: "unispect-service.firebasestorage.app",
  messagingSenderId: "1072518189146",
  appId: "1:1072518189146:web:055a375c84b0b0e6ac0863"
};

const app = initializeApp(firebaseConfig);
const dbFirestore = getFirestore(app);

async function test() {
  console.log("=== USER LIST ===");
  try {
    const snap = await getDocs(collection(dbFirestore, "usuarios"));
    snap.docs.forEach(doc => {
      console.log(doc.id, "=>", doc.data());
    });
  } catch (error) {
    console.error("Error reading users:", error);
  }
}

test();
