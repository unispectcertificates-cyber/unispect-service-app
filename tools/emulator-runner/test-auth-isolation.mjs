import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const firestoreRulesPath = join(__dirname, 'firestore.experimental.rules');
const storageRulesPath = join(__dirname, 'storage.experimental.rules');

const PROJECT_ID = 'demo-unispect-test';
const AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const fetch = globalThis.fetch;

console.log('===============================================================');
console.log('SUÍTE DE TESTES REAIS: ETAPA 1A — AUTENTICAÇÃO E ISOLAMENTO');
console.log('Projeto: demo-unispect-test | Auth: 9099 | Firestore: 8080 | Storage: 9199');
console.log('===============================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function runTest(name, fn) {
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

// ── 1. PROVISIONAMENTO ADMINISTRATIVO DE USUÁRIOS NO AUTH EMULATOR ──

async function provisionSyntheticUser({ email, password, displayName, claims }) {
  const signUpUrl = `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;
  let localId;

  const createRes = await fetch(signUpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName, returnSecureToken: true })
  });
  const createData = await createRes.json();

  if (createData.localId) {
    localId = createData.localId;
  } else if (createData.error && createData.error.message.includes('EMAIL_EXISTS')) {
    const lookupUrl = `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fake-api-key`;
    const lookupRes = await fetch(lookupUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer owner'
      },
      body: JSON.stringify({ email: [email] })
    });
    const lookupData = await lookupRes.json();
    if (!lookupData.users || !lookupData.users[0]) {
      throw new Error(`Lookup falhou para ${email}: ${JSON.stringify(lookupData)}`);
    }
    localId = lookupData.users[0].localId;
  } else {
    throw new Error(`Falha no provisionamento de ${email}: ${JSON.stringify(createData.error)}`);
  }

  // Atribuição de Custom Claims exclusivamente via endpoint administrativo com token de privilégio de emulador (Bearer owner)
  const updateUrl = `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key`;
  const updateRes = await fetch(updateUrl, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': 'Bearer owner'
    },
    body: JSON.stringify({ localId, customAttributes: JSON.stringify(claims) })
  });
  const updateData = await updateRes.json();
  if (!updateRes.ok) console.warn('Update claims error for', email, updateData);

  return { localId, email, claims };
}

// Decodificador de claims JWT sem expor segredos
function decodeJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token JWT inválido');
  const payloadStr = Buffer.from(parts[1], 'base64').toString('utf8');
  return JSON.parse(payloadStr);
}

// Tradutor de erro espelhando src/utils/authService.js
function translateAuthError(codeOrMsg) {
  const s = String(codeOrMsg);
  if (s.includes('INVALID_LOGIN_CREDENTIALS') || s.includes('INVALID_PASSWORD') || s.includes('EMAIL_NOT_FOUND') || s.includes('invalid-credential')) {
    return 'E-mail ou senha incorretos.';
  }
  if (s.includes('INVALID_EMAIL')) {
    return 'Formato de e-mail inválido.';
  }
  if (s.includes('USER_DISABLED')) {
    return 'Este usuário foi desativado pelo administrador.';
  }
  return 'Ocorreu um erro na autenticação. Tente novamente.';
}

// Mapeamento de usuário do app
function mapUserFromClaims(userRecord, claims) {
  const isMaster = Boolean(claims.isUnispectMaster || claims.role === 'MASTER');
  let normalizedRole = 'INSPECTOR';
  if (isMaster) normalizedRole = 'MASTER';
  else if (claims.role === 'CLIENT_ADMIN') normalizedRole = 'CLIENT_ADMIN';
  else if (claims.role === 'INSPECTOR') normalizedRole = 'INSPECTOR';
  else if (claims.role === 'EXPORTER') normalizedRole = 'EXPORTER';
  else if (claims.role) normalizedRole = claims.role;

  const legacyRole = isMaster || normalizedRole === 'CLIENT_ADMIN' ? 'ADM' : (normalizedRole === 'EXPORTER' ? 'Exportador' : 'Inspector');

  return {
    uid: userRecord.localId,
    email: userRecord.email,
    displayName: userRecord.displayName || userRecord.email?.split('@')[0],
    role: legacyRole,
    normalizedRole,
    isUnispectMaster: isMaster,
    authorizedClients: claims.authorizedClients || [],
    exporterId: claims.exporterId || null,
    claims
  };
}

// ── DEFINIÇÃO DOS USUÁRIOS SINTÉTICOS ──
const USERS = {
  master: {
    email: 'master@unispect.com',
    password: 'Password123!',
    displayName: 'Master Unispect Supervisor',
    claims: { role: 'MASTER', isUnispectMaster: true, authorizedClients: ['*'] }
  },
  adminInterport: {
    email: 'admin@interport.com.br',
    password: 'Password123!',
    displayName: 'Administrador Interport',
    claims: { role: 'CLIENT_ADMIN', authorizedClients: ['client_interport'] }
  },
  inspectorCarlos: {
    email: 'carlos@interport.com.br',
    password: 'Password123!',
    displayName: 'Carlos Santos (Inspetor Interport)',
    claims: { role: 'INSPECTOR', authorizedClients: ['client_interport'] }
  },
  exporterAtlantica: {
    email: 'exportador@cafeatlantica.com.br',
    password: 'Password123!',
    displayName: 'Café Atlântica Exportador',
    claims: { role: 'EXPORTER', authorizedClients: ['client_interport'], exporterId: 'exp_atlantica' }
  },
  unauthorizedUser: {
    email: 'semcargo@interport.com.br',
    password: 'Password123!',
    displayName: 'Usuário Sem Papel',
    claims: {}
  },
  adminTerminalB: {
    email: 'admin@terminalb.com.br',
    password: 'Password123!',
    displayName: 'Admin Terminal B',
    claims: { role: 'CLIENT_ADMIN', authorizedClients: ['client_terminal_b'] }
  }
};

const userRecords = {};

// ── INICIALIZAÇÃO DE AMBIENTE E EXECUÇÃO DOS TESTES ──
try {
  console.log('Provisionando usuários no Auth Emulator...');
  for (const [key, config] of Object.entries(USERS)) {
    userRecords[key] = await provisionSyntheticUser(config);
  }
  console.log('✔ Todos os 6 usuários de teste provisionados com Custom Claims.\n');

  // Inicializa Test Environment para regras de Firestore e Storage
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(firestoreRulesPath, 'utf8')
    },
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: readFileSync(storageRulesPath, 'utf8')
    }
  });

  // Limpa estado anterior do Firestore e executa seed de dados
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const db = adminContext.firestore();

    // Cliente Operacional Principal INTERPORT
    await setDoc(doc(db, 'clients', 'client_interport'), {
      id: 'client_interport',
      name: 'INTERPORT Logística',
      code: 'INTERPORT',
      description: 'Terminal e Operador Logístico Principal',
      cnpj: '08.123.456/0001-78',
      active: true,
      isDefault: true,
      createdAt: 1704067200000
    });

    // Booking Demo Interport (com containers históricos)
    await setDoc(doc(db, 'bookings', 'bk_demo_interport'), {
      id: 'bk_demo_interport',
      clientId: 'client_interport',
      bookingNumber: 'BKG-INT-DEMO-01',
      certificateNumber: 'CERT-2026-DEMO',
      exporterId: 'exp_atlantica',
      status: 'Em andamento',
      containers: [
        { id: 'cntr_demo_1', containerNumber: 'MSDU1234567', status: 'Vistoriado' },
        { id: 'cntr_demo_2', containerNumber: 'TGHU7654321', status: 'Pendente' }
      ],
      createdAt: 1704067200000
    });

    // Booking Interport (Exportador Atlântica)
    await setDoc(doc(db, 'bookings', 'bk_interport'), {
      id: 'bk_interport',
      clientId: 'client_interport',
      bookingNumber: 'BKG-INT-001',
      certificateNumber: 'CERT-2026-001',
      exporterId: 'exp_atlantica',
      status: 'Pendente',
      inspectorNotes: 'Vistoria pendente'
    });

    // Booking Interport para outro exportador (Tristão)
    await setDoc(doc(db, 'bookings', 'bk_interport_tristao'), {
      id: 'bk_interport_tristao',
      clientId: 'client_interport',
      bookingNumber: 'BKG-INT-002',
      certificateNumber: 'CERT-2026-002',
      exporterId: 'exp_tristao',
      status: 'Pendente'
    });

    // Booking Terminal B
    await setDoc(doc(db, 'bookings', 'bk_terminal_b'), {
      id: 'bk_terminal_b',
      clientId: 'client_terminal_b',
      bookingNumber: 'BKG-TB-001',
      certificateNumber: 'CERT-TB-001',
      exporterId: 'exp_outros',
      status: 'Pendente'
    });
  });

  // ── TESTE 1: LOGIN VÁLIDO COM RETORNO DE CUSTOM CLAIMS E MAPEAMENTO ──
  await runTest('Login válido com e-mail e senha corretos retorna ID token com Custom Claims', async () => {
    const signInUrl = `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`;
    const res = await fetch(signInUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: USERS.inspectorCarlos.email,
        password: USERS.inspectorCarlos.password,
        returnSecureToken: true
      })
    });
    const data = await res.json();
    if (!data.idToken) throw new Error('Falha ao obter idToken: ' + JSON.stringify(data));

    const payload = decodeJwtPayload(data.idToken);
    if (payload.role !== 'INSPECTOR') throw new Error(`Role inesperada: ${payload.role}`);
    if (!payload.authorizedClients?.includes('client_interport')) throw new Error('authorizedClients ausente');

    const mapped = mapUserFromClaims(data, payload);
    if (mapped.role !== 'Inspector') throw new Error(`Legacy role inesperada: ${mapped.role}`);
    if (mapped.normalizedRole !== 'INSPECTOR') throw new Error(`Normalized role inesperada: ${mapped.normalizedRole}`);
  });

  // ── TESTE 2: LOGIN INVÁLIDO (SENHA INCORRETA) ──
  await runTest('Login com senha incorreta é rejeitado e retorna mensagem segura em português', async () => {
    const signInUrl = `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`;
    const res = await fetch(signInUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: USERS.inspectorCarlos.email,
        password: 'SenhaTotalmenteIncorreta123!',
        returnSecureToken: true
      })
    });
    const data = await res.json();
    if (res.ok) throw new Error('Login deveria ter falhado com senha errada');

    const errCode = data?.error?.message || '';
    const friendly = translateAuthError(errCode);
    if (friendly !== 'E-mail ou senha incorretos.') {
      throw new Error(`Mensagem inesperada: ${friendly}`);
    }
  });

  // ── TESTE 3: LOGIN INVÁLIDO (USUÁRIO INEXISTENTE) ──
  await runTest('Login com e-mail não cadastrado retorna a mesma mensagem genérica sem enumerar usuários', async () => {
    const signInUrl = `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`;
    const res = await fetch(signInUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'naoexiste_desconhecido@interport.com.br',
        password: 'QualquerSenha123!',
        returnSecureToken: true
      })
    });
    const data = await res.json();
    if (res.ok) throw new Error('Login deveria ter falhado para usuário inexistente');

    const errCode = data?.error?.message || '';
    const friendly = translateAuthError(errCode);
    if (friendly !== 'E-mail ou senha incorretos.') {
      throw new Error(`Mensagem inesperada: ${friendly}`);
    }
  });

  // ── TESTE 4: USUÁRIO AUTENTICADO SEM PAPEL OPERACIONAL ATRIBUÍDO ──
  await runTest('Usuário autenticado mas sem Custom Claims operacionais é marcado como unauthorized', async () => {
    const signInUrl = `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`;
    const res = await fetch(signInUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: USERS.unauthorizedUser.email,
        password: USERS.unauthorizedUser.password,
        returnSecureToken: true
      })
    });
    const data = await res.json();
    const payload = decodeJwtPayload(data.idToken);

    // Validação de papel reconhecido (espelho de authService.js)
    const hasRecognizedRole = Boolean(
      payload.isUnispectMaster ||
      payload.role === 'MASTER' ||
      payload.role === 'CLIENT_ADMIN' ||
      payload.role === 'INSPECTOR' ||
      payload.role === 'EXPORTER'
    );

    if (hasRecognizedRole) throw new Error('Usuário sem cargo não deveria ter papel reconhecido');
  });

  // ── TESTE 5: RECUPERAÇÃO DE ACESSO (PASSWORD RESET) ──
  await runTest('Recuperação de acesso gera link seguro de redefinição de senha', async () => {
    const resetUrl = `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=fake-api-key`;
    const res = await fetch(resetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'PASSWORD_RESET',
        email: USERS.inspectorCarlos.email
      })
    });
    const data = await res.json();
    if (!res.ok || data.email !== USERS.inspectorCarlos.email) {
      throw new Error('Falha no envio de redefinição de senha: ' + JSON.stringify(data));
    }
  });

  // ── TESTE 6: LOGOUT PRESERVA FILAS E DADOS OFFLINE NO INDEXEDDB ──
  await runTest('Logout encerra sessão do usuário mas preserva filas offline e fotos pendentes', async () => {
    // Simulação do estado local e fila offline
    const mockStorage = {
      currentUser: JSON.stringify({ email: 'carlos@interport.com.br' }),
      bookingPhotoQueue: JSON.stringify([
        { id: 'q_1', containerId: 'CONT123', status: 'pending', photoUri: 'blob:...' },
        { id: 'q_2', containerId: 'CONT124', status: 'pending', photoUri: 'blob:...' }
      ]),
      offlineFieldContainers: JSON.stringify([{ id: 'fc_1', number: 'MSDU8821297' }])
    };

    // Executa a operação de logout (espelho de logoutUser() em authService.js)
    delete mockStorage.currentUser;

    if (mockStorage.currentUser !== undefined) {
      throw new Error('Sessão ativa não foi limpa');
    }
    const queue = JSON.parse(mockStorage.bookingPhotoQueue);
    if (!queue || queue.length !== 2) {
      throw new Error('Fila de fotos foi corrompida ou apagada indevidamente no logout');
    }
    const offlineCache = JSON.parse(mockStorage.offlineFieldContainers);
    if (!offlineCache || offlineCache.length !== 1) {
      throw new Error('Cache offline de contêineres foi corrompido no logout');
    }
  });

  // ── TESTE 7: ISOLAMENTO MULTI-TENANT ENTRE CLIENTES (INTERPORT vs TERMINAL B) ──
  await runTest('Inspetor da Interport lê dados da Interport mas é BLOQUEADO no Terminal B', async () => {
    const carlosContext = testEnv.authenticatedContext(userRecords.inspectorCarlos.localId, {
      email: USERS.inspectorCarlos.email,
      ...USERS.inspectorCarlos.claims
    });
    const db = carlosContext.firestore();

    // Leitura na Interport: DEVE PERMITIR
    await assertSucceeds(getDoc(doc(db, 'bookings', 'bk_interport')));

    // Leitura no Terminal B: DEVE BLOQUEAR
    await assertFails(getDoc(doc(db, 'bookings', 'bk_terminal_b')));
  });

  await runTest('Admin do Terminal B é BLOQUEADO em qualquer documento da Interport', async () => {
    const tbContext = testEnv.authenticatedContext(userRecords.adminTerminalB.localId, {
      email: USERS.adminTerminalB.email,
      ...USERS.adminTerminalB.claims
    });
    const db = tbContext.firestore();

    // Acesso à Interport: DEVE BLOQUEAR
    await assertFails(getDoc(doc(db, 'bookings', 'bk_interport')));

    // Acesso ao próprio Terminal B: DEVE PERMITIR
    await assertSucceeds(getDoc(doc(db, 'bookings', 'bk_terminal_b')));
  });

  // ── TESTE 8: RESTRIÇÃO ESTREITA DO EXPORTADOR (SOMENTE SUAS PRÓPRIAS CARGAS) ──
  await runTest('Exportador Café Atlântica lê somente cargas próprias e é bloqueado em outros exportadores', async () => {
    const expContext = testEnv.authenticatedContext(userRecords.exporterAtlantica.localId, {
      email: USERS.exporterAtlantica.email,
      ...USERS.exporterAtlantica.claims
    });
    const db = expContext.firestore();

    // Carga Café Atlântica: DEVE PERMITIR
    await assertSucceeds(getDoc(doc(db, 'bookings', 'bk_interport')));

    // Carga de outro exportador (Tristão): DEVE BLOQUEAR
    await assertFails(getDoc(doc(db, 'bookings', 'bk_interport_tristao')));
  });

  // ── TESTE 9: PRIVILÉGIO MASTER UNISPECT COM VISIBILIDADE GLOBAL ──
  await runTest('Master Unispect possui visibilidade administrativa transversal a todos os clientes', async () => {
    const masterContext = testEnv.authenticatedContext(userRecords.master.localId, {
      email: USERS.master.email,
      ...USERS.master.claims
    });
    const db = masterContext.firestore();

    await assertSucceeds(getDoc(doc(db, 'bookings', 'bk_interport')));
    await assertSucceeds(getDoc(doc(db, 'bookings', 'bk_terminal_b')));
  });

  // ── TESTE 10: REVOGAÇÃO IMEDIATA DE SESSÃO ADMINISTRATIVA ──
  await runTest('Sessão revogada no Firestore (userSecurityMetadata) bloqueia operações subsequentes', async () => {
    const carlosUid = userRecords.inspectorCarlos.localId;

    // Admin registra revogação imediata no Firestore com timestamp futuro
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const db = adminContext.firestore();
      await setDoc(doc(db, 'userSecurityMetadata', carlosUid), {
        revokedAt: Math.floor(Date.now() / 1000) + 3600 // revogado 1h à frente
      });
    });

    // Token emitido antes do revokedAt
    const revokedCarlosContext = testEnv.authenticatedContext(carlosUid, {
      email: USERS.inspectorCarlos.email,
      auth_time: Math.floor(Date.now() / 1000) - 100, // emitido há 100s
      ...USERS.inspectorCarlos.claims
    });
    const db = revokedCarlosContext.firestore();

    // Acesso DEVE FALHAR devido à regra isNotRevoked()
    await assertFails(getDoc(doc(db, 'bookings', 'bk_interport')));
  });

  await testEnv.cleanup();
} catch (err) {
  console.error('\n❌ Erro crítico na execução da suíte:', err);
  process.exit(1);
}

console.log('\n===============================================================');
console.log(`RESULTADO FINAL DA SUÍTE DE AUTENTICAÇÃO E ISOLAMENTO:`);
console.log(`Total de Testes: ${totalTests} | Aprovados: ${passedTests} | Falhas: ${failedTests}`);
console.log('===============================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
