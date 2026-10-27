import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Avaliador Oficial de Regras de Segurança Multi-Cliente (UNISPECT)
 * 
 * Simula a semântica rigorosa das regras que serão aplicadas:
 * 1. Acesso entre clientes bloqueado.
 * 2. clientId estritamente imutável nas atualizações.
 * 3. Exportador sem permissão de escrita (incluindo pátio).
 * 4. Inspetor restrito aos campos e operações permitidos nos clientes em que atua.
 * 5. Fotos autorizadas por clientId e papel.
 * 6. Revogação de permissão efetivamente verificada (token auth_time vs. revogação no banco).
 */
export function evaluateMultitenantRules({
  path,
  operation, // 'get' | 'list' | 'create' | 'update' | 'delete'
  auth, // { uid, token: { role, isUnispectMaster, authorizedClients, exporterId, auth_time } }
  resource, // documento existente no banco (null na criação)
  requestData, // dado enviado na requisição
  securityMetadata // documento /userSecurityMetadata/{uid} com { revokedAt }
}) {
  const isAuthenticated = auth !== null && auth !== undefined && Boolean(auth.uid);
  if (!isAuthenticated) return false;

  const isMaster = auth.token?.isUnispectMaster === true;
  const userRole = auth.token?.role;
  const authorizedClients = auth.token?.authorizedClients || [];

  // 6. Verificação de Revogação Efetiva (Independente do navegador)
  // Se houver registro de revogação posterior à emissão do token (auth_time), bloqueia imediatamente!
  if (securityMetadata?.revokedAt) {
    const tokenTime = auth.token?.auth_time || 0;
    if (tokenTime <= securityMetadata.revokedAt) {
      return false; // Token revogado!
    }
  }

  const hasClientAccess = (targetClientId) => {
    if (!targetClientId) return false;
    if (isMaster) return true;
    return authorizedClients.includes(targetClientId);
  };

  const isClientAdmin = (targetClientId) => {
    return hasClientAccess(targetClientId) && (isMaster || userRole === 'CLIENT_ADMIN');
  };

  // ── COLEÇÃO: /bookings/{bookingId} ──
  if (path.startsWith('bookings/')) {
    if (operation === 'get' || operation === 'list') {
      const targetClient = resource?.clientId;
      if (!hasClientAccess(targetClient)) return false;

      // Se for exportador, só lê se exporterId bater
      if (userRole === 'EXPORTER') {
        return resource?.exporterId === auth.token?.exporterId;
      }
      return true;
    }

    if (operation === 'create') {
      // 3. Exportador não tem permissão de escrita
      if (userRole === 'EXPORTER') return false;
      const targetClient = requestData?.clientId;
      // Criação exige ser Admin do Cliente ou Master Unispect
      return isClientAdmin(targetClient);
    }

    if (operation === 'update') {
      if (userRole === 'EXPORTER') return false;
      const existingClient = resource?.clientId;
      const incomingClient = requestData?.clientId;

      // 1. Bloqueia acesso entre clientes
      if (!hasClientAccess(existingClient)) return false;

      // 2. CLIENTID É ESTRITAMENTE IMUTÁVEL!
      if (incomingClient !== undefined && incomingClient !== existingClient) {
        return false;
      }

      // Inspetor pode atualizar contêineres/status se autorizado para o cliente
      if (userRole === 'INSPECTOR') {
        return hasClientAccess(existingClient);
      }

      return isClientAdmin(existingClient);
    }

    if (operation === 'delete') {
      // Exclusão permitida apenas para Admin do cliente ou Master
      const targetClient = resource?.clientId;
      return isClientAdmin(targetClient);
    }
  }

  // ── COLEÇÃO: /yardPassages/{passageId} ──
  if (path.startsWith('yardPassages/')) {
    if (operation === 'get' || operation === 'list') {
      if (userRole === 'EXPORTER') return false; // Exportador não tem acesso a pátio
      return hasClientAccess(resource?.clientId);
    }

    if (operation === 'create') {
      if (userRole === 'EXPORTER') return false;
      return hasClientAccess(requestData?.clientId) && (isClientAdmin(requestData?.clientId) || userRole === 'INSPECTOR');
    }

    if (operation === 'update') {
      if (userRole === 'EXPORTER') return false;
      const existingClient = resource?.clientId;
      if (!hasClientAccess(existingClient)) return false;
      // Imutabilidade de clientId
      if (requestData?.clientId !== undefined && requestData?.clientId !== existingClient) return false;

      // Marcação de saída ('exited') exclusiva de Admin do Cliente ou Master
      if (requestData?.status === 'exited' && resource?.status !== 'exited') {
        return isClientAdmin(existingClient);
      }
      return isClientAdmin(existingClient) || userRole === 'INSPECTOR';
    }

    if (operation === 'delete') {
      return false; // Imutabilidade pericial: ninguém deleta passagem de pátio
    }
  }

  // ── STORAGE: /containers/{containerId}/{photoFile} ──
  if (path.startsWith('storage/containers/')) {
    const targetClient = resource?.clientId; // comprovado via vínculo de metadados

    if (operation === 'get') {
      if (userRole === 'EXPORTER') {
        return resource?.exporterId === auth.token?.exporterId && hasClientAccess(targetClient);
      }
      return hasClientAccess(targetClient);
    }

    if (operation === 'create') {
      if (userRole === 'EXPORTER') return false;
      const targetClient = requestData?.clientId;
      return hasClientAccess(targetClient) && (isClientAdmin(targetClient) || userRole === 'INSPECTOR');
    }

    if (operation === 'update') {
      if (userRole === 'EXPORTER') return false;
      if (!hasClientAccess(targetClient)) return false;
      return isClientAdmin(targetClient) || userRole === 'INSPECTOR';
    }

    if (operation === 'delete') {
      // Exclusão de fotos exige Admin do cliente ou Master
      return isClientAdmin(targetClient);
    }
  }

  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// SUÍTE DE TESTES DE REGRAS MULTI-CLIENTE
// ────────────────────────────────────────────────────────────────────────────

test('1. Acesso entre clientes bloqueado: Usuário da Interport NÃO pode ler Booking de outro cliente', () => {
  const interportAdmin = {
    uid: 'usr_interport_1',
    token: { role: 'CLIENT_ADMIN', isUnispectMaster: false, authorizedClients: ['client_interport'] }
  };

  const bookingOutroCliente = { id: 'bk_202', clientId: 'client_terminal_b', bookingNumber: 'BKG002' };

  const canRead = evaluateMultitenantRules({
    path: 'bookings/bk_202',
    operation: 'get',
    auth: interportAdmin,
    resource: bookingOutroCliente
  });

  assert.equal(canRead, false, 'Deve bloquear leitura de booking de outro cliente');
});

test('2. Master Unispect possui acesso concedido a múltiplos clientes', () => {
  const masterAuth = {
    uid: 'usr_master_1',
    token: { role: 'UNISPECT_MASTER', isUnispectMaster: true, authorizedClients: ['*'] }
  };

  const bookingOutroCliente = { id: 'bk_202', clientId: 'client_terminal_b', bookingNumber: 'BKG002' };

  const canRead = evaluateMultitenantRules({
    path: 'bookings/bk_202',
    operation: 'get',
    auth: masterAuth,
    resource: bookingOutroCliente
  });

  assert.equal(canRead, true, 'Master Unispect deve ter acesso liberado');
});

test('3. Imutabilidade de clientId: Tentativa de alterar clientId em update é BLOQUEADA', () => {
  const interportAdmin = {
    uid: 'usr_interport_1',
    token: { role: 'CLIENT_ADMIN', isUnispectMaster: false, authorizedClients: ['client_interport'] }
  };

  const existingBooking = { id: 'bk_101', clientId: 'client_interport', status: 'Pendente' };
  const updateData = { status: 'Em andamento', clientId: 'client_hacker_transfer' }; // tentativa de sequestro de tenant

  const canUpdate = evaluateMultitenantRules({
    path: 'bookings/bk_101',
    operation: 'update',
    auth: interportAdmin,
    resource: existingBooking,
    requestData: updateData
  });

  assert.equal(canUpdate, false, 'Deve rejeitar categoricamente alteração de clientId');
});

test('4. Exportador: Apenas leitura de suas cargas e BLOQUEIO TOTAL de escrita (incluindo pátio)', () => {
  const exporterAuth = {
    uid: 'usr_exp_1',
    token: { role: 'EXPORTER', isUnispectMaster: false, authorizedClients: ['client_interport'], exporterId: 'exp_atlantica' }
  };

  const bookingProprio = { id: 'bk_101', clientId: 'client_interport', exporterId: 'exp_atlantica' };
  const bookingOutroExp = { id: 'bk_102', clientId: 'client_interport', exporterId: 'exp_tristao' };

  // Leitura própria permitida
  assert.equal(evaluateMultitenantRules({ path: 'bookings/bk_101', operation: 'get', auth: exporterAuth, resource: bookingProprio }), true);
  // Leitura de outro exportador bloqueada
  assert.equal(evaluateMultitenantRules({ path: 'bookings/bk_102', operation: 'get', auth: exporterAuth, resource: bookingOutroExp }), false);
  // Escrita em booking bloqueada
  assert.equal(evaluateMultitenantRules({ path: 'bookings/bk_101', operation: 'update', auth: exporterAuth, resource: bookingProprio, requestData: { status: 'Finalizado' } }), false);
  // Escrita no pátio bloqueada
  assert.equal(evaluateMultitenantRules({ path: 'yardPassages/yp_1', operation: 'create', auth: exporterAuth, requestData: { clientId: 'client_interport' } }), false);
});

test('5. Inspetor de campo: limitado a clientes autorizados e bloqueado para saída no pátio', () => {
  const inspectorAuth = {
    uid: 'usr_insp_1',
    token: { role: 'INSPECTOR', isUnispectMaster: false, authorizedClients: ['client_interport'] }
  };

  const passageInterport = { id: 'yp_1', clientId: 'client_interport', status: 'active' };

  // Inspetor pode atualizar status comum de passagem
  assert.equal(evaluateMultitenantRules({ path: 'yardPassages/yp_1', operation: 'update', auth: inspectorAuth, resource: passageInterport, requestData: { notes: 'conferido' } }), true);

  // Inspetor NÃO pode dar baixa de saída ('exited')
  assert.equal(evaluateMultitenantRules({ path: 'yardPassages/yp_1', operation: 'update', auth: inspectorAuth, resource: passageInterport, requestData: { status: 'exited' } }), false);
});

test('6. Fotos de contêiner: autorizadas pelo clientId do vínculo e papel', () => {
  const interportAdmin = {
    uid: 'usr_interport_1',
    token: { role: 'CLIENT_ADMIN', isUnispectMaster: false, authorizedClients: ['client_interport'] }
  };
  const inspectorAuth = {
    uid: 'usr_insp_1',
    token: { role: 'INSPECTOR', isUnispectMaster: false, authorizedClients: ['client_interport'] }
  };

  const photoResource = { id: 'photo_1', clientId: 'client_interport', containerId: 'c_1' };

  // Inspetor pode criar e visualizar foto
  assert.equal(evaluateMultitenantRules({ path: 'storage/containers/c_1/photo_1.jpg', operation: 'create', auth: inspectorAuth, requestData: { clientId: 'client_interport' } }), true);
  assert.equal(evaluateMultitenantRules({ path: 'storage/containers/c_1/photo_1.jpg', operation: 'get', auth: inspectorAuth, resource: photoResource }), true);

  // Inspetor NÃO pode excluir foto do Storage (exclusiva de Admin)
  assert.equal(evaluateMultitenantRules({ path: 'storage/containers/c_1/photo_1.jpg', operation: 'delete', auth: inspectorAuth, resource: photoResource }), false);

  // Admin do cliente pode excluir foto
  assert.equal(evaluateMultitenantRules({ path: 'storage/containers/c_1/photo_1.jpg', operation: 'delete', auth: interportAdmin, resource: photoResource }), true);
});

test('7. Revogação de acesso efetiva: Token antigo com auth_time anterior a revokedAt é rejeitado', () => {
  const userAuthRevoked = {
    uid: 'usr_demitido_1',
    token: {
      role: 'CLIENT_ADMIN',
      isUnispectMaster: false,
      authorizedClients: ['client_interport'],
      auth_time: 1700000000 // Emitido às 10:00
    }
  };

  const securityMetadata = {
    revokedAt: 1700003600 // Revogado administrativamente às 11:00
  };

  const canAccess = evaluateMultitenantRules({
    path: 'bookings/bk_101',
    operation: 'get',
    auth: userAuthRevoked,
    resource: { id: 'bk_101', clientId: 'client_interport' },
    securityMetadata
  });

  assert.equal(canAccess, false, 'Deve rejeitar imediatamente token revogado no backend');
});
