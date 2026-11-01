import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEGACY_AUTHORSHIP_LABEL,
  SYSTEM_ACTOR,
  resolveAuthenticatedActor,
  getResponsibleInspectorInfo,
  applyViewAccessToContainer,
  resetViewSessionCacheForTests,
  transferContainerResponsibility,
  signInspectionCertificate,
  recordReportAuditAction,
  appendTimelineEvents,
  assertTimelineImmutable,
  enqueueOfflineInspectionAction,
  getOfflinePendingActionsForUser,
  syncOfflineInspectionActions,
  clearOfflineAuditQueueForTests
} from '../src/utils/inspectionAudit.js';
import { createConcurrentRepository } from '../src/utils/bookingConcurrent.js';
import { processContainerProvisionalSeals } from '../src/utils/provisionalSealQueue.js';

// Helper de banco em memória com transações atômicas serializadas (como no Firestore)
function createInMemoryDb(initialBooking) {
  const store = new Map();
  store.set(initialBooking.id, structuredClone(initialBooking));
  let txChain = Promise.resolve();

  const reference = (_col, id) => ({ id });
  const transaction = async (callback) => {
    const run = async () => {
      const tx = {
        get: async (ref) => {
          const data = store.get(ref.id);
          return {
            exists: () => Boolean(data),
            data: () => structuredClone(data)
          };
        },
        update: (ref, patch) => {
          const curr = store.get(ref.id);
          store.set(ref.id, structuredClone({ ...curr, ...patch }));
        }
      };
      return callback(tx);
    };
    const next = txChain.then(run);
    txChain = next.catch(() => {});
    return next;
  };

  return { store, reference, transaction };
}

const inspectorJoao = {
  id: 'usr_joao',
  uid: 'usr_joao',
  name: 'João',
  email: 'joao@unispect.com.br',
  role: 'Inspector',
  clientId: 'client_interport'
};

const inspectorMaria = {
  id: 'usr_maria',
  uid: 'usr_maria',
  name: 'Maria',
  email: 'maria@unispect.com.br',
  role: 'Inspector',
  clientId: 'client_interport'
};

const supervisorAdm = {
  id: 'usr_adm',
  uid: 'usr_adm',
  name: 'Carlos Supervisor',
  email: 'supervisor@unispect.com.br',
  role: 'ADM',
  clientId: 'client_interport'
};

test('Cenários 1, 2 e 3: Início da inspeção, consulta sem edição (incluindo legado) e participação de múltiplos inspetores', async () => {
  resetViewSessionCacheForTests();

  const initialBooking = {
    id: 'bk_100',
    bookingNumber: 'BK-100',
    certificateNumber: 'UN1000/2026',
    clientId: 'client_interport',
    _revision: 1,
    containers: [
      {
        id: 'cont_1',
        containerNumber: 'MSDU1234567',
        status: 'Pendente',
        photos: [],
        provisionalSeals: []
      }
    ]
  };

  const { store, reference, transaction } = createInMemoryDb(initialBooking);
  const repo = createConcurrentRepository({ reference, transaction, requireAuth: true });

  // Antes de qualquer ação técnica, um registro sem responsável exibe o rótulo de registro legado
  const legacyInfo = getResponsibleInspectorInfo(store.get('bk_100').containers[0]);
  assert.equal(legacyInfo.isIdentified, false);
  assert.equal(legacyInfo.displayLabel, LEGACY_AUTHORSHIP_LABEL);

  // Cenário 2: Maria apenas abre o container para visualização às 08:55 (fuso America/Sao_Paulo = -03:00 -> 11:55Z)
  await repo.recordContainerAccess('bk_100', 'cont_1', {
    authenticatedUser: inspectorMaria,
    sessionKey: 'sess_maria_open_1',
    serverTimestamp: '2026-11-01T11:55:00.000Z'
  });

  // Re-renderização na mesma sessão não duplica o evento de visualização
  await repo.recordContainerAccess('bk_100', 'cont_1', {
    authenticatedUser: inspectorMaria,
    sessionKey: 'sess_maria_open_1',
    serverTimestamp: '2026-11-01T11:55:05.000Z'
  });

  let cont = store.get('bk_100').containers[0];
  // Apenas visualizar NUNCA deve atribuir ou alterar a responsabilidade!
  assert.equal(cont.responsibleInspector, undefined);
  assert.equal(cont.auditTimeline.length, 1);
  assert.equal(cont.auditTimeline[0].action, 'access_view');
  assert.equal(cont.auditTimeline[0].formattedText, '01/11/2026 às 08:55 — Maria acessou o Container.');

  // Cenário 1: João realiza a primeira ação técnica (adiciona 4 fotos às 09:10 / 09:12 BRT)
  await repo.appendPhoto(
    'bk_100',
    'cont_1',
    { id: 'photo_1', url: 'https://storage/p1.jpg', stepLabel: '4 fotos iniciais' },
    {
      authenticatedUser: inspectorJoao,
      photoCount: 4,
      deviceTimestamp: '2026-11-01T12:10:00.000Z',
      serverTimestamp: '2026-11-01T12:12:00.000Z'
    }
  );

  cont = store.get('bk_100').containers[0];
  assert.ok(cont.responsibleInspector);
  assert.equal(cont.responsibleInspector.id, 'usr_joao');
  assert.equal(cont.responsibleInspector.name, 'João');

  const startedEv = cont.auditTimeline.find(e => e.action === 'inspection_started');
  const photoEv = cont.auditTimeline.find(e => e.action === 'photo_added');
  assert.ok(startedEv);
  assert.ok(photoEv);
  assert.equal(startedEv.formattedText, '01/11/2026 às 09:12 — João iniciou a inspeção.');
  assert.equal(photoEv.formattedText, '01/11/2026 às 09:12 — João adicionou 4 fotos.');

  // Cenário 2 e 3: Maria acessa em nova sessão às 09:20 e adiciona o lacre provisório 003155 às 09:25
  await repo.recordContainerAccess('bk_100', 'cont_1', {
    authenticatedUser: inspectorMaria,
    sessionKey: 'sess_maria_open_2',
    serverTimestamp: '2026-11-01T12:20:00.000Z'
  });

  await repo.mutateProvisionalSeals(
    'bk_100',
    'cont_1',
    {
      authenticatedUser: inspectorMaria,
      addSeals: [{ sealNumber: '003155', source: 'manual' }],
      deviceTimestamp: '2026-11-01T12:25:00.000Z',
      serverTimestamp: '2026-11-01T12:25:00.000Z'
    }
  );

  cont = store.get('bk_100').containers[0];
  // O responsável continua sendo João, mas a ação do lacre fica registrada em nome de Maria
  assert.equal(cont.responsibleInspector.id, 'usr_joao');
  assert.equal(cont.responsibleInspector.name, 'João');
  const mariaSealEv = cont.auditTimeline.find(e => e.action === 'seal_added' && e.newValue === '003155');
  assert.ok(mariaSealEv);
  assert.equal(mariaSealEv.userId, 'usr_maria');
  assert.equal(mariaSealEv.formattedText, '01/11/2026 às 09:25 — Maria adicionou o lacre provisório 003155.');

  // João finaliza a inspeção às 10:05 BRT
  await repo.patchContainer(
    'bk_100',
    'cont_1',
    { status: 'Finalizado' },
    { status: 'Pendente' },
    {
      authenticatedUser: inspectorJoao,
      deviceTimestamp: '2026-11-01T13:05:00.000Z',
      serverTimestamp: '2026-11-01T13:05:00.000Z'
    }
  );

  cont = store.get('bk_100').containers[0];
  const finEv = cont.auditTimeline.find(e => e.action === 'inspection_finalized');
  assert.ok(finEv);
  assert.equal(finEv.formattedText, '01/11/2026 às 10:05 — João finalizou a inspeção.');
});

test('Cenário 4: Início simultâneo por dois usuários preserva o primeiro responsável sem sobrescrever silenciosamente', async () => {
  const initialBooking = {
    id: 'bk_sim',
    bookingNumber: 'BK-SIM',
    clientId: 'client_interport',
    _revision: 1,
    containers: [
      {
        id: 'cont_sim',
        containerNumber: 'MSCU7654321',
        tara: '',
        definiteSeal: '',
        photos: [],
        provisionalSeals: []
      }
    ]
  };

  const { store, reference, transaction } = createInMemoryDb(initialBooking);
  const repo = createConcurrentRepository({ reference, transaction, requireAuth: true });

  // João e Maria disparam a primeira ação técnica concorrentemente no mesmo container ainda sem responsável
  await Promise.all([
    repo.patchContainer(
      'bk_sim',
      'cont_sim',
      { tara: '3800' },
      { tara: '' },
      { authenticatedUser: inspectorJoao, serverTimestamp: '2026-11-01T12:00:01.000Z' }
    ),
    repo.patchContainer(
      'bk_sim',
      'cont_sim',
      { definiteSeal: 'DEF999' },
      { definiteSeal: '' },
      { authenticatedUser: inspectorMaria, serverTimestamp: '2026-11-01T12:00:02.000Z' }
    )
  ]);

  const cont = store.get('bk_sim').containers[0];
  // João (primeiro a commitar) permanece como único inspetor responsável; Maria não o sobrescreve
  assert.equal(cont.responsibleInspector.id, 'usr_joao');
  assert.equal(cont.responsibleInspector.name, 'João');
  assert.equal(cont.tara, '3800');
  assert.equal(cont.definiteSeal, 'DEF999');

  // Apenas 1 evento de inspection_started foi gerado, e ambas as edições estão na linha do tempo com seus verdadeiros autores
  const startEvents = cont.auditTimeline.filter(e => e.action === 'inspection_started');
  assert.equal(startEvents.length, 1);
  assert.equal(startEvents[0].userId, 'usr_joao');

  const taraEv = cont.auditTimeline.find(e => e.action === 'field_updated' && e.targetItem === 'tara');
  const defEv = cont.auditTimeline.find(e => e.action === 'field_updated' && e.targetItem === 'definiteSeal');
  assert.equal(taraEv.userId, 'usr_joao');
  assert.equal(defEv.userId, 'usr_maria');
});

test('Cenário 5: Transferência autorizada de responsabilidade exige perfil ADM/MASTER e justificativa obrigatória', async () => {
  let container = {
    id: 'cont_tr',
    containerNumber: 'TGBU1112223',
    clientId: 'client_interport',
    responsibleInspector: {
      id: 'usr_joao',
      uid: 'usr_joao',
      name: 'João',
      role: 'Inspector'
    },
    auditTimeline: []
  };

  // 1. Inspetor comum tentando transferir -> bloqueado
  assert.throws(
    () =>
      transferContainerResponsibility({
        container,
        authenticatedUser: inspectorJoao,
        newResponsibleUser: inspectorMaria,
        reason: 'Vou sair para almoço'
      }),
    /apenas perfis autorizados/i
  );

  // 2. ADM tentando transferir sem justificativa -> bloqueado
  assert.throws(
    () =>
      transferContainerResponsibility({
        container,
        authenticatedUser: supervisorAdm,
        newResponsibleUser: inspectorMaria,
        reason: '  '
      }),
    /Justificativa obrigatória/i
  );

  // 3. ADM transfere com justificativa obrigatória -> sucesso e registro completo
  const res = transferContainerResponsibility({
    container,
    authenticatedUser: supervisorAdm,
    newResponsibleUser: inspectorMaria,
    reason: 'Troca de turno operacional às 14h',
    deviceTimestamp: '2026-11-01T17:00:00.000Z',
    serverTimestamp: '2026-11-01T17:00:01.000Z'
  });

  container = res.container;
  assert.equal(container.responsibleInspector.id, 'usr_maria');
  assert.equal(container.responsibleInspector.name, 'Maria');
  assert.equal(container.responsibleInspector.assignedBy.previousResponsibleId, 'usr_joao');
  assert.equal(container.responsibleInspector.assignedBy.previousResponsibleName, 'João');
  assert.equal(container.responsibleInspector.assignedBy.id, 'usr_adm');
  assert.equal(container.responsibleInspector.assignedBy.reason, 'Troca de turno operacional às 14h');

  const trEv = container.auditTimeline[0];
  assert.equal(trEv.action, 'responsibility_transferred');
  assert.equal(trEv.oldValue, 'João');
  assert.equal(trEv.newValue, 'Maria');
  assert.match(
    trEv.formattedText,
    /01\/11\/2026 às 14:00 — Carlos Supervisor transferiu a responsabilidade de João para Maria\. Motivo: Troca de turno operacional às 14h\./
  );
});

test('Cenário 6: Bloqueio de tentativa de falsificar autoria (spoofing), inspetor padrão e adulteração de histórico', () => {
  // 1. Tentar registrar ação sem estar autenticado
  assert.throws(() => resolveAuthenticatedActor(null), /usuário não autenticado/i);

  // 2. Tentar usar nome fixo / inspetor padrão
  assert.throws(
    () => resolveAuthenticatedActor({ id: 'default', name: 'Inspetor Padrão' }),
    /inválido ou ausente|inspetor padrão proibido/i
  );

  // 3. João autenticado tentando registrar ação em nome de Maria (spoofing de ID ou nome)
  assert.throws(
    () => resolveAuthenticatedActor(inspectorJoao, { id: 'usr_maria', name: 'Maria' }),
    /Tentativa de falsificar autoria bloqueada/i
  );
  assert.throws(
    () => resolveAuthenticatedActor(inspectorJoao, { id: 'usr_joao', name: 'Maria' }),
    /Tentativa de falsificar autoria bloqueada/i
  );

  // 4. Isolamento de cliente: inspetor de outro cliente tentando alterar container da Interport
  const otherClientInspector = {
    id: 'usr_ext',
    uid: 'usr_ext',
    name: 'Pedro Externo',
    role: 'Inspector',
    clientId: 'client_outro'
  };
  assert.throws(
    () =>
      applyViewAccessToContainer({
        container: { id: 'c1', clientId: 'client_interport' },
        authenticatedUser: otherClientInspector,
        clientId: 'client_interport'
      }),
    /Acesso negado/i
  );

  // 5. Proteção contra edição ou exclusão de eventos existentes na linha do tempo
  const existingTimeline = appendTimelineEvents([], [
    {
      id: 'evt_1',
      action: 'inspection_started',
      actor: inspectorJoao,
      userId: 'usr_joao',
      userName: 'João',
      deviceTimestamp: '2026-11-01T12:10:00.000Z',
      serverTimestamp: '2026-11-01T12:10:00.000Z'
    }
  ]);

  // Tentativa de apagar evento histórico
  assert.throws(() => assertTimelineImmutable(existingTimeline, []), /Violação de integridade da auditoria/i);

  // Tentativa de adulterar autor de evento histórico
  assert.throws(
    () =>
      assertTimelineImmutable(existingTimeline, [
        { ...existingTimeline[0], userId: 'usr_maria', userName: 'Maria' }
      ]),
    /Violação de integridade da auditoria/i
  );
});

test('Cenários 7, 8 e 9: Operação offline, troca de usuário no mesmo dispositivo e idempotência na sincronização repetida', async () => {
  clearOfflineAuditQueueForTests();

  // Cenário 7: João realiza ação offline às 09:00 BRT (12:00Z no relógio do aparelho)
  const offlineEntry = enqueueOfflineInspectionAction({
    authenticatedUser: inspectorJoao,
    action: 'seal_added',
    clientId: 'client_interport',
    bookingId: 'bk_off',
    containerId: 'cont_off',
    containerNumber: 'MSDU9998887',
    targetItem: 'Lacre provisório 007788',
    newValue: '007788',
    deviceTimestamp: '2026-11-01T12:00:00.000Z',
    eventId: 'evt_offline_joao_seal_007788'
  });

  assert.equal(offlineEntry.ownerUserId, 'usr_joao');
  assert.equal(offlineEntry.event.deviceTimestamp, '2026-11-01T12:00:00.000Z');
  assert.equal(offlineEntry.event.serverTimestamp, null);

  // Cenário 8: Maria faz login no mesmo aparelho em seguida -> não herda nem envia a pendência offline de João
  const mariaPending = getOfflinePendingActionsForUser(inspectorMaria);
  assert.equal(mariaPending.length, 0);

  let appliedEvents = [];
  const syncWhenMariaLogged = await syncOfflineInspectionActions({
    currentLoggedUser: inspectorMaria,
    onlyForCurrentLoggedUser: true,
    serverNowFn: () => '2026-11-01T12:30:00.000Z',
    applySyncedEntry: async (entry) => {
      appliedEvents.push(entry.syncedEvent);
    }
  });
  assert.equal(syncWhenMariaLogged.synced.length, 0);
  assert.equal(syncWhenMariaLogged.remaining.length, 1);

  // Quando João reconecta e sincroniza às 09:45 BRT (12:45Z no servidor), preserva a autoria de João e distingue deviceTimestamp e serverTimestamp
  const syncWhenJoaoLogged = await syncOfflineInspectionActions({
    currentLoggedUser: inspectorJoao,
    onlyForCurrentLoggedUser: true,
    serverNowFn: () => '2026-11-01T12:45:00.000Z',
    applySyncedEntry: async (entry) => {
      appliedEvents.push(entry.syncedEvent);
    }
  });

  assert.equal(syncWhenJoaoLogged.synced.length, 1);
  const syncedEv = appliedEvents[0];
  assert.equal(syncedEv.userId, 'usr_joao');
  assert.equal(syncedEv.userName, 'João');
  assert.equal(syncedEv.deviceTimestamp, '2026-11-01T12:00:00.000Z');
  assert.equal(syncedEv.serverTimestamp, '2026-11-01T12:45:00.000Z');
  // Usa o horário do servidor (09:45 BRT) como referência de auditoria
  assert.equal(syncedEv.formattedText, '01/11/2026 às 09:45 — João adicionou o lacre provisório 007788.');

  // Cenário 9: Sincronização repetida do mesmo evento não duplica na linha do tempo
  let timeline = appendTimelineEvents([], [syncedEv]);
  timeline = appendTimelineEvents(timeline, [syncedEv]);
  timeline = appendTimelineEvents(timeline, [{ ...syncedEv }]);
  assert.equal(timeline.length, 1);
});

test('Cenário 10: Reconhecimento automático de lacres provisórios é registrado como "Sistema", vinculado à foto, quem capturou e quem solicitou', async () => {
  const container = {
    id: 'cont_ocr_audit',
    containerNumber: 'MSDU5554443',
    clientId: 'client_interport',
    bookingId: 'bk_ocr',
    responsibleInspector: {
      id: 'usr_joao',
      uid: 'usr_joao',
      name: 'João',
      role: 'Inspector'
    },
    photos: [
      {
        id: 'photo_seal_1',
        url: 'data:image/jpeg;base64,AAA',
        sizeBytes: 12345,
        compressionVersion: '1',
        authorId: 'usr_joao',
        authorName: 'João',
        capturedBy: { id: 'usr_joao', name: 'João' }
      }
    ],
    provisionalSeals: [],
    auditTimeline: []
  };

  // Maria atualiza o container disparando o processamento em segundo plano da foto que foi capturada por João
  const updated = await processContainerProvisionalSeals({
    container,
    bookingId: 'bk_ocr',
    clientId: 'client_interport',
    requestedBy: inspectorMaria,
    customOcrRunner: async () => ({
      confirmed: [{ sealNumber: '005745', confidence: 0.96 }],
      doubtful: []
    })
  });

  assert.deepEqual(updated.provisionalSeals, ['005745']);
  const prov = updated.sealProvenance['005745'];
  assert.equal(prov.source, 'ocr');
  assert.equal(prov.actorType, 'system');
  assert.equal(prov.actorName, 'Sistema');
  assert.deepEqual(prov.photoIds, ['photo_seal_1']);
  assert.equal(prov.capturedBy.id, 'usr_joao');
  assert.equal(prov.capturedBy.name, 'João');
  assert.equal(prov.requestedBy.id, 'usr_maria');
  assert.equal(prov.requestedBy.name, 'Maria');

  const autoEv = updated.auditTimeline.find(e => e.action === 'seal_recognized_auto');
  assert.ok(autoEv);
  assert.equal(autoEv.actor.id, SYSTEM_ACTOR.id);
  assert.equal(autoEv.userName, 'Sistema');
  assert.equal(autoEv.actorType, 'system');
  assert.equal(autoEv.metadata.photoId, 'photo_seal_1');
  assert.equal(autoEv.metadata.capturedBy, 'usr_joao');
  assert.equal(autoEv.metadata.capturedByName, 'João');
  assert.equal(autoEv.metadata.requestedBy, 'usr_maria');
  assert.equal(autoEv.metadata.requestedByName, 'Maria');
  assert.match(
    autoEv.formattedText,
    /Sistema reconheceu automaticamente o lacre provisório 005745 a partir da foto photo_seal_1 \(capturada por João, processamento solicitado por Maria\)\./
  );
});

test('Cenário 11: Emissão, assinatura digital e download do certificado respeitam permissões e separam responsabilidade de assinatura', () => {
  let container = {
    id: 'cont_cert',
    containerNumber: 'MSDU1010101',
    clientId: 'client_interport',
    bookingId: 'bk_cert',
    responsibleInspector: {
      id: 'usr_joao',
      uid: 'usr_joao',
      name: 'João',
      role: 'Inspector'
    },
    auditTimeline: []
  };
  const booking = {
    id: 'bk_cert',
    certificateNumber: 'UN2050/2026',
    clientId: 'client_interport'
  };

  // 1. O preenchimento automático do inspetor responsável NÃO assina o certificado automaticamente
  const respInfo = getResponsibleInspectorInfo(container, booking);
  assert.equal(respInfo.name, 'João');
  assert.equal(container.certificateSignature, undefined);

  // 2. Maria (outro inspetor comum que não é o responsável) tenta assinar o certificado -> bloqueado!
  assert.throws(
    () =>
      signInspectionCertificate({
        container,
        booking,
        authenticatedUser: inspectorMaria
      }),
    /apenas o inspetor responsável \(João\) ou um administrador autorizado pode assinar/i
  );

  // 3. Geração do relatório é registrada na linha do tempo
  const genRes = recordReportAuditAction({
    container,
    authenticatedUser: inspectorJoao,
    actionType: 'report_generated',
    format: 'PDF',
    bookingId: 'bk_cert',
    serverTimestamp: '2026-11-01T14:10:00.000Z'
  });
  container = genRes.container;

  // 4. João (inspetor responsável) assina digitalmente o certificado
  const signRes = signInspectionCertificate({
    container,
    booking,
    authenticatedUser: inspectorJoao,
    bookingId: 'bk_cert',
    deviceTimestamp: '2026-11-01T14:15:00.000Z',
    serverTimestamp: '2026-11-01T14:15:00.000Z'
  });
  container = signRes.container;

  assert.equal(container.certificateSignature.isSigned, true);
  assert.equal(container.certificateSignature.signedBy.id, 'usr_joao');
  assert.equal(container.certificateSignature.signedBy.name, 'João');
  assert.equal(container.certificateSignature.certificateNumber, 'UN2050/2026');

  // 5. Download do relatório (PDF) é registrado na linha do tempo
  const dlRes = recordReportAuditAction({
    container,
    authenticatedUser: inspectorJoao,
    actionType: 'report_downloaded',
    format: 'PDF',
    bookingId: 'bk_cert',
    serverTimestamp: '2026-11-01T14:16:00.000Z'
  });
  container = dlRes.container;

  const actions = container.auditTimeline.map(e => e.action);
  assert.deepEqual(actions, ['report_generated', 'certificate_signed', 'report_downloaded']);
  assert.equal(container.auditTimeline[1].formattedText, '01/11/2026 às 11:15 — João assinou digitalmente o certificado.');
  assert.equal(container.auditTimeline[2].formattedText, '01/11/2026 às 11:16 — João baixou o relatório (PDF).');
});
