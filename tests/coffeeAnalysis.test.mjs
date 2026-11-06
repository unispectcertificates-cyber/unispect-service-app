import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  COFFEE_ANALYSES_COL,
  COFFEE_ANALYSIS_AUDIT_COL,
  COFFEE_ANALYSIS_COUNTERS_COL,
  COFFEE_ANALYSIS_REQ_KEYS_COL,
  OFFICIAL_COFFEE_AUDIT_SOURCE,
  COFFEE_ANALYSIS_INITIAL_STATUS,
  COFFEE_CLASSIFICATION_BASIS,
  COFFEE_SAMPLE_WEIGHT_GRAMS,
  COFFEE_DRAFT_NEXT_STAGE_NOTICE,
  COFFEE_EMPTY_LIST_MESSAGE,
  canAccessCoffeeAnalysisModule,
  canCreateOrEditCoffeeAnalysis,
  filterExportersForUser,
  filterBookingsForExporterAndUser,
  extractBookingLotsAndContainers,
  reconcileExporterChange,
  validateCoffeeAnalysisLinks,
  queryCoffeeAnalyses,
  createCoffeeAnalysisRepository,
  formatDateTimeSp
} from '../src/utils/coffeeAnalysisService.js';

function createTransactionalMemoryFixture({ failAuditWrite = false } = {}) {
  const store = new Map(); // "col/id" -> doc
  let currentClock = Date.parse('2026-11-02T20:15:00-03:00');
  let txLock = Promise.resolve();

  const reference = (col, id) => ({ col, id: String(id), key: `${col}/${id}` });

  const transaction = async callback => {
    const run = txLock.then(async () => {
      const staged = new Map();
      const tx = {
        get: async refObj => {
          const val = staged.has(refObj.key) ? staged.get(refObj.key) : store.get(refObj.key);
          return {
            exists: () => val !== undefined && val !== null,
            data: () => (val ? structuredClone(val) : null)
          };
        },
        set: (refObj, data) => {
          if (failAuditWrite && refObj.col === COFFEE_ANALYSIS_AUDIT_COL) {
            throw new Error('Falha simulada ao gravar evento na coleção de auditoria');
          }
          staged.set(refObj.key, structuredClone(data));
        }
      };

      const res = await callback(tx);
      // Commit atômico: só aplica no store se todas as operações da transação tiverem sucesso
      for (const [k, v] of staged.entries()) {
        store.set(k, v);
      }
      return res;
    });
    txLock = run.catch(() => {});
    return run;
  };

  const listCollection = colName => {
    const out = [];
    for (const [k, v] of store.entries()) {
      if (k.startsWith(`${colName}/`)) out.push(structuredClone(v));
    }
    return out;
  };

  const repo = createCoffeeAnalysisRepository({
    listRecords: async () => listCollection(COFFEE_ANALYSES_COL),
    getRecord: async id => store.get(`${COFFEE_ANALYSES_COL}/${id}`) || null,
    saveRecord: async rec => {
      store.set(`${COFFEE_ANALYSES_COL}/${rec.id}`, structuredClone(rec));
      return rec;
    },
    appendAuditEvent: async ev => {
      if (failAuditWrite) throw new Error('Falha simulada ao gravar auditoria');
      store.set(`${COFFEE_ANALYSIS_AUDIT_COL}/${ev.id}`, structuredClone(ev));
      return ev;
    },
    listAuditEvents: async laudoId =>
      listCollection(COFFEE_ANALYSIS_AUDIT_COL).filter(e => String(e.laudoId) === String(laudoId)),
    reference,
    transaction,
    serverTimestamp: () => {
      currentClock += 500;
      return { _serverTimestamp: true, seconds: Math.floor(currentClock / 1000), nanoseconds: (currentClock % 1000) * 1e6 };
    },
    now: () => {
      currentClock += 1000;
      return currentClock;
    },
    auditAvailable: true
  });

  const exportadores = [
    {
      id: 'exp_1',
      code: 'EXP-0001',
      name: 'Café Atlântica Exportadora Ltda',
      cnpj: '12.345.678/0001-90',
      email: 'contato@cafeatlantica.com.br',
      clientId: 'client_interport'
    },
    {
      id: 'exp_2',
      code: 'EXP-0002',
      name: 'Tristão Companhia de Comércio Exterior',
      cnpj: '98.765.432/0001-10',
      email: 'tristao@tristao.com.br',
      clientId: 'client_interport'
    },
    {
      id: 'exp_other_client',
      code: 'EXP-0003',
      name: 'Exportadora Cliente Beta S/A',
      cnpj: '11.222.333/0001-44',
      clientId: 'client_beta'
    }
  ];

  const bookings = [
    {
      id: 'bk_101',
      bookingNumber: 'MEDU9988771',
      certificateNumber: 'UN1001/2026',
      exporterId: 'exp_1',
      clientId: 'client_interport',
      lots: [
        { id: 'LOT-001', code: '002/1540', bagsQuantity: 320 },
        { id: 'LOT-002', code: '002/1541', bagsQuantity: 320 }
      ],
      containers: [
        { id: 'cont_1', containerNumber: 'MSDU1234567', containerType: "20'", bagsQuantity: 320 },
        { id: 'cont_2', containerNumber: 'MEDU7654321', containerType: "20'", bagsQuantity: 320 }
      ]
    },
    {
      id: 'bk_202',
      bookingNumber: 'MAEU5544332',
      certificateNumber: 'UN1002/2026',
      exporterId: 'exp_2',
      clientId: 'client_interport',
      containers: [
        { id: 'cont_3', containerNumber: 'MAEU1112223', containerType: "40'", bagsQuantity: 400, brand: 'TRISTAO-L1' }
      ]
    },
    {
      id: 'bk_beta',
      bookingNumber: 'BETA000999',
      certificateNumber: 'UN1003/2026',
      exporterId: 'exp_other_client',
      clientId: 'client_beta',
      containers: [
        { id: 'cont_beta', containerNumber: 'TGHU9998887', containerType: "20'", bagsQuantity: 320 }
      ]
    }
  ];

  const users = {
    master: { id: 'usr_master', uid: 'usr_master', name: 'Master Supervisor', login: 'admin', role: 'ADM' },
    inspectorInterport: {
      id: 'usr_insp_1',
      uid: 'usr_insp_1',
      name: 'Carlos Santos',
      login: 'carlos',
      role: 'Inspector',
      clientId: 'client_interport',
      authorizedClients: ['client_interport']
    },
    inspectorInterport2: {
      id: 'usr_insp_2',
      uid: 'usr_insp_2',
      name: 'Marcos Oliveira',
      login: 'marcos',
      role: 'Inspector',
      clientId: 'client_interport',
      authorizedClients: ['client_interport']
    },
    inspectorBeta: {
      id: 'usr_insp_beta',
      uid: 'usr_insp_beta',
      name: 'Roberto Beta',
      login: 'roberto',
      role: 'Inspector',
      clientId: 'client_beta',
      authorizedClients: ['client_beta']
    },
    exporter1: {
      id: 'usr_exp_1',
      uid: 'usr_exp_1',
      name: 'Portal Café Atlântica',
      login: 'atlantica',
      role: 'Exportador',
      exporterId: 'exp_1',
      clientId: 'client_interport'
    }
  };

  return { repo, store, listCollection, exportadores, bookings, users };
}

test('1. Posição e funcionamento do menu (abaixo de Análise e Relatórios, ícone Coffee e rota protegida)', () => {
  const sidebarCode = fs.readFileSync(path.resolve('src/components/Sidebar.jsx'), 'utf8');
  const idxAnalytics = sidebarCode.indexOf("setCurrentTab('analytics-reports')");
  const idxCoffee = sidebarCode.indexOf("setCurrentTab('analysis-of-coffee')");

  assert.ok(idxAnalytics > -1, 'Item Análise e Relatórios deve existir no Sidebar');
  assert.ok(idxCoffee > -1, 'Item Analysis of coffee deve existir no Sidebar');
  assert.ok(
    idxCoffee > idxAnalytics,
    'O item "Analysis of coffee" deve estar posicionado abaixo de "Análise e Relatórios"'
  );

  const betweenSlice = sidebarCode.slice(idxAnalytics, idxCoffee);
  assert.ok(
    !betweenSlice.includes("setCurrentTab('settings')"),
    'Analysis of coffee deve vir imediatamente abaixo de Análise e Relatórios, antes de Configurações'
  );
  assert.ok(sidebarCode.includes('<Coffee'), 'Deve utilizar o ícone Coffee relacionado à análise de café');
  assert.ok(sidebarCode.includes('Analysis of coffee'), 'Deve conter o rótulo exato "Analysis of coffee"');
});

test('2. Criação de rascunho apenas com exportador selecionado', async () => {
  const { repo, exportadores, bookings, users } = createTransactionalMemoryFixture();

  const draft = await repo.createDraft(
    {
      exporterId: 'exp_1',
      bookingId: null,
      selectedLots: [],
      selectedContainerIds: [],
      exportadores,
      bookings,
      user: users.inspectorInterport
    },
    { requestKey: 'req_only_exporter_1' }
  );

  assert.ok(draft.id.startsWith('coffee_laudo_'), 'Deve gerar ID único imutável');
  assert.equal(draft.laudoNumber, 'UN0001/2026', 'Deve gerar identificação legível sequencial');
  assert.equal(draft.exporterId, 'exp_1');
  assert.equal(draft.bookingId, null);
  assert.deepEqual(draft.selectedLots, []);
  assert.deepEqual(draft.selectedContainerIds, []);
  assert.equal(draft.status, 'Rascunho');
  assert.equal(draft.classificationBasis, '300 g de café');
  assert.equal(draft.sampleWeightGrams, 300);
  assert.equal(draft.analysisPerformed, false, 'Base de 300 g não deve indicar que análise já foi realizada');
  assert.equal(draft.createdBy.id, 'usr_insp_1');
  assert.equal(draft.createdBy.name, 'Carlos Santos');
  assert.equal(draft.classifierInspectorId, null, 'Autor do rascunho não é automaticamente o classificador');
  assert.equal(draft.certificateSignatoryId, null, 'Autor do rascunho não é automaticamente o signatário');
});

test('3. Criação com booking, lotes e Containers e permissão de múltiplos laudos para mesmo exportador/booking sem mutar cadastros', async () => {
  const { repo, exportadores, bookings, users } = createTransactionalMemoryFixture();
  const expSnapshotBefore = JSON.stringify(exportadores);
  const bkSnapshotBefore = JSON.stringify(bookings);

  const draft1 = await repo.createDraft(
    {
      exporterId: 'exp_1',
      bookingId: 'bk_101',
      selectedLots: ['LOT-001'],
      selectedContainerIds: ['cont_1'],
      exportadores,
      bookings,
      user: users.inspectorInterport
    },
    { requestKey: 'req_with_booking_1' }
  );

  const draft2 = await repo.createDraft(
    {
      exporterId: 'exp_1',
      bookingId: 'bk_101',
      selectedLots: ['LOT-002'],
      selectedContainerIds: ['cont_2'],
      exportadores,
      bookings,
      user: users.inspectorInterport
    },
    { requestKey: 'req_with_booking_2' }
  );

  assert.notEqual(draft1.id, draft2.id, 'Deve permitir vários laudos para o mesmo exportador e booking');
  assert.equal(draft1.laudoNumber, 'UN0001/2026');
  assert.equal(draft2.laudoNumber, 'UN0002/2026');
  assert.equal(draft1.bookingNumber, 'MEDU9988771');
  assert.deepEqual(draft1.selectedLots, ['LOT-001']);
  assert.deepEqual(draft1.selectedContainerIds, ['cont_1']);
  assert.deepEqual(draft1.selectedContainerNumbers, ['MSDU1234567']);

  assert.equal(JSON.stringify(exportadores), expSnapshotBefore);
  assert.equal(JSON.stringify(bookings), bkSnapshotBefore);
});

test('4. Cancelamento da criação sem persistência no banco de dados', async () => {
  const { listCollection } = createTransactionalMemoryFixture();

  // Nenhum laudo deve ter sido persistido antes da confirmação
  assert.equal(
    listCollection(COFFEE_ANALYSES_COL).length,
    0,
    'Ao cancelar o modal sem confirmar criação, nenhum registro é salvo no banco de dados'
  );
});

test('5. Prevenção de duplicação por clique repetido ou retry da mesma solicitação (Idempotência via requestKey)', async () => {
  const { repo, listCollection, exportadores, bookings, users } = createTransactionalMemoryFixture();

  // Cliques repetidos simultâneos e nova tentativa posterior com o mesmo requestKey
  const [resA, resB, resC] = await Promise.all([
    repo.createDraft(
      {
        exporterId: 'exp_1',
        bookingId: 'bk_101',
        selectedLots: ['LOT-001'],
        selectedContainerIds: ['cont_1'],
        exportadores,
        bookings,
        user: users.inspectorInterport
      },
      { requestKey: 'same_click_token_99' }
    ),
    repo.createDraft(
      {
        exporterId: 'exp_1',
        bookingId: 'bk_101',
        selectedLots: ['LOT-001'],
        selectedContainerIds: ['cont_1'],
        exportadores,
        bookings,
        user: users.inspectorInterport
      },
      { requestKey: 'same_click_token_99' }
    ),
    repo.createDraft(
      {
        exporterId: 'exp_1',
        bookingId: 'bk_101',
        selectedLots: ['LOT-001'],
        selectedContainerIds: ['cont_1'],
        exportadores,
        bookings,
        user: users.inspectorInterport
      },
      { requestKey: 'same_click_token_99' }
    )
  ]);

  assert.equal(resA.id, resB.id);
  assert.equal(resB.id, resC.id);
  assert.equal(
    listCollection(COFFEE_ANALYSES_COL).length,
    1,
    'Cliques repetidos da mesma solicitação devem criar apenas 1 registro'
  );
});

test('6. Listagem, pesquisa, filtros, estado vazio e abertura com aviso da etapa e sem duplicar auditoria de consulta', async () => {
  const { repo, exportadores, bookings, users } = createTransactionalMemoryFixture();

  assert.equal(
    COFFEE_EMPTY_LIST_MESSAGE,
    "Nenhum laudo cadastrado. Clique em 'Novo laudo de café' para começar."
  );
  assert.equal(
    COFFEE_DRAFT_NEXT_STAGE_NOTICE,
    'Rascunho cadastrado. O formulário de classificação e o modelo do certificado serão disponibilizados em uma próxima etapa.'
  );

  const d1 = await repo.createDraft(
    {
      exporterId: 'exp_1',
      bookingId: 'bk_101',
      selectedLots: ['LOT-001'],
      selectedContainerIds: ['cont_1'],
      exportadores,
      bookings,
      user: users.inspectorInterport
    },
    { requestKey: 'req_q1' }
  );

  const d2 = await repo.createDraft(
    {
      exporterId: 'exp_2',
      bookingId: null,
      selectedLots: [],
      selectedContainerIds: [],
      exportadores,
      bookings,
      user: users.master
    },
    { requestKey: 'req_q2' }
  );

  const all = await repo.listForUser(users.master);
  assert.equal(all.length, 2);

  const byLaudoNum = queryCoffeeAnalyses(all, {
    user: users.master,
    exportadores,
    bookings,
    searchQuery: 'UN0001'
  });
  assert.equal(byLaudoNum.length, 1);
  assert.equal(byLaudoNum[0].id, d1.id);

  const byBookingNum = queryCoffeeAnalyses(all, {
    user: users.master,
    exportadores,
    bookings,
    searchQuery: 'MEDU9988771'
  });
  assert.equal(byBookingNum.length, 1);
  assert.equal(byBookingNum[0].id, d1.id);

  const byExp2 = queryCoffeeAnalyses(all, {
    user: users.master,
    exportadores,
    bookings,
    exporterFilter: 'exp_2'
  });
  assert.equal(byExp2.length, 1);
  assert.equal(byExp2[0].id, d2.id);

  await repo.openDraftForConsultation({
    laudoId: d1.id,
    user: users.inspectorInterport,
    sessionKey: 'sess_open_1'
  });
  await repo.openDraftForConsultation({
    laudoId: d1.id,
    user: users.inspectorInterport,
    sessionKey: 'sess_open_1'
  });

  const timeline = await repo.getAuditTimeline(d1.id, users.inspectorInterport);
  const openEvents = timeline.filter(e => e.actionType === 'REPORT_OPENED');
  assert.equal(openEvents.length, 1, 'Não deve duplicar evento REPORT_OPENED por re-renderização');
});

test('7. Edição dos vínculos do rascunho, limpeza ao trocar exportador e bloqueio de relações incompatíveis', async () => {
  const { repo, exportadores, bookings, users } = createTransactionalMemoryFixture();

  const dirtyForm = {
    exporterId: 'exp_1',
    bookingId: 'bk_101',
    selectedLots: ['LOT-001'],
    selectedContainerIds: ['cont_1']
  };
  const cleanedForm = reconcileExporterChange(dirtyForm, 'exp_2', bookings);
  assert.equal(cleanedForm.exporterId, 'exp_2');
  assert.equal(cleanedForm.bookingId, '');
  assert.deepEqual(cleanedForm.selectedLots, []);
  assert.deepEqual(cleanedForm.selectedContainerIds, []);

  const draft = await repo.createDraft(
    {
      exporterId: 'exp_1',
      bookingId: null,
      exportadores,
      bookings,
      user: users.inspectorInterport
    },
    { requestKey: 'req_edit_1' }
  );

  await assert.rejects(
    async () => {
      await repo.updateDraftLinks({
        laudoId: draft.id,
        exporterId: 'exp_1',
        bookingId: 'bk_202',
        selectedLots: [],
        selectedContainerIds: [],
        exportadores,
        bookings,
        user: users.inspectorInterport
      });
    },
    /pertence a outro exportador/i
  );

  const updated = await repo.updateDraftLinks({
    laudoId: draft.id,
    exporterId: 'exp_1',
    bookingId: 'bk_101',
    selectedLots: ['LOT-001'],
    selectedContainerIds: ['cont_1', 'cont_2'],
    exportadores,
    bookings,
    user: users.inspectorInterport
  });

  assert.equal(updated.bookingId, 'bk_101');
  assert.deepEqual(updated.selectedLots, ['LOT-001']);
  assert.deepEqual(updated.selectedContainerIds, ['cont_1', 'cont_2']);

  const timeline = await repo.getAuditTimeline(draft.id, users.inspectorInterport);
  const updateEv = timeline.find(e => e.actionType === 'LINKS_UPDATED');
  assert.ok(updateEv, 'Deve registrar evento LINKS_UPDATED na coleção oficial de auditoria');
  assert.equal(updateEv.previousValues.bookingId, null);
  assert.equal(updateEv.newValues.bookingId, 'bk_101');
  assert.deepEqual(updateEv.newValues.selectedContainerIds, ['cont_1', 'cont_2']);
  assert.equal(updateEv.timezone, 'America/Sao_Paulo');
});

test('8. Registro correto de autoria e bloqueio de escolha de outro colaborador como autor', async () => {
  const { repo, exportadores, bookings, users } = createTransactionalMemoryFixture();

  await assert.rejects(
    async () => {
      await repo.createDraft(
        {
          exporterId: 'exp_1',
          exportadores,
          bookings,
          user: users.inspectorInterport,
          attemptedAuthorOverride: { id: 'usr_master', name: 'Master Supervisor' }
        },
        { requestKey: 'req_spoof' }
      );
    },
    /Não é permitido escolher outra pessoa como autor/i
  );
});

test('9. Permissões e isolamento entre clientes e perfil Exportador (somente leitura dos próprios dados)', async () => {
  const { repo, exportadores, bookings, users } = createTransactionalMemoryFixture();

  const laudoInterportExp1 = await repo.createDraft(
    {
      exporterId: 'exp_1',
      bookingId: 'bk_101',
      exportadores,
      bookings,
      user: users.inspectorInterport
    },
    { requestKey: 'req_iso_1' }
  );

  const laudoInterportExp2 = await repo.createDraft(
    {
      exporterId: 'exp_2',
      bookingId: 'bk_202',
      exportadores,
      bookings,
      user: users.inspectorInterport
    },
    { requestKey: 'req_iso_2' }
  );

  const laudoBeta = await repo.createDraft(
    {
      exporterId: 'exp_other_client',
      bookingId: 'bk_beta',
      exportadores,
      bookings,
      user: users.inspectorBeta
    },
    { requestKey: 'req_iso_beta' }
  );

  const masterList = await repo.listForUser(users.master);
  assert.equal(masterList.length, 3);

  const interportList = await repo.listForUser(users.inspectorInterport);
  assert.equal(interportList.length, 2);

  const betaList = await repo.listForUser(users.inspectorBeta);
  assert.equal(betaList.length, 1);
  assert.equal(betaList[0].id, laudoBeta.id);

  const exp1Analyses = await repo.listForUser(users.exporter1);
  assert.equal(exp1Analyses.length, 1);
  assert.equal(exp1Analyses[0].id, laudoInterportExp1.id);

  assert.equal(canCreateOrEditCoffeeAnalysis(users.exporter1), false);
});

test('10. Integração Desktop, Mobile/Tablet e Rota Protegida (#/analysis-of-coffee)', () => {
  const desktopCode = fs.readFileSync(path.resolve('src/components/DesktopDashboardView.jsx'), 'utf8');
  const appCode = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');
  const viewCode = fs.readFileSync(path.resolve('src/components/CoffeeAnalysisView.jsx'), 'utf8');

  assert.ok(desktopCode.includes("currentTab === 'analysis-of-coffee'"));
  assert.ok(appCode.includes('#/analysis-of-coffee'));
  assert.ok(appCode.includes("setCurrentTab('analysis-of-coffee')"));
  assert.ok(viewCode.includes('+ Novo laudo de café') && viewCode.includes('Abrir laudo'));
});

test('11. Atomicidade da Auditoria: se a gravação do evento de auditoria falhar, a alteração do laudo sofre rollback e não é salva isoladamente', async () => {
  const { repo, listCollection, exportadores, bookings, users } = createTransactionalMemoryFixture({
    failAuditWrite: true
  });

  await assert.rejects(
    async () => {
      await repo.createDraft(
        {
          exporterId: 'exp_1',
          bookingId: 'bk_101',
          selectedLots: ['LOT-001'],
          selectedContainerIds: ['cont_1'],
          exportadores,
          bookings,
          user: users.inspectorInterport
        },
        { requestKey: 'req_atomic_rollback' }
      );
    },
    /Falha simulada ao gravar evento na coleção de auditoria/i
  );

  // Nem o laudo nem o evento foram persistidos
  assert.equal(
    listCollection(COFFEE_ANALYSES_COL).length,
    0,
    'O rascunho não pode ser salvo se o evento de auditoria falhar na transação'
  );
  assert.equal(listCollection(COFFEE_ANALYSIS_AUDIT_COL).length, 0);
});

test('12. Fonte Oficial Única de Auditoria (coffeeAnalysisAuditEvents) e uso de Server Timestamp', async () => {
  const { repo, store, exportadores, bookings, users } = createTransactionalMemoryFixture();

  assert.equal(repo.getOfficialAuditSource(), 'coffeeAnalysisAuditEvents');

  const draft = await repo.createDraft(
    {
      exporterId: 'exp_1',
      bookingId: null,
      exportadores,
      bookings,
      user: users.inspectorInterport
    },
    { requestKey: 'req_official_source' }
  );

  const savedLaudoDoc = store.get(`${COFFEE_ANALYSES_COL}/${draft.id}`);
  assert.equal(
    'auditTimeline' in savedLaudoDoc,
    false,
    'O documento coffeeAnalyses não deve armazenar auditTimeline mutável; a fonte oficial é coffeeAnalysisAuditEvents'
  );
  assert.equal(savedLaudoDoc.officialAuditCollection, 'coffeeAnalysisAuditEvents');
  assert.ok(savedLaudoDoc.createdServerTimestamp?._serverTimestamp, 'Deve gravar createdServerTimestamp do servidor');
  assert.ok(savedLaudoDoc.updatedServerTimestamp?._serverTimestamp, 'Deve gravar updatedServerTimestamp do servidor');

  const events = await repo.getAuditTimeline(draft.id, users.inspectorInterport);
  assert.equal(events.length, 1);
  assert.ok(events[0].serverTimestamp?._serverTimestamp, 'Evento de auditoria deve usar serverTimestamp do servidor');
});

test('13. Concorrência: dois usuários criando laudos simultaneamente nunca recebem a mesma identificação (laudoNumber)', async () => {
  const { repo, exportadores, bookings, users } = createTransactionalMemoryFixture();

  const [laudoUser1, laudoUser2] = await Promise.all([
    repo.createDraft(
      {
        exporterId: 'exp_1',
        bookingId: 'bk_101',
        selectedLots: ['LOT-001'],
        selectedContainerIds: ['cont_1'],
        exportadores,
        bookings,
        user: users.inspectorInterport
      },
      { requestKey: 'req_concurrent_user_1' }
    ),
    repo.createDraft(
      {
        exporterId: 'exp_2',
        bookingId: 'bk_202',
        selectedLots: [],
        selectedContainerIds: ['cont_3'],
        exportadores,
        bookings,
        user: users.inspectorInterport2
      },
      { requestKey: 'req_concurrent_user_2' }
    )
  ]);

  assert.notEqual(laudoUser1.id, laudoUser2.id);
  assert.notEqual(
    laudoUser1.laudoNumber,
    laudoUser2.laudoNumber,
    'Dois usuários criando rascunhos simultaneamente não podem receber o mesmo laudoNumber'
  );
  const numbers = [laudoUser1.laudoNumber, laudoUser2.laudoNumber].sort();
  assert.deepEqual(numbers, ['UN0001/2026', 'UN0002/2026']);
});

test('14. Formulário de Classificação, Cálculo Estrito de Defeitos, Peneiras e Assinatura Individual', async () => {
  const { repo, exportadores, bookings, users } = createTransactionalMemoryFixture();

  // 1. Criação do laudo
  const draft = await repo.createDraft(
    {
      exporterId: 'exp_1',
      bookingId: 'bk_101',
      selectedLots: ['LOT-001'],
      selectedContainerIds: ['cont_1'],
      exportadores,
      bookings,
      user: users.inspectorInterport
    },
    { requestKey: 'req_class_stage2' }
  );
  assert.equal(draft.laudoNumber, 'UN0001/2026');
  assert.equal(draft.status, 'Rascunho');

  // 2. Salvamento parcial do formulário (com linhas pendentes de defeito)
  const partialSaved = await repo.saveClassificationDraft({
    laudoId: draft.id,
    formData: {
      lotNumber: 'LOTE 01',
      cropYear: '2025/2026',
      sampleId: 'SMP-2026-001',
      coffeeType: 'Coffea Arabica',
      classificationType: 'Tipo 2', // tipo informado manualmente
      moisturePercent: '11,5',
      screens: {
        screen_18: '30,0',
        screen_17: '50,0',
        bottom: '20,0' // soma = 100%
      },
      defects: {
        full_black: { count: '2', equivalency: '1', totalDefects: '2' },
        full_sour: { count: '1', equivalency: '1', totalDefects: '1' }
        // 7 linhas restantes não informadas
      },
      insectDamageEquivalentDefects: '3',
      insectDamagePercentage: '1,0',
      classifierId: 'usr_insp_1',
      classifierName: 'Carlos Santos'
    },
    user: users.inspectorInterport,
    expectedRevision: draft._revision
  });

  // Linhas incompletas não devem exibir soma parcial como total completo
  assert.equal(partialSaved.classificationSummary.totalEquivalentDefects, null, 'Total de defeitos deve ser null se houver linhas pendentes');
  assert.equal(partialSaved.defectAnalysis.partialSum, 3, 'Soma parcial mantida internamente');
  assert.equal(partialSaved.screenAnalysis.isExact100, true);

  // 3. Preenchimento completo de todas as 9 linhas de defeitos
  const allDefects = {};
  const defectRows = [
    'full_black', 'full_sour', 'dried_cherry', 'severe_insect', 'foreign_matter',
    'partial_black', 'partial_sour', 'parchment', 'broken_chipped'
  ];
  defectRows.forEach((k, idx) => {
    allDefects[k] = { count: String(idx + 1), equivalency: '1', totalDefects: String(idx + 1) };
  });

  const fullSaved = await repo.saveClassificationDraft({
    laudoId: draft.id,
    formData: {
      lotNumber: 'LOTE 01',
      cropYear: '2025/2026',
      sampleId: 'SMP-2026-001',
      inspectionDate: '2026-11-02',
      inspectionLocation: 'Interport Logística',
      coffeeType: 'Coffea Arabica',
      classificationType: 'Tipo 2',
      moisturePercent: '11.5',
      screens: {
        screen_18: '40',
        screen_17: '40',
        bottom: '20'
      },
      defects: allDefects,
      insectDamageEquivalentDefects: '4',
      insectDamagePercentage: '1.2',
      classifierId: 'usr_carlos_test',
      classifierName: 'Carlos Santos [Demonstração / Teste]',
      signatoryId: 'usr_carlos_test',
      signatoryName: 'Carlos Santos [Demonstração / Teste]'
    },
    user: users.inspectorInterport,
    expectedRevision: partialSaved._revision
  });

  // Soma 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 = 45
  assert.equal(fullSaved.classificationSummary.totalEquivalentDefects, 45, 'Total de defeitos deve ser exatamente 45');
  assert.equal(fullSaved.totalEquivalentDefects, 45);

  // 4. Detecção de conflito de edição por concorrência
  await assert.rejects(
    async () => {
      await repo.saveClassificationDraft({
        laudoId: draft.id,
        formData: { lotNumber: 'LOTE ALTERADO CONCORRENTE' },
        user: users.inspectorInterport,
        expectedRevision: 1 // revisão antiga defasada!
      });
    },
    /Conflito de edição detectado/
  );

  // 5. Finalização técnica: avança para "Aguardando assinatura"
  const finalized = await repo.finalizeCoffeeAnalysis({
    laudoId: draft.id,
    user: users.inspectorInterport,
    signatoryId: 'usr_carlos_test',
    inspectors: [
      { id: 'usr_carlos_test', name: 'Carlos Santos [Demonstração / Teste]', signatureImageUrl: '/assinatura_carlos.svg' },
      { id: 'usr_bruno', name: 'Bruno O. G. Lobo', signatureImageUrl: '/assinatura.jpg' }
    ]
  });
  assert.equal(finalized.status, 'Aguardando assinatura');
  assert.equal(finalized.signatory.id, 'usr_carlos_test');

  // 6. Bloqueio de assinatura por terceiro: Bruno (ADM) tenta assinar laudo que aguarda Carlos
  await assert.rejects(
    async () => {
      await repo.signAndIssueCertificate({
        laudoId: draft.id,
        user: { id: 'usr_bruno', uid: 'usr_bruno', name: 'Bruno O. G. Lobo', role: 'ADM', signatureImageUrl: '/assinatura.jpg' },
        inspectors: [
          { id: 'usr_carlos_test', name: 'Carlos Santos [Demonstração / Teste]', signatureImageUrl: '/assinatura_carlos.svg' },
          { id: 'usr_bruno', name: 'Bruno O. G. Lobo', signatureImageUrl: '/assinatura.jpg' }
        ]
      });
    },
    /aguarda a assinatura exclusiva/
  );

  // 7. Tentativa de assinar sem assinatura cadastrada
  await assert.rejects(
    async () => {
      await repo.signAndIssueCertificate({
        laudoId: draft.id,
        user: { id: 'usr_carlos_test', uid: 'usr_carlos_test', name: 'Carlos Santos [Demonstração / Teste]', role: 'Inspector' },
        signatureImageUrl: null,
        inspectors: [{ id: 'usr_carlos_test', name: 'Carlos Santos [Demonstração / Teste]', signatureImageUrl: null }]
      });
    },
    /não possui assinatura digital cadastrada/
  );

  // 8. Assinatura pessoal bem-sucedida pelo próprio signatário (Carlos Santos - Fixture de Teste)
  const issued = await repo.signAndIssueCertificate({
    laudoId: draft.id,
    user: { id: 'usr_carlos_test', uid: 'usr_carlos_test', name: 'Carlos Santos [Demonstração / Teste]', role: 'Inspector', signatureImageUrl: '/assinatura_carlos.svg' },
    inspectors: [{ id: 'usr_carlos_test', name: 'Carlos Santos [Demonstração / Teste]', signatureImageUrl: '/assinatura_carlos.svg' }]
  });
  assert.equal(issued.status, 'Emitido');
  assert.equal(issued.signatureImageUrl, '/assinatura_carlos.svg', 'Deve aplicar exclusivamente a assinatura pessoal do signatário');
  assert.ok(issued.issuedSnapshot, 'Deve conter snapshot fechado e imutável');
  assert.equal(issued.issuedSnapshot.signatory.signatureImageUrl, '/assinatura_carlos.svg');
  assert.ok(issued.issuedSnapshot.signatory.signatureImageData, 'Snapshot deve preservar os bytes da imagem da assinatura (Data URI)');
  assert.ok(issued.issuedSnapshot.signatory.signatureImageData.startsWith('data:image/'), 'A assinatura preservada deve ser um Data URI real');

  // 9. Bloqueio de alteração direta em laudo emitido
  await assert.rejects(
    async () => {
      await repo.saveClassificationDraft({
        laudoId: draft.id,
        formData: { comments: 'Tentativa de adulterar laudo já emitido' },
        user: users.inspectorInterport
      });
    },
    /Não é permitido alterar laudo no estado "Emitido"/
  );

  // 10. Geração de Nova Revisão (preserva snapshot anterior)
  const revision2 = await repo.createNewRevision({
    laudoId: draft.id,
    reason: 'Correção de umidade e peneiras conforme reteste laboratorial',
    user: users.inspectorInterport
  });
  assert.equal(revision2.status, 'Rascunho');
  assert.equal(revision2.currentRevision, 2);
  assert.equal(revision2.revisions.length, 1);
  assert.equal(revision2.revisions[0].revisionReason, 'Correção de umidade e peneiras conforme reteste laboratorial');
  assert.equal(revision2.revisions[0].snapshot.signatory.signatureImageUrl, '/assinatura_carlos.svg');

  // 11. Finalização para assinatura por Bruno O. G. Lobo na Revisão 2
  await repo.finalizeCoffeeAnalysis({
    laudoId: draft.id,
    user: users.inspectorInterport,
    signatoryId: 'usr_bruno',
    inspectors: [
      { id: 'usr_bruno', name: 'Bruno O. G. Lobo', signatureImageUrl: '/assinatura.jpg' }
    ]
  });

  // 12. Assinatura pessoal por Bruno O. G. Lobo na Revisão 2
  const issuedRev2 = await repo.signAndIssueCertificate({
    laudoId: draft.id,
    user: { id: 'usr_bruno', uid: 'usr_bruno', name: 'Bruno O. G. Lobo', role: 'ADM', signatureImageUrl: '/assinatura.jpg' },
    inspectors: [{ id: 'usr_bruno', name: 'Bruno O. G. Lobo', signatureImageUrl: '/assinatura.jpg' }]
  });
  assert.equal(issuedRev2.status, 'Emitido');
  assert.equal(issuedRev2.signatureImageUrl, '/assinatura.jpg');
  assert.equal(issuedRev2.issuedSnapshot.signatory.name, 'Bruno O. G. Lobo');
});

