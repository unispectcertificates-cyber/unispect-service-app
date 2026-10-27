/**
 * prepare-users-transition.mjs
 * 
 * Ferramenta preparatória para a futura transição da coleção 'usuarios' do Firestore.
 * 
 * OBJETIVO:
 * - Planejar e demonstrar o saneamento seguro dos 4 usuários existentes.
 * - Remover campos sensíveis legados ('password', 'senha') que continham senhas em texto puro.
 * - Vincular cada documento ao respectivo 'authUid' do Firebase Auth.
 * - Configurar a blindagem de regras de segurança (somente Master ou backend administrativo).
 * 
 * SALVAGUARDA DE SEGURANÇA:
 * - Este script roda em modo DRY-RUN por padrão.
 * - NENHUMA alteração é gravada no banco de produção.
 */

export const TRANSITION_PLAN = [
  {
    legacyId: 'usr_master',
    legacyLogin: 'admin',
    proposedEmail: 'master@unispect.com',
    targetRole: 'MASTER',
    claims: { role: 'MASTER', isUnispectMaster: true, authorizedClients: ['*'] },
    actions: [
      'Remover campo legível "password"',
      'Vincular ao authUid gerado no Firebase Auth',
      'Atribuir Custom Claim isUnispectMaster: true',
      'Gravar timestamp de migração'
    ]
  },
  {
    legacyId: 'usr_inspector',
    legacyLogin: 'carlos',
    proposedEmail: 'carlos@interport.com.br',
    targetRole: 'INSPECTOR',
    claims: { role: 'INSPECTOR', authorizedClients: ['client_interport'] },
    actions: [
      'Remover campo legível "password"',
      'Vincular ao authUid do Firebase Auth',
      'Atribuir authorizedClients: ["client_interport"]',
      'Forçar primeiro acesso via fluxo seguro de redefinição de senha'
    ]
  },
  {
    legacyId: 'usr_admin_interport',
    legacyLogin: 'interport_adm',
    proposedEmail: 'admin@interport.com.br',
    targetRole: 'CLIENT_ADMIN',
    claims: { role: 'CLIENT_ADMIN', authorizedClients: ['client_interport'] },
    actions: [
      'Remover campo legível "password"',
      'Vincular ao authUid do Firebase Auth',
      'Atribuir permissão de administração restrita a client_interport'
    ]
  },
  {
    legacyId: 'usr_exporter_atlantica',
    legacyLogin: 'exp_atlantica',
    proposedEmail: 'exportador@cafeatlantica.com.br',
    targetRole: 'EXPORTER',
    claims: { role: 'EXPORTER', authorizedClients: ['client_interport'], exporterId: 'exp_atlantica' },
    actions: [
      'Remover campo legível "password"',
      'Vincular ao authUid do Firebase Auth',
      'Atribuir exporterId imutável nas Custom Claims para isolamento de cargas'
    ]
  }
];

export function sanitizeUserDocument(docData, authUid) {
  const sanitized = { ...docData };
  
  // 1. Eliminação irrevogável de senhas em texto puro
  delete sanitized.password;
  delete sanitized.senha;
  delete sanitized.pass;
  delete sanitized.secret;

  // 2. Vínculo seguro de identidade Firebase
  sanitized.authUid = authUid;
  sanitized.isMigratedToFirebaseAuth = true;
  sanitized.migratedAt = Date.now();
  sanitized.authProvider = 'firebase-auth-email';

  return sanitized;
}

export function generateSanitizationDryRun() {
  console.log('===============================================================');
  console.log('PLANO DE SANEAMENTO E TRANSIÇÃO DA COLEÇÃO "usuarios"');
  console.log('STATUS: DRY-RUN (NENHUMA ALTERAÇÃO REAL FOI OU SERÁ APLICADA AGORA)');
  console.log('===============================================================\n');

  TRANSITION_PLAN.forEach((userPlan, index) => {
    console.log(`[Usuário ${index + 1}/${TRANSITION_PLAN.length}] ID Legado: ${userPlan.legacyId} (Login: ${userPlan.legacyLogin})`);
    console.log(`  ➔ E-mail Corporativo Proposto: ${userPlan.proposedEmail}`);
    console.log(`  ➔ Novo Papel (Custom Claims): ${userPlan.targetRole}`);
    console.log(`  ➔ Claims a provisionar:`, JSON.stringify(userPlan.claims));
    console.log(`  ➔ Ações de Saneamento:`);
    userPlan.actions.forEach(a => console.log(`     • ${a}`));

    // Demonstra documento saneado
    const sampleLegacyDoc = {
      id: userPlan.legacyId,
      login: userPlan.legacyLogin,
      name: `Nome de ${userPlan.legacyLogin}`,
      password: '*** SENHA ANTIGA EM TEXTO PURO QUE SERÁ EXPURGADA ***',
      role: userPlan.targetRole
    };
    const sanitized = sanitizeUserDocument(sampleLegacyDoc, `mock_auth_uid_${index + 1}`);
    console.log(`  ➔ Documento Final Saneado no Firestore (sem senhas):`, JSON.stringify(sanitized));
    console.log('---------------------------------------------------------------');
  });

  console.log('\nREGRAS DE SEGURANÇA PROPOSTAS PARA A TRANSIÇÃO (FIRESTORE):');
  console.log(`
    match /usuarios/{userId} {
      // Bloqueio total de leitura pública ou por clientes regulares.
      // Autenticação passa a ser feita exclusivamente por tokens e claims do Firebase Auth.
      allow read, write: if request.auth != null && 
        request.auth.token.isUnispectMaster == true;
    }
  `);
  console.log('===============================================================');
}

if (process.argv[1].endsWith('prepare-users-transition.mjs')) {
  generateSanitizationDryRun();
}
