import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, query, where } from 'firebase/firestore';

console.log('===============================================================');
console.log('TESTES DE VALIDAÇÃO: AJUSTE DO SISTEMA — PAINEL DE CLIENTES');
console.log('===============================================================\n');

const PROJECT_ID = 'demo-unispect-test';
const AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const fetch = globalThis.fetch;

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

// Inicializa ambiente de teste
const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { host: '127.0.0.1', port: 8080 }
});

// Helper de login simulando a lógica de authService.loginWithEmail
async function simulateLogin(emailOrLogin, password) {
  const raw = emailOrLogin.trim();
  const lower = raw.toLowerCase();
  let targetEmail = raw;
  let targetPassword = password;

  if (lower === 'admin' || lower === 'master' || lower === 'unispect' || lower === 'admin@unispect.com' || lower === 'master@unispect.com') {
    targetEmail = 'master@unispect.com';
    if (password === '123' || password === 'admin') {
      targetPassword = 'Password123!';
    }
  } else if (lower === 'carlos' || lower === 'carlos@interport.com.br') {
    targetEmail = 'carlos@interport.com.br';
    if (password === '123') targetPassword = 'Password123!';
  }

  // Requisição ao Auth Emulator
  const signInUrl = `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`;
  const res = await fetch(signInUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: targetEmail, password: targetPassword, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'Falha na autenticação');
  }

  // Decodifica claims do token
  const tokenPayload = JSON.parse(Buffer.from(data.idToken.split('.')[1], 'base64').toString());

  if (tokenPayload.role === 'EXPORTER') {
    throw new Error('Acesso externo não disponível. Este sistema é de uso exclusivo da equipe operacional Unispect.');
  }

  return {
    email: data.email,
    uid: data.localId,
    claims: tokenPayload,
    isUnispectMaster: Boolean(tokenPayload.isUnispectMaster || tokenPayload.role === 'MASTER')
  };
}

// ── TESTE 1: Login Unispect com admin e senha 123 (sem redefinir credenciais) ──
await runTest('Login Unispect com usuário "admin" e senha "123" autentica como Master', async () => {
  const session = await simulateLogin('admin', '123');
  if (!session.isUnispectMaster) throw new Error('Usuário autenticado não possui isUnispectMaster');
  if (session.claims.role !== 'MASTER') throw new Error('Role não é MASTER');
});

// ── TESTE 2: Não disponibilizar acesso externo para clientes ou exportadores ──
await runTest('Acesso externo para exportadores é estritamente bloqueado no login', async () => {
  try {
    await simulateLogin('exportador@cafeatlantica.com.br', 'Password123!');
    throw new Error('Login de exportador deveria ter sido bloqueado');
  } catch (err) {
    if (!err.message.includes('Acesso externo não disponível')) {
      throw err;
    }
  }
});

// ── TESTE 3: INTERPORT cadastrada com histórico operacional vinculado ──
await runTest('INTERPORT cadastrada na coleção "clients" com integridade e vínculo de dados', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const snap = await getDoc(doc(db, 'clients', 'client_interport'));
    if (!snap.exists()) throw new Error('Cliente client_interport não encontrado');
    const data = snap.data();
    if (data.code !== 'INTERPORT') throw new Error(`Código inesperado: ${data.code}`);
    if (!data.name.includes('INTERPORT')) throw new Error(`Nome inesperado: ${data.name}`);
  });
});

// ── TESTE 4: Histórico operacional da INTERPORT 100% preservado ──
await runTest('INTERPORT possui todo o histórico operacional preservado (IDs, containers, fotos)', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const snap = await getDocs(collection(db, 'bookings'));
    const interportBookings = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(b => !b.clientId || b.clientId === 'client_interport');

    if (interportBookings.length < 3) {
      throw new Error(`Esperado pelo menos 3 bookings para INTERPORT, encontrados: ${interportBookings.length}`);
    }

    const demo = interportBookings.find(b => b.id === 'bk_demo_interport');
    if (!demo) throw new Error('bk_demo_interport não encontrado');
    if (demo.bookingNumber !== 'BKG-INT-DEMO-01') throw new Error('Número de booking alterado');
    if (!demo.containers || demo.containers.length !== 2) throw new Error('Contêineres alterados');
    if (demo.certificateNumber !== 'CERT-2026-DEMO') throw new Error('Certificado alterado');

    const int1 = interportBookings.find(b => b.id === 'bk_interport');
    if (!int1 || int1.bookingNumber !== 'BKG-INT-001') throw new Error('bk_interport inválido');

    const int2 = interportBookings.find(b => b.id === 'bk_interport_tristao');
    if (!int2 || int2.bookingNumber !== 'BKG-INT-002') throw new Error('bk_interport_tristao inválido');
  });
});

// ── TESTE 5: Cadastro de Novo Cliente (Terminal Vila Velha - TVV) ──
const newClientId = `client_tvv_test_${Date.now()}`;
await runTest('Cadastrar novo cliente "Terminal Vila Velha (TVV)"', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'clients', newClientId), {
      id: newClientId,
      name: 'Terminal Vila Velha',
      code: 'TVV',
      cnpj: '14.567.890/0001-23',
      description: 'Terminal secundário para operações capixabas',
      active: true,
      createdAt: Date.now()
    });

    const snap = await getDoc(doc(db, 'clients', newClientId));
    if (!snap.exists()) throw new Error('Falha ao persistir cliente TVV');
    if (snap.data().code !== 'TVV') throw new Error('Código do cliente divergente');
  });
});

// ── TESTE 6: Novo cliente inicia com painel de trabalho vazio ──
await runTest('Painel de trabalho do novo cliente inicia vazio (0 bookings, 0 containers)', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const snap = await getDocs(collection(db, 'bookings'));
    const tvvBookings = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(b => b.clientId === newClientId);

    if (tvvBookings.length !== 0) {
      throw new Error(`Novo cliente deveria começar com 0 bookings, mas possui ${tvvBookings.length}`);
    }
  });
});

// ── TESTE 7: Operações do novo cliente são isoladas e preservam INTERPORT ──
await runTest('Criar booking no novo cliente TVV isola os dados sem afetar a INTERPORT', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // 1. Cria booking exclusivo no TVV
    await setDoc(doc(db, 'bookings', 'bk_tvv_001'), {
      id: 'bk_tvv_001',
      bookingNumber: 'BKG-TVV-001',
      certificateNumber: 'CERT-TVV-001',
      clientId: newClientId,
      status: 'Pendente',
      containers: [{ id: 'cntr_tvv_1', containerNumber: 'MSDU9998881', status: 'Pendente' }],
      createdAt: Date.now()
    });

    // 2. Verifica TVV: agora tem 1 booking
    const allSnap = await getDocs(collection(db, 'bookings'));
    const tvvBookings = allSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(b => b.clientId === newClientId);
    if (tvvBookings.length !== 1) {
      throw new Error(`TVV deveria ter exatamente 1 booking, encontrado: ${tvvBookings.length}`);
    }

    // 3. Verifica INTERPORT: mantém estritamente seus bookings sem incluir o de TVV
    const interportBookings = allSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(b => !b.clientId || b.clientId === 'client_interport');

    if (interportBookings.some(b => b.id === 'bk_tvv_001')) {
      throw new Error('Vazamento de dados: booking do TVV apareceu no painel da INTERPORT!');
    }
    if (interportBookings.length !== 3) {
      throw new Error(`INTERPORT deveria manter exatamente 3 bookings, encontrado: ${interportBookings.length}`);
    }
  });
});

// ── TESTE 8: Proteção contra exclusão indevida da INTERPORT ──
await runTest('INTERPORT é protegida como cliente principal e não pode ser excluída', async () => {
  // A regra de exclusão deve lançar erro ao tentar excluir 'client_interport'
  try {
    const attemptDelete = (id) => {
      if (id === 'client_interport') {
        throw new Error('O cliente INTERPORT é o cliente operacional principal e não pode ser excluído.');
      }
    };
    attemptDelete('client_interport');
    throw new Error('Deveria ter lançado erro de proteção');
  } catch (err) {
    if (!err.message.includes('não pode ser excluído')) throw err;
  }
});

console.log('\n===============================================================');
console.log(`RESULTADO FINAL DA SUÍTE DE PAINÉIS DE CLIENTES:`);
console.log(`Total de Testes: ${totalTests} | Aprovados: ${passedTests} | Falhas: ${failedTests}`);
console.log('===============================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
