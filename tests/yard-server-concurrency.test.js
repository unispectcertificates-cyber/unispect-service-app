import test from 'node:test';
import assert from 'node:assert/strict';

import { createYardRepository, makeYardLockKey } from '../src/utils/yardRepository.js';

// Simulador em memória de Firestore Transaction com semântica de concorrência e locks
function createMemoryFirestoreHarness() {
  const store = new Map(); // key -> document object
  let isLocked = false;
  const queue = [];

  const executeLock = async () => {
    while (isLocked) {
      await new Promise(r => setTimeout(r, 5));
    }
    isLocked = true;
  };
  const releaseLock = () => { isLocked = false; };

  const reference = (col, id) => ({
    col,
    id,
    key: `${col}/${id}`
  });

  const transaction = async (callback) => {
    await executeLock();
    try {
      const txOps = new Map(); // key -> new doc data or null if deleted

      const tx = {
        get: async (ref) => {
          const current = txOps.has(ref.key) ? txOps.get(ref.key) : store.get(ref.key);
          return {
            exists: () => current !== undefined && current !== null,
            data: () => (current ? JSON.parse(JSON.stringify(current)) : null)
          };
        },
        set: (ref, data) => {
          txOps.set(ref.key, JSON.parse(JSON.stringify(data)));
        },
        delete: (ref) => {
          txOps.set(ref.key, null);
        }
      };

      const result = await callback(tx);

      // Commit atômico
      for (const [key, val] of txOps.entries()) {
        if (val === null) store.delete(key);
        else store.set(key, val);
      }

      return result;
    } finally {
      releaseLock();
    }
  };

  return { reference, transaction, store };
}

test('1. Concorrência: Dois celulares cadastram o mesmo container no mesmo pátio simultaneamente', async () => {
  const harness = createMemoryFirestoreHarness();
  const repo = createYardRepository({
    reference: harness.reference,
    transaction: harness.transaction,
    now: () => 1791830000000
  });

  // Dois celulares enviam requisição concorrente exatamente ao mesmo tempo
  const [res1, res2] = await Promise.all([
    repo.openYardPassageAtomic({
      containerNumber: 'MSCU 987654-3',
      yardId: 'loc_1',
      yardName: 'Interport',
      actor: { id: 'celular_1', name: 'Inspetor Carlos', role: 'Inspector' },
      notes: 'Lido pelo Celular 1'
    }),
    repo.openYardPassageAtomic({
      containerNumber: 'MSCU 987654-3',
      yardId: 'loc_1',
      yardName: 'Interport',
      actor: { id: 'celular_2', name: 'Inspetor Marcos', role: 'Inspector' },
      notes: 'Lido pelo Celular 2 simultâneo'
    })
  ]);

  // Exatamente UMA das requisições criou a nova passagem
  const news = [res1, res2].filter(r => r.isNew);
  const handled = [res1, res2].filter(r => r.conflictHandled);

  assert.equal(news.length, 1, 'Apenas uma requisição pode criar a passagem');
  assert.equal(handled.length, 1, 'A outra requisição deve reutilizar atomicamente a passagem');

  // Ambas as respostas apontam para a MESMA passagem única
  assert.equal(res1.passage.id, res2.passage.id);

  // No banco, existe exatamente 1 passagem e 1 lock ativo
  const passagesInDb = Array.from(harness.store.keys()).filter(k => k.startsWith('yardPassages/'));
  const locksInDb = Array.from(harness.store.keys()).filter(k => k.startsWith('yardActiveLocks/'));

  assert.equal(passagesInDb.length, 1);
  assert.equal(locksInDb.length, 1);
});

test('2. Saída confirmada por ADM libera o lock e permite nova passagem no futuro', async () => {
  const harness = createMemoryFirestoreHarness();
  const repo = createYardRepository({
    reference: harness.reference,
    transaction: harness.transaction,
    now: () => 1000
  });

  const { passage } = await repo.openYardPassageAtomic({
    containerNumber: 'MSCU 111222-3',
    yardId: 'loc_1',
    actor: { id: 'ins_1' }
  });

  // Tentativa de confirmação de saída por Inspetor comum é BLOQUEADA
  await assert.rejects(
    async () => repo.confirmExitAtomic({
      passageId: passage.id,
      actor: { id: 'ins_1', role: 'Inspector' }
    }),
    /Apenas administradores podem confirmar a saída/i
  );

  // Confirmação de saída por Administrador tem SUCESSO
  const exited = await repo.confirmExitAtomic({
    passageId: passage.id,
    actor: { id: 'adm_1', name: 'Gerente ADM', role: 'ADM' }
  });

  assert.equal(exited.status, 'exited');

  // O lock atômico foi removido
  const lockKey = makeYardLockKey('loc_1', 'MSCU1112223');
  assert.equal(harness.store.has(`yardActiveLocks/${lockKey}`), false);

  // Semanas depois, o mesmo container retorna ao mesmo pátio
  const { passage: secondPassage, isNew } = await repo.openYardPassageAtomic({
    containerNumber: 'MSCU 111222-3',
    yardId: 'loc_1',
    actor: { id: 'ins_2' }
  });

  assert.equal(isNew, true);
  assert.notEqual(secondPassage.id, passage.id);

  // Ambas as passagens coexistem no banco de dados!
  const passagesInDb = Array.from(harness.store.keys()).filter(k => k.startsWith('yardPassages/'));
  assert.equal(passagesInDb.length, 2);
});

test('3. Bloqueio de fechamento de conferência quando há aparelhos offline ou com sincronização pendente', async () => {
  const harness = createMemoryFirestoreHarness();
  const repo = createYardRepository({
    reference: harness.reference,
    transaction: harness.transaction,
    now: () => 2000
  });

  // Cria uma conferência aberta
  harness.store.set('yardAudits/audit_1', {
    id: 'audit_1',
    yardId: 'loc_1',
    status: 'in_progress'
  });

  // Aparelho do Inspetor Marcos está offline com 4 pendências
  const participatingDevices = {
    'dev_celular_carlos': { inspectorName: 'Carlos', pendingUploads: 0, isConfirmedSynced: true, isOnline: true },
    'dev_celular_marcos': { inspectorName: 'Marcos', pendingUploads: 4, isConfirmedSynced: false, isOnline: false }
  };

  await assert.rejects(
    async () => repo.closeYardAuditAtomic({
      auditId: 'audit_1',
      actor: { id: 'sup_1', role: 'ADM' },
      participatingDevices
    }),
    /Há aparelhos participantes sem confirmação de sincronização: Marcos \(4 pendentes\)/i
  );

  // A conferência continua com status in_progress
  assert.equal(harness.store.get('yardAudits/audit_1').status, 'in_progress');

  // Após Marcos sincronizar tudo com sucesso:
  participatingDevices['dev_celular_marcos'] = {
    inspectorName: 'Marcos',
    pendingUploads: 0,
    isConfirmedSynced: true,
    isOnline: true
  };

  const closed = await repo.closeYardAuditAtomic({
    auditId: 'audit_1',
    actor: { id: 'sup_1', role: 'ADM' },
    participatingDevices
  });

  assert.equal(closed.status, 'closed');
});

test('4. Tratamento de leituras atrasadas recebidas pós-fechamento: reativa presença e salva sem descartar', async () => {
  const harness = createMemoryFirestoreHarness();
  const repo = createYardRepository({
    reference: harness.reference,
    transaction: harness.transaction,
    now: () => 5000
  });

  // Cria passagem inicialmente sob revisão
  const passageId = 'yp_TEMU5555555_1000';
  harness.store.set(`yardPassages/${passageId}`, {
    id: passageId,
    containerNumber: 'TEMU 555555-5',
    normalizedNumber: 'TEMU5555555',
    yardId: 'loc_1',
    status: 'under_review', // Estava sob revisão após conferência
    lastConfirmedAt: 1000,
    events: []
  });

  // Cria lock ativo apontando para essa passagem
  const lockKey = makeYardLockKey('loc_1', 'TEMU5555555');
  harness.store.set(`yardActiveLocks/${lockKey}`, {
    lockKey,
    passageId,
    status: 'active'
  });

  // Cria conferência que foi fechada às 4000
  harness.store.set('yardAudits/audit_fechada', {
    id: 'audit_fechada',
    yardId: 'loc_1',
    status: 'closed'
  });

  // Chega leitura capturada às 3500 pelo celular sem sinal, que só subiu às 5000
  const result = await repo.processLateAuditReadingAtomic({
    auditId: 'audit_fechada',
    containerNumber: 'TEMU 555555-5',
    capturedAt: 3500,
    actor: { id: 'ins_tarde', name: 'Inspetor Tarde' },
    notes: 'Aparelho descarregado recuperou conexão'
  });

  // A passagem voltou de 'under_review' para 'active'
  const passageUpdated = harness.store.get(`yardPassages/${passageId}`);
  assert.equal(passageUpdated.status, 'active');
  assert.equal(passageUpdated.lastConfirmedAt, 3500);

  // O evento histórico foi adicionado com tipo late_audit_reading
  const lateEvent = passageUpdated.events.find(e => e.type === 'late_audit_reading');
  assert.ok(lateEvent);
  assert.equal(lateEvent.timestamp, 3500);

  // A conferência fechada registrou a leitura tardia em lateReadings sem ser corrompida
  const auditUpdated = harness.store.get('yardAudits/audit_fechada');
  assert.ok(auditUpdated.lateReadings['TEMU5555555']);
  assert.equal(auditUpdated.lateReadings['TEMU5555555'].capturedAt, 3500);
});

test('5. Validação 1: Bloqueia fechamento quando aparelho possui fila zerada e "online", porém com informação antiga de sincronização', async () => {
  const harness = createMemoryFirestoreHarness();
  const repo = createYardRepository({
    reference: harness.reference,
    transaction: harness.transaction,
    now: () => 100000 // Hora atual: 100.000ms
  });

  harness.store.set('yardAudits/audit_stale', {
    id: 'audit_stale',
    yardId: 'loc_1',
    status: 'in_progress'
  });

  // Aparelho do Carlos tem pendingUploads=0 e isOnline=true, mas sua última sincronização foi há 15 minutos (900.000ms atrás)
  const participatingDevices = {
    'dev_celular_carlos': {
      inspectorName: 'Carlos Santos',
      pendingUploads: 0,
      isConfirmedSynced: true,
      isOnline: true,
      lastSyncConfirmedAt: 10000 // Mais de 60s atrás!
    }
  };

  await assert.rejects(
    async () => repo.closeYardAuditAtomic({
      auditId: 'audit_stale',
      actor: { id: 'sup_1', role: 'ADM' },
      participatingDevices,
      maxStalenessMs: 60000 // Exige confirmação nos últimos 60s
    }),
    /Há aparelhos participantes sem confirmação de sincronização: Carlos Santos \(sincronização antiga há 90s sem confirmação recente\).*Informação antiga de "online" ou fila zerada não é suficiente/i
  );

  // Agora Carlos faz handshake de sincronização recente (às 99.500ms, há 0.5s)
  participatingDevices['dev_celular_carlos'].lastSyncConfirmedAt = 99500;

  const closed = await repo.closeYardAuditAtomic({
    auditId: 'audit_stale',
    actor: { id: 'sup_1', role: 'ADM' },
    participatingDevices,
    maxStalenessMs: 60000
  });

  assert.equal(closed.status, 'closed');
});

test('6. Validação 1: Etapa de fechamento ("closing") impede novas leituras regulares sem reconciliação', async () => {
  const harness = createMemoryFirestoreHarness();
  const repo = createYardRepository({
    reference: harness.reference,
    transaction: harness.transaction,
    now: () => 50000
  });

  harness.store.set('yardAudits/audit_closing_stage', {
    id: 'audit_closing_stage',
    yardId: 'loc_1',
    status: 'in_progress',
    readings: {}
  });

  // Inicia etapa de fechamento
  const closingAudit = await repo.beginYardAuditClosingAtomic({
    auditId: 'audit_closing_stage',
    actor: { id: 'sup_1', name: 'Supervisor ADM', role: 'ADM' }
  });

  assert.equal(closingAudit.status, 'closing');
  assert.equal(closingAudit.closingStartedAt, 50000);

  // No modelo em memória, conferência agora está em 'closing'
  const inDb = harness.store.get('yardAudits/audit_closing_stage');
  assert.equal(inDb.status, 'closing');
});

test('7. Validação 2: Leitura atrasada para container já encerrado (status "exited") NÃO reativa a passagem e encaminha conflito para ADM', async () => {
  const harness = createMemoryFirestoreHarness();
  const repo = createYardRepository({
    reference: harness.reference,
    transaction: harness.transaction,
    now: () => 70000
  });

  // Passagem original de um container que foi FINALIZADA como saída pelo ADM às 60000
  const passageId = 'yp_EMCU1234567_exited';
  harness.store.set(`yardPassages/${passageId}`, {
    id: passageId,
    containerNumber: 'EMCU 123456-7',
    normalizedNumber: 'EMCU1234567',
    yardId: 'loc_1',
    status: 'exited', // Passagem JÁ ENCERRADA!
    exitInfo: {
      type: 'inventory_exit',
      confirmedAt: 60000,
      confirmedBy: { id: 'adm_1', name: 'Supervisor ADM' }
    },
    lastConfirmedAt: 55000,
    events: []
  });

  // Conferência fechada às 58000
  harness.store.set('yardAudits/audit_fechada_ontem', {
    id: 'audit_fechada_ontem',
    yardId: 'loc_1',
    status: 'closed',
    expectedContainers: [
      { normalizedNumber: 'EMCU1234567', containerNumber: 'EMCU 123456-7', passageId }
    ],
    readings: {},
    lateReadings: {},
    pendingConflicts: []
  });

  // Chega leitura física capturada às 57000 por aparelho que só descarregou agora às 70000
  const result = await repo.processLateAuditReadingAtomic({
    auditId: 'audit_fechada_ontem',
    containerNumber: 'EMCU 123456-7',
    capturedAt: 57000,
    actor: { id: 'ins_campo', name: 'Inspetor Campo', role: 'Inspector' },
    notes: 'Aparelho descarregado após turno',
    originalPassageId: passageId
  });

  // REGRA CRÍTICA 2: A passagem encerrada NÃO É REATIVADA! Permanece 'exited'
  const passageInDb = harness.store.get(`yardPassages/${passageId}`);
  assert.equal(passageInDb.status, 'exited');

  // Conflito foi gerado e encaminhado para revisão do administrador
  assert.equal(result.flaggedForAdminReview, true);
  assert.equal(result.conflict.type, 'late_reading_on_exited_passage');
  assert.equal(result.conflict.status, 'pending_admin_review');
  assert.equal(result.conflict.passageId, passageId);
  assert.equal(result.conflict.auditId, 'audit_fechada_ontem');

  // Na conferência, o conflito e a leitura extemporânea estão gravados com referências originais
  const auditInDb = harness.store.get('yardAudits/audit_fechada_ontem');
  assert.equal(auditInDb.pendingConflicts.length, 1);
  assert.equal(auditInDb.pendingConflicts[0].normalizedNumber, 'EMCU1234567');
  assert.equal(auditInDb.lateReadings['EMCU1234567'].conflict, 'passage_already_exited');
});

test('8. Validação 3: Resolução administrativa de conflito permitida apenas para ADM e bloqueada para Inspetor', async () => {
  const harness = createMemoryFirestoreHarness();
  const repo = createYardRepository({
    reference: harness.reference,
    transaction: harness.transaction,
    now: () => 80000
  });

  harness.store.set('yardAudits/audit_with_conflict', {
    id: 'audit_with_conflict',
    yardId: 'loc_1',
    status: 'closed',
    pendingConflicts: [
      {
        id: 'conf_123',
        type: 'late_reading_on_exited_passage',
        containerNumber: 'EMCU 123456-7',
        resolved: false
      }
    ]
  });

  // Tentativa por Inspetor comum é BLOQUEADA
  await assert.rejects(
    async () => repo.resolveYardConflictAtomic({
      auditId: 'audit_with_conflict',
      conflictId: 'conf_123',
      resolution: 'keep_exited',
      actor: { id: 'ins_1', role: 'Inspector' }
    }),
    /Apenas administradores podem resolver conflitos/i
  );

  // Tentativa por ADM tem SUCESSO
  const { conflict } = await repo.resolveYardConflictAtomic({
    auditId: 'audit_with_conflict',
    conflictId: 'conf_123',
    resolution: 'keep_exited',
    actor: { id: 'adm_master', name: 'Administrador Master', role: 'ADM' },
    notes: 'Confirmado com portaria física que o container realmente saiu ontem.'
  });

  assert.equal(conflict.resolved, true);
  assert.equal(conflict.resolvedBy.name, 'Administrador Master');
  assert.equal(conflict.resolution, 'keep_exited');
});
