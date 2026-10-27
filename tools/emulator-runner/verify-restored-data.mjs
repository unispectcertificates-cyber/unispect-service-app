import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, getDocs, limit, query } from 'firebase/firestore';

console.log('===============================================================');
console.log('CONFERÊNCIA DE DADOS IMPORTADOS NO EMULADOR FIRESTORE LOCAL');
console.log('===============================================================');

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-unispect-test',
  firestore: {
    host: '127.0.0.1',
    port: 8080
  }
});

let totalDocsFound = 0;
const results = {};

try {
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const db = adminContext.firestore();

    const collectionsToAudit = [
      'bookings',
      'containers',
      'containerPhotos',
      'yardPassages',
      'users',
      'clients',
      'counters',
      'certificates',
      'sealOperations',
      'auditLogs',
      'photos',
      'inspections',
      'services'
    ];

    for (const col of collectionsToAudit) {
      try {
        const snap = await getDocs(collection(db, col));
        if (snap.size > 0) {
          results[col] = snap.size;
          totalDocsFound += snap.size;
          console.log(`✔ Coleção '${col}': ${snap.size} documentos recuperados com integridade.`);
        }
      } catch (err) {
        console.warn(`Aviso na coleção '${col}':`, err.message);
      }
    }

    try {
      const q = query(collection(db, 'bookings'), limit(3));
      const bSnap = await getDocs(q);
      console.log('\n--- Amostra de Documentos da INTERPORT Recuperados ---');
      bSnap.forEach((doc) => {
        const data = doc.data();
        console.log(`Documento Bookings [${doc.id}]:`);
        console.log(` - Número: ${data.bookingNumber || data.number || 'N/A'}`);
        console.log(` - Exportador: ${data.exporter || data.exporterName || data.exporterId || 'N/A'}`);
        console.log(` - Status: ${data.status || 'N/A'}`);
        console.log(` - Contêineres: ${Array.isArray(data.containers) ? data.containers.length : (data.containerCount || 'N/A')}`);
      });
    } catch (e) {
      console.warn('Não foi possível ler amostra de bookings:', e.message);
    }
  });
} finally {
  await testEnv.cleanup();
}

console.log('===============================================================');
console.log(`TOTAL DE DOCUMENTOS AUDITADOS E RECUPERADOS: ${totalDocsFound}`);
console.log('===============================================================');

process.exit(0);
