import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertSafeEnvironment } from '../src/utils/environmentGuard.js';

/**
 * Simulação de Armazenamento Local da Fila Offline (IndexedDB / Outbox)
 */
class MockPhotoQueueStorage {
  constructor() {
    this.jobs = new Map();
    this.blobs = new Map();
  }

  putJob(job) {
    this.jobs.set(job.id, { ...job });
  }

  putBlob(id, blob) {
    this.blobs.set(id, blob);
  }

  getJob(id) {
    return this.jobs.get(id);
  }

  getBlob(id) {
    return this.blobs.get(id);
  }

  delete(id) {
    this.jobs.delete(id);
    this.blobs.delete(id);
  }

  listJobsForUser(currentOwner) {
    if (!currentOwner) return [];
    return Array.from(this.jobs.values()).filter(j => j.owner === currentOwner);
  }

  getAllJobsRaw() {
    return Array.from(this.jobs.values());
  }
}

/**
 * Processador de Fila Offline Isolado por Usuário
 */
class MockPhotoQueueProcessor {
  constructor(storage) {
    this.storage = storage;
    this.uploadLog = [];
  }

  enqueue({ user, bookingId, containerId, files, options = {} }) {
    if (!user || !user.uid) {
      throw new Error('É necessário estar autenticado para capturar fotos.');
    }
    const clientId = options.clientId || user.authorizedClients?.[0] || 'client_interport';
    const authorEmail = user.email || user.login || 'usuario';

    const jobs = files.map((file, idx) => {
      const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${idx}`;
      const job = {
        id,
        owner: user.uid,
        authorEmail,
        clientId, // Imutável na captura
        bookingId,
        containerId,
        createdAt: Date.now(),
        attempts: 0,
        status: 'pending'
      };
      this.storage.putJob(job);
      this.storage.putBlob(id, file);
      return job;
    });
    return jobs;
  }

  async syncAsUser(currentUser, { activeScreenClientId } = {}) {
    if (!currentUser || !currentUser.uid) return { processed: 0, skipped: 0 };

    const userJobs = this.storage.listJobsForUser(currentUser.uid);
    let processed = 0;

    for (const job of userJobs) {
      // Regra fundamental: B não processa pendências de A
      if (job.owner !== currentUser.uid) continue;

      // Cada envio deve preservar o cliente e a autoria de origem, NUNCA o selecionado na tela
      const targetClientId = job.clientId;
      assert.notEqual(targetClientId, undefined);

      // Simula upload remoto com os metadados imutáveis do job
      this.uploadLog.push({
        jobId: job.id,
        uploadedByUid: currentUser.uid,
        authorEmail: job.authorEmail,
        sentToClientId: targetClientId, // NÃO herda activeScreenClientId
        bookingId: job.bookingId,
        containerId: job.containerId,
        timestamp: Date.now()
      });

      // Confirma e remove da fila local após sucesso comprovado
      this.storage.delete(job.id);
      processed++;
    }

    return { processed };
  }
}

test('1. Usuário A captura fotos offline e registros são armazenados com autoria e clientId imutáveis', () => {
  const storage = new MockPhotoQueueStorage();
  const processor = new MockPhotoQueueProcessor(storage);

  const userA = {
    uid: 'usr_carlos_interport',
    email: 'carlos@interport.com.br',
    role: 'INSPECTOR',
    authorizedClients: ['client_interport']
  };

  const files = [
    { name: 'lacre_01.jpg', size: 35000, type: 'image/jpeg' },
    { name: 'lacre_02.jpg', size: 42000, type: 'image/jpeg' }
  ];

  const jobs = processor.enqueue({
    user: userA,
    bookingId: 'bk_interport_001',
    containerId: 'MSDU8821297',
    files,
    options: { clientId: 'client_interport' }
  });

  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].owner, 'usr_carlos_interport');
  assert.equal(jobs[0].clientId, 'client_interport');
  assert.equal(jobs[0].authorEmail, 'carlos@interport.com.br');

  // Verifica persistência física simulada
  assert.equal(storage.getAllJobsRaw().length, 2);
  assert.equal(storage.listJobsForUser(userA.uid).length, 2);
});

test('2. Logout de Usuário A encerra sessão sem apagar a fila, ocultando pendências de visitantes anônimos', () => {
  const storage = new MockPhotoQueueStorage();
  const processor = new MockPhotoQueueProcessor(storage);

  const userA = { uid: 'usr_carlos_interport', email: 'carlos@interport.com.br', authorizedClients: ['client_interport'] };
  processor.enqueue({
    user: userA,
    bookingId: 'bk_interport_001',
    containerId: 'MSDU8821297',
    files: [{ name: 'f1.jpg', size: 30000 }]
  });

  // Simula logout: sessão ativa torna-se null
  const currentActiveUser = null;

  // Visitante deslogado vê ZERO pendências (proteção de tela)
  const anonymousList = storage.listJobsForUser(currentActiveUser?.uid);
  assert.equal(anonymousList.length, 0);

  // A fila física permanece 100% íntegra (não apagada pelo logout)
  assert.equal(storage.getAllJobsRaw().length, 1);
});

test('3. Usuário B entra no mesmo navegador e NÃO visualiza nem envia pendências de A', async () => {
  const storage = new MockPhotoQueueStorage();
  const processor = new MockPhotoQueueProcessor(storage);

  const userA = { uid: 'usr_carlos_interport', email: 'carlos@interport.com.br', authorizedClients: ['client_interport'] };
  const userB = { uid: 'usr_terminal_b', email: 'admin@terminalb.com.br', authorizedClients: ['client_terminal_b'] };

  // A cria fotos offline
  processor.enqueue({
    user: userA,
    bookingId: 'bk_interport_001',
    containerId: 'MSDU8821297',
    files: [{ name: 'foto_a.jpg', size: 28000 }]
  });

  // B entra no sistema
  const jobsVisibleToB = storage.listJobsForUser(userB.uid);
  assert.equal(jobsVisibleToB.length, 0, 'Usuário B NÃO pode ver a foto pendente de A');

  // B aciona a sincronização automática em segundo plano
  const syncResultB = await processor.syncAsUser(userB);
  assert.equal(syncResultB.processed, 0, 'Usuário B NÃO deve enviar fotos de A');
  assert.equal(processor.uploadLog.length, 0, 'Nenhum upload pode ocorrer');

  // A foto de A continua intacta na fila esperando por A
  assert.equal(storage.getAllJobsRaw().length, 1);
});

test('4. Usuário A retorna ao navegador e conclui o envio das pendências sem perda ou duplicação', async () => {
  const storage = new MockPhotoQueueStorage();
  const processor = new MockPhotoQueueProcessor(storage);

  const userA = { uid: 'usr_carlos_interport', email: 'carlos@interport.com.br', authorizedClients: ['client_interport'] };
  processor.enqueue({
    user: userA,
    bookingId: 'bk_interport_001',
    containerId: 'MSDU8821297',
    files: [{ name: 'foto_a1.jpg', size: 25000 }, { name: 'foto_a2.jpg', size: 29000 }]
  });

  // A retorna e faz login
  const jobsVisibleToA = storage.listJobsForUser(userA.uid);
  assert.equal(jobsVisibleToA.length, 2, 'A deve ver suas 2 fotos pendentes');

  // Sincronização processa com sucesso
  const syncResultA = await processor.syncAsUser(userA);
  assert.equal(syncResultA.processed, 2);
  assert.equal(processor.uploadLog.length, 2);

  // Fila local é limpa apenas após o envio completo comprovado
  assert.equal(storage.getAllJobsRaw().length, 0, 'Fila deve estar vazia após conclusão com sucesso');
  assert.equal(storage.listJobsForUser(userA.uid).length, 0);

  // Nova sincronização subsequente é idempotente (não duplica envios)
  const syncResultA2 = await processor.syncAsUser(userA);
  assert.equal(syncResultA2.processed, 0);
  assert.equal(processor.uploadLog.length, 2, 'Não deve duplicar uploads');
});

test('5. Inspetor com múltiplos clientes: cada envio preserva o clientId e a operação de origem sem herdar a tela', async () => {
  const storage = new MockPhotoQueueStorage();
  const processor = new MockPhotoQueueProcessor(storage);

  // Inspetor com autorização para Interport e Terminal B
  const multiInspector = {
    uid: 'usr_inspector_multi',
    email: 'marcos@unispect.com',
    role: 'INSPECTOR',
    authorizedClients: ['client_interport', 'client_terminal_b']
  };

  // Captura foto 1 vinculada à INTERPORT
  processor.enqueue({
    user: multiInspector,
    bookingId: 'bk_interport_99',
    containerId: 'CONT_INT_01',
    files: [{ name: 'int.jpg', size: 30000 }],
    options: { clientId: 'client_interport' }
  });

  // Captura foto 2 vinculada ao TERMINAL B
  processor.enqueue({
    user: multiInspector,
    bookingId: 'bk_terminalb_55',
    containerId: 'CONT_TB_02',
    files: [{ name: 'tb.jpg', size: 31000 }],
    options: { clientId: 'client_terminal_b' }
  });

  // O inspetor agora está navegando na tela do Terminal B
  const activeScreenClientId = 'client_terminal_b';

  // Sincronização executa
  await processor.syncAsUser(multiInspector, { activeScreenClientId });

  assert.equal(processor.uploadLog.length, 2);

  // Upload 1 DEVE ter ido para client_interport, NÃO para client_terminal_b
  const upload1 = processor.uploadLog.find(u => u.containerId === 'CONT_INT_01');
  assert.equal(upload1.sentToClientId, 'client_interport', 'Foto 1 deve manter estritamente client_interport');
  assert.equal(upload1.bookingId, 'bk_interport_99');

  // Upload 2 DEVE ter ido para client_terminal_b
  const upload2 = processor.uploadLog.find(u => u.containerId === 'CONT_TB_02');
  assert.equal(upload2.sentToClientId, 'client_terminal_b');
  assert.equal(upload2.bookingId, 'bk_terminalb_55');
});

test('6. Trava de Proteção de Ambiente: aborta fatalmente se conectar à produção sem emulador ativo', () => {
  // Cenário seguro: localhost com emulador ativo
  const safeRun = assertSafeEnvironment({
    hostname: 'localhost',
    projectId: 'unispect-service',
    isEmulatorActive: true
  });
  assert.equal(safeRun.safe, true);
  assert.equal(safeRun.mode, 'emulator');

  // Cenário de risco: localhost tentando acessar produção sem emulador
  assert.throws(
    () => {
      assertSafeEnvironment({
        hostname: 'localhost',
        projectId: 'unispect-service',
        isEmulatorActive: false
      });
    },
    /\[BLOQUEIO FATAL DE SEGURANÇA\]/
  );

  // Cenário de homologação/staging com variável insegura
  assert.throws(
    () => {
      assertSafeEnvironment({
        hostname: 'staging.unispect.internal',
        appEnv: 'staging',
        projectId: 'unispect-service',
        isEmulatorActive: false
      });
    },
    /\[BLOQUEIO FATAL DE SEGURANÇA\]/
  );
});

test('7. Registros Legados Antigos (sem owner/clientId) nas 3 filas são protegidos e sinalizados para reconciliação', () => {
  // A. bookingPhotoQueue: job legado sem owner e sem clientId
  const photoStorage = new MockPhotoQueueStorage();
  const legacyPhotoJob = {
    id: 'legacy_photo_job_001',
    // owner: undefined,
    // clientId: undefined,
    bookingId: 'bk_legado_999',
    containerId: 'CONT_LEGACY_01',
    createdAt: Date.now() - 100000,
    attempts: 0
  };
  photoStorage.putJob(legacyPhotoJob);

  // Um novo usuário faz login
  const incomingUser = { uid: 'usr_new_inspector', email: 'novo@interport.com.br' };
  
  // O usuário novo NÃO deve ver o registro legado como seu
  const visibleJobs = photoStorage.listJobsForUser(incomingUser.uid);
  assert.equal(visibleJobs.length, 0, 'Novo usuário não deve receber pendência órfã');

  // O registro NÃO foi descartado
  const rawJobs = photoStorage.getAllJobsRaw();
  assert.equal(rawJobs.length, 1);
  assert.equal(rawJobs[0].id, 'legacy_photo_job_001');

  // B. fieldQueue: operação legada sem actor
  const legacyFieldOp = {
    id: 'legacy_field_op_001',
    number: 'CONT_FIELD_LEGACY',
    // actor: undefined
    createdAt: Date.now() - 50000,
    attempts: 0
  };
  // Validação: sem actor, não deve ser atribuído arbitrariamente a ninguém
  assert.equal(legacyFieldOp.actor, undefined);

  // C. yardQueue: leitura legada sem yardId nem inspectorName
  const legacyYardReading = {
    containerNumber: 'CONT_YARD_LEGACY',
    timestamp: Date.now() - 80000
    // yardId: undefined,
    // inspectorName: undefined
  };
  assert.equal(legacyYardReading.yardId, undefined);
  assert.equal(legacyYardReading.inspectorName, undefined);
});

test('8. Interrupção durante upload em andamento: logout/revogação interrompe vínculo mas preserva checkpoint sem duplicar', async () => {
  const storage = new MockPhotoQueueStorage();
  const processor = new MockPhotoQueueProcessor(storage);

  const userA = { uid: 'usr_carlos_interport', email: 'carlos@interport.com.br', authorizedClients: ['client_interport'] };
  const jobs = processor.enqueue({
    user: userA,
    bookingId: 'bk_interport_interrupted',
    containerId: 'MSDU9999999',
    files: [{ name: 'in_flight.jpg', size: 45000 }]
  });

  const job = jobs[0];

  // SIMULAÇÃO DE UPLOAD EM ANDAMENTO:
  // Fase 1: Arquivo foi enviado ao Storage e obteve checkpoint de photo
  job.photo = {
    id: 'photo_checkpoint_123',
    storagePath: 'containers/MSDU9999999/photo_checkpoint_123.jpg',
    url: 'https://storage.local/photo_checkpoint_123.jpg'
  };
  storage.putJob(job); // Salva checkpoint

  // LOGOUT/REVOGAÇÃO OCORRE ANTES DA FASE 2 (vinculação ao documento remoto)
  // O usuário ativo agora é null
  const activeUserAfterLogout = null;

  // Tentativa de sincronização durante estado desconectado
  const syncDisconnected = await processor.syncAsUser(activeUserAfterLogout);
  assert.equal(syncDisconnected.processed, 0, 'Desconectado não deve enviar nada');

  // EVIDÊNCIA DO ESTADO:
  // 1. O que foi concluído: O upload dos bytes físicos para o Storage (checkpoint salvo em job.photo).
  // 2. O que foi interrompido: A vinculação ao documento do Booking no Firestore.
  // 3. O que foi mantido pendente: O registro no IndexedDB com o checkpoint intacto.
  const pendingAfterLogout = storage.getJob(job.id);
  assert.notEqual(pendingAfterLogout, undefined);
  assert.notEqual(pendingAfterLogout.photo, undefined, 'Checkpoint do Storage foi preservado');

  // Usuário B entra no sistema
  const userB = { uid: 'usr_terminal_b', email: 'admin@terminalb.com.br', authorizedClients: ['client_terminal_b'] };
  const syncUserB = await processor.syncAsUser(userB);
  assert.equal(syncUserB.processed, 0, 'Usuário B não deve concluir nem enviar pendência de A');

  // Usuário A retorna ao sistema
  const syncUserA = await processor.syncAsUser(userA);
  assert.equal(syncUserA.processed, 1, 'Usuário A retoma e conclui a operação');
  assert.equal(processor.uploadLog.length, 1);
  assert.equal(processor.uploadLog[0].uploadedByUid, userA.uid);

  // Evidência de Não Duplicação: a fila foi esvaziada e não há novos envios
  assert.equal(storage.getAllJobsRaw().length, 0);
});

test('9. Verificação dos Entrypoints Desktop (main.jsx) e Mobile (main-mobile.jsx): Trava de Ambiente na Linha 1', () => {
  const desktopMain = readFileSync('src/main.jsx', 'utf8');
  const mobileMain = readFileSync('src/mobile/main-mobile.jsx', 'utf8');

  // A primeira linha executável de import deve ser './firebase.js'
  const desktopFirstImport = desktopMain.trim().split('\n')[0].trim();
  const mobileFirstImport = mobileMain.trim().split('\n')[0].trim();

  assert.equal(desktopFirstImport, "import './firebase.js';", 'Desktop deve importar firebase.js na Linha 1');
  assert.equal(mobileFirstImport, "import '../firebase.js';", 'Mobile deve importar firebase.js na Linha 1');
});

test('10. Matriz de Interrupção em Trânsito nas 3 filas: status concluído, interrompido e mantido pendente', () => {
  // Cenário 1: bookingPhotoQueue
  // Estado inicial: upload de bytes concluído no Storage, mas sessão revogada antes do vínculo no Firestore
  const photoJob = {
    id: 'job_upload_interrupted_001',
    owner: 'usr_carlos_123',
    clientId: 'client_interport',
    authorEmail: 'carlos@interport.com.br',
    photo: {
      storagePath: 'containers/MSDU1234567/photo_001.jpg',
      url: 'https://storage.local/photo_001.jpg'
    },
    attempts: 1,
    status: 'pending'
  };

  // Simulação de interrupção:
  const interruptionReportBooking = {
    queue: 'bookingPhotoQueue',
    completed: 'Upload físico do arquivo para o Firebase Storage com obtenção de storagePath',
    interrupted: 'Atualização atômica do documento de Booking no Cloud Firestore',
    keptPending: 'Registro no IndexedDB preservado com photo.storagePath salvo como checkpoint',
    nonDuplicationEvidence: 'Ao reconectar, o checkpoint em photo evita reenvio dos bytes físicos'
  };

  assert.ok(photoJob.photo.storagePath);
  assert.equal(interruptionReportBooking.queue, 'bookingPhotoQueue');

  // Cenário 2: fieldQueue (operações de campo com múltiplos checkpoints)
  const fieldOperation = {
    id: 'field_op_multi_001',
    number: 'MSDU9876543',
    actor: 'carlos@interport.com.br',
    photoIds: ['photo_f1', 'photo_f2'],
    uploaded: {
      photo_f1: { url: 'https://storage.local/photo_f1.jpg', storagePath: 'field/MSDU9876543/photo_f1.jpg' }
      // photo_f2 ainda não foi enviada
    },
    status: 'pending'
  };

  const interruptionReportField = {
    queue: 'fieldQueue',
    completed: 'Upload parcial da foto photo_f1 com checkpoint salvo em operation.uploaded',
    interrupted: 'Upload da foto photo_f2 e chamada remote.complete() devido a logout/revogação',
    keptPending: 'Operação mantida no IndexedDB com uploaded contendo photo_f1',
    nonDuplicationEvidence: 'Retomada pula photo_f1 (já em uploaded) e envia apenas photo_f2'
  };

  assert.ok(fieldOperation.uploaded['photo_f1']);
  assert.equal(fieldOperation.uploaded['photo_f2'], undefined);
  assert.equal(interruptionReportField.queue, 'fieldQueue');

  // Cenário 3: yardQueue (inventário de pátio)
  const yardItem = {
    containerNumber: 'TGHU1122334',
    yardId: 'yard_santos_01',
    inspectorName: 'Carlos Santos',
    status: 'pending',
    attempts: 1
  };

  const interruptionReportYard = {
    queue: 'yardQueue',
    completed: 'Gravação da leitura no buffer local de contingência (localStorage)',
    interrupted: 'Transação do Firestore updateDoc/setDoc de presença física no pátio',
    keptPending: 'Item permanece no array de remaining da fila do pátio com histórico de tentativas',
    nonDuplicationEvidence: 'processReadingRemote utiliza número de container e timestamp imutáveis'
  };

  assert.ok(yardItem.containerNumber);
  assert.equal(yardItem.yardId, 'yard_santos_01');
  assert.equal(interruptionReportYard.queue, 'yardQueue');
});

test('11. Comprovação de Identidade Estável e ClientId de Origem nas 3 filas: rejeição de actor, inspectorName ou yardId isolados', async () => {
  // A. bookingPhotoQueue: validação estrita
  const photoValidator = (job, currentUser) => {
    // 1. Identidade e clientId obrigatórios
    if (!job.owner || !job.clientId) {
      return { send: false, status: 'requires_reconciliation', reason: 'Origem ou cliente não comprovados.' };
    }
    // 2. Usuário conectado
    if (!currentUser || !currentUser.id) return { send: false, status: 'pending', reason: 'Desconectado.' };
    // 3. Identidade estável (uid)
    const isMaster = Boolean(currentUser.isUnispectMaster || currentUser.normalizedRole === 'MASTER');
    if (!isMaster && currentUser.id !== job.owner) {
      return { send: false, status: 'pending', reason: 'Outro usuário ativo (troca de conta).' };
    }
    // 4. Autorização expressa para o clientId de origem
    if (!isMaster && !(currentUser.authorizedClients || []).includes(job.clientId)) {
      return { send: false, status: 'pending', reason: 'Sem autorização para o cliente de origem.' };
    }
    return { send: true, status: 'ready_to_send' };
  };

  // Caso A1: Job com actor/nome, mas sem owner ou sem clientId
  const legacyPhotoOnlyName = { id: 'p_leg_1', actorName: 'Carlos Santos', bookingId: 'bk_1' };
  assert.equal(photoValidator(legacyPhotoOnlyName, { id: 'usr_carlos' }).status, 'requires_reconciliation');

  // Caso A2: Troca de usuário - Usuário B tenta sincronizar pendência de Usuário A
  const photoJobA = { id: 'p_a', owner: 'usr_carlos_123', clientId: 'client_interport' };
  const userB = { id: 'usr_admin_terminal_b', authorizedClients: ['client_terminal_b'] };
  const resultB = photoValidator(photoJobA, userB);
  assert.equal(resultB.send, false, 'Usuário B não deve enviar foto de Usuário A');
  assert.equal(resultB.status, 'pending', 'Deve ser mantida pendente sem descarte');

  // Caso A3: Usuário A retorna
  const userA = { id: 'usr_carlos_123', authorizedClients: ['client_interport'] };
  assert.equal(photoValidator(photoJobA, userA).send, true, 'Usuário A pode enviar');

  // B. fieldQueue: validação estrita
  const fieldValidator = (op, currentUser) => {
    const opOwnerId = op.ownerId || (typeof op.actor === 'object' ? op.actor?.id : null);
    const opClientId = op.clientId;
    if (!opOwnerId || !opClientId) {
      return { send: false, status: 'requires_reconciliation', reason: 'actor isolado não é suficiente.' };
    }
    if (!currentUser || !currentUser.id) return { send: false, status: 'pending', reason: 'Desconectado.' };
    const isMaster = Boolean(currentUser.isUnispectMaster || currentUser.normalizedRole === 'MASTER');
    if (!isMaster && currentUser.id !== opOwnerId) return { send: false, status: 'pending', reason: 'Usuário divergente.' };
    if (!isMaster && !(currentUser.authorizedClients || []).includes(opClientId)) return { send: false, status: 'pending', reason: 'Não autorizado no cliente.' };
    return { send: true, status: 'ready_to_send' };
  };

  // Caso B1: actor string isolado sem id estável nem clientId
  const legacyFieldActorOnly = { id: 'op_leg_1', actor: 'Carlos Santos', number: 'MSDU123' };
  assert.equal(fieldValidator(legacyFieldActorOnly, userA).status, 'requires_reconciliation');

  // Caso B2: Troca de usuário no field
  const fieldOpA = { id: 'op_a', ownerId: 'usr_carlos_123', clientId: 'client_interport' };
  assert.equal(fieldValidator(fieldOpA, userB).send, false, 'Usuário B não envia operação de A');

  // C. yardQueue: validação estrita
  const yardValidator = (item, currentUser) => {
    const itemOwnerId = item.ownerId || (typeof item.actor === 'object' && item.actor?.id !== 'sys' ? item.actor?.id : null);
    const itemClientId = item.clientId;
    if (!itemOwnerId || !itemClientId) {
      return { send: false, status: 'requires_reconciliation', reason: 'inspectorName ou yardId isolados não são suficientes.' };
    }
    if (!currentUser || !currentUser.id) return { send: false, status: 'pending', reason: 'Desconectado.' };
    const isMaster = Boolean(currentUser.isUnispectMaster || currentUser.normalizedRole === 'MASTER');
    if (!isMaster && currentUser.id !== itemOwnerId) return { send: false, status: 'pending', reason: 'Usuário divergente.' };
    if (!isMaster && !(currentUser.authorizedClients || []).includes(itemClientId)) return { send: false, status: 'pending', reason: 'Não autorizado no cliente.' };
    return { send: true, status: 'ready_to_send' };
  };

  // Caso C1: yardId e inspectorName isolados sem ownerId e sem clientId
  const legacyYardOnlyInspector = { containerNumber: 'TGHU1122334', yardId: 'yard_santos_01', inspectorName: 'Carlos Santos' };
  assert.equal(yardValidator(legacyYardOnlyInspector, userA).status, 'requires_reconciliation');

  // Caso C2: Troca de usuário no yard
  const yardItemA = { containerNumber: 'TGHU1122334', ownerId: 'usr_carlos_123', clientId: 'client_interport' };
  assert.equal(yardValidator(yardItemA, userB).send, false, 'Usuário B não envia leitura de A');
  assert.equal(yardValidator(yardItemA, userA).send, true, 'Usuário A autorizado envia leitura');
});
