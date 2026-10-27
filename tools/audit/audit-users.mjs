/**
 * audit-users.mjs
 * 
 * Ferramenta somente-leitura de auditoria prévia da coleção /usuarios.
 * 
 * OBJETIVO:
 * Identificar com antecedência inconsistências cadastrais que impedirão
 * o provisionamento no Firebase Authentication, SEM EXPOR SENHAS NEM CREDENCIAIS.
 * 
 * REGRAS DE AUDITORIA:
 * 1. Não alterar nem sanear o banco de produção nesta etapa.
 * 2. Omitir senhas e credenciais em relatórios e saídas de terminal.
 * 3. Identificar:
 *    - Usuários sem e-mail ou com formato de e-mail inválido;
 *    - E-mails duplicados (incompatíveis com a unicidade do Firebase Auth);
 *    - IDs incompatíveis com as restrições de UID do Firebase Auth (1-128 caracteres ASCII);
 *    - Usuários sem papel (role) válido.
 */

export function auditUsersCollection(usersList = []) {
  const report = {
    auditedAt: new Date().toISOString(),
    totalUsers: usersList.length,
    eligibleForAuth: 0,
    anomaliesCount: 0,
    issues: {
      missingEmail: [],
      invalidEmailFormat: [],
      duplicateEmails: [],
      incompatibleUid: [],
      missingRole: []
    },
    userSummary: []
  };

  const emailOccurrences = new Map();
  const validEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validUidRegex = /^[A-Za-z0-9_\-:.]{1,128}$/;

  // 1. Primeira passada para mapeamento e contagem de e-mails
  for (const user of usersList) {
    const email = user.email ? String(user.email).trim().toLowerCase() : '';
    if (email) {
      emailOccurrences.set(email, (emailOccurrences.get(email) || 0) + 1);
    }
  }

  // 2. Segunda passada para análise detalhada e sanitizada
  for (const user of usersList) {
    const userId = user.id || 'sem_id';
    const email = user.email ? String(user.email).trim().toLowerCase() : '';
    const role = user.role || '';
    const userIssues = [];

    // Verificação de E-mail
    if (!email) {
      userIssues.push('SEM_EMAIL');
      report.issues.missingEmail.push({ userId, name: user.name || 'Sem Nome' });
    } else if (!validEmailRegex.test(email)) {
      userIssues.push('EMAIL_FORMATO_INVALIDO');
      report.issues.invalidEmailFormat.push({ userId, email });
    } else if (emailOccurrences.get(email) > 1) {
      userIssues.push('EMAIL_DUPLICADO');
      report.issues.duplicateEmails.push({ userId, email });
    }

    // Verificação de UID
    if (!validUidRegex.test(String(userId))) {
      userIssues.push('UID_INCOMPATIVEL');
      report.issues.incompatibleUid.push({ userId, length: String(userId).length });
    }

    // Verificação de Role
    if (!role) {
      userIssues.push('SEM_ROLE');
      report.issues.missingRole.push({ userId });
    }

    const hasAnomaly = userIssues.length > 0;
    if (hasAnomaly) {
      report.anomaliesCount++;
    } else {
      report.eligibleForAuth++;
    }

    report.userSummary.push({
      userId,
      name: user.name || 'Sem Nome',
      role: user.role || 'SEM_PAPEL',
      hasValidEmail: Boolean(email && validEmailRegex.test(email) && emailOccurrences.get(email) === 1),
      status: hasAnomaly ? 'EXIGE_REVISAO' : 'APTO_PARA_AUTH',
      issues: userIssues
      // SENHA E TOKEN NUNCA SÃO INCLUÍDOS
    });
  }

  return report;
}
