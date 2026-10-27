import fetch from 'node-fetch';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, getDocs } from 'firebase/firestore';
import { readFileSync, writeFileSync } from 'node:fs';

console.log('===============================================================');
console.log('INICIANDO CONFERÊNCIA EXAUSTIVA DE 100% DOS DOCUMENTOS E VÍNCULOS');
console.log('===============================================================');

const EMULATOR_HOST = '127.0.0.1:8080';
const PROJECT_ID = 'demo-unispect-test';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { host: '127.0.0.1', port: 8080 }
});

const report = {
  timestamp: new Date().toISOString(),
  subcollectionScan: {
    totalDocumentsScanned: 0,
    collectionsWithSubcollections: {},
    subcollectionsFoundCount: 0
  },
  embeddedPhotoReferences: {
    inBookings: 0,
    inFieldContainers: 0,
    uniqueEmbeddedPhotoPathsFound: 0,
    matchedWithStorageBackup: 0,
    unmatchedEmbeddedPhotos: 0
  },
  incompleteRecordsAnalysis: {
    totalIncomplete: 0,
    fieldsAnalysis: {},
    byInspector: {},
    byDateRange: {},
    exactEvidence: []
  },
  storageClassification: {
    totalStorageFiles: 0,
    matchedViaContainerPhotos: 0,
    matchedViaEmbeddedBookings: 0,
    matchedViaFieldContainers: 0,
    legacyOrOrphanRemaining: 0
  }
};

try {
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const db = adminContext.firestore();

    // 1. Carregar inventário do backup do Storage (17.222 arquivos)
    const backupCsv = readFileSync('scratch/backup_storage_inventory.csv', 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);
    
    const storageFiles = new Set();
    for (const l of backupCsv) {
      let p = l.split(',')[0];
      if (p.startsWith('storage-files/')) p = p.substring('storage-files/'.length);
      storageFiles.add(p);
    }
    report.storageClassification.totalStorageFiles = storageFiles.size;
    console.log(`Carregados ${storageFiles.size} arquivos do backup do Storage para cruzamento.`);

    // 2. Descobrir todas as coleções raiz
    const listColsUrl = `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents:listCollectionIds`;
    const resCols = await fetch(listColsUrl, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const rootColsData = await resCols.json();
    const allRootCollections = rootColsData.collectionIds || [];
    console.log(`Coleções raiz identificadas:`, allRootCollections);

    // 3. Varredura EXAUSTIVA de subcoleções em 100% dos documentos de todas as coleções
    console.log('\n--- Varrendo 100% dos documentos em busca de subcoleções ---');
    let totalDocsScanned = 0;
    
    for (const col of allRootCollections) {
      const snap = await getDocs(collection(db, col));
      console.log(`Varrendo coleção '${col}' (${snap.size} documentos)...`);
      for (const d of snap.docs) {
        totalDocsScanned++;
        // Chamada REST para verificar subcoleções do documento
        const subUrl = `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${col}/${d.id}:listCollectionIds`;
        const subRes = await fetch(subUrl, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer owner', 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        const subData = await subRes.json();
        if (subData.collectionIds && subData.collectionIds.length > 0) {
          if (!report.subcollectionScan.collectionsWithSubcollections[col]) {
            report.subcollectionScan.collectionsWithSubcollections[col] = {};
          }
          report.subcollectionScan.collectionsWithSubcollections[col][d.id] = subData.collectionIds;
          report.subcollectionScan.subcollectionsFoundCount += subData.collectionIds.length;
        }
      }
    }
    report.subcollectionScan.totalDocumentsScanned = totalDocsScanned;
    console.log(`Total de documentos varridos: ${totalDocsScanned}`);
    console.log(`Total de subcoleções encontradas: ${report.subcollectionScan.subcollectionsFoundCount}`);

    // 4. Cruzamento de fotos embutidas em 'bookings' e 'fieldContainers'
    console.log('\n--- Cruzando fotos embutidas em bookings e fieldContainers ---');
    const embeddedPaths = new Set();
    let bookingsEmbeddedCount = 0;
    let fieldContainersEmbeddedCount = 0;

    const bookingsSnap = await getDocs(collection(db, 'bookings'));
    bookingsSnap.forEach(bDoc => {
      const bData = bDoc.data();
      // Percorre containers embutidos
      if (Array.isArray(bData.containers)) {
        bData.containers.forEach(c => {
          // container.photos array
          if (Array.isArray(c.photos)) {
            c.photos.forEach(p => {
              bookingsEmbeddedCount++;
              const pathOrUrl = typeof p === 'string' ? p : (p.storagePath || p.path || p.url);
              if (pathOrUrl) embeddedPaths.add(pathOrUrl);
            });
          }
          // container.lacrePhotos array
          if (Array.isArray(c.lacrePhotos)) {
            c.lacrePhotos.forEach(p => {
              bookingsEmbeddedCount++;
              const pathOrUrl = typeof p === 'string' ? p : (p.storagePath || p.path || p.url);
              if (pathOrUrl) embeddedPaths.add(pathOrUrl);
            });
          }
        });
      }
    });

    const fieldContainersSnap = await getDocs(collection(db, 'fieldContainers'));
    fieldContainersSnap.forEach(fcDoc => {
      const fcData = fcDoc.data();
      if (Array.isArray(fcData.photos)) {
        fcData.photos.forEach(p => {
          fieldContainersEmbeddedCount++;
          const pathOrUrl = typeof p === 'string' ? p : (p.storagePath || p.path || p.url);
          if (pathOrUrl) embeddedPaths.add(pathOrUrl);
        });
      }
    });

    console.log(`Referências de fotos embutidas encontradas em bookings: ${bookingsEmbeddedCount}`);
    console.log(`Referências de fotos embutidas encontradas em fieldContainers: ${fieldContainersEmbeddedCount}`);
    console.log(`Total de referências únicas embutidas: ${embeddedPaths.size}`);

    // Cruzar caminhos embutidos com o Storage
    let matchedEmbeddedCount = 0;
    const matchedStoragePathsFromEmbedded = new Set();

    embeddedPaths.forEach(rawPath => {
      for (const sp of storageFiles) {
        if (rawPath === sp || rawPath.includes(sp)) {
          matchedEmbeddedCount++;
          matchedStoragePathsFromEmbedded.add(sp);
          break;
        }
      }
    });

    report.embeddedPhotoReferences = {
      inBookings: bookingsEmbeddedCount,
      inFieldContainers: fieldContainersEmbeddedCount,
      uniqueEmbeddedPhotoPathsFound: embeddedPaths.size,
      matchedWithStorageBackup: matchedEmbeddedCount,
      unmatchedEmbeddedPhotos: embeddedPaths.size - matchedEmbeddedCount
    };

    // 5. Cruzar 'containerPhotos' com Storage
    const photosSnap = await getDocs(collection(db, 'containerPhotos'));
    const matchedStorageFromContainerPhotos = new Set();
    const incompleteRecords = [];

    photosSnap.forEach(pDoc => {
      const pData = pDoc.data();
      const sPath = pData.storagePath || pData.path || (pData.url ? pData.url.split('?')[0] : null);
      
      let matched = false;
      if (sPath) {
        if (storageFiles.has(sPath)) {
          matched = true;
          matchedStorageFromContainerPhotos.add(sPath);
        } else {
          for (const sp of storageFiles) {
            if (sPath.includes(sp)) {
              matched = true;
              matchedStorageFromContainerPhotos.add(sp);
              break;
            }
          }
        }
      }

      if (!matched) {
        incompleteRecords.push({
          id: pDoc.id,
          data: pData
        });
      }
    });

    // 6. Investigação aprofundada dos registros incompletos (sem presunções)
    console.log(`\n--- Investigando os ${incompleteRecords.length} registros incompletos ---`);
    report.incompleteRecordsAnalysis.totalIncomplete = incompleteRecords.length;

    const fieldsCounter = {};
    const inspectorCounter = {};
    const dateRangeCounter = {};

    incompleteRecords.forEach(rec => {
      const keys = Object.keys(rec.data).sort().join(',');
      fieldsCounter[keys] = (fieldsCounter[keys] || 0) + 1;

      const insp = rec.data.inspectorId || rec.data.inspectorName || rec.data.userId || 'NÃO_IDENTIFICADO';
      inspectorCounter[insp] = (inspectorCounter[insp] || 0) + 1;

      const date = rec.data.createdAt || rec.data.date || rec.data.timestamp || 'DATA_AUSENTE';
      const dateKey = typeof date === 'string' ? date.substring(0, 10) : (typeof date === 'number' ? new Date(date).toISOString().substring(0, 10) : 'OUTRO');
      dateRangeCounter[dateKey] = (dateRangeCounter[dateKey] || 0) + 1;
    });

    report.incompleteRecordsAnalysis.fieldsAnalysis = fieldsCounter;
    report.incompleteRecordsAnalysis.byInspector = inspectorCounter;
    report.incompleteRecordsAnalysis.byDateRange = dateRangeCounter;
    report.incompleteRecordsAnalysis.exactEvidence = incompleteRecords.slice(0, 15).map(r => ({
      id: r.id,
      fieldsPresent: Object.keys(r.data),
      values: r.data
    }));

    // 7. Classificação consolidada dos 17.222 arquivos do Storage
    const allMatchedStorage = new Set([
      ...matchedStorageFromContainerPhotos,
      ...matchedStoragePathsFromEmbedded
    ]);

    report.storageClassification = {
      totalStorageFiles: storageFiles.size,
      matchedViaContainerPhotos: matchedStorageFromContainerPhotos.size,
      matchedViaEmbeddedReferences: matchedStoragePathsFromEmbedded.size,
      totalFilesWithIdentifiedDatabaseLinks: allMatchedStorage.size,
      unlinkedStorageFilesPreserved: storageFiles.size - allMatchedStorage.size
    };

    console.log('\n--- Classificação Final dos Arquivos no Storage ---');
    console.log(`Total no Storage de Backup: ${storageFiles.size}`);
    console.log(`Vinculados via containerPhotos: ${matchedStorageFromContainerPhotos.size}`);
    console.log(`Vinculados via referências embutidas (bookings/field): ${matchedStoragePathsFromEmbedded.size}`);
    console.log(`Total com vínculos em banco identificados: ${allMatchedStorage.size}`);
    console.log(`Arquivos legados/órfãos preservados na íntegra: ${storageFiles.size - allMatchedStorage.size}`);
  });
} finally {
  await testEnv.cleanup();
}

writeFileSync('scratch/complete_backup_audit.json', JSON.stringify(report, null, 2), 'utf8');
console.log('\nConferência concluída e relatório salvo em scratch/complete_backup_audit.json');
process.exit(0);
