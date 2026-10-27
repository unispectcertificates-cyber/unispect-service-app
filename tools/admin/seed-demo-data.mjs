import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc } from 'firebase/firestore';

const app = initializeApp({ projectId: 'demo-unispect-test', apiKey: 'fake-api-key' });
const auth = getAuth(app);
const db = getFirestore(app);

connectAuthEmulator(auth, 'http://127.0.0.1:9099');
connectFirestoreEmulator(db, '127.0.0.1', 8080);

async function seed() {
  console.log('Autenticando como Administrador da Interport (admin@interport.com.br)...');
  await signInWithEmailAndPassword(auth, 'admin@interport.com.br', 'Password123!');
  console.log('✔ Autenticado com sucesso. Populando dados de teste no Firestore Emulator...');
  
  // Booking da INTERPORT
  await setDoc(doc(db, 'bookings', 'bk_demo_interport'), {
    id: 'bk_demo_interport',
    clientId: 'client_interport',
    bookingNumber: 'BKG-INT-DEMO-01',
    certificateNumber: 'CERT-2026-DEMO',
    exporterId: 'exp_atlantica',
    exporterName: 'Café Atlântica',
    localName: 'Terminal Interport',
    status: 'Em Andamento',
    containersCount: 2,
    containers: [
      {
        number: 'MSDU8821297',
        seal: 'SEAL-00123',
        status: 'Em Vistoria',
        photos: []
      },
      {
        number: 'TGHU1234567',
        seal: 'SEAL-00124',
        status: 'Concluído',
        photos: []
      }
    ],
    updatedAt: new Date().toISOString()
  });

  console.log('✔ Booking da Interport criado com sucesso pelo Administrador autorizado.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Erro ao popular dados:', err.message);
  process.exit(1);
});
