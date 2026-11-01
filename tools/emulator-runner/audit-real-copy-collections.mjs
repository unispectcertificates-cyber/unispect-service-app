import fetch from 'node-fetch';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, getDocs } from 'firebase/firestore';
import { writeFileSync } from 'node:fs';

console.log('===============================================================');
console.log('AUDITORIA DE TODAS AS COLEÇÕES - CÓPIA LOCAL DO BACKUP REAL');
console.log('Porta: 8088 | Projeto: interport-real-restored-copy');
console.log('===============================================================');

const EMULATOR_HOST = '127.0.0.1:8088';
const PROJECT_ID = 'interport-real-restored-copy';

// 1. Descobrir coleções raiz via REST
async function listRootCollections() {
  const url = `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents:listCollectionIds`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const data = await res.json();
  return data.collectionIds || [];
}

const rootCols = await listRootCollections();
console.log('\n[1] Coleções Raiz Descobertas no Banco Restaurado:', rootCols);

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { host: '127.0.0.1', port: 8088 }
});

const auditReport = {
  timestamp: new Date().toISOString(),
  targetExpected: {
    bookings: 1146,
    embeddedContainers: 3976,
    containerPhotos: 7571
  },
  actualCollections: {},
  discrepancies: [],
  bookingsDetail: {
    totalDocs: 0,
    bookingsWithContainers: 0,
    totalEmbeddedContainers: 0,
    sampleBookings: []
  },
  containerPhotosDetail: {
    totalDocs: 0,
    base64Count: 0,
    storagePathCount: 0,
    legacyUrlsCount: 0,
    sampleBase64: [],
    sampleStoragePaths: []
  }
};

try {
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const db = adminContext.firestore();

    // 2. Contagem e auditoria de cada coleção
    for (const col of rootCols) {
      const snap = await getDocs(collection(db, col));
      auditReport.actualCollections[col] = snap.size;
      console.log(`- Coleção '${col}': ${snap.size} documento(s)`);
    }

    // 3. Auditoria profunda de 'bookings' e contêineres embutidos
    console.log('\n[2] Auditando estrutura interna de "bookings"...');
    const bookingsSnap = await getDocs(collection(db, 'bookings'));
    auditReport.bookingsDetail.totalDocs = bookingsSnap.size;

    let totalContainers = 0;
    let withContainers = 0;

    bookingsSnap.forEach(d => {
      const b = d.data();
      const cList = Array.isArray(b.containers) ? b.containers : [];
      if (cList.length > 0) {
        withContainers++;
        totalContainers += cList.length;
      }
      if (auditReport.bookingsDetail.sampleBookings.length < 5) {
        auditReport.bookingsDetail.sampleBookings.push({
          id: d.id,
          bookingNumber: b.bookingNumber || b.number || 'N/A',
          containersCount: cList.length,
          certificateNumber: b.certificateNumber || 'N/A',
          exporterId: b.exporterId || b.exporter || 'N/A',
          clientId: b.clientId || null
        });
      }
    });

    auditReport.bookingsDetail.bookingsWithContainers = withContainers;
    auditReport.bookingsDetail.totalEmbeddedContainers = totalContainers;

    console.log(`  ✔ Total de Bookings: ${bookingsSnap.size} (esperado: 1146)`);
    console.log(`  ✔ Bookings com contêineres: ${withContainers}`);
    console.log(`  ✔ Total de Contêineres Embutidos: ${totalContainers} (esperado: 3976)`);

    if (bookingsSnap.size !== 1146) {
      auditReport.discrepancies.push(`Bookings: encontrado ${bookingsSnap.size}, esperado 1146`);
    }
    if (totalContainers !== 3976) {
      auditReport.discrepancies.push(`Contêineres embutidos: encontrado ${totalContainers}, esperado 3976`);
    }

    // 4. Auditoria detalhada de 'containerPhotos' (Base64 vs Storage Path)
    console.log('\n[3] Auditando integridade e fotos em "containerPhotos"...');
    const photosSnap = await getDocs(collection(db, 'containerPhotos'));
    auditReport.containerPhotosDetail.totalDocs = photosSnap.size;

    let base64Count = 0;
    let storagePathCount = 0;
    let legacyUrlsCount = 0;

    photosSnap.forEach(d => {
      const p = d.data();
      const hasBase64 = (p.dataUrl && p.dataUrl.startsWith('data:image')) ||
                        (p.base64 && typeof p.base64 === 'string') ||
                        (p.url && p.url.startsWith('data:image'));
      if (hasBase64) {
        base64Count++;
        if (auditReport.containerPhotosDetail.sampleBase64.length < 3) {
          auditReport.containerPhotosDetail.sampleBase64.push({
            id: d.id,
            containerId: p.containerId,
            base64Length: (p.dataUrl || p.base64 || p.url).length,
            prefix: (p.dataUrl || p.base64 || p.url).substring(0, 35) + '...'
          });
        }
      }

      if (p.storagePath || p.path) {
        storagePathCount++;
        if (auditReport.containerPhotosDetail.sampleStoragePaths.length < 3) {
          auditReport.containerPhotosDetail.sampleStoragePaths.push({
            id: d.id,
            containerId: p.containerId,
            storagePath: p.storagePath || p.path
          });
        }
      }

      if (p.url && (p.url.startsWith('http://') || p.url.startsWith('https://') || p.url.startsWith('gs://'))) {
        legacyUrlsCount++;
      }
    });

    auditReport.containerPhotosDetail.base64Count = base64Count;
    auditReport.containerPhotosDetail.storagePathCount = storagePathCount;
    auditReport.containerPhotosDetail.legacyUrlsCount = legacyUrlsCount;

    console.log(`  ✔ Total de Registros em containerPhotos: ${photosSnap.size} (esperado: 7571)`);
    console.log(`  ✔ Fotos com Payload Base64 preservado: ${base64Count}`);
    console.log(`  ✔ Fotos com Caminho de Arquivo no Storage (storagePath): ${storagePathCount}`);
    console.log(`  ✔ Fotos com Referências/URLs legadas: ${legacyUrlsCount}`);

    if (photosSnap.size !== 7571) {
      auditReport.discrepancies.push(`containerPhotos: encontrado ${photosSnap.size}, esperado 7571`);
    }

    // Salvar relatório detalhado
    writeFileSync('scratch/audit_real_copy_results.json', JSON.stringify(auditReport, null, 2), 'utf8');
    console.log('\n✔ Relatório salvo em "scratch/audit_real_copy_results.json".');
  });
} finally {
  await testEnv.cleanup();
}

console.log('===============================================================');
console.log(`STATUS FINAL DA AUDITORIA: ${auditReport.discrepancies.length === 0 ? 'INTEGRIDADE PERFEITA (100% CONFORME)' : 'DIVERGÊNCIAS DETECTADAS'}`);
if (auditReport.discrepancies.length > 0) {
  console.log('Divergências:', auditReport.discrepancies);
}
console.log('===============================================================');
