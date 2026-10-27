import fetch from 'node-fetch';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { readFileSync, writeFileSync } from 'node:fs';

console.log('===============================================================');
console.log('AUDITORIA COMPLETA DE TODAS AS COLEÇÕES E VÍNCULOS RESTAURADOS');
console.log('===============================================================');

const EMULATOR_HOST = '127.0.0.1:8080';
const PROJECT_ID = 'demo-unispect-test';

// 1. Descobrir todas as coleções raiz via REST API do Firestore
async function listRootCollections() {
  const url = `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents:listCollectionIds`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer owner',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  const data = await res.json();
  return data.collectionIds || [];
}

// 2. Descobrir subcoleções de um documento
async function listSubcollections(docPath) {
  const url = `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}:listCollectionIds`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer owner',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  const data = await res.json();
  return data.collectionIds || [];
}

const rootCols = await listRootCollections();
console.log('\nColeções raiz descobertas no banco restaurado:', rootCols);

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { host: '127.0.0.1', port: 8080 }
});

const report = {
  discoveredRootCollections: rootCols,
  collectionDetails: {},
  subcollectionsFound: {},
  photoLinkIntegrity: {},
  embeddedStructures: {}
};

try {
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const db = adminContext.firestore();

    for (const col of rootCols) {
      const snap = await getDocs(collection(db, col));
      console.log(`\n--- Coleção '${col}' (${snap.size} documentos) ---`);
      
      const docIds = [];
      const subcolsMap = {};
      let count = 0;

      for (const d of snap.docs) {
        if (count < 5) docIds.push(d.id);
        
        // Verifica se os primeiros 5 documentos possuem subcoleções
        if (count < 5) {
          const subcols = await listSubcollections(`${col}/${d.id}`);
          if (subcols.length > 0) {
            subcolsMap[d.id] = subcols;
          }
        }
        count++;
      }

      report.collectionDetails[col] = {
        totalDocs: snap.size,
        sampleIds: docIds,
        subcollections: subcolsMap
      };

      if (Object.keys(subcolsMap).length > 0) {
        console.log(`  Subcoleções encontradas em '${col}':`, subcolsMap);
      } else {
        console.log(`  Nenhuma subcoleção detectada nas amostras de '${col}'.`);
      }
    }

    // 3. Auditoria profunda em 'bookings'
    console.log('\n--- Auditoria Estrutural de Bookings ---');
    const bookingsSnap = await getDocs(collection(db, 'bookings'));
    let totalContainersInBookings = 0;
    let bookingsWithContainers = 0;
    const containersSample = [];

    bookingsSnap.forEach(bDoc => {
      const bData = bDoc.data();
      if (Array.isArray(bData.containers) && bData.containers.length > 0) {
        bookingsWithContainers++;
        totalContainersInBookings += bData.containers.length;
        if (containersSample.length < 5) {
          containersSample.push({
            bookingId: bDoc.id,
            bookingNumber: bData.bookingNumber || bData.number,
            containerNumber: bData.containers[0].containerNumber || bData.containers[0].number,
            containerId: bData.containers[0].id || bData.containers[0].containerId
          });
        }
      }
    });

    console.log(`Total de Bookings: ${bookingsSnap.size}`);
    console.log(`Bookings com contêineres embutidos: ${bookingsWithContainers}`);
    console.log(`Total de Contêineres registrados em Bookings: ${totalContainersInBookings}`);
    report.embeddedStructures.bookings = {
      totalBookings: bookingsSnap.size,
      bookingsWithContainers,
      totalContainersInBookings,
      sample: containersSample
    };

    // 4. Auditoria de 'containerPhotos' e vínculo com os arquivos do Storage
    console.log('\n--- Auditoria de Vínculos de Fotos com Storage ---');
    const photosSnap = await getDocs(collection(db, 'containerPhotos'));
    console.log(`Total de metadados em containerPhotos: ${photosSnap.size}`);

    // Carrega o mapa de arquivos do backup para cruzar vínculos
    const backupLines = readFileSync('scratch/backup_storage_inventory.csv', 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);
    
    const storageFilesSet = new Set();
    for (const l of backupLines) {
      let p = l.split(',')[0];
      if (p.startsWith('storage-files/')) p = p.substring('storage-files/'.length);
      storageFilesSet.add(p);
    }

    let photosWithValidStoragePath = 0;
    let photosMissingInStorage = 0;
    const missingPhotosSample = [];
    const validPhotosSample = [];

    photosSnap.forEach(pDoc => {
      const pData = pDoc.data();
      const sPath = pData.storagePath || pData.path || (pData.url ? pData.url.split('?')[0] : null);
      
      let resolvedPath = null;
      if (sPath) {
        if (storageFilesSet.has(sPath)) {
          resolvedPath = sPath;
        } else {
          // Tenta extrair caminho relativo se for URL completa
          for (const sp of storageFilesSet) {
            if (sPath.includes(sp)) {
              resolvedPath = sp;
              break;
            }
          }
        }
      }

      if (resolvedPath) {
        photosWithValidStoragePath++;
        if (validPhotosSample.length < 5) {
          validPhotosSample.push({
            photoId: pDoc.id,
            containerId: pData.containerId,
            storagePath: resolvedPath
          });
        }
      } else {
        photosMissingInStorage++;
        if (missingPhotosSample.length < 5) {
          missingPhotosSample.push({
            photoId: pDoc.id,
            data: {
              containerId: pData.containerId,
              storagePath: pData.storagePath,
              url: pData.url ? pData.url.substring(0, 60) + '...' : null
            }
          });
        }
      }
    });

    console.log(`Fotos com arquivo comprovado no Storage de Backup: ${photosWithValidStoragePath}`);
    console.log(`Fotos sem correspondência direta imediata: ${photosMissingInStorage}`);
    
    // Arquivos no Storage que não estão em containerPhotos (arquivos órfãos / arquivos de outras coleções / fotos legadas)
    console.log(`Total de arquivos no Storage de Backup: ${storageFilesSet.size}`);
    const orphanStorageFiles = storageFilesSet.size - photosWithValidStoragePath;
    console.log(`Arquivos no Storage preservados como órfãos ou referenciados em outras estruturas: ${orphanStorageFiles}`);

    report.photoLinkIntegrity = {
      totalPhotosMetadata: photosSnap.size,
      photosWithConfirmedFile: photosWithValidStoragePath,
      photosMissingFile: photosMissingInStorage,
      missingSample: missingPhotosSample,
      validSample: validPhotosSample,
      totalStorageFiles: storageFilesSet.size,
      unlinkedStorageFilesPreserved: orphanStorageFiles
    };
  });
} finally {
  await testEnv.cleanup();
}

writeFileSync('scratch/deep_audit_report.json', JSON.stringify(report, null, 2), 'utf8');
console.log('\nRelatório completo salvo em scratch/deep_audit_report.json');
process.exit(0);
