import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

console.log('===============================================================');
console.log('SIMULAÇÃO (DRY-RUN) DA VINCULAÇÃO OPERACIONAL À INTERPORT');
console.log('Porta: 8088 | Projeto: interport-real-restored-copy (CÓPIA REAL)');
console.log('===============================================================');

const testEnv = await initializeTestEnvironment({
  projectId: 'interport-real-restored-copy',
  firestore: {
    host: '127.0.0.1',
    port: 8088
  }
});

const simulationSummary = {
  dryRun: true,
  timestamp: new Date().toISOString(),
  totalBookingsInspected: 0,
  bookingsToLink: 0,
  alreadyLinked: 0,
  conflictsFound: 0,
  containersInBookingsToLink: 0,
  photosInBookingsToLink: 0,
  clientTarget: {
    id: 'client_interport',
    name: 'INTERPORT Logística',
    code: 'INTERPORT'
  },
  samplePlannedOperations: []
};

try {
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const db = adminContext.firestore();

    // 1. Verificar estado da coleção 'clients'
    console.log('\n[1] Verificando existência de clientes na cópia...');
    const clientRef = doc(db, 'clients', 'client_interport');
    const clientSnap = await getDoc(clientRef);
    if (clientSnap.exists()) {
      console.log('  ✔ Cliente "client_interport" já existe:', clientSnap.data().name);
    } else {
      console.log('  ℹ Cliente "client_interport" será provisionado durante a execução real.');
    }

    // 2. Varrer todos os bookings reais para simular vinculação
    console.log('\n[2] Analisando todos os Bookings para planejamento da vinculação...');
    const bookingsSnap = await getDocs(collection(db, 'bookings'));
    simulationSummary.totalBookingsInspected = bookingsSnap.size;

    bookingsSnap.forEach(d => {
      const b = d.data();
      const currentClientId = b.clientId || null;
      const cList = Array.isArray(b.containers) ? b.containers : [];
      let photoRefsCount = 0;
      cList.forEach(c => {
        if (Array.isArray(c.photos)) photoRefsCount += c.photos.length;
      });

      if (!currentClientId || currentClientId === '(nenhum)' || currentClientId === 'client_interport') {
        simulationSummary.bookingsToLink++;
        simulationSummary.containersInBookingsToLink += cList.length;
        simulationSummary.photosInBookingsToLink += photoRefsCount;

        if (simulationSummary.samplePlannedOperations.length < 10) {
          simulationSummary.samplePlannedOperations.push({
            id: d.id,
            bookingNumber: b.bookingNumber || b.number || 'N/A',
            certificateNumber: b.certificateNumber || 'N/A',
            containers: cList.length,
            embeddedPhotoRefs: photoRefsCount,
            currentClientId: currentClientId,
            plannedAction: 'UPDATE clientId = "client_interport"'
          });
        }
      } else {
        simulationSummary.conflictsFound++;
        console.warn(`Atenção: Booking ${d.id} possui outro clientId: ${currentClientId}`);
      }
    });

    console.log(`\n--- RESULTADO DA SIMULAÇÃO (DRY RUN) ---`);
    console.log(`Total de Bookings avaliados: ${simulationSummary.totalBookingsInspected}`);
    console.log(`Bookings planejados para vinculação: ${simulationSummary.bookingsToLink}`);
    console.log(`Contêineres embutidos impactados: ${simulationSummary.containersInBookingsToLink}`);
    console.log(`Fotos referenciadas impactadas: ${simulationSummary.photosInBookingsToLink}`);
    console.log(`Conflitos detectados: ${simulationSummary.conflictsFound}`);
    console.log(`Modificações realizadas no banco: 0 (DRY-RUN GARANTIDO)`);

    console.log('\n--- Amostra de Operações Planejadas na Simulação ---');
    console.table(simulationSummary.samplePlannedOperations);
  });
} finally {
  await testEnv.cleanup();
}

console.log('===============================================================');
console.log('SIMULAÇÃO CONCLUÍDA COM SUCESSO. NENHUM DADO FOI ALTERADO.');
console.log('===============================================================');
