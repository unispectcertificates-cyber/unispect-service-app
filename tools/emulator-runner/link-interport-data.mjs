import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';

console.log('===============================================================');
console.log('VINCULAÇÃO DE CONTEÚDO OPERACIONAL À INTERPORT (CÓPIA LOCAL)');
console.log('===============================================================');

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-unispect-test',
  firestore: {
    host: '127.0.0.1',
    port: 8080
  }
});

await testEnv.withSecurityRulesDisabled(async (adminContext) => {
  const db = adminContext.firestore();

  // 1. Cadastrar INTERPORT na coleção 'clients' se não existir
  console.log('\n1. Verificando cadastro do cliente INTERPORT...');
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
  console.log('✔ Cliente INTERPORT cadastrado/garantido com ID "client_interport".');

  // 2. Auditoria ANTES da vinculação
  console.log('\n2. Auditoria ANTES da vinculação:');
  const snapBefore = await getDocs(collection(db, 'bookings'));
  console.log(`Total de bookings encontrados: ${snapBefore.size}`);
  
  const beforeAudit = [];
  snapBefore.forEach(d => {
    const data = d.data();
    beforeAudit.push({
      id: d.id,
      bookingNumber: data.bookingNumber || data.number,
      containersCount: data.containers?.length || 0,
      certificateNumber: data.certificateNumber || 'N/A',
      currentClientId: data.clientId || '(nenhum)'
    });
  });
  console.table(beforeAudit);

  // 3. Execução da vinculação
  console.log('\n3. Vinculando bookings existentes à INTERPORT (preservando IDs e integridade)...');
  let linkedCount = 0;
  for (const item of beforeAudit) {
    // Se não tiver clientId ou já for da Interport, garante client_interport
    if (!item.currentClientId || item.currentClientId === '(nenhum)' || item.currentClientId === 'client_interport') {
      await updateDoc(doc(db, 'bookings', item.id), {
        clientId: 'client_interport'
      });
      linkedCount++;
    }
  }
  console.log(`✔ ${linkedCount} booking(s) vinculado(s) explicitamente a INTERPORT.`);

  // 4. Auditoria DEPOIS da vinculação
  console.log('\n4. Auditoria DEPOIS da vinculação:');
  const snapAfter = await getDocs(collection(db, 'bookings'));
  const afterAudit = [];
  snapAfter.forEach(d => {
    const data = d.data();
    afterAudit.push({
      id: d.id,
      bookingNumber: data.bookingNumber || data.number,
      containersCount: data.containers?.length || 0,
      certificateNumber: data.certificateNumber || 'N/A',
      newClientId: data.clientId
    });
  });
  console.table(afterAudit);

  // 5. Verificação de integridade estrita
  console.log('\n5. Verificação de integridade estrita:');
  if (snapBefore.size !== snapAfter.size) {
    throw new Error(`Contagem divergente! Antes: ${snapBefore.size}, Depois: ${snapAfter.size}`);
  }
  for (let i = 0; i < beforeAudit.length; i++) {
    const b = beforeAudit[i];
    const a = afterAudit.find(x => x.id === b.id);
    if (!a) throw new Error(`ID perdido: ${b.id}`);
    if (a.bookingNumber !== b.bookingNumber) throw new Error(`BookingNumber alterado: ${b.id}`);
    if (a.containersCount !== b.containersCount) throw new Error(`ContainersCount alterado: ${b.id}`);
    if (a.certificateNumber !== b.certificateNumber) throw new Error(`CertificateNumber alterado: ${b.id}`);
  }
  console.log('✔ Todos os IDs, números de certificados e listas de contêineres foram 100% preservados.');

  // Listar clientes atuais
  const clientsSnap = await getDocs(collection(db, 'clients'));
  console.log(`\nClientes cadastrados na coleção 'clients' (${clientsSnap.size}):`);
  clientsSnap.forEach(d => {
    console.log(`- [${d.id}] ${d.data().name} (${d.data().code})`);
  });
});

console.log('\n===============================================================');
console.log('VINCULAÇÃO E AUDITORIA CONCLUÍDAS COM SUCESSO!');
console.log('===============================================================');
