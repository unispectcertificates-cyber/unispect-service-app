const fetch = globalThis.fetch;

/**
 * ============================================================================
 * FERRAMENTA EXCLUSIVA DO FIREBASE AUTH EMULATOR (AMBIENTE DE LABORATÓRIO)
 * ============================================================================
 * ATENÇÃO: Esta ferramenta utiliza o cabeçalho 'Authorization: Bearer owner',
 * que é um mecanismo sintético interno EXCLUSIVO do emulador local do Firebase.
 * 
 * Este cabeçalho NÃO EXISTE E NÃO CONSTITUI SEGURANÇA EM PRODUÇÃO.
 * Em ambiente produtivo, o provisionamento de Custom Claims deve ser realizado
 * exclusivamente pelo Firebase Admin SDK autenticado via Google Cloud IAM
 * (Application Default Credentials / Service Account com OAuth2).
 * ============================================================================
 */

const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-unispect-test';

// Trava ativa de isolamento: aborta imediatamente se o destino não for o emulador local
function assertLocalEmulatorTarget(host, projectId) {
  const isLocalHost = host.startsWith('127.0.0.1:') || host.startsWith('localhost:');
  const isDemoOrTest = projectId.startsWith('demo-') || projectId.endsWith('-test');

  if (!isLocalHost || !isDemoOrTest) {
    const errorMsg = `[BLOQUEIO DE SEGURANÇA FATAL] manage-users.mjs utiliza 'Authorization: Bearer owner', ` +
      `um artifício simulado EXCLUSIVO do Auth Emulator. A execução foi abortada imediatamente ` +
      `porque o destino (${host} / ${projectId}) não é um emulador local seguro.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Cria ou atualiza um usuário fictício no Firebase Auth Emulator com Custom Claims.
 */
export async function provisionUser({ email, password, displayName, claims }) {
  assertLocalEmulatorTarget(AUTH_EMULATOR_HOST, PROJECT_ID);
  const url = `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;
  
  // 1. Criar ou autenticar usuário no emulador
  let localId;
  const createRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      displayName,
      returnSecureToken: true
    })
  });
  const createData = await createRes.json();

  if (createData.localId) {
    localId = createData.localId;
  } else if (createData.error && createData.error.message.includes('EMAIL_EXISTS')) {
    // Busca o localId do usuário existente
    const lookupUrl = `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fake-api-key`;
    const lookupRes = await fetch(lookupUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: [email] })
    });
    const lookupData = await lookupRes.json();
    localId = lookupData.users[0].localId;
  } else {
    throw new Error(`Falha ao provisionar usuário ${email}: ` + JSON.stringify(createData.error));
  }

  // 2. Definir Custom Claims (Papéis e Clientes Autorizados)
  const setClaimsUrl = `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key`;
  const updateRes = await fetch(setClaimsUrl, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': 'Bearer owner'
    },
    body: JSON.stringify({
      localId,
      customAttributes: JSON.stringify(claims)
    })
  });
  const updateData = await updateRes.json();
  if (!updateRes.ok) throw new Error(`Falha ao definir claims para ${email}: ` + JSON.stringify(updateData.error));

  return { localId, email, claims };
}

export const TEST_USERS = [
  {
    email: 'master@unispect.com',
    password: 'Password123!',
    displayName: 'Master Unispect Supervisor',
    claims: {
      role: 'MASTER',
      isUnispectMaster: true,
      authorizedClients: ['*']
    }
  },
  {
    email: 'admin@interport.com.br',
    password: 'Password123!',
    displayName: 'Administrador Interport',
    claims: {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_interport']
    }
  },
  {
    email: 'carlos@interport.com.br',
    password: 'Password123!',
    displayName: 'Carlos Santos (Inspetor Interport)',
    claims: {
      role: 'INSPECTOR',
      authorizedClients: ['client_interport']
    }
  },
  {
    email: 'exportador@cafeatlantica.com.br',
    password: 'Password123!',
    displayName: 'Café Atlântica Exportador',
    claims: {
      role: 'EXPORTER',
      authorizedClients: ['client_interport'],
      exporterId: 'exp_atlantica'
    }
  },
  {
    email: 'semcargo@interport.com.br',
    password: 'Password123!',
    displayName: 'Usuário Sem Papel Operacional',
    claims: {}
  },
  {
    email: 'admin@terminalb.com.br',
    password: 'Password123!',
    displayName: 'Admin Terminal B',
    claims: {
      role: 'CLIENT_ADMIN',
      authorizedClients: ['client_terminal_b']
    }
  }
];

export async function provisionAllTestUsers() {
  console.log('=== PROVISIONANDO USUÁRIOS DE TESTE NO AUTH EMULATOR ===');
  for (const u of TEST_USERS) {
    const res = await provisionUser(u);
    console.log(`✔ Usuário ${res.email} provisionado com claims:`, res.claims);
  }
  console.log('Provisionamento administrativo concluído.');
}

if (process.argv[1].endsWith('manage-users.mjs')) {
  provisionAllTestUsers().catch(err => {
    console.error('Erro no provisionamento:', err.message);
    process.exit(1);
  });
}
