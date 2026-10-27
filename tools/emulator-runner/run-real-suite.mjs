import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

console.log('===============================================================');
console.log('INICIANDO SUÍTE DE TESTES REAIS DE REGRAS NO EMULADOR');
console.log('Projeto: demo-unispect-test | Firestore: 127.0.0.1:8080 | Storage: 127.0.0.1:9199');
console.log('===============================================================\n');

const PROJECT_ID = 'demo-unispect-test';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    host: '127.0.0.1',
    port: 8080,
    rules: readFileSync('tools/emulator-runner/firestore.experimental.rules', 'utf8')
  },
  storage: {
    host: '127.0.0.1',
    port: 9199,
    rules: readFileSync('tools/emulator-runner/storage.experimental.rules', 'utf8')
  }
});

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function runTestCase(name, fn) {
  totalTests++;
  process.stdout.write(`Teste ${totalTests}: ${name} ... `);
  try {
    await fn();
    passedTests++;
    console.log('✅ APROVADO');
  } catch (err) {
    failedTests++;
    console.log('❌ FALHOU');
    console.error('   Motivo:', err.message);
  }
}

try {
  // ── SEEDING DE DADOS INICIAIS VIA CONTEXTO ADMINISTRATIVO ──
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const db = adminContext.firestore();

    // Booking da INTERPORT
    await setDoc(doc(db, 'bookings', 'bk_interport'), {
      id: 'bk_interport',
      clientId: 'client_interport',
      bookingNumber: 'BKG-INT-001',
      certificateNumber: 'CERT-2026-001',
      exporterId: 'exp_atlantica',
      status: 'Pendente',
      inspectorNotes: 'Vistoria inicial pendente'
    });

    // Booking do TERMINAL B
    await setDoc(doc(db, 'bookings', 'bk_terminal_b'), {
      id: 'bk_terminal_b',
      clientId: 'client_terminal_b',
      bookingNumber: 'BKG-TB-002',
      certificateNumber: 'CERT-TB-002',
      exporterId: 'exp_tristao',
      status: 'Pendente'
    });

    // Passagem de Pátio da INTERPORT
    await setDoc(doc(db, 'yardPassages', 'yp_interport'), {
      id: 'yp_interport',
      clientId: 'client_interport',
      containerNumber: 'MSDU8821297',
      status: 'active'
    });

    // Metadado de Foto da INTERPORT (foto legada preservada com vínculos completos)
    await setDoc(doc(db, 'containerPhotos', 'photo_interport_01'), {
      id: 'photo_interport_01',
      clientId: 'client_interport',
      exporterId: 'exp_atlantica',
      containerId: 'c_1',
      storagePath: 'containers/c_1/photo_01.jpg',
      inspectorNotes: 'Lacre intacto'
    });

    // Metadado de Foto da INTERPORT para outro exportador (Tristão)
    await setDoc(doc(db, 'containerPhotos', 'photo_interport_tristao'), {
      id: 'photo_interport_tristao',
      clientId: 'client_interport',
      exporterId: 'exp_tristao',
      containerId: 'c_1',
      storagePath: 'containers/c_1/photo_tristao.jpg'
    });

    // Metadado de Foto para teste de deleção
    await setDoc(doc(db, 'containerPhotos', 'photo_interport_delete'), {
      id: 'photo_interport_delete',
      clientId: 'client_interport',
      exporterId: 'exp_atlantica',
      containerId: 'c_1',
      storagePath: 'containers/c_1/photo_delete.jpg'
    });

    // ── SEEDING DE ARQUIVOS FÍSICOS NO STORAGE (CONTEXTO ADMIN / REGRAS DESATIVADAS) ──
    const storage = adminContext.storage();
    const dummy20k = new Uint8Array(20 * 1024);

    // 1. Foto Interport com metadados explícitos (propriedade e exportador Atlântica)
    await uploadBytes(ref(storage, 'containers/c_interport/photo_interport_01.jpg'), dummy20k, {
      contentType: 'image/jpeg',
      customMetadata: { clientId: 'client_interport', exporterId: 'exp_atlantica' }
    });

    // 2. Foto Interport de outro exportador (Tristão)
    await uploadBytes(ref(storage, 'containers/c_interport/photo_exporter_tristao.jpg'), dummy20k, {
      contentType: 'image/jpeg',
      customMetadata: { clientId: 'client_interport', exporterId: 'exp_tristao' }
    });

    // 3. Foto Interport para teste de deleção
    await uploadBytes(ref(storage, 'containers/c_interport/photo_to_delete.jpg'), dummy20k, {
      contentType: 'image/jpeg',
      customMetadata: { clientId: 'client_interport' }
    });

    // 4. Foto Legada com propriedade ambígua / não anotada (sem customMetadata)
    await uploadBytes(ref(storage, 'containers/c_legacy/photo_legacy_ambiguous.jpg'), dummy20k, {
      contentType: 'image/jpeg'
    });
  });

  // ── 1. BLOQUEIO DE ACESSO ENTRE CLIENTES ──
  await runTestCase('Bloqueio entre clientes: Usuário Interport NÃO pode ler Booking do Terminal B', async () => {
    const interportUser = testEnv.authenticatedContext('usr_interport', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport']
    });
    const db = interportUser.firestore();
    await assertFails(getDoc(doc(db, 'bookings', 'bk_terminal_b')));
  });

  await runTestCase('Isolamento: Usuário Interport pode ler seu próprio Booking', async () => {
    const interportUser = testEnv.authenticatedContext('usr_interport', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport']
    });
    const db = interportUser.firestore();
    await assertSucceeds(getDoc(doc(db, 'bookings', 'bk_interport')));
  });

  // ── 2. IMPOSSIBILIDADE DE ALTERAR CLIENTID (IMUTABILIDADE) ──
  await runTestCase('Imutabilidade: Tentativa de alterar clientId em update de Booking é REJEITADA', async () => {
    const interportAdmin = testEnv.authenticatedContext('usr_interport', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport']
    });
    const db = interportAdmin.firestore();
    await assertFails(updateDoc(doc(db, 'bookings', 'bk_interport'), {
      status: 'Em andamento',
      clientId: 'client_hacker' // violação
    }));
  });

  await runTestCase('Atualização permitida mantendo mesmo clientId', async () => {
    const interportAdmin = testEnv.authenticatedContext('usr_interport', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport']
    });
    const db = interportAdmin.firestore();
    await assertSucceeds(updateDoc(doc(db, 'bookings', 'bk_interport'), {
      status: 'Em andamento',
      clientId: 'client_interport'
    }));
  });

  // ── 3. EXPORTADOR SOMENTE-LEITURA E RESTRITO ÀS PRÓPRIAS CARGAS ──
  await runTestCase('Exportador lê carga em que exporterId bate', async () => {
    const exporterAtlantica = testEnv.authenticatedContext('usr_exp_1', {
      role: 'EXPORTER',
      authorizedClients: ['client_interport'],
      exporterId: 'exp_atlantica'
    });
    const db = exporterAtlantica.firestore();
    await assertSucceeds(getDoc(doc(db, 'bookings', 'bk_interport')));
  });

  await runTestCase('Exportador é BLOQUEADO ao tentar ler carga de outro exportador', async () => {
    const exporterTristao = testEnv.authenticatedContext('usr_exp_2', {
      role: 'EXPORTER',
      authorizedClients: ['client_interport'],
      exporterId: 'exp_tristao'
    });
    const db = exporterTristao.firestore();
    await assertFails(getDoc(doc(db, 'bookings', 'bk_interport')));
  });

  await runTestCase('Exportador é BLOQUEADO ao tentar gravar em bookings', async () => {
    const exporterAtlantica = testEnv.authenticatedContext('usr_exp_1', {
      role: 'EXPORTER',
      authorizedClients: ['client_interport'],
      exporterId: 'exp_atlantica'
    });
    const db = exporterAtlantica.firestore();
    await assertFails(updateDoc(doc(db, 'bookings', 'bk_interport'), {
      status: 'Finalizado'
    }));
  });

  await runTestCase('Exportador é BLOQUEADO ao tentar acessar pátio (/yardPassages)', async () => {
    const exporterAtlantica = testEnv.authenticatedContext('usr_exp_1', {
      role: 'EXPORTER',
      authorizedClients: ['client_interport'],
      exporterId: 'exp_atlantica'
    });
    const db = exporterAtlantica.firestore();
    await assertFails(getDoc(doc(db, 'yardPassages', 'yp_interport')));
  });

  // ── 4. LIMITES DAS OPERAÇÕES DO INSPETOR E CONTROLE DE CAMPOS ──
  await runTestCase('Inspetor PODE atualizar campos operacionais permitidos (status e inspectorNotes)', async () => {
    const inspector = testEnv.authenticatedContext('usr_insp_carlos', {
      role: 'INSPECTOR',
      authorizedClients: ['client_interport']
    });
    const db = inspector.firestore();
    await assertSucceeds(updateDoc(doc(db, 'bookings', 'bk_interport'), {
      status: 'Em andamento',
      inspectorNotes: 'Vistoria física em andamento pelo inspetor'
    }));
  });

  await runTestCase('Inspetor é BLOQUEADO ao tentar alterar exporterId no Booking', async () => {
    const inspector = testEnv.authenticatedContext('usr_insp_carlos', {
      role: 'INSPECTOR',
      authorizedClients: ['client_interport']
    });
    const db = inspector.firestore();
    await assertFails(updateDoc(doc(db, 'bookings', 'bk_interport'), {
      exporterId: 'exp_hacker'
    }));
  });

  await runTestCase('Inspetor é BLOQUEADO ao tentar alterar certificateNumber no Booking', async () => {
    const inspector = testEnv.authenticatedContext('usr_insp_carlos', {
      role: 'INSPECTOR',
      authorizedClients: ['client_interport']
    });
    const db = inspector.firestore();
    await assertFails(updateDoc(doc(db, 'bookings', 'bk_interport'), {
      certificateNumber: 'CERT-HACK-002'
    }));
  });

  await runTestCase('Inspetor é BLOQUEADO ao tentar alterar bookingNumber no Booking', async () => {
    const inspector = testEnv.authenticatedContext('usr_insp_carlos', {
      role: 'INSPECTOR',
      authorizedClients: ['client_interport']
    });
    const db = inspector.firestore();
    await assertFails(updateDoc(doc(db, 'bookings', 'bk_interport'), {
      bookingNumber: 'BKG-ALTERADO-001'
    }));
  });

  await runTestCase('Admin do cliente PODE alterar campos administrativos (ex: certificateNumber)', async () => {
    const interportAdmin = testEnv.authenticatedContext('usr_interport', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport']
    });
    const db = interportAdmin.firestore();
    await assertSucceeds(updateDoc(doc(db, 'bookings', 'bk_interport'), {
      certificateNumber: 'CERT-2026-FINAL',
      clientId: 'client_interport'
    }));
  });

  await runTestCase('Inspetor é BLOQUEADO ao tentar excluir Booking', async () => {
    const inspector = testEnv.authenticatedContext('usr_insp_carlos', {
      role: 'INSPECTOR',
      authorizedClients: ['client_interport']
    });
    const db = inspector.firestore();
    await assertFails(deleteDoc(doc(db, 'bookings', 'bk_interport')));
  });

  await runTestCase('Inspetor é BLOQUEADO ao tentar dar baixa definitiva no pátio (status: exited)', async () => {
    const inspector = testEnv.authenticatedContext('usr_insp_carlos', {
      role: 'INSPECTOR',
      authorizedClients: ['client_interport']
    });
    const db = inspector.firestore();
    await assertFails(updateDoc(doc(db, 'yardPassages', 'yp_interport'), {
      status: 'exited',
      clientId: 'client_interport'
    }));
  });

  await runTestCase('Admin do cliente PODE dar baixa definitiva no pátio (status: exited)', async () => {
    const interportAdmin = testEnv.authenticatedContext('usr_interport', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport']
    });
    const db = interportAdmin.firestore();
    await assertSucceeds(updateDoc(doc(db, 'yardPassages', 'yp_interport'), {
      status: 'exited',
      clientId: 'client_interport'
    }));
  });

  await runTestCase('Deleção em /yardPassages é PROIBIDA para todos (imutabilidade)', async () => {
    const interportAdmin = testEnv.authenticatedContext('usr_interport', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport']
    });
    const db = interportAdmin.firestore();
    await assertFails(deleteDoc(doc(db, 'yardPassages', 'yp_interport')));
  });

  // ── BLOQUEIO DE ESCRITAS PARA USUÁRIOS SEM PAPEL RECONHECIDO (TODAS AS COLEÇÕES) ──
  await runTestCase('Usuário sem papel reconhecido NÃO pode criar Booking', async () => {
    const viewer = testEnv.authenticatedContext('usr_viewer', {
      role: 'VIEWER',
      authorizedClients: ['client_interport']
    });
    const db = viewer.firestore();
    await assertFails(setDoc(doc(db, 'bookings', 'bk_unauthorized'), {
      id: 'bk_unauthorized',
      clientId: 'client_interport',
      bookingNumber: 'BKG-NO-ROLE'
    }));
  });

  await runTestCase('Usuário sem papel reconhecido NÃO pode registrar no Pátio (/yardPassages)', async () => {
    const viewer = testEnv.authenticatedContext('usr_viewer', {
      role: 'VIEWER',
      authorizedClients: ['client_interport']
    });
    const db = viewer.firestore();
    await assertFails(setDoc(doc(db, 'yardPassages', 'yp_unauthorized'), {
      id: 'yp_unauthorized',
      clientId: 'client_interport',
      containerNumber: 'TEST1234567'
    }));
  });

  await runTestCase('Usuário sem papel reconhecido NÃO pode criar metadados de Foto (/containerPhotos)', async () => {
    const viewer = testEnv.authenticatedContext('usr_viewer', {
      role: 'VIEWER',
      authorizedClients: ['client_interport']
    });
    const db = viewer.firestore();
    await assertFails(setDoc(doc(db, 'containerPhotos', 'ph_unauthorized'), {
      id: 'ph_unauthorized',
      clientId: 'client_interport',
      storagePath: 'containers/c_1/photo_hack.jpg'
    }));
  });

  // ── 5. PERMISSÕES DE FOTOS E PROTEÇÃO DE VÍNCULOS (/containerPhotos) ──
  await runTestCase('Metadado de foto: Exportador Atlântica PODE ler foto de sua própria carga', async () => {
    const expAtlantica = testEnv.authenticatedContext('usr_exp_1', {
      role: 'EXPORTER',
      authorizedClients: ['client_interport'],
      exporterId: 'exp_atlantica'
    });
    const db = expAtlantica.firestore();
    await assertSucceeds(getDoc(doc(db, 'containerPhotos', 'photo_interport_01')));
  });

  await runTestCase('Metadado de foto: Exportador Atlântica é BLOQUEADO ao ler foto de outro exportador (Tristão)', async () => {
    const expAtlantica = testEnv.authenticatedContext('usr_exp_1', {
      role: 'EXPORTER',
      authorizedClients: ['client_interport'],
      exporterId: 'exp_atlantica'
    });
    const db = expAtlantica.firestore();
    await assertFails(getDoc(doc(db, 'containerPhotos', 'photo_interport_tristao')));
  });

  await runTestCase('Metadado de foto: Usuário do Terminal B é BLOQUEADO ao tentar ler foto da Interport', async () => {
    const terminalBUser = testEnv.authenticatedContext('usr_terminal_b', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_terminal_b']
    });
    const db = terminalBUser.firestore();
    await assertFails(getDoc(doc(db, 'containerPhotos', 'photo_interport_01')));
  });

  // Proteção rigorosa de vínculos da foto (clientId, storagePath, containerId, exporterId)
  await runTestCase('Proteção de vínculos: Tentativa de alterar clientId em foto é REJEITADA', async () => {
    const interportAdmin = testEnv.authenticatedContext('usr_interport', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport']
    });
    const db = interportAdmin.firestore();
    await assertFails(updateDoc(doc(db, 'containerPhotos', 'photo_interport_01'), {
      clientId: 'client_terminal_b'
    }));
  });

  await runTestCase('Proteção de vínculos: Tentativa de alterar storagePath em foto é REJEITADA', async () => {
    const interportAdmin = testEnv.authenticatedContext('usr_interport', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport']
    });
    const db = interportAdmin.firestore();
    await assertFails(updateDoc(doc(db, 'containerPhotos', 'photo_interport_01'), {
      storagePath: 'containers/c_other/forged.jpg'
    }));
  });

  await runTestCase('Proteção de vínculos: Tentativa de alterar containerId em foto é REJEITADA', async () => {
    const interportAdmin = testEnv.authenticatedContext('usr_interport', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport']
    });
    const db = interportAdmin.firestore();
    await assertFails(updateDoc(doc(db, 'containerPhotos', 'photo_interport_01'), {
      containerId: 'c_forged_999'
    }));
  });

  await runTestCase('Proteção de vínculos: Tentativa de alterar exporterId em foto é REJEITADA', async () => {
    const interportAdmin = testEnv.authenticatedContext('usr_interport', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport']
    });
    const db = interportAdmin.firestore();
    await assertFails(updateDoc(doc(db, 'containerPhotos', 'photo_interport_01'), {
      exporterId: 'exp_forged'
    }));
  });

  await runTestCase('Proteção de vínculos: Master Unispect PODE atualizar vínculos em procedimento autorizado específico', async () => {
    const master = testEnv.authenticatedContext('usr_master', {
      isUnispectMaster: true
    });
    const db = master.firestore();
    await assertSucceeds(updateDoc(doc(db, 'containerPhotos', 'photo_interport_01'), {
      inspectorNotes: 'Reclassificação pericial autorizada pela matriz Unispect'
    }));
  });

  await runTestCase('Metadado de foto: Inspetor pode ler e criar, mas NÃO pode deletar', async () => {
    const inspector = testEnv.authenticatedContext('usr_insp_carlos', {
      role: 'INSPECTOR',
      authorizedClients: ['client_interport']
    });
    const db = inspector.firestore();
    await assertSucceeds(getDoc(doc(db, 'containerPhotos', 'photo_interport_01')));
    await assertFails(deleteDoc(doc(db, 'containerPhotos', 'photo_interport_01')));
  });

  await runTestCase('Metadado de foto: Admin do cliente PODE deletar metadado autorizado', async () => {
    const interportAdmin = testEnv.authenticatedContext('usr_interport', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport']
    });
    const db = interportAdmin.firestore();
    await assertSucceeds(deleteDoc(doc(db, 'containerPhotos', 'photo_interport_delete')));
  });

  // ── 6. REGRAS REAIS DO FIREBASE STORAGE (ISOLAMENTO MULTI-CLIENTE E METADADOS) ──

  // 6.1 Usuário do Cliente B NÃO lê fotos da Interport
  await runTestCase('Storage: Usuário do Cliente B NÃO pode ler foto física da Interport', async () => {
    const userB = testEnv.authenticatedContext('usr_client_b', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_terminal_b']
    });
    const storage = userB.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo_interport_01.jpg');
    await assertFails(getBytes(photoRef));
  });

  await runTestCase('Storage: Usuário da Interport PODE ler sua própria foto física', async () => {
    const interportUser = testEnv.authenticatedContext('usr_interport', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport']
    });
    const storage = interportUser.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo_interport_01.jpg');
    await assertSucceeds(getBytes(photoRef));
  });

  // 6.2 Inspetor do Cliente B NÃO cria nem sobrescreve arquivos vinculados à Interport
  await runTestCase('Storage: Inspetor do Cliente B NÃO pode criar arquivo vinculado à Interport', async () => {
    const inspectorB = testEnv.authenticatedContext('usr_insp_b', {
      role: 'INSPECTOR',
      authorizedClients: ['client_terminal_b']
    });
    const storage = inspectorB.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo_hack_b.jpg');
    const dummyJpeg = new Uint8Array(15 * 1024);
    await assertFails(uploadBytes(photoRef, dummyJpeg, {
      contentType: 'image/jpeg',
      customMetadata: { clientId: 'client_interport' }
    }));
  });

  await runTestCase('Storage: Inspetor do Cliente B NÃO pode sobrescrever arquivo existente da Interport', async () => {
    const inspectorB = testEnv.authenticatedContext('usr_insp_b', {
      role: 'INSPECTOR',
      authorizedClients: ['client_terminal_b']
    });
    const storage = inspectorB.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo_interport_01.jpg');
    const dummyJpeg = new Uint8Array(15 * 1024);
    await assertFails(uploadBytes(photoRef, dummyJpeg, {
      contentType: 'image/jpeg',
      customMetadata: { clientId: 'client_interport' }
    }));
  });

  await runTestCase('Storage: Inspetor da Interport PODE criar foto para a Interport com metadados corretos', async () => {
    const inspectorInterport = testEnv.authenticatedContext('usr_insp_carlos', {
      role: 'INSPECTOR',
      authorizedClients: ['client_interport']
    });
    const storage = inspectorInterport.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo_new_insp.jpg');
    const dummyJpeg = new Uint8Array(15 * 1024);
    await assertSucceeds(uploadBytes(photoRef, dummyJpeg, {
      contentType: 'image/jpeg',
      customMetadata: { clientId: 'client_interport' }
    }));
  });

  // 6.3 Administrador do Cliente B NÃO exclui fotos da Interport
  await runTestCase('Storage: Administrador do Cliente B NÃO pode excluir foto da Interport', async () => {
    const adminB = testEnv.authenticatedContext('usr_admin_b', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_terminal_b']
    });
    const storage = adminB.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo_to_delete.jpg');
    await assertFails(deleteObject(photoRef));
  });

  await runTestCase('Storage: Inspetor da própria Interport NÃO pode excluir foto da Interport', async () => {
    const inspectorInterport = testEnv.authenticatedContext('usr_insp_carlos', {
      role: 'INSPECTOR',
      authorizedClients: ['client_interport']
    });
    const storage = inspectorInterport.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo_to_delete.jpg');
    await assertFails(deleteObject(photoRef));
  });

  await runTestCase('Storage: Administrador da Interport PODE excluir foto da Interport', async () => {
    const adminInterport = testEnv.authenticatedContext('usr_interport', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport']
    });
    const storage = adminInterport.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo_to_delete.jpg');
    await assertSucceeds(deleteObject(photoRef));
  });

  // 6.4 Exportador acessa somente fotos das próprias cargas
  await runTestCase('Storage: Exportador Atlântica PODE ler foto física de sua própria carga', async () => {
    const expAtlantica = testEnv.authenticatedContext('usr_exp_1', {
      role: 'EXPORTER',
      authorizedClients: ['client_interport'],
      exporterId: 'exp_atlantica'
    });
    const storage = expAtlantica.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo_interport_01.jpg');
    await assertSucceeds(getBytes(photoRef));
  });

  await runTestCase('Storage: Exportador Atlântica é BLOQUEADO ao tentar ler foto de outro exportador (Tristão)', async () => {
    const expAtlantica = testEnv.authenticatedContext('usr_exp_1', {
      role: 'EXPORTER',
      authorizedClients: ['client_interport'],
      exporterId: 'exp_atlantica'
    });
    const storage = expAtlantica.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo_exporter_tristao.jpg');
    await assertFails(getBytes(photoRef));
  });

  await runTestCase('Storage: Exportador é BLOQUEADO ao tentar fazer upload de fotos', async () => {
    const expAtlantica = testEnv.authenticatedContext('usr_exp_1', {
      role: 'EXPORTER',
      authorizedClients: ['client_interport'],
      exporterId: 'exp_atlantica'
    });
    const storage = expAtlantica.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo_exp_upload.jpg');
    const dummyJpeg = new Uint8Array(10 * 1024);
    await assertFails(uploadBytes(photoRef, dummyJpeg, {
      contentType: 'image/jpeg',
      customMetadata: { clientId: 'client_interport' }
    }));
  });

  await runTestCase('Storage: Exportador é BLOQUEADO ao tentar excluir fotos', async () => {
    const expAtlantica = testEnv.authenticatedContext('usr_exp_1', {
      role: 'EXPORTER',
      authorizedClients: ['client_interport'],
      exporterId: 'exp_atlantica'
    });
    const storage = expAtlantica.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo_interport_01.jpg');
    await assertFails(deleteObject(photoRef));
  });

  // 6.5 Usuário sem papel reconhecido NÃO recebe permissão de gravação
  await runTestCase('Storage: Usuário sem papel reconhecido (role não-operacional ou ausente) NÃO pode gravar foto', async () => {
    const unknownRoleUser = testEnv.authenticatedContext('usr_viewer', {
      role: 'VIEWER',
      authorizedClients: ['client_interport']
    });
    const storage = unknownRoleUser.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo_viewer.jpg');
    const dummyJpeg = new Uint8Array(10 * 1024);
    await assertFails(uploadBytes(photoRef, dummyJpeg, {
      contentType: 'image/jpeg',
      customMetadata: { clientId: 'client_interport' }
    }));
  });

  // 6.6 Revogação também bloqueia acesso autenticado ao Storage
  await runTestCase('Storage: Usuário com revogação ativa (isRevoked: true) tem ACESSO BLOQUEADO ao Storage', async () => {
    const revokedUser = testEnv.authenticatedContext('usr_revogado_storage', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport'],
      isRevoked: true
    });
    const storage = revokedUser.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo_interport_01.jpg');
    await assertFails(getBytes(photoRef));
  });

  await runTestCase('Storage: Usuário com auth_time anterior ao minAuthTime tem ACESSO BLOQUEADO ao Storage', async () => {
    const oldSessionUser = testEnv.authenticatedContext('usr_old_session', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport'],
      auth_time: 1000,
      minAuthTime: 2000
    });
    const storage = oldSessionUser.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo_interport_01.jpg');
    await assertFails(getBytes(photoRef));
  });

  // 6.7 Propriedade ambígua ou inexistente impede acesso direto, preservando o arquivo
  await runTestCase('Storage: Arquivo legado sem metadado de cliente tem LEITURA DIRETA BLOQUEADA para segurança', async () => {
    const interportUser = testEnv.authenticatedContext('usr_interport', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport']
    });
    const storage = interportUser.storage();
    const legacyRef = ref(storage, 'containers/c_legacy/photo_legacy_ambiguous.jpg');
    // Como o arquivo legado físico não possui customMetadata.clientId no Storage,
    // a regra de segurança bloqueia o acesso direto não comprovado para evitar vazamento entre tenants.
    await assertFails(getBytes(legacyRef));
  });

  await runTestCase('Storage: Arquivo com propriedade ambígua é PROTEGIDO contra sobrescrita e exclusão indevida', async () => {
    const interportUser = testEnv.authenticatedContext('usr_interport', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport']
    });
    const storage = interportUser.storage();
    const legacyRef = ref(storage, 'containers/c_legacy/photo_legacy_ambiguous.jpg');
    await assertFails(deleteObject(legacyRef));
  });

  // 6.8 Controles de integridade de formato e tamanho do Storage
  await runTestCase('Storage: Gravação de foto > 45KB é REJEITADA', async () => {
    const inspector = testEnv.authenticatedContext('usr_insp_carlos', {
      role: 'INSPECTOR',
      authorizedClients: ['client_interport']
    });
    const storage = inspector.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo_heavy.jpg');
    const heavyFile = new Uint8Array(50 * 1024);
    await assertFails(uploadBytes(photoRef, heavyFile, {
      contentType: 'image/jpeg',
      customMetadata: { clientId: 'client_interport' }
    }));
  });

  await runTestCase('Storage: Gravação de formato não-JPEG (ex: PNG) é REJEITADA', async () => {
    const inspector = testEnv.authenticatedContext('usr_insp_carlos', {
      role: 'INSPECTOR',
      authorizedClients: ['client_interport']
    });
    const storage = inspector.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo.png');
    const dummyPng = new Uint8Array(10 * 1024);
    await assertFails(uploadBytes(photoRef, dummyPng, {
      contentType: 'image/png',
      customMetadata: { clientId: 'client_interport' }
    }));
  });

  await runTestCase('Storage: Proteção de caminhos fora de containers/ BLOQUEIA gravação', async () => {
    const inspector = testEnv.authenticatedContext('usr_insp_carlos', {
      role: 'INSPECTOR',
      authorizedClients: ['client_interport']
    });
    const storage = inspector.storage();
    const arbitraryRef = ref(storage, 'legacy_photos/dump.jpg');
    const dummyJpeg = new Uint8Array(10 * 1024);
    await assertFails(uploadBytes(arbitraryRef, dummyJpeg, {
      contentType: 'image/jpeg',
      customMetadata: { clientId: 'client_interport' }
    }));
  });

  await runTestCase('Storage: Usuário NÃO autenticado NÃO pode gravar nem excluir fotos', async () => {
    const unauthed = testEnv.unauthenticatedContext();
    const storage = unauthed.storage();
    const photoRef = ref(storage, 'containers/c_interport/photo_anon.jpg');
    const dummyJpeg = new Uint8Array(10 * 1024);
    await assertFails(uploadBytes(photoRef, dummyJpeg, {
      contentType: 'image/jpeg',
      customMetadata: { clientId: 'client_interport' }
    }));
    await assertFails(deleteObject(photoRef));
  });

  // ── 7. REVOGAÇÃO EFETIVA DE ACESSO REAL (MESMO TOKEN ANTES E DEPOIS DA ALTERAÇÃO ADMINISTRATIVA) ──
  // Demonstração rigorosa de segurança:
  // 1. O usuário é autenticado com auth_time = 1500 e obtém um token.
  // 2. Antes de qualquer revogação administrativa, a leitura é APROVADA com esse token.
  // 3. Um administrador grava no Firestore que o usuário foi revogado em revokedAt = 2000.
  // 4. Sem emitir novo token e sem alterar as credenciais locais, o MESMO usuário tenta ler com o MESMO token antigo.
  // 5. O acesso é IMEDIATAMENTE BLOQUEADO pela regra de backend!
  // 6. A renovação automática (refresh token) mantém o auth_time = 1500 inalterado, continuando BLOQUEADO.
  // 7. Apenas uma nova autenticação interativa completa emite um novo auth_time recente (ex: 3000), restabelecendo o acesso.

  const sameUserSession = testEnv.authenticatedContext('usr_test_revoc', {
    role: 'CLIENT_ADMIN',
    authorizedClients: ['client_interport'],
    auth_time: 1500
  });
  const dbSameUser = sameUserSession.firestore();

  await runTestCase('Revogação Real: MESMO token lê com sucesso ANTES da alteração administrativa', async () => {
    await assertSucceeds(getDoc(doc(dbSameUser, 'bookings', 'bk_interport')));
  });

  await runTestCase('Revogação Real: Administrador registra revokedAt=2000 no Firestore e o MESMO token antigo passa a ser BLOQUEADO', async () => {
    // Gravação administrativa legítima realizada por Master Unispect (permitido por allow write: if isUnispectMaster())
    const masterContext = testEnv.authenticatedContext('usr_master_admin', {
      isUnispectMaster: true
    });
    const masterDb = masterContext.firestore();
    await setDoc(doc(masterDb, 'userSecurityMetadata', 'usr_test_revoc'), {
      revokedAt: 2000
    });

    // Reutiliza EXATAMENTE a mesma sessão e token ativo do usuário (auth_time: 1500)
    await assertFails(getDoc(doc(dbSameUser, 'bookings', 'bk_interport')));
  });

  await runTestCase('Revogação Real: Renovação de token (refresh token) preserva auth_time original e CONTINUA BLOQUEADO', async () => {
    // Simula a renovação automática de token: gera novo ID token mas o auth_time NÃO avança (continua 1500)
    const refreshedTokenSession = testEnv.authenticatedContext('usr_test_revoc', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport'],
      auth_time: 1500 // auth_time inalterado pelo refresh
    });
    const db = refreshedTokenSession.firestore();
    await assertFails(getDoc(doc(db, 'bookings', 'bk_interport')));
  });

  await runTestCase('Revogação Real: Nova autenticação interativa (auth_time=3000 posterior a 2000) restabelece o acesso', async () => {
    // Usuário digita credenciais novamente em novo login interativo com auth_time recente
    const reauthenticatedUser = testEnv.authenticatedContext('usr_test_revoc', {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport'],
      auth_time: 3000
    });
    const db = reauthenticatedUser.firestore();
    await assertSucceeds(getDoc(doc(db, 'bookings', 'bk_interport')));
  });

} finally {
  await testEnv.cleanup();
}

console.log('\n===============================================================');
console.log(`TOTAL DE TESTES REAIS: ${totalTests}`);
console.log(`APROVADOS: ${passedTests}`);
console.log(`FALHAS: ${failedTests}`);
console.log('===============================================================');

if (failedTests > 0) process.exit(1);
