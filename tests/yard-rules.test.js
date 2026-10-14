import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Avaliador de Regras de Segurança do Firestore para o Módulo de Inventário de Pátio
 * Simula a semântica exata das regras declaradas em firestore.rules
 */
function evaluateYardRules({
  path,
  operation, // 'get' | 'list' | 'create' | 'update' | 'delete'
  auth, // { uid, token: { role, admin } }
  resource, // estado atual do documento (null para create)
  requestData // novo dado enviado na requisição
}) {
  const isAuthenticated = auth !== null && auth !== undefined;
  const isAdmin = isAuthenticated && (auth?.token?.role === 'ADM' || auth?.token?.admin === true);

  // Match /yardPassages/{passageId}
  if (path.startsWith('yardPassages/')) {
    if (operation === 'get' || operation === 'list') {
      return isAuthenticated;
    }
    if (operation === 'create') {
      return isAuthenticated;
    }
    if (operation === 'update') {
      if (!isAuthenticated) return false;
      const isStatusExited = requestData?.status === 'exited';
      const wasAlreadyExited = resource?.status === 'exited';
      // allow update: if isAuthenticated() && (request.resource.data.status != 'exited' || resource.data.status == 'exited' || isAdmin());
      return (!isStatusExited || wasAlreadyExited || isAdmin);
    }
    if (operation === 'delete') {
      return false; // allow delete: if false
    }
  }

  // Match /yardActiveLocks/{lockKey}
  if (path.startsWith('yardActiveLocks/')) {
    return isAuthenticated;
  }

  // Match /yardAudits/{auditId}
  if (path.startsWith('yardAudits/')) {
    if (operation === 'get' || operation === 'list' || operation === 'create' || operation === 'update') {
      return isAuthenticated;
    }
    if (operation === 'delete') {
      return false; // allow delete: if false
    }
  }

  return false;
}

test('Regras de Segurança: Inspetor autenticado pode ler e criar passagens e auditorias', () => {
  const inspectorAuth = { uid: 'insp_1', token: { role: 'Inspector' } };

  assert.equal(
    evaluateYardRules({ path: 'yardPassages/yp_1', operation: 'get', auth: inspectorAuth }),
    true,
    'Inspetor deve conseguir ler passagens'
  );

  assert.equal(
    evaluateYardRules({ path: 'yardPassages/yp_1', operation: 'create', auth: inspectorAuth, requestData: { status: 'active' } }),
    true,
    'Inspetor deve conseguir criar novas passagens'
  );

  assert.equal(
    evaluateYardRules({ path: 'yardAudits/audit_1', operation: 'create', auth: inspectorAuth }),
    true,
    'Inspetor deve conseguir criar conferências'
  );
});

test('Regras de Segurança: Inspetor é BLOQUEADO ao tentar marcar saída (status: "exited")', () => {
  const inspectorAuth = { uid: 'insp_1', token: { role: 'Inspector' } };
  const passageResource = { status: 'active', containerNumber: 'MSCU1234567' };

  // Tentativa de atualizar para 'exited' por Inspetor
  const allowed = evaluateYardRules({
    path: 'yardPassages/yp_1',
    operation: 'update',
    auth: inspectorAuth,
    resource: passageResource,
    requestData: { ...passageResource, status: 'exited' }
  });

  assert.equal(allowed, false, 'Inspetor NÃO pode alterar status para exited');
});

test('Regras de Segurança: Administrador (ADM) tem PERMISSÃO para marcar saída (status: "exited")', () => {
  const admAuth = { uid: 'adm_1', token: { role: 'ADM' } };
  const passageResource = { status: 'active', containerNumber: 'MSCU1234567' };

  // Tentativa de atualizar para 'exited' por Administrador
  const allowed = evaluateYardRules({
    path: 'yardPassages/yp_1',
    operation: 'update',
    auth: admAuth,
    resource: passageResource,
    requestData: { ...passageResource, status: 'exited' }
  });

  assert.equal(allowed, true, 'ADM deve ter permissão para confirmar saída');
});

test('Regras de Segurança: Exclusão de passagens ou conferências é estritamente proibida (imutabilidade)', () => {
  const admAuth = { uid: 'adm_master', token: { role: 'ADM', admin: true } };

  assert.equal(
    evaluateYardRules({ path: 'yardPassages/yp_1', operation: 'delete', auth: admAuth }),
    false,
    'Nenhum usuário pode deletar passagens'
  );

  assert.equal(
    evaluateYardRules({ path: 'yardAudits/audit_1', operation: 'delete', auth: admAuth }),
    false,
    'Nenhum usuário pode deletar conferências'
  );
});

test('Regras de Segurança: Não autenticado é bloqueado em todas as operações de pátio', () => {
  assert.equal(evaluateYardRules({ path: 'yardPassages/yp_1', operation: 'get', auth: null }), false);
  assert.equal(evaluateYardRules({ path: 'yardPassages/yp_1', operation: 'create', auth: null }), false);
  assert.equal(evaluateYardRules({ path: 'yardAudits/audit_1', operation: 'get', auth: null }), false);
});
