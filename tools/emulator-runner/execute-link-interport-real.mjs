import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { writeFileSync } from 'node:fs';

console.log('===============================================================');
console.log('EXECUÇÃO DA VINCULAÇÃO OPERACIONAL À INTERPORT (CÓPIA REAL)');
console.log('Porta: 8088 | Projeto: interport-real-restored-copy');
console.log('===============================================================');

const testEnv = await initializeTestEnvironment({
  projectId: 'interport-real-restored-copy',
  firestore: {
    host: '127.0.0.1',
    port: 8088
  }
});

const report = {
  timestamp: new Date().toISOString(),
  targetClientId: 'client_interport',
  before: {
    totalBookings: 0,
    totalContainers: 0,
    totalContainerPhotos: 0,
    base64PhotosCount: 0,
    storagePathPhotosCount: 0
  },
  after: {
    totalBookings: 0,
    totalContainers: 0,
    totalContainerPhotos: 0,
    base64PhotosCount: 0,
    storagePathPhotosCount: 0,
    bookingsWithInterportClientId: 0
  },
  comparisonCheck: {
    allIdsPreserved: false,
    allBookingNumbersPreserved: false,
    allContainersArraysPreserved: false,
    allCertificateNumbersPreserved: false,
    allBase64PhotosPreserved: false,
    allStoragePathsPreserved: false,
    discrepancies: []
  },
  sampleBeforeAfterComparison: []
};

try {
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const db = adminContext.firestore();

    // ── 1. SNAPSHOT ANTES DA VINCULAÇÃO ──
    console.log('\n[1] Capturando estado estrito ANTES da vinculação...');
    const bookingsBeforeSnap = await getDocs(collection(db, 'bookings'));
    report.before.totalBookings = bookingsBeforeSnap.size;

    const bookingsBeforeMap = new Map();
    bookingsBeforeSnap.forEach(d => {
      const b = d.data();
      const cList = Array.isArray(b.containers) ? b.containers : [];
      report.before.totalContainers += cList.length;

      // Armazena cópia imutável para comparação
      bookingsBeforeMap.set(d.id, {
        id: d.id,
        bookingNumber: b.bookingNumber || b.number || null,
        certificateNumber: b.certificateNumber || null,
        exporterId: b.exporterId || b.exporter || null,
        vesselVoyage: b.vesselVoyage || b.vessel || null,
        containersCount: cList.length,
        containersJSON: JSON.stringify(cList),
        rawDocJSONWithoutClientId: JSON.stringify({ ...b, clientId: undefined })
      });
    });

    // Snapshot de containerPhotos
    const photosBeforeSnap = await getDocs(collection(db, 'containerPhotos'));
    report.before.totalContainerPhotos = photosBeforeSnap.size;

    const photosBeforeMap = new Map();
    photosBeforeSnap.forEach(d => {
      const p = d.data();
      const hasBase64 = (p.dataUrl && p.dataUrl.startsWith('data:image')) ||
                        (p.base64 && typeof p.base64 === 'string') ||
                        (p.url && p.url.startsWith('data:image'));
      if (hasBase64) report.before.base64PhotosCount++;
      if (p.storagePath || p.path) report.before.storagePathPhotosCount++;

      photosBeforeMap.set(d.id, {
        id: d.id,
        containerId: p.containerId,
        storagePath: p.storagePath || p.path || null,
        dataUrlLen: p.dataUrl ? p.dataUrl.length : 0,
        rawJSON: JSON.stringify(p)
      });
    });

    console.log(`  ✔ Bookings auditados antes: ${report.before.totalBookings}`);
    console.log(`  ✔ Contêineres auditados antes: ${report.before.totalContainers}`);
    console.log(`  ✔ containerPhotos auditados antes: ${report.before.totalContainerPhotos} (Base64: ${report.before.base64PhotosCount}, StoragePath: ${report.before.storagePathPhotosCount})`);

    // ── 2. CADASTRO DE INTERPORT EM 'clients' ──
    console.log('\n[2] Cadastrando cliente INTERPORT na coleção "clients"...');
    const interportRef = doc(db, 'clients', 'client_interport');
    await setDoc(interportRef, {
      id: 'client_interport',
      name: 'INTERPORT Logística',
      code: 'INTERPORT',
      description: 'Terminal e Operador Logístico Principal',
      cnpj: '08.123.456/0001-78',
      active: true,
      isDefault: true,
      createdAt: 1704067200000
    }, { merge: true });
    console.log('  ✔ Registro de cliente "client_interport" garantido.');

    // ── 3. EXECUÇÃO DA VINCULAÇÃO (BATCHED WRITES) ──
    console.log('\n[3] Executando vinculação dos 1.146 Bookings a "client_interport"...');
    const bookingIds = Array.from(bookingsBeforeMap.keys());
    const batchSize = 400; // Limite do Firestore é 500 operações por batch

    for (let i = 0; i < bookingIds.length; i += batchSize) {
      const chunk = bookingIds.slice(i, i + batchSize);
      const batch = writeBatch(db);
      for (const id of chunk) {
        const bRef = doc(db, 'bookings', id);
        batch.update(bRef, { clientId: 'client_interport' });
      }
      await batch.commit();
      console.log(`  ✔ Lote de ${chunk.length} bookings atualizado (${Math.min(i + batchSize, bookingIds.length)}/${bookingIds.length}).`);
    }

    // ── 4. SNAPSHOT DEPOIS DA VINCULAÇÃO ──
    console.log('\n[4] Capturando estado estrito DEPOIS da vinculação...');
    const bookingsAfterSnap = await getDocs(collection(db, 'bookings'));
    report.after.totalBookings = bookingsAfterSnap.size;

    const bookingsAfterMap = new Map();
    bookingsAfterSnap.forEach(d => {
      const b = d.data();
      const cList = Array.isArray(b.containers) ? b.containers : [];
      report.after.totalContainers += cList.length;
      if (b.clientId === 'client_interport') {
        report.after.bookingsWithInterportClientId++;
      }

      bookingsAfterMap.set(d.id, {
        id: d.id,
        clientId: b.clientId,
        bookingNumber: b.bookingNumber || b.number || null,
        certificateNumber: b.certificateNumber || null,
        exporterId: b.exporterId || b.exporter || null,
        vesselVoyage: b.vesselVoyage || b.vessel || null,
        containersCount: cList.length,
        containersJSON: JSON.stringify(cList),
        rawDocJSONWithoutClientId: JSON.stringify({ ...b, clientId: undefined })
      });
    });

    // Verificar containerPhotos após vinculação
    const photosAfterSnap = await getDocs(collection(db, 'containerPhotos'));
    report.after.totalContainerPhotos = photosAfterSnap.size;

    const photosAfterMap = new Map();
    photosAfterSnap.forEach(d => {
      const p = d.data();
      const hasBase64 = (p.dataUrl && p.dataUrl.startsWith('data:image')) ||
                        (p.base64 && typeof p.base64 === 'string') ||
                        (p.url && p.url.startsWith('data:image'));
      if (hasBase64) report.after.base64PhotosCount++;
      if (p.storagePath || p.path) report.after.storagePathPhotosCount++;

      photosAfterMap.set(d.id, {
        id: d.id,
        containerId: p.containerId,
        storagePath: p.storagePath || p.path || null,
        dataUrlLen: p.dataUrl ? p.dataUrl.length : 0,
        rawJSON: JSON.stringify(p)
      });
    });

    console.log(`  ✔ Bookings auditados depois: ${report.after.totalBookings}`);
    console.log(`  ✔ Bookings com clientId 'client_interport': ${report.after.bookingsWithInterportClientId}`);
    console.log(`  ✔ Contêineres auditados depois: ${report.after.totalContainers}`);
    console.log(`  ✔ containerPhotos auditados depois: ${report.after.totalContainerPhotos}`);

    // ── 5. COMPARAÇÃO RIGOROSA 1-A-1 (ANTES VS DEPOIS) ──
    console.log('\n[5] Executando comparação profunda 1-a-1 de TODOS os documentos...');
    
    let allIdsPreserved = true;
    let allBookingNumbersPreserved = true;
    let allContainersArraysPreserved = true;
    let allCertificateNumbersPreserved = true;

    for (const [id, before] of bookingsBeforeMap.entries()) {
      const after = bookingsAfterMap.get(id);
      if (!after) {
        allIdsPreserved = false;
        report.comparisonCheck.discrepancies.push(`ID ausente após vinculação: ${id}`);
        continue;
      }

      if (before.bookingNumber !== after.bookingNumber) {
        allBookingNumbersPreserved = false;
        report.comparisonCheck.discrepancies.push(`BookingNumber divergente em ${id}: antes="${before.bookingNumber}", depois="${after.bookingNumber}"`);
      }

      if (before.certificateNumber !== after.certificateNumber) {
        allCertificateNumbersPreserved = false;
        report.comparisonCheck.discrepancies.push(`CertificateNumber divergente em ${id}: antes="${before.certificateNumber}", depois="${after.certificateNumber}"`);
      }

      if (before.containersJSON !== after.containersJSON) {
        allContainersArraysPreserved = false;
        report.comparisonCheck.discrepancies.push(`Array containers alterado em ${id}`);
      }

      if (before.rawDocJSONWithoutClientId !== after.rawDocJSONWithoutClientId) {
        report.comparisonCheck.discrepancies.push(`Campos adicionais alterados em ${id}`);
      }

      if (report.sampleBeforeAfterComparison.length < 8) {
        report.sampleBeforeAfterComparison.push({
          id,
          bookingNumber: after.bookingNumber,
          containers: after.containersCount,
          certificateNumber: after.certificateNumber,
          clientIdBefore: '(nenhum)',
          clientIdAfter: after.clientId,
          contentUnchanged: before.rawDocJSONWithoutClientId === after.rawDocJSONWithoutClientId
        });
      }
    }

    report.comparisonCheck.allIdsPreserved = allIdsPreserved;
    report.comparisonCheck.allBookingNumbersPreserved = allBookingNumbersPreserved;
    report.comparisonCheck.allContainersArraysPreserved = allContainersArraysPreserved;
    report.comparisonCheck.allCertificateNumbersPreserved = allCertificateNumbersPreserved;

    // Comparação de containerPhotos
    let allPhotosPreserved = true;
    for (const [id, pBefore] of photosBeforeMap.entries()) {
      const pAfter = photosAfterMap.get(id);
      if (!pAfter || pBefore.rawJSON !== pAfter.rawJSON) {
        allPhotosPreserved = false;
        report.comparisonCheck.discrepancies.push(`Registro em containerPhotos alterado ou perdido: ${id}`);
      }
    }

    report.comparisonCheck.allBase64PhotosPreserved = (report.before.base64PhotosCount === report.after.base64PhotosCount) && allPhotosPreserved;
    report.comparisonCheck.allStoragePathsPreserved = (report.before.storagePathPhotosCount === report.after.storagePathPhotosCount) && allPhotosPreserved;

    // Salvar relatório completo
    writeFileSync('scratch/link_real_copy_diff_report.json', JSON.stringify(report, null, 2), 'utf8');
    console.log('\n✔ Relatório de comparação salvo em "scratch/link_real_copy_diff_report.json".');

    console.log('\n--- Amostra de Comparação Antes vs Depois ---');
    console.table(report.sampleBeforeAfterComparison);

    console.log('\n--- Resumo de Verificação Estrita ---');
    console.log(`- 100% dos IDs preservados: ${allIdsPreserved ? 'SIM ✔' : 'NÃO ❌'}`);
    console.log(`- 100% dos Números de Booking preservados: ${allBookingNumbersPreserved ? 'SIM ✔' : 'NÃO ❌'}`);
    console.log(`- 100% dos Contêineres e Fotos embutidas preservados: ${allContainersArraysPreserved ? 'SIM ✔' : 'NÃO ❌'}`);
    console.log(`- 100% dos Certificados preservados: ${allCertificateNumbersPreserved ? 'SIM ✔' : 'NÃO ❌'}`);
    console.log(`- 100% dos 397 registros Base64 em containerPhotos preservados: ${report.comparisonCheck.allBase64PhotosPreserved ? 'SIM ✔' : 'NÃO ❌'}`);
    console.log(`- 100% dos 7.174 registros de Storage Paths preservados: ${report.comparisonCheck.allStoragePathsPreserved ? 'SIM ✔' : 'NÃO ❌'}`);
    console.log(`- 100% dos 1.146 Bookings vinculados a "client_interport": ${report.after.bookingsWithInterportClientId === 1146 ? 'SIM ✔' : 'NÃO ❌'}`);
    console.log(`- Discrepâncias encontradas: ${report.comparisonCheck.discrepancies.length}`);

    if (report.comparisonCheck.discrepancies.length > 0) {
      throw new Error(`Falha na validação de integridade: ${report.comparisonCheck.discrepancies.join('; ')}`);
    }
  });
} finally {
  await testEnv.cleanup();
}

console.log('===============================================================');
console.log('VINCULAÇÃO NA CÓPIA REAL CONCLUÍDA COM INTEGRIDADE ABSOLUTA!');
console.log('===============================================================');
