import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, getDocs } from 'firebase/firestore';

console.log('Testing connection to port 8088...');
const testEnv = await initializeTestEnvironment({
  projectId: 'interport-real-restored-copy',
  firestore: {
    host: '127.0.0.1',
    port: 8088
  }
});

try {
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const db = adminContext.firestore();
    const snap = await getDocs(collection(db, 'bookings'));
    console.log(`>>> TEST SUCCESS! Real Bookings found on port 8088: ${snap.size}`);
  });
} finally {
  await testEnv.cleanup();
}
