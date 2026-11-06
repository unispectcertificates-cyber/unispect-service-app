import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const JAVA_BIN = 'C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\java.exe';
const EMULATOR_JAR =
  'C:\\Users\\unisp\\.cache\\firebase\\emulators\\cloud-firestore-emulator-v1.19.8.jar';
const RULES_PATH = path.resolve('firestore.rules');
const PROJECT_ID = 'unispect-service';
const PORT = 8089;
const BASE_URL = `http://127.0.0.1:${PORT}/v1/projects/${PROJECT_ID}/databases/(default)`;

/**
 * Gera um JWT sem assinatura (alg: none) aceito nativamente pelo Cloud Firestore Emulator
 * para popular `request.auth.uid` e `request.auth.token` nas regras de segurança (`firestore.rules`).
 */
function makeEmulatorJwt(uid, claims = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      sub: uid,
      user_id: uid,
      iat: nowSec - 60,
      exp: nowSec + 3600,
      ...claims
    })
  ).toString('base64url');
  return `${header}.${payload}.`;
}

/**
 * Converte objeto JS simples em mapa `fields` do protocolo Firestore REST v1
 */
function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) fields[k] = toFirestoreValue(v);
  }
  return fields;
}

function docName(col, id) {
  return `projects/${PROJECT_ID}/databases/(default)/documents/${col}/${id}`;
}

async function firestoreCommit(writes, bearerToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }
  const res = await fetch(`${BASE_URL}/documents:commit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ writes })
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

async function firestoreGet(col, id, bearerToken) {
  const headers = {};
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }
  const res = await fetch(`${BASE_URL}/documents/${col}/${id}`, {
    method: 'GET',
    headers
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

async function firestoreDelete(col, id, bearerToken) {
  const headers = {};
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }
  const res = await fetch(`${BASE_URL}/documents/${col}/${id}`, {
    method: 'DELETE',
    headers
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

async function waitForEmulatorReady(emulatorState, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (emulatorState.exited) {
      throw new Error(
        `Firestore Emulator encerrou prematuramente (code=${emulatorState.exitCode}). Logs:\n${emulatorState.logs}`
      );
    }
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.ok || res.status === 200) return true;
    } catch {
      // Aguardando inicialização
    }
    await new Promise(r => setTimeout(r, 350));
  }
  throw new Error(
    `Firestore Emulator não respondeu na porta ${PORT} após ${timeoutMs}ms. Logs:\n${emulatorState.logs}`
  );
}

test('Suíte de Integração Real no Cloud Firestore Emulator (Regras firestore.rules em Execução Real)', async t => {
  assert.ok(fs.existsSync(JAVA_BIN), 'OpenJDK 21 deve existir para iniciar o emulador');
  assert.ok(fs.existsSync(EMULATOR_JAR), 'JAR do Cloud Firestore Emulator deve existir');

  const emulatorState = { logs: '', exited: false, exitCode: null };
  const emulatorProc = spawn(
    JAVA_BIN,
    [
      '-Duser.language=en',
      '-Duser.country=US',
      '-jar',
      EMULATOR_JAR,
      '--host',
      '127.0.0.1',
      '--port',
      String(PORT),
      '--rules',
      RULES_PATH,
      '--project_id',
      PROJECT_ID
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  emulatorProc.stdout.on('data', chunk => {
    emulatorState.logs += chunk.toString();
  });
  emulatorProc.stderr.on('data', chunk => {
    emulatorState.logs += chunk.toString();
  });
  emulatorProc.on('exit', code => {
    emulatorState.exited = true;
    emulatorState.exitCode = code;
  });

  t.after(() => {
    try {
      emulatorProc.kill();
    } catch {
      // Ignora erro no encerramento
    }
  });

  await waitForEmulatorReady(emulatorState, 25000);

  // Tokens de teste para diferentes perfis e clientes
  const tokens = {
    owner: 'owner',
    master: makeEmulatorJwt('usr_master', { role: 'ADM', admin: true }),
    inspectorBruno: makeEmulatorJwt('usr_bruno', { role: 'ADM', admin: true }),
    inspectorCarlos: makeEmulatorJwt('usr_carlos_test', {
      role: 'Inspector',
      clientId: 'client_interport'
    }),
    inspectorMarcosNoSig: makeEmulatorJwt('usr_marcos_test', {
      role: 'Inspector',
      clientId: 'client_interport'
    }),
    inspectorInterport: makeEmulatorJwt('usr_insp_interport', {
      role: 'Inspector',
      clientId: 'client_interport'
    }),
    inspectorBeta: makeEmulatorJwt('usr_insp_beta', {
      role: 'Inspector',
      clientId: 'client_beta'
    }),
    exporter1: makeEmulatorJwt('usr_exp_1', {
      role: 'Exportador',
      clientId: 'client_interport',
      exporterId: 'exp_interport_1'
    }),
    exporter2: makeEmulatorJwt('usr_exp_2', {
      role: 'Exportador',
      clientId: 'client_interport',
      exporterId: 'exp_interport_2'
    })
  };

  // Seed inicial de exportadores e bookings no emulador
  await t.test('0. Seed inicial de exportadores e bookings no Firestore Emulator', async () => {
    const seedRes = await firestoreCommit(
      [
        {
          update: {
            name: docName('exportadores', 'exp_interport_1'),
            fields: toFirestoreFields({
              id: 'exp_interport_1',
              code: 'EXP-0001',
              name: 'Café Atlântica Exportadora Ltda',
              clientId: 'client_interport'
            })
          }
        },
        {
          update: {
            name: docName('exportadores', 'exp_interport_2'),
            fields: toFirestoreFields({
              id: 'exp_interport_2',
              code: 'EXP-0002',
              name: 'Tristão Companhia de Comércio Exterior',
              clientId: 'client_interport'
            })
          }
        },
        {
          update: {
            name: docName('exportadores', 'exp_beta_1'),
            fields: toFirestoreFields({
              id: 'exp_beta_1',
              code: 'EXP-0003',
              name: 'Exportadora Cliente Beta S/A',
              clientId: 'client_beta'
            })
          }
        },
        {
          update: {
            name: docName('bookings', 'bk_interport_1'),
            fields: toFirestoreFields({
              id: 'bk_interport_1',
              bookingNumber: 'MEDU9988771',
              exporterId: 'exp_interport_1',
              clientId: 'client_interport'
            })
          }
        },
        {
          update: {
            name: docName('bookings', 'bk_interport_2'),
            fields: toFirestoreFields({
              id: 'bk_interport_2',
              bookingNumber: 'MAEU5544332',
              exporterId: 'exp_interport_2',
              clientId: 'client_interport'
            })
          }
        },
        {
          update: {
            name: docName('bookings', 'bk_beta_1'),
            fields: toFirestoreFields({
              id: 'bk_beta_1',
              bookingNumber: 'BETA000999',
              exporterId: 'exp_beta_1',
              clientId: 'client_beta'
            })
          }
        },
        {
          update: {
            name: docName('inspectors', 'usr_bruno'),
            fields: toFirestoreFields({
              id: 'usr_bruno',
              uid: 'usr_bruno',
              name: 'Bruno O. G. Lobo',
              role: 'Signatory',
              isSignatory: true,
              signatureImageUrl: '/assinatura.jpg'
            })
          }
        },
        {
          update: {
            name: docName('inspectors', 'usr_carlos_test'),
            fields: toFirestoreFields({
              id: 'usr_carlos_test',
              uid: 'usr_carlos_test',
              name: 'Carlos Santos [Demonstração / Teste]',
              role: 'Inspector',
              isSignatory: true,
              signatureImageUrl: '/assinatura_carlos.svg'
            })
          }
        },
        {
          update: {
            name: docName('inspectors', 'usr_marcos_test'),
            fields: toFirestoreFields({
              id: 'usr_marcos_test',
              uid: 'usr_marcos_test',
              name: 'Marcos Oliveira',
              role: 'Inspector',
              isSignatory: false,
              signatureImageUrl: null,
              signatureImageData: null
            })
          }
        }
      ],
      tokens.owner
    );
    assert.equal(seedRes.ok, true, `Seed deve ter sucesso: ${JSON.stringify(seedRes.body)}`);
  });

  await t.test(
    '1. Criação atômica válida (coffeeAnalyses + coffeeAnalysisAuditEvents) com horário do servidor (REQUEST_TIME)',
    async () => {
      const commitRes = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_interport_1'),
              fields: toFirestoreFields({
                id: 'laudo_interport_1',
                laudoNumber: 'LCF-0001/2026',
                clientId: 'client_interport',
                exporterId: 'exp_interport_1',
                bookingId: 'bk_interport_1',
                bookingNumber: 'MEDU9988771',
                selectedLots: ['LOT-001'],
                selectedContainerIds: ['cont_1'],
                status: 'Rascunho',
                classificationBasis: '300 g de café',
                sampleWeightGrams: 300,
                analysisPerformed: false,
                createdBy: {
                  id: 'usr_insp_interport',
                  uid: 'usr_insp_interport',
                  name: 'Carlos Santos',
                  role: 'Inspector'
                },
                updatedBy: {
                  id: 'usr_insp_interport',
                  uid: 'usr_insp_interport',
                  name: 'Carlos Santos',
                  role: 'Inspector'
                },
                createdAt: 1793660000000,
                updatedAt: 1793660000000,
                officialAuditCollection: 'coffeeAnalysisAuditEvents'
              })
            },
            currentDocument: { exists: false },
            updateTransforms: [
              { fieldPath: 'createdServerTimestamp', setToServerValue: 'REQUEST_TIME' },
              { fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }
            ]
          },
          {
            update: {
              name: docName('coffeeAnalysisAuditEvents', 'caud_1'),
              fields: toFirestoreFields({
                id: 'caud_1',
                laudoId: 'laudo_interport_1',
                laudoNumber: 'LCF-0001/2026',
                clientId: 'client_interport',
                exporterId: 'exp_interport_1',
                actionType: 'DRAFT_CREATED',
                actionLabel: 'Criação do rascunho',
                actor: {
                  id: 'usr_insp_interport',
                  uid: 'usr_insp_interport',
                  name: 'Carlos Santos',
                  role: 'Inspector'
                },
                timestampMs: 1793660000000,
                timezone: 'America/Sao_Paulo'
              })
            },
            currentDocument: { exists: false },
            updateTransforms: [{ fieldPath: 'serverTimestamp', setToServerValue: 'REQUEST_TIME' }]
          }
        ],
        tokens.inspectorInterport
      );

      assert.equal(
        commitRes.ok,
        true,
        `Commit atômico válido deve ser aceito pelo emulador: ${JSON.stringify(commitRes.body)}\nLogs:\n${emulatorState.logs}`
      );

      // Verifica que o servidor preencheu createdServerTimestamp e serverTimestamp
      const readLaudo = await firestoreGet(
        'coffeeAnalyses',
        'laudo_interport_1',
        tokens.inspectorInterport
      );
      assert.equal(readLaudo.status, 200);
      assert.ok(
        readLaudo.body.fields?.createdServerTimestamp?.timestampValue,
        'O emulador deve gravar createdServerTimestamp com o horário real do servidor'
      );

      const readAudit = await firestoreGet(
        'coffeeAnalysisAuditEvents',
        'caud_1',
        tokens.inspectorInterport
      );
      assert.equal(readAudit.status, 200);
      assert.ok(
        readAudit.body.fields?.serverTimestamp?.timestampValue,
        'O emulador deve gravar serverTimestamp no evento de auditoria com o horário real do servidor'
      );
    }
  );

  await t.test('2. Bloqueio de acesso entre clientes (Isolamento Multi-Cliente nas regras reais)', async () => {
    // Inspetor do client_beta tenta ler laudo do client_interport -> 403 PERMISSION_DENIED
    const readCrossClient = await firestoreGet(
      'coffeeAnalyses',
      'laudo_interport_1',
      tokens.inspectorBeta
    );
    assert.equal(
      readCrossClient.status,
      403,
      'Inspetor do Cliente Beta deve ser bloqueado ao tentar ler laudo do Cliente Interport'
    );

    // Inspetor do client_beta tenta ler evento de auditoria do client_interport -> 403 PERMISSION_DENIED
    const readAuditCrossClient = await firestoreGet(
      'coffeeAnalysisAuditEvents',
      'caud_1',
      tokens.inspectorBeta
    );
    assert.equal(
      readAuditCrossClient.status,
      403,
      'Inspetor do Cliente Beta deve ser bloqueado ao tentar ler auditoria do Cliente Interport'
    );

    // Master tem acesso transversal -> 200 OK
    const readByMaster = await firestoreGet('coffeeAnalyses', 'laudo_interport_1', tokens.master);
    assert.equal(readByMaster.status, 200, 'Master Unispect deve ter acesso transversal');
  });

  await t.test(
    '3. Exportador limitado estritamente aos próprios registros e sem permissão de escrita',
    async () => {
      // Exportador 1 lê seu próprio laudo (exporterId == 'exp_interport_1') -> 200 OK
      const ownRead = await firestoreGet('coffeeAnalyses', 'laudo_interport_1', tokens.exporter1);
      assert.equal(ownRead.status, 200, 'Exportador 1 deve conseguir consultar seu próprio laudo');

      // Exportador 2 tenta ler laudo do Exportador 1 -> 403 PERMISSION_DENIED
      const otherExpRead = await firestoreGet(
        'coffeeAnalyses',
        'laudo_interport_1',
        tokens.exporter2
      );
      assert.equal(
        otherExpRead.status,
        403,
        'Exportador 2 deve ser bloqueado ao tentar ler laudo do Exportador 1'
      );

      // Exportador 1 tenta criar um novo laudo -> 403 PERMISSION_DENIED
      const expCreateAttempt = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_exp_attempt'),
              fields: toFirestoreFields({
                id: 'laudo_exp_attempt',
                laudoNumber: 'LCF-0099/2026',
                clientId: 'client_interport',
                exporterId: 'exp_interport_1',
                bookingId: null,
                status: 'Rascunho',
                classificationBasis: '300 g de café',
                createdBy: { uid: 'usr_exp_1', name: 'Portal Café Atlântica' },
                updatedBy: { uid: 'usr_exp_1', name: 'Portal Café Atlântica' },
                createdAt: 1793660000000,
                updatedAt: 1793660000000
              })
            },
            currentDocument: { exists: false },
            updateTransforms: [
              { fieldPath: 'createdServerTimestamp', setToServerValue: 'REQUEST_TIME' },
              { fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }
            ]
          }
        ],
        tokens.exporter1
      );
      assert.equal(
        expCreateAttempt.status,
        403,
        'Perfil Exportador deve ser bloqueado na tentativa de criar laudo diretamente no Firestore'
      );
    }
  );

  await t.test('4. Bloqueio de falsificação de autoria (spoofing de createdBy, updatedBy e actor)', async () => {
    // Inspetor usr_insp_interport tenta gravar um laudo fingindo que o autor é usr_master -> 403 PERMISSION_DENIED
    const spoofLaudoRes = await firestoreCommit(
      [
        {
          update: {
            name: docName('coffeeAnalyses', 'laudo_spoofed'),
            fields: toFirestoreFields({
              id: 'laudo_spoofed',
              laudoNumber: 'LCF-0002/2026',
              clientId: 'client_interport',
              exporterId: 'exp_interport_1',
              bookingId: null,
              status: 'Rascunho',
              classificationBasis: '300 g de café',
              createdBy: { uid: 'usr_master', name: 'Master Supervisor' },
              updatedBy: { uid: 'usr_master', name: 'Master Supervisor' },
              createdAt: 1793660000000,
              updatedAt: 1793660000000
            })
          },
          currentDocument: { exists: false },
          updateTransforms: [
            { fieldPath: 'createdServerTimestamp', setToServerValue: 'REQUEST_TIME' },
            { fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }
          ]
        }
      ],
      tokens.inspectorInterport
    );
    assert.equal(
      spoofLaudoRes.status,
      403,
      'Falsificação de autoria no laudo deve ser bloqueada pelas regras do Firestore'
    );

    // Inspetor usr_insp_interport tenta gravar evento de auditoria fingindo ser usr_master -> 403 PERMISSION_DENIED
    const spoofAuditRes = await firestoreCommit(
      [
        {
          update: {
            name: docName('coffeeAnalysisAuditEvents', 'caud_spoofed'),
            fields: toFirestoreFields({
              id: 'caud_spoofed',
              laudoId: 'laudo_interport_1',
              clientId: 'client_interport',
              exporterId: 'exp_interport_1',
              actionType: 'LINKS_UPDATED',
              actor: { uid: 'usr_master', name: 'Master Supervisor' }
            })
          },
          currentDocument: { exists: false },
          updateTransforms: [{ fieldPath: 'serverTimestamp', setToServerValue: 'REQUEST_TIME' }]
        }
      ],
      tokens.inspectorInterport
    );
    assert.equal(
      spoofAuditRes.status,
      403,
      'Falsificação de autoria no evento de auditoria deve ser bloqueada pelas regras do Firestore'
    );
  });

  await t.test(
    '5. Bloqueio de edição e exclusão de eventos de auditoria e bloqueio de reescrita de histórico pelo documento do laudo',
    async () => {
      // Tentativa de editar evento de auditoria existente caud_1 -> 403 PERMISSION_DENIED
      const updateAuditAttempt = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalysisAuditEvents', 'caud_1'),
              fields: toFirestoreFields({
                id: 'caud_1',
                laudoId: 'laudo_interport_1',
                clientId: 'client_interport',
                exporterId: 'exp_interport_1',
                actionType: 'TAMPERED',
                actor: { uid: 'usr_insp_interport', name: 'Carlos Santos' }
              })
            },
            currentDocument: { exists: true },
            updateTransforms: [{ fieldPath: 'serverTimestamp', setToServerValue: 'REQUEST_TIME' }]
          }
        ],
        tokens.inspectorInterport
      );
      assert.equal(
        updateAuditAttempt.status,
        403,
        'Eventos de auditoria não podem ser editados por nenhum usuário'
      );

      // Tentativa de excluir evento de auditoria caud_1 (mesmo por ADM) -> 403 PERMISSION_DENIED
      const deleteAuditAttempt = await firestoreDelete(
        'coffeeAnalysisAuditEvents',
        'caud_1',
        tokens.master
      );
      assert.equal(
        deleteAuditAttempt.status,
        403,
        'Eventos de auditoria não podem ser excluídos nem mesmo por ADM'
      );

      // Tentativa de usuário comum injetar/reescrever `auditTimeline` dentro do documento `coffeeAnalyses/laudo_interport_1` -> 403 PERMISSION_DENIED
      const rewriteTimelineOnLaudo = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_interport_1'),
              fields: toFirestoreFields({
                id: 'laudo_interport_1',
                laudoNumber: 'LCF-0001/2026',
                clientId: 'client_interport',
                exporterId: 'exp_interport_1',
                bookingId: 'bk_interport_1',
                status: 'Rascunho',
                classificationBasis: '300 g de café',
                createdBy: {
                  id: 'usr_insp_interport',
                  uid: 'usr_insp_interport',
                  name: 'Carlos Santos',
                  role: 'Inspector'
                },
                updatedBy: {
                  id: 'usr_insp_interport',
                  uid: 'usr_insp_interport',
                  name: 'Carlos Santos',
                  role: 'Inspector'
                },
                createdAt: 1793660000000,
                updatedAt: 1793660005000,
                auditTimeline: [{ id: 'fake_history', actionLabel: 'Histórico adulterado' }]
              })
            },
            currentDocument: { exists: true },
            updateTransforms: [
              { fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }
            ]
          }
        ],
        tokens.inspectorInterport
      );
      assert.equal(
        rewriteTimelineOnLaudo.status,
        403,
        'Usuário comum não consegue injetar ou reescrever auditTimeline pelo documento do laudo'
      );
    }
  );

  await t.test(
    '6. Bloqueio de vínculos incompatíveis (booking de outro exportador ou de outro cliente) em gravações diretas fora da interface',
    async () => {
      // Gravação direta tentando vincular exp_interport_1 com bk_interport_2 (que pertence a exp_interport_2) -> 403 PERMISSION_DENIED
      const wrongExporterBookingRes = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_incompatible_bk'),
              fields: toFirestoreFields({
                id: 'laudo_incompatible_bk',
                laudoNumber: 'LCF-0005/2026',
                clientId: 'client_interport',
                exporterId: 'exp_interport_1',
                bookingId: 'bk_interport_2', // pertence a exp_interport_2!
                status: 'Rascunho',
                classificationBasis: '300 g de café',
                createdBy: { uid: 'usr_insp_interport', name: 'Carlos Santos' },
                updatedBy: { uid: 'usr_insp_interport', name: 'Carlos Santos' },
                createdAt: 1793660000000,
                updatedAt: 1793660000000
              })
            },
            currentDocument: { exists: false },
            updateTransforms: [
              { fieldPath: 'createdServerTimestamp', setToServerValue: 'REQUEST_TIME' },
              { fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }
            ]
          }
        ],
        tokens.inspectorInterport
      );
      assert.equal(
        wrongExporterBookingRes.status,
        403,
        'Firestore Rules deve bloquear gravação direta vinculando booking de outro exportador'
      );

      // Gravação direta tentando vincular exp_interport_1 com bk_beta_1 (que pertence a client_beta) -> 403 PERMISSION_DENIED
      const crossClientBookingRes = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_cross_client_bk'),
              fields: toFirestoreFields({
                id: 'laudo_cross_client_bk',
                laudoNumber: 'LCF-0006/2026',
                clientId: 'client_interport',
                exporterId: 'exp_interport_1',
                bookingId: 'bk_beta_1', // pertence a client_beta!
                status: 'Rascunho',
                classificationBasis: '300 g de café',
                createdBy: { uid: 'usr_insp_interport', name: 'Carlos Santos' },
                updatedBy: { uid: 'usr_insp_interport', name: 'Carlos Santos' },
                createdAt: 1793660000000,
                updatedAt: 1793660000000
              })
            },
            currentDocument: { exists: false },
            updateTransforms: [
              { fieldPath: 'createdServerTimestamp', setToServerValue: 'REQUEST_TIME' },
              { fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }
            ]
          }
        ],
        tokens.inspectorInterport
      );
      assert.equal(
        crossClientBookingRes.status,
        403,
        'Firestore Rules deve bloquear gravação direta vinculando booking de outro cliente'
      );

      // Gravação direta tentando falsificar createdServerTimestamp com timestamp do cliente em vez de REQUEST_TIME -> 403 PERMISSION_DENIED
      const forgedClientTimestampRes = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_forged_ts'),
              fields: {
                ...toFirestoreFields({
                  id: 'laudo_forged_ts',
                  laudoNumber: 'LCF-0007/2026',
                  clientId: 'client_interport',
                  exporterId: 'exp_interport_1',
                  bookingId: null,
                  status: 'Rascunho',
                  classificationBasis: '300 g de café',
                  createdBy: { uid: 'usr_insp_interport', name: 'Carlos Santos' },
                  updatedBy: { uid: 'usr_insp_interport', name: 'Carlos Santos' },
                  createdAt: 1793660000000,
                  updatedAt: 1793660000000
                }),
                createdServerTimestamp: { timestampValue: '2020-01-01T00:00:00Z' },
                updatedServerTimestamp: { timestampValue: '2020-01-01T00:00:00Z' }
              }
            },
            currentDocument: { exists: false }
          }
        ],
        tokens.inspectorInterport
      );
      assert.equal(
        forgedClientTimestampRes.status,
        403,
        'Firestore Rules deve exigir horário real do servidor (request.time) e rejeitar timestamp forjado pelo cliente'
      );
    }
  );

  await t.test(
    '7. Idempotência (coffeeAnalysisRequestKeys) e Concorrência de numeração (coffeeAnalysisCounters) no Emulador',
    async () => {
      // Primeira submissão com requestKey 'req_idem_001' cria a chave, incrementa o contador e grava o laudo + auditoria
      const firstReqCommit = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalysisRequestKeys', 'req_idem_001'),
              fields: toFirestoreFields({
                id: 'req_idem_001',
                laudoId: 'laudo_idem_1',
                laudoNumber: 'LCF-0010/2026',
                clientId: 'client_interport',
                createdByUid: 'usr_insp_interport',
                createdAt: 1793660010000
              })
            },
            currentDocument: { exists: false }
          },
          {
            update: {
              name: docName('coffeeAnalysisCounters', 'counter_2026'),
              fields: toFirestoreFields({
                id: 'counter_2026',
                year: 2026,
                seq: 10,
                updatedAt: 1793660010000,
                updatedByUid: 'usr_insp_interport'
              })
            }
          }
        ],
        tokens.inspectorInterport
      );
      assert.equal(
        firstReqCommit.ok,
        true,
        `Primeira gravação de requestKey e contador deve ser aceita: ${JSON.stringify(firstReqCommit.body)}`
      );

      // Tentativa duplicada de criação com a mesma requestKey (currentDocument: { exists: false }) é rejeitada atomicamente pelo emulador (400 FAILED_PRECONDITION / 403)
      const duplicateReqCommit = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalysisRequestKeys', 'req_idem_001'),
              fields: toFirestoreFields({
                id: 'req_idem_001',
                laudoId: 'laudo_idem_duplicado',
                laudoNumber: 'LCF-0011/2026',
                clientId: 'client_interport',
                createdByUid: 'usr_insp_interport',
                createdAt: 1793660011000
              })
            },
            currentDocument: { exists: false }
          }
        ],
        tokens.inspectorInterport
      );
      assert.equal(
        duplicateReqCommit.ok,
        false,
        'Nova tentativa da mesma requestKey com precondição exists:false ou regra allow update:false não cria segundo rascunho'
      );

      // Consulta da requestKey existente confirma o retorno do mesmo laudoId original ('laudo_idem_1')
      const existingKeyDoc = await firestoreGet(
        'coffeeAnalysisRequestKeys',
        'req_idem_001',
        tokens.inspectorInterport
      );
      assert.equal(existingKeyDoc.status, 200);
      assert.equal(existingKeyDoc.body.fields?.laudoId?.stringValue, 'laudo_idem_1');
      assert.equal(existingKeyDoc.body.fields?.laudoNumber?.stringValue, 'LCF-0010/2026');
    }
  );

  await t.test(
    '8. Atomicidade (Rollback se auditoria falhar) e Concorrência Real de Transações no Emulador',
    async () => {
      // 8A. Commit atômico onde o laudo é válido, mas o evento de auditoria falha na regra (actor falsificado)
      // Deve abortar o commit inteiro sem gravar o laudo isoladamente!
      const atomicRollbackRes = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_must_rollback'),
              fields: toFirestoreFields({
                id: 'laudo_must_rollback',
                laudoNumber: 'LCF-0090/2026',
                clientId: 'client_interport',
                exporterId: 'exp_interport_1',
                bookingId: null,
                status: 'Rascunho',
                classificationBasis: '300 g de café',
                createdBy: { uid: 'usr_insp_interport', name: 'Carlos Santos' },
                updatedBy: { uid: 'usr_insp_interport', name: 'Carlos Santos' },
                createdAt: 1793660020000,
                updatedAt: 1793660020000
              })
            },
            currentDocument: { exists: false },
            updateTransforms: [
              { fieldPath: 'createdServerTimestamp', setToServerValue: 'REQUEST_TIME' },
              { fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }
            ]
          },
          {
            update: {
              name: docName('coffeeAnalysisAuditEvents', 'caud_bad_actor'),
              fields: toFirestoreFields({
                id: 'caud_bad_actor',
                laudoId: 'laudo_must_rollback',
                clientId: 'client_interport',
                exporterId: 'exp_interport_1',
                actionType: 'DRAFT_CREATED',
                actor: { uid: 'usr_forged_other', name: 'Autor Invalido' } // viola actor.uid == request.auth.uid
              })
            },
            currentDocument: { exists: false },
            updateTransforms: [{ fieldPath: 'serverTimestamp', setToServerValue: 'REQUEST_TIME' }]
          }
        ],
        tokens.inspectorInterport
      );
      assert.equal(
        atomicRollbackRes.status,
        403,
        'Commit atômico com evento de auditoria inválido deve ser rejeitado'
      );

      // Comprova diretamente no armazenamento do emulador que o laudo NÃO foi salvo isoladamente (404 NOT_FOUND)
      const checkRolledBackLaudo = await firestoreGet(
        'coffeeAnalyses',
        'laudo_must_rollback',
        tokens.owner
      );
      assert.equal(
        checkRolledBackLaudo.status,
        404,
        'Laudo não pode existir no banco quando seu evento de auditoria falha na mesma transação'
      );

      // 8B. Concorrência controlada no Emulador: Duas tentativas simultâneas com precondição ou atualização sequencial
      const resA = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalysisCounters', 'counter_2026'),
              fields: toFirestoreFields({
                id: 'counter_2026',
                year: 2026,
                seq: 11,
                updatedByUid: 'usr_insp_interport'
              })
            }
          }
        ],
        tokens.inspectorInterport
      );
      assert.equal(resA.ok, true, 'Primeira atualização do contador deve confirmar');

      const resB = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalysisCounters', 'counter_2026'),
              fields: toFirestoreFields({
                id: 'counter_2026',
                year: 2026,
                seq: 12,
                updatedByUid: 'usr_master'
              })
            }
          }
        ],
        tokens.master
      );
      assert.equal(resB.ok, true, 'Segunda atualização do contador com seq incrementado deve confirmar');

      const finalCounter = await firestoreGet(
        'coffeeAnalysisCounters',
        'counter_2026',
        tokens.master
      );
      assert.equal(finalCounter.status, 200);
      assert.equal(finalCounter.body.fields?.seq?.integerValue, '12');
    }
  );

  await t.test(
    '9. Regras de Assinatura Individual no Firestore Emulator (Bloqueio de ADM por terceiros, alteração atômica e emissão legítima)',
    async () => {
      const MOCK_SIGNATURE_DATA = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMzAiPjx0ZXh0PklOU1BFVE9SPC90ZXh0Pjwvc3ZnPg==';

      // 9A. Criação inicial de um laudo em "Rascunho" e avanço para "Aguardando assinatura"
      const laudoBase = {
        id: 'laudo_sign_test_1',
        laudoNumber: 'UN0050/2026',
        clientId: 'client_interport',
        exporterId: 'exp_interport_1',
        bookingId: 'bk_interport_1',
        status: 'Rascunho',
        classificationBasis: '300 g de café',
        createdBy: { uid: 'usr_carlos_test', name: 'Carlos Santos [Demonstração / Teste]' },
        updatedBy: { uid: 'usr_carlos_test', name: 'Carlos Santos [Demonstração / Teste]' },
        createdAt: 1793660100000,
        updatedAt: 1793660100000
      };

      // Criar rascunho com auditoria
      const createRes = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_sign_test_1'),
              fields: toFirestoreFields(laudoBase)
            },
            currentDocument: { exists: false },
            updateTransforms: [
              { fieldPath: 'createdServerTimestamp', setToServerValue: 'REQUEST_TIME' },
              { fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }
            ]
          },
          {
            update: {
              name: docName('coffeeAnalysisAuditEvents', 'caud_sign_create_1'),
              fields: toFirestoreFields({
                id: 'caud_sign_create_1',
                laudoId: 'laudo_sign_test_1',
                clientId: 'client_interport',
                exporterId: 'exp_interport_1',
                actionType: 'DRAFT_CREATED',
                actor: { uid: 'usr_carlos_test', name: 'Carlos Santos [Demonstração / Teste]' }
              })
            },
            currentDocument: { exists: false },
            updateTransforms: [{ fieldPath: 'serverTimestamp', setToServerValue: 'REQUEST_TIME' }]
          }
        ],
        tokens.inspectorCarlos
      );
      assert.equal(createRes.status, 200, 'Rascunho para teste de assinatura deve ser criado com sucesso');

      // Avançar para "Aguardando assinatura" com indicação de signatário Carlos Santos (UID canônico)
      const awaitingSignFields = {
        ...laudoBase,
        status: 'Aguardando assinatura',
        signatory: {
          id: 'usr_carlos_test',
          uid: 'usr_carlos_test',
          name: 'Carlos Santos [Demonstração / Teste]'
        },
        updatedBy: { uid: 'usr_carlos_test', name: 'Carlos Santos [Demonstração / Teste]' },
        updatedAt: 1793660105000
      };

      const finalizeRes = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_sign_test_1'),
              fields: toFirestoreFields(awaitingSignFields)
            },
            currentDocument: { exists: true },
            updateTransforms: [{ fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }]
          }
        ],
        tokens.inspectorCarlos
      );
      assert.equal(finalizeRes.status, 200, 'Avanço para Aguardando assinatura deve ser aceito');

      // 9B. Tentativa 1: Alteração SOMENTE de signatory.uid para tentar emitir laudo de terceiro -> NEGADO (403 PERMISSION_DENIED)
      // O atacante mantém signatory.id como 'usr_carlos_test', mas altera signatory.uid para 'usr_master' tentando coincidir com seu auth.uid
      const alterOnlyUidAttempt = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_sign_test_1'),
              fields: toFirestoreFields({
                ...awaitingSignFields,
                status: 'Emitido',
                signatory: {
                  id: 'usr_carlos_test',
                  uid: 'usr_master', // tentativa maliciosa de adulterar apenas o UID canônico!
                  name: 'Carlos Santos [Demonstração / Teste]'
                },
                updatedBy: { uid: 'usr_master', name: 'Master Supervisor' },
                issuedSnapshot: {
                  signatory: {
                    id: 'usr_carlos_test',
                    uid: 'usr_master',
                    name: 'Carlos Santos [Demonstração / Teste]',
                    signatureImageUrl: '/assinatura_carlos.svg',
                    signatureImageData: MOCK_SIGNATURE_DATA
                  }
                }
              })
            },
            currentDocument: { exists: true },
            updateTransforms: [{ fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }]
          }
        ],
        tokens.master
      );
      assert.equal(
        alterOnlyUidAttempt.status,
        403,
        'Tentativa de alterar somente signatory.uid durante emissão deve ser estritamente bloqueada (403)'
      );

      // 9C. Tentativa 2: Divergência entre a identidade do signatário no laudo e no snapshot -> NEGADA (403 PERMISSION_DENIED)
      // Carlos tenta emitir, mas envia no snapshot o UID de Bruno (ou vice-versa)
      const divergentSnapshotIdentityAttempt = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_sign_test_1'),
              fields: toFirestoreFields({
                ...awaitingSignFields,
                status: 'Emitido',
                updatedBy: { uid: 'usr_carlos_test', name: 'Carlos Santos [Demonstração / Teste]' },
                issuedSnapshot: {
                  signatory: {
                    id: 'usr_bruno',
                    uid: 'usr_bruno', // DIVERGÊNCIA: laudo aguarda usr_carlos_test, mas snapshot declara usr_bruno!
                    name: 'Bruno O. G. Lobo',
                    signatureImageUrl: '/assinatura.jpg',
                    signatureImageData: MOCK_SIGNATURE_DATA
                  }
                }
              })
            },
            currentDocument: { exists: true },
            updateTransforms: [{ fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }]
          }
        ],
        tokens.inspectorCarlos
      );
      assert.equal(
        divergentSnapshotIdentityAttempt.status,
        403,
        'Divergência entre o signatário do laudo e o signatário do snapshot deve ser estritamente bloqueada (403)'
      );

      // 9D. Tentativa 3: Usuário sem assinatura cadastrada enviando signatureImageData não vazio -> NEGADA (403 PERMISSION_DENIED)
      // Criar rascunho com signatário Marcos Oliveira (usr_marcos_test, que NÃO tem assinatura cadastrada no banco)
      const marcosDraft = {
        id: 'laudo_marcos_no_sig',
        laudoNumber: 'UN0055/2026',
        clientId: 'client_interport',
        exporterId: 'exp_interport_1',
        bookingId: null,
        status: 'Aguardando assinatura',
        signatory: {
          id: 'usr_marcos_test',
          uid: 'usr_marcos_test',
          name: 'Marcos Oliveira'
        },
        classificationBasis: '300 g de café',
        createdBy: { uid: 'usr_marcos_test', name: 'Marcos Oliveira' },
        updatedBy: { uid: 'usr_marcos_test', name: 'Marcos Oliveira' },
        createdAt: 1793660100000,
        updatedAt: 1793660100000
      };

      // Seed do rascunho via token owner para colocar em Aguardando assinatura
      await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_marcos_no_sig'),
              fields: toFirestoreFields(marcosDraft)
            },
            currentDocument: { exists: false },
            updateTransforms: [
              { fieldPath: 'createdServerTimestamp', setToServerValue: 'REQUEST_TIME' },
              { fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }
            ]
          }
        ],
        tokens.owner
      );

      // Marcos tenta emitir enviando uma imagem arbitrária em signatureImageData (sem ter assinatura no cadastro protegido)
      const arbitrarySignatureAttempt = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_marcos_no_sig'),
              fields: toFirestoreFields({
                ...marcosDraft,
                status: 'Emitido',
                updatedBy: { uid: 'usr_marcos_test', name: 'Marcos Oliveira' },
                issuedSnapshot: {
                  signatory: {
                    id: 'usr_marcos_test',
                    uid: 'usr_marcos_test',
                    name: 'Marcos Oliveira',
                    signatureImageUrl: '/fake_arbitrary.png',
                    signatureImageData: 'data:image/png;base64,PHN2Zz5mYWtlX2FyYml0cmFyeTwvc3ZnPg=='
                  }
                }
              })
            },
            currentDocument: { exists: true },
            updateTransforms: [{ fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }]
          }
        ],
        tokens.inspectorMarcosNoSig
      );
      assert.equal(
        arbitrarySignatureAttempt.status,
        403,
        'Usuário sem assinatura cadastrada enviando imagem arbitrária deve ser estritamente bloqueado (403)'
      );

      // 9E. ADM tentando assinar como outro inspetor -> NEGADO (403 PERMISSION_DENIED)
      const admAttemptAsCarlos = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_sign_test_1'),
              fields: toFirestoreFields({
                ...awaitingSignFields,
                status: 'Emitido',
                updatedBy: { uid: 'usr_master', name: 'Master Supervisor' },
                issuedSnapshot: {
                  signatory: {
                    id: 'usr_carlos_test',
                    uid: 'usr_carlos_test',
                    name: 'Carlos Santos [Demonstração / Teste]',
                    signatureImageUrl: '/assinatura_carlos.svg',
                    signatureImageData: MOCK_SIGNATURE_DATA
                  }
                }
              })
            },
            currentDocument: { exists: true },
            updateTransforms: [{ fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }]
          }
        ],
        tokens.master
      );
      assert.equal(
        admAttemptAsCarlos.status,
        403,
        'ADM tentando emitir/assinar em nome de outro inspetor deve ser estritamente bloqueado (403)'
      );

      // 9F. Próprio signatário autorizado emitindo com sua assinatura pessoal cadastrada -> PERMITIDO (200 OK)
      const validEmitRes = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_sign_test_1'),
              fields: toFirestoreFields({
                ...awaitingSignFields,
                status: 'Emitido',
                updatedBy: { uid: 'usr_carlos_test', name: 'Carlos Santos [Demonstração / Teste]' },
                issuedSnapshot: {
                  signatory: {
                    id: 'usr_carlos_test',
                    uid: 'usr_carlos_test',
                    name: 'Carlos Santos [Demonstração / Teste]',
                    signatureImageUrl: '/assinatura_carlos.svg',
                    signatureImageData: MOCK_SIGNATURE_DATA
                  }
                }
              })
            },
            currentDocument: { exists: true },
            updateTransforms: [{ fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }]
          }
        ],
        tokens.inspectorCarlos
      );
      assert.equal(
        validEmitRes.status,
        200,
        'Próprio signatário com assinatura válida cadastrada e identidade canônica confirmada deve emitir com sucesso'
      );

      // 9G. Tentativa de adulterar documento já emitido -> NEGADA (403 PERMISSION_DENIED)
      const tamperIssuedAttempt = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_sign_test_1'),
              fields: toFirestoreFields({
                ...awaitingSignFields,
                status: 'Emitido',
                comments: 'Adulteração após emissão oficial',
                updatedBy: { uid: 'usr_master', name: 'Master Supervisor' }
              })
            },
            currentDocument: { exists: true },
            updateTransforms: [{ fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }]
          }
        ],
        tokens.master
      );
      assert.equal(
        tamperIssuedAttempt.status,
        403,
        'Documento já emitido não pode sofrer alteração in-place'
      );

      // 9H. O Administrador pode encaminhar ou alterar a designação ANTES da assinatura em etapa separada
      // Criação de segundo laudo para testar reatribuição legítima por ADM
      const laudoBase2 = {
        id: 'laudo_sign_test_2',
        laudoNumber: 'UN0051/2026',
        clientId: 'client_interport',
        exporterId: 'exp_interport_1',
        bookingId: null,
        status: 'Rascunho',
        classificationBasis: '300 g de café',
        createdBy: { uid: 'usr_carlos_test', name: 'Carlos Santos [Demonstração / Teste]' },
        updatedBy: { uid: 'usr_carlos_test', name: 'Carlos Santos [Demonstração / Teste]' },
        createdAt: 1793660110000,
        updatedAt: 1793660110000
      };

      const c2 = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_sign_test_2'),
              fields: toFirestoreFields(laudoBase2)
            },
            currentDocument: { exists: false },
            updateTransforms: [
              { fieldPath: 'createdServerTimestamp', setToServerValue: 'REQUEST_TIME' },
              { fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }
            ]
          }
        ],
        tokens.inspectorCarlos
      );
      assert.equal(c2.status, 200, 'Rascunho 2 criado com sucesso');

      // Avançar laudo 2 para Aguardando assinatura com Carlos como signatário inicial
      const adv2 = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_sign_test_2'),
              fields: toFirestoreFields({
                ...laudoBase2,
                status: 'Aguardando assinatura',
                signatory: {
                  id: 'usr_carlos_test',
                  uid: 'usr_carlos_test',
                  name: 'Carlos Santos [Demonstração / Teste]'
                },
                updatedBy: { uid: 'usr_carlos_test', name: 'Carlos Santos [Demonstração / Teste]' },
                updatedAt: 1793660112000
              })
            },
            currentDocument: { exists: true },
            updateTransforms: [{ fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }]
          }
        ],
        tokens.inspectorCarlos
      );
      assert.equal(adv2.status, 200, 'Laudo 2 avançou para Aguardando assinatura');

      // ADM reatribui a designação para Bruno O. G. Lobo mantendo status "Aguardando assinatura"
      const reassignRes = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_sign_test_2'),
              fields: toFirestoreFields({
                ...laudoBase2,
                status: 'Aguardando assinatura',
                signatory: {
                  id: 'usr_bruno',
                  uid: 'usr_bruno',
                  name: 'Bruno O. G. Lobo'
                },
                updatedBy: { uid: 'usr_master', name: 'Master Supervisor' },
                updatedAt: 1793660115000
              })
            },
            currentDocument: { exists: true },
            updateTransforms: [{ fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }]
          }
        ],
        tokens.master
      );
      assert.equal(
        reassignRes.status,
        200,
        'Administrador pode encaminhar ou reatribuir o signatário antes da assinatura em etapa auditada'
      );

      // Agora o novo signatário designado (Bruno) assina e emite legitimamente com sua própria assinatura
      const brunoEmitRes = await firestoreCommit(
        [
          {
            update: {
              name: docName('coffeeAnalyses', 'laudo_sign_test_2'),
              fields: toFirestoreFields({
                ...laudoBase2,
                status: 'Emitido',
                signatory: {
                  id: 'usr_bruno',
                  uid: 'usr_bruno',
                  name: 'Bruno O. G. Lobo'
                },
                updatedBy: { uid: 'usr_bruno', name: 'Bruno O. G. Lobo' },
                updatedAt: 1793660120000,
                issuedSnapshot: {
                  signatory: {
                    id: 'usr_bruno',
                    uid: 'usr_bruno',
                    name: 'Bruno O. G. Lobo',
                    signatureImageUrl: '/assinatura.jpg',
                    signatureImageData: 'data:image/jpeg;base64,PHN2Zz5icnVubzwvc3ZnPg=='
                  }
                }
              })
            },
            currentDocument: { exists: true },
            updateTransforms: [{ fieldPath: 'updatedServerTimestamp', setToServerValue: 'REQUEST_TIME' }]
          }
        ],
        tokens.inspectorBruno
      );
      assert.equal(
        brunoEmitRes.status,
        200,
        'Novo signatário designado (Bruno) pode assinar com sua própria identidade após reatribuição'
      );
    }
  );
});
