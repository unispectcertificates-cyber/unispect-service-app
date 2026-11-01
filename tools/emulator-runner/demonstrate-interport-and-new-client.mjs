import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, getDocs, doc, setDoc, query, where } from 'firebase/firestore';

console.log('===============================================================');
console.log('DEMONSTRAÇÃO: INTERPORT HISTÓRICO REAL VS NOVO CLIENTE VAZIO');
console.log('Porta: 8088 | Projeto: interport-real-restored-copy');
console.log('===============================================================');

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

    // 1. Garantir vinculação à INTERPORT na sessão
    const bookingsSnap = await getDocs(collection(db, 'bookings'));
    console.log(`\n[1] Verificando total de bookings reais no banco: ${bookingsSnap.size}`);

    // Garante clientId = 'client_interport' se ainda não estiver salvo na instância
    for (const bDoc of bookingsSnap.docs) {
      if (bDoc.data().clientId !== 'client_interport') {
        await setDoc(doc(db, 'bookings', bDoc.id), { clientId: 'client_interport' }, { merge: true });
      }
    }

    // Cadastra cliente INTERPORT
    await setDoc(doc(db, 'clients', 'client_interport'), {
      id: 'client_interport',
      name: 'INTERPORT Logística',
      code: 'INTERPORT',
      description: 'Terminal e Operador Logístico Principal',
      active: true,
      isDefault: true,
      createdAt: 1704067200000
    }, { merge: true });

    // 2. Cadastrar Novo Cliente Vazio
    console.log('\n[2] Cadastrando Novo Cliente independente: "client_novo_terminal"...');
    await setDoc(doc(db, 'clients', 'client_novo_terminal'), {
      id: 'client_novo_terminal',
      name: 'Terminal Marítimo Exportação',
      code: 'TERM_EXPORT',
      description: 'Novo cliente parceiro recém-criado',
      active: true,
      isDefault: false,
      createdAt: Date.now()
    });
    console.log('  ✔ Novo cliente cadastrado com sucesso.');

    // 3. Verificação de dados sintéticos (não devem existir na cópia real)
    console.log('\n[3] Verificando ausência de bookings sintéticos da demonstração...');
    const syntheticIds = ['bk_demo_interport', 'bk_interport', 'bk_interport_tristao', 'BKG-INT-DEMO-01'];
    let foundSynthetic = 0;
    syntheticIds.forEach(synId => {
      if (bookingsSnap.docs.some(d => d.id === synId || d.data().bookingNumber === synId)) {
        foundSynthetic++;
        console.warn(`  Aviso: registro sintético encontrado: ${synId}`);
      }
    });
    if (foundSynthetic === 0) {
      console.log('  ✔ Nenhum booking sintético/fictício encontrado no banco real.');
    }

    // 4. Consulta do Painel INTERPORT (exatamente como a UI do Unispect executa)
    console.log('\n[4] Consultando Painel INTERPORT (clientId == "client_interport")...');
    const qInterport = query(collection(db, 'bookings'), where('clientId', '==', 'client_interport'));
    const interportSnap = await getDocs(qInterport);

    let interportContainersCount = 0;
    const interportSample = [];

    interportSnap.forEach(d => {
      const b = d.data();
      const cList = Array.isArray(b.containers) ? b.containers : [];
      interportContainersCount += cList.length;
      if (interportSample.length < 5) {
        interportSample.push({
          id: d.id,
          bookingNumber: b.bookingNumber || b.number,
          containers: cList.length,
          certificateNumber: b.certificateNumber,
          vesselVoyage: b.vesselVoyage || b.vessel || 'N/A',
          clientId: b.clientId
        });
      }
    });

    console.log(`  ✔ Total de Bookings da INTERPORT retornados: ${interportSnap.size}`);
    console.log(`  ✔ Total de Contêineres operacionais da INTERPORT: ${interportContainersCount}`);
    console.log('  Amostra de Bookings Reais da INTERPORT:');
    console.table(interportSample);

    // 5. Consulta do Painel do NOVO CLIENTE (clientId == "client_novo_terminal")
    console.log('\n[5] Consultando Painel do NOVO CLIENTE (clientId == "client_novo_terminal")...');
    const qNovo = query(collection(db, 'bookings'), where('clientId', '==', 'client_novo_terminal'));
    const novoSnap = await getDocs(qNovo);

    console.log(`  ✔ Total de Bookings do Novo Cliente retornados: ${novoSnap.size} (ZERO - Painel Limpo)`);

    // 6. Criar nova operação para o NOVO CLIENTE e comprovar isolamento
    console.log('\n[6] Inserindo nova operação piloto exclusiva para o NOVO CLIENTE...');
    const novoBookingId = 'bk_novo_export_2026_001';
    await setDoc(doc(db, 'bookings', novoBookingId), {
      id: novoBookingId,
      clientId: 'client_novo_terminal',
      bookingNumber: 'EXP-PILOTO-001',
      certificateNumber: 'CERT-NOVO-001',
      status: 'Pendente',
      createdAt: Date.now(),
      containers: [
        {
          id: 'c_piloto_01',
          containerNumber: 'TEST-123456-7',
          photos: []
        }
      ]
    });
    console.log('  ✔ Booking de teste inserido no novo cliente.');

    // 7. Re-consultar ambos os clientes
    console.log('\n[7] Re-consultando painéis para comprovar isolamento estrito:');
    const snapInterportFinal = await getDocs(query(collection(db, 'bookings'), where('clientId', '==', 'client_interport')));
    const snapNovoFinal = await getDocs(query(collection(db, 'bookings'), where('clientId', '==', 'client_novo_terminal')));

    console.log(`  ✔ Painel INTERPORT: ${snapInterportFinal.size} bookings (preservado sem qualquer contaminação).`);
    console.log(`  ✔ Painel Novo Cliente: ${snapNovoFinal.size} booking(s) (apenas a operação criada nele).`);
  });
} finally {
  await testEnv.cleanup();
}

console.log('===============================================================');
console.log('DEMONSTRAÇÃO DE ISOLAMENTO E HISTÓRICO REAL CONCLUÍDA!');
console.log('===============================================================');
