import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyB3KIjgh7x5MFu-VscddMEV5kPCTkiGoBc",
  authDomain: "unispect-service.firebaseapp.com",
  projectId: "unispect-service",
  storageBucket: "unispect-service.firebasestorage.app",
  messagingSenderId: "1072518189146",
  appId: "1:1072518189146:web:055a375c84b0b0e6ac0863"
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

async function test() {
  console.log("Iniciando teste de upload no Firebase Storage...");
  try {
    const filename = `test_temp_${Date.now()}.txt`;
    const storageRef = ref(storage, filename);
    
    console.log(`Tentando fazer upload do arquivo de teste '${filename}'...`);
    await uploadString(storageRef, "Hello World from Unispect!", "raw");
    console.log("Upload concluido com sucesso!");
    
    console.log("Tentando obter URL de download...");
    const url = await getDownloadURL(storageRef);
    console.log("URL obtida:", url);
    
    console.log("Tentando deletar o arquivo de teste...");
    await deleteObject(storageRef);
    console.log("Delecao concluida!");
    
    console.log("=== TESTE DE STORAGE CONCLUIDO COM SUCESSO! ===");
  } catch (error) {
    console.error("=== ERRO NO TESTE DE STORAGE ===");
    console.error(error);
  }
}

test();
