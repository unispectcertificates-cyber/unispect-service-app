// Motor de Identidade, Inspetor Responsável, Assinatura de Certificado e Linha do Tempo de Auditoria (Unispect)

export const LEGACY_AUTHORSHIP_LABEL = 'Autoria não identificada — registro legado';
export const AUDIT_TIMEZONE = 'America/Sao_Paulo';

export const SYSTEM_ACTOR = Object.freeze({
  id: 'system',
  uid: 'system',
  name: 'Sistema',
  email: 'system@unispect.internal',
  role: 'SYSTEM',
  type: 'system',
  isSystem: true
});

const FORBIDDEN_DEFAULT_IDS = new Set([
  'default',
  'padrao',
  'padrão',
  'anonymous',
  'anon',
  'unknown',
  'insp_default'
]);

const FORBIDDEN_DEFAULT_NAMES = new Set([
  'inspetor padrão',
  'inspetor padrao',
  'será usado o padrão',
  'sera usado o padrao',
  'padrão',
  'padrao',
  'default',
  'anônimo',
  'anonimo'
]);

// Cache em memória/sessionStorage para deduplicar eventos de visualização por abertura efetiva
const viewedSessionKeys = new Set();
const VIEW_SESSION_STORAGE_KEY = 'unispect_audit_viewed_sessions_v1';
const OFFLINE_AUDIT_QUEUE_KEY = 'unispect_offline_audit_queue_v1';

let activeAuthProvider = null;

/**
 * Registra um provedor da conta autenticada atual (ex: () => db.getUser() ou sessão Firebase Auth).
 */
export function setAuthenticatedUserProvider(providerFn) {
  activeAuthProvider = typeof providerFn === 'function' ? providerFn : null;
}

export function getActiveAuthenticatedUser() {
  if (activeAuthProvider) {
    try {
      const u = activeAuthProvider();
      if (u) return u;
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Formata data/hora no fuso America/Sao_Paulo no padrão DD/MM/AAAA às HH:mm (ou com segundos opcional).
 */
export function formatAuditTimestampSp(timestampInput, { includeSeconds = false } = {}) {
  if (!timestampInput) return 'Data/hora não registrada';
  const date = timestampInput instanceof Date ? timestampInput : new Date(timestampInput);
  if (Number.isNaN(date.getTime())) return String(timestampInput);

  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: AUDIT_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const datePart = `${map.day}/${map.month}/${map.year}`;
  const timePart = includeSeconds
    ? `${map.hour}:${map.minute}:${map.second}`
    : `${map.hour}:${map.minute}`;
  return `${datePart} às ${timePart}`;
}

/**
 * Verifica se o usuário possui perfil administrativo autorizado para transferir responsabilidade
 * ou gerenciar permissões especiais (ADM ou MASTER).
 */
export function isAuthorizedAdminRole(user) {
  if (!user || typeof user !== 'object') return false;
  if (user.isUnispectMaster === true) return true;
  const role = String(user.normalizedRole || user.role || '').trim().toUpperCase();
  return role === 'ADM' || role === 'MASTER' || role === 'ADMIN';
}

/**
 * Valida e resolve o autor autenticado da ação (Regra 1 e Regra 7).
 * - Usa exclusivamente a conta autenticada como origem da identidade.
 * - Bloqueia tentativas de escolher outro colaborador como autor (spoofing).
 * - Bloqueia uso de nomes fixos/padrão sem identidade autenticada válida.
 */
export function resolveAuthenticatedActor(authenticatedUser, claimedActor = null, { allowSystem = false } = {}) {
  if (allowSystem && (claimedActor?.isSystem || claimedActor?.type === 'system' || claimedActor?.id === 'system' || authenticatedUser?.isSystem)) {
    return { ...SYSTEM_ACTOR };
  }

  const effectiveAuth = authenticatedUser || getActiveAuthenticatedUser();
  if (!effectiveAuth || typeof effectiveAuth !== 'object') {
    throw new Error('Operação bloqueada: usuário não autenticado. Faça login para registrar ou alterar dados.');
  }

  const authId = String(effectiveAuth.uid || effectiveAuth.id || '').trim();
  const authName = String(effectiveAuth.name || effectiveAuth.displayName || '').trim();
  const authEmail = String(effectiveAuth.email || '').trim();
  const authRole = String(effectiveAuth.normalizedRole || effectiveAuth.role || 'Inspector').trim();
  const authClientId = String(effectiveAuth.clientId || '').trim();

  if (!authId || FORBIDDEN_DEFAULT_IDS.has(authId.toLowerCase())) {
    throw new Error('Operação bloqueada: identificador único do usuário autenticado é inválido ou ausente.');
  }
  if (!authName || FORBIDDEN_DEFAULT_NAMES.has(authName.toLowerCase())) {
    throw new Error('Operação bloqueada: nome do usuário autenticado é inválido ou utiliza um inspetor padrão proibido.');
  }

  // Se a camada chamadora enviou um claimedActor, valida que ele NÃO tenta se passar por outro colaborador
  if (claimedActor && typeof claimedActor === 'object' && !claimedActor.isSystem) {
    const claimedId = String(claimedActor.uid || claimedActor.id || claimedActor.userId || '').trim();
    const claimedName = String(claimedActor.name || claimedActor.userName || '').trim();

    if (claimedId && claimedId !== authId && claimedId !== String(effectiveAuth.id || '').trim() && claimedId !== String(effectiveAuth.uid || '').trim()) {
      throw new Error('Tentativa de falsificar autoria bloqueada: não é permitido registrar ações em nome de outro colaborador.');
    }
    if (claimedName && claimedName.toLowerCase() !== authName.toLowerCase()) {
      throw new Error('Tentativa de falsificar autoria bloqueada: o nome informado diverge da conta autenticada.');
    }
  }

  return {
    id: authId,
    uid: String(effectiveAuth.uid || authId),
    name: authName,
    email: authEmail,
    role: authRole,
    clientId: authClientId,
    type: 'user',
    isSystem: false
  };
}

/**
 * Verifica isolamento por cliente (Regra 7).
 */
export function assertClientAccess(actor, targetClientId) {
  if (!actor || actor.isSystem) return true;
  if (isAuthorizedAdminRole(actor)) return true;
  const userClient = String(actor.clientId || '').trim();
  const recordClient = String(targetClientId || '').trim();
  if (userClient && recordClient && userClient !== recordClient) {
    throw new Error('Acesso negado: você não tem permissão para acessar ou alterar registros de outro cliente.');
  }
  return true;
}

/**
 * Verifica se o usuário tem permissão para visualizar a linha do tempo de auditoria (Regra 7).
 */
export function canViewAuditTimeline(user, record = {}) {
  if (!user) return false;
  if (isAuthorizedAdminRole(user)) return true;
  const userClient = String(user.clientId || '').trim();
  const recordClient = String(record.clientId || '').trim();
  if (userClient && recordClient && userClient !== recordClient) return false;
  return true;
}

/**
 * Retorna a identificação do inspetor responsável para exibição na UI e nos relatórios.
 * Para registros antigos sem autoria comprovada, retorna "Autoria não identificada — registro legado"
 * sem jamais atribuir retroativamente ao usuário que abrir o registro (Regra 2, 3 e 7).
 */
export function getResponsibleInspectorInfo(container = {}, booking = {}) {
  const resp = container?.responsibleInspector || booking?.responsibleInspector || null;
  if (resp && typeof resp === 'object' && (resp.id || resp.uid) && resp.name) {
    const cleanName = String(resp.name).trim();
    if (!FORBIDDEN_DEFAULT_NAMES.has(cleanName.toLowerCase())) {
      return {
        isIdentified: true,
        isLegacy: false,
        id: String(resp.id || resp.uid),
        uid: String(resp.uid || resp.id),
        name: cleanName,
        email: resp.email || '',
        role: resp.role || 'Inspector',
        assignedAt: resp.assignedAt || resp.serverTimestamp || resp.deviceTimestamp || null,
        displayLabel: cleanName
      };
    }
  }

  return {
    isIdentified: false,
    isLegacy: true,
    id: null,
    uid: null,
    name: null,
    email: '',
    role: null,
    assignedAt: null,
    displayLabel: LEGACY_AUTHORSHIP_LABEL
  };
}

/**
 * Gera um ID determinístico ou único para um evento de auditoria, prevenindo duplicação em retentativas de sync.
 */
export function buildAuditEventId({
  eventId = '',
  action = 'event',
  bookingId = '',
  containerId = '',
  actorId = '',
  deviceTimestamp = '',
  targetKey = ''
} = {}) {
  if (eventId && String(eventId).trim()) return String(eventId).trim();
  const cleanTarget = String(targetKey || '').replace(/[^a-zA-Z0-9_:-]/g, '_').slice(0, 64);
  const ts = deviceTimestamp || new Date().toISOString();
  return `evt_${action}_${bookingId || 'b'}_${containerId || 'c'}_${actorId || 'u'}_${ts}_${cleanTarget || '0'}`;
}

/**
 * Cria um objeto de evento da linha do tempo de auditoria (Regras 1, 4, 5 e 6).
 */
export function createAuditEvent({
  eventId = '',
  action,
  actor,
  clientId = 'client_interport',
  bookingId = '',
  containerId = '',
  containerNumber = '',
  inspectionId = '',
  targetItem = '',
  oldValue = undefined,
  newValue = undefined,
  deviceTimestamp = null,
  serverTimestamp = null,
  isOfflineCapture = false,
  metadata = {}
}) {
  if (!action) throw new Error('Ação de auditoria é obrigatória.');
  if (!actor || (!actor.id && !actor.uid)) {
    throw new Error('Autor autenticado é obrigatório para criar evento de auditoria.');
  }

  const nowIso = new Date().toISOString();
  const devTs = deviceTimestamp || nowIso;
  const srvTs = isOfflineCapture && !serverTimestamp ? null : (serverTimestamp || nowIso);

  const actorObj = actor.isSystem
    ? { ...SYSTEM_ACTOR }
    : {
        id: String(actor.id || actor.uid),
        uid: String(actor.uid || actor.id),
        name: String(actor.name),
        email: String(actor.email || ''),
        role: String(actor.role || 'Inspector'),
        type: 'user'
      };

  const resolvedInspectionId = inspectionId || (bookingId && containerId ? `${bookingId}::${containerId}` : (containerId || bookingId || ''));
  const targetKey = metadata?.photoId || metadata?.sealNumber || metadata?.field || targetItem || '';

  const id = buildAuditEventId({
    eventId,
    action,
    bookingId,
    containerId,
    actorId: actorObj.id,
    deviceTimestamp: devTs,
    targetKey
  });

  const event = {
    id,
    action,
    actor: actorObj,
    userId: actorObj.id,
    userName: actorObj.name,
    actorType: actorObj.type,
    clientId: String(clientId || 'client_interport'),
    bookingId: String(bookingId || ''),
    containerId: String(containerId || ''),
    containerNumber: String(containerNumber || containerId || ''),
    inspectionId: String(resolvedInspectionId),
    targetItem: String(targetItem || ''),
    deviceTimestamp: devTs,
    serverTimestamp: srvTs,
    // Referência oficial de auditoria: serverTimestamp quando sincronizado, ou deviceTimestamp enquanto pendente
    auditTimestamp: srvTs || devTs,
    timezone: AUDIT_TIMEZONE,
    metadata: { ...metadata }
  };

  if (oldValue !== undefined) event.oldValue = oldValue;
  if (newValue !== undefined) event.newValue = newValue;

  event.formattedText = formatTimelineEventPtBr(event);
  return event;
}

const FIELD_LABELS_PT = {
  definiteSeal: 'Lacre definitivo',
  provisionalSeals: 'Lacres provisórios',
  agencySeal: 'Lacre agência',
  peroxideSeal: 'Lacre peróxido',
  siscomexSeal: 'Lacre Siscomex',
  otherSeal: 'Outro lacre',
  tare: 'Tara',
  grossWeight: 'Peso bruto',
  netWeight: 'Peso líquido',
  capacity: 'Capacidade',
  manufactureDate: 'Data de fabricação',
  containerType: 'Tipo de container',
  status: 'Status da inspeção',
  observations: 'Observações',
  notes: 'Observações',
  approvalStatus: 'Status de aprovação',
  number: 'Número do container',
  containerNumber: 'Número do container'
};

function formatValueForDisplay(val) {
  if (val === null || val === undefined || val === '') return 'vazio';
  if (Array.isArray(val)) return val.length ? val.join(', ') : 'vazio';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

/**
 * Formata um evento da linha do tempo em português (fuso America/Sao_Paulo) seguindo o modelo exigido:
 * Ex.:
 * 01/11/2026 às 09:10 — João iniciou a inspeção.
 * 01/11/2026 às 09:12 — João adicionou 4 fotos.
 * 01/11/2026 às 09:20 — Maria acessou o Container.
 * 01/11/2026 às 09:25 — Maria adicionou o lacre provisório 003155.
 * 01/11/2026 às 10:05 — João finalizou a inspeção.
 */
export function formatTimelineEventPtBr(event) {
  if (!event) return '';
  const referenceTime = event.serverTimestamp || event.auditTimestamp || event.deviceTimestamp;
  const dateStr = formatAuditTimestampSp(referenceTime);
  const actorName = event.actor?.isSystem || event.actorType === 'system'
    ? 'Sistema'
    : (event.userName || event.actor?.name || LEGACY_AUTHORSHIP_LABEL);

  const meta = event.metadata || {};

  switch (event.action) {
    case 'access_view':
      return `${dateStr} — ${actorName} acessou o Container.`;

    case 'inspection_started':
      return `${dateStr} — ${actorName} iniciou a inspeção.`;

    case 'photo_added': {
      const count = Number(meta.photoCount || 1);
      if (count > 1) {
        return `${dateStr} — ${actorName} adicionou ${count} fotos.`;
      }
      const label = meta.stepLabel || event.targetItem || meta.photoId || '';
      return label
        ? `${dateStr} — ${actorName} adicionou a foto (${label}).`
        : `${dateStr} — ${actorName} adicionou 1 foto.`;
    }

    case 'photo_deleted': {
      const label = meta.stepLabel || event.targetItem || meta.photoId || 'foto';
      return `${dateStr} — ${actorName} excluiu a foto (${label}).`;
    }

    case 'seal_added': {
      const sealNum = event.newValue || meta.sealNumber || event.targetItem || '';
      return `${dateStr} — ${actorName} adicionou o lacre provisório ${sealNum}.`;
    }

    case 'seal_removed': {
      const sealNum = event.oldValue || meta.sealNumber || event.targetItem || '';
      return `${dateStr} — ${actorName} removeu o lacre provisório ${sealNum}.`;
    }

    case 'seal_recognized_auto': {
      const sealNum = event.newValue || meta.sealNumber || event.targetItem || '';
      const photoId = meta.photoId || 'foto';
      const capturedBy = meta.capturedByName || meta.capturedBy || 'não identificado';
      const requestedBy = meta.requestedByName || meta.requestedBy || '';
      const reqSuffix = requestedBy ? `, processamento solicitado por ${requestedBy}` : '';
      return `${dateStr} — Sistema reconheceu automaticamente o lacre provisório ${sealNum} a partir da foto ${photoId} (capturada por ${capturedBy}${reqSuffix}).`;
    }

    case 'field_updated': {
      const rawField = meta.field || event.targetItem || 'campo';
      const fieldLabel = FIELD_LABELS_PT[rawField] || rawField;
      const oldStr = formatValueForDisplay(event.oldValue);
      const newStr = formatValueForDisplay(event.newValue);
      return `${dateStr} — ${actorName} alterou ${fieldLabel} de "${oldStr}" para "${newStr}".`;
    }

    case 'responsibility_transferred': {
      const prevName = meta.previousResponsibleName || formatValueForDisplay(event.oldValue);
      const nextName = meta.newResponsibleName || formatValueForDisplay(event.newValue);
      const reason = meta.reason || 'Sem justificativa';
      return `${dateStr} — ${actorName} transferiu a responsabilidade de ${prevName} para ${nextName}. Motivo: ${reason}.`;
    }

    case 'inspection_finalized':
      return `${dateStr} — ${actorName} finalizou a inspeção.`;

    case 'inspection_reopened':
      return `${dateStr} — ${actorName} reabriu a inspeção.`;

    case 'report_generated':
      return `${dateStr} — ${actorName} gerou o relatório/certificado.`;

    case 'certificate_signed':
      return `${dateStr} — ${actorName} assinou digitalmente o certificado.`;

    case 'report_downloaded': {
      const format = meta.format ? ` (${meta.format})` : '';
      return `${dateStr} — ${actorName} baixou o relatório${format}.`;
    }

    default:
      return `${dateStr} — ${actorName} executou ${event.targetItem || event.action}.`;
  }
}

/**
 * Valida que uma atualização de linha do tempo é estritamente append-only (Regra 7):
 * nenhum evento existente pode ser removido ou adulterado.
 */
export function assertTimelineImmutable(existingTimeline = [], candidateTimeline = []) {
  if (!Array.isArray(existingTimeline) || existingTimeline.length === 0) return true;
  if (!Array.isArray(candidateTimeline) || candidateTimeline.length < existingTimeline.length) {
    throw new Error('Violação de integridade da auditoria: não é permitido excluir eventos do histórico.');
  }
  const byId = new Map(candidateTimeline.map(ev => [ev.id, ev]));
  for (const oldEv of existingTimeline) {
    if (!oldEv?.id) continue;
    const match = byId.get(oldEv.id);
    if (!match) {
      throw new Error(`Violação de integridade da auditoria: o evento ${oldEv.id} foi removido.`);
    }
    if (match.action !== oldEv.action || match.userId !== oldEv.userId || match.deviceTimestamp !== oldEv.deviceTimestamp) {
      throw new Error(`Violação de integridade da auditoria: o evento ${oldEv.id} foi adulterado.`);
    }
  }
  return true;
}

/**
 * Combina eventos novos à linha do tempo existente de forma imutável e idempotente (sem duplicar IDs).
 */
export function appendTimelineEvents(existingTimeline = [], incomingEvents = [], { serverNow = null } = {}) {
  const existing = Array.isArray(existingTimeline) ? existingTimeline : [];
  const incoming = Array.isArray(incomingEvents) ? incomingEvents : [incomingEvents].filter(Boolean);

  const map = new Map();
  for (const ev of existing) {
    if (ev && ev.id) {
      map.set(ev.id, ev);
    }
  }

  const resolvedServerNow = serverNow || new Date().toISOString();

  for (const rawEv of incoming) {
    if (!rawEv || !rawEv.id) continue;
    if (map.has(rawEv.id)) {
      // Idempotência: se o evento já existe e apenas faltava o serverTimestamp (sincronização concluída), preenche serverTimestamp sem duplicar
      const prev = map.get(rawEv.id);
      if (!prev.serverTimestamp && rawEv.serverTimestamp) {
        const updated = {
          ...prev,
          serverTimestamp: rawEv.serverTimestamp,
          auditTimestamp: rawEv.serverTimestamp,
          formattedText: formatTimelineEventPtBr({ ...prev, serverTimestamp: rawEv.serverTimestamp })
        };
        map.set(rawEv.id, updated);
      }
      continue;
    }

    const withServerTs = {
      ...rawEv,
      serverTimestamp: rawEv.serverTimestamp || resolvedServerNow,
      auditTimestamp: rawEv.serverTimestamp || resolvedServerNow
    };
    withServerTs.formattedText = formatTimelineEventPtBr(withServerTs);
    map.set(withServerTs.id, withServerTs);
  }

  const merged = [...map.values()].sort((a, b) => {
    const tA = new Date(a.serverTimestamp || a.auditTimestamp || a.deviceTimestamp || 0).getTime();
    const tB = new Date(b.serverTimestamp || b.auditTimestamp || b.deviceTimestamp || 0).getTime();
    return tA - tB;
  });

  assertTimelineImmutable(existing, merged);
  return merged;
}

/**
 * Atribui automaticamente o usuário autenticado como inspetor responsável na primeira ação técnica
 * ou preserva o responsável existente se outro inspetor já tiver iniciado (Regra 2).
 *
 * Ações de simples visualização (`access_view`) ou ações automáticas do `"Sistema"` NUNCA atribuem
 * nem alteram o inspetor responsável.
 */
export function assignOrPreserveResponsibleInspector({
  container = {},
  actor,
  isTechnicalAction = true,
  clientId = 'client_interport',
  bookingId = '',
  deviceTimestamp = null,
  serverTimestamp = null,
  startEventId = ''
}) {
  const currentResp = container?.responsibleInspector;
  const hasResponsible = Boolean(currentResp && (currentResp.id || currentResp.uid) && currentResp.name);

  // Visualização ou ação automática de sistema não atribui responsável
  if (!isTechnicalAction || !actor || actor.isSystem || actor.type === 'system') {
    return {
      responsibleInspector: currentResp || null,
      wasAssignedNow: false,
      startedEvent: null
    };
  }

  // Se já existe um inspetor responsável, mantém o atual sem sobrescrever (mesmo em início simultâneo ou colaboração de múltiplos inspetores)
  if (hasResponsible) {
    return {
      responsibleInspector: currentResp,
      wasAssignedNow: false,
      startedEvent: null
    };
  }

  const nowIso = new Date().toISOString();
  const devTs = deviceTimestamp || nowIso;
  const srvTs = serverTimestamp || nowIso;

  const newResponsible = {
    id: String(actor.id || actor.uid),
    uid: String(actor.uid || actor.id),
    name: String(actor.name),
    email: String(actor.email || ''),
    role: String(actor.role || 'Inspector'),
    assignedAt: srvTs,
    deviceTimestamp: devTs,
    serverTimestamp: srvTs,
    assignedBy: {
      id: String(actor.id || actor.uid),
      name: String(actor.name),
      mode: 'automatic_first_technical_action'
    }
  };

  const startedEvent = createAuditEvent({
    eventId: startEventId || `evt_inspection_started_${bookingId || 'b'}_${container.id || 'c'}_${newResponsible.id}`,
    action: 'inspection_started',
    actor,
    clientId: clientId || container.clientId || 'client_interport',
    bookingId: bookingId || container.bookingId || '',
    containerId: container.id || '',
    containerNumber: container.containerNumber || container.number || container.id || '',
    targetItem: 'Inspeção do Container',
    newValue: newResponsible.name,
    deviceTimestamp: devTs,
    serverTimestamp: srvTs
  });

  return {
    responsibleInspector: newResponsible,
    wasAssignedNow: true,
    startedEvent
  };
}

/**
 * Registra acesso de visualização ao Container sem atribuir ou alterar responsabilidade (Regra 2 e Regra 4).
 * Deduplica por sessão de abertura (`sessionKey`) para evitar eventos repetidos em re-renderizações.
 */
export function applyViewAccessToContainer({
  container,
  authenticatedUser,
  claimedActor = null,
  clientId = 'client_interport',
  bookingId = '',
  sessionKey = '',
  deviceTimestamp = null,
  serverTimestamp = null
}) {
  if (!container) throw new Error('Container é obrigatório.');
  const actor = resolveAuthenticatedActor(authenticatedUser, claimedActor);
  assertClientAccess(actor, clientId || container.clientId);

  const effectiveSessionKey = sessionKey || `${actor.id}::${bookingId || container.bookingId || ''}::${container.id}`;

  // Verifica deduplicação na sessão atual
  if (viewedSessionKeys.has(effectiveSessionKey)) {
    return {
      container,
      recorded: false,
      event: null
    };
  }

  try {
    if (typeof sessionStorage !== 'undefined') {
      const storedRaw = sessionStorage.getItem(VIEW_SESSION_STORAGE_KEY);
      const storedList = storedRaw ? JSON.parse(storedRaw) : [];
      if (Array.isArray(storedList) && storedList.includes(effectiveSessionKey)) {
        viewedSessionKeys.add(effectiveSessionKey);
        return {
          container,
          recorded: false,
          event: null
        };
      }
      storedList.push(effectiveSessionKey);
      sessionStorage.setItem(VIEW_SESSION_STORAGE_KEY, JSON.stringify(storedList.slice(-500)));
    }
  } catch {
    // ignore storage errors
  }

  viewedSessionKeys.add(effectiveSessionKey);

  const event = createAuditEvent({
    eventId: `evt_access_view_${bookingId || 'b'}_${container.id}_${actor.id}_${effectiveSessionKey}`,
    action: 'access_view',
    actor,
    clientId: clientId || container.clientId || 'client_interport',
    bookingId: bookingId || container.bookingId || '',
    containerId: container.id,
    containerNumber: container.containerNumber || container.number || container.id,
    targetItem: 'Visualização do Container',
    deviceTimestamp,
    serverTimestamp
  });

  const updatedTimeline = appendTimelineEvents(container.auditTimeline || [], [event], {
    serverNow: serverTimestamp
  });

  // IMPORTANTE: NUNCA define nem altera responsibleInspector ao apenas visualizar!
  return {
    container: {
      ...container,
      auditTimeline: updatedTimeline
    },
    recorded: true,
    event
  };
}

export function resetViewSessionCacheForTests() {
  viewedSessionKeys.clear();
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(VIEW_SESSION_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Transfere a responsabilidade da inspeção para outro colaborador (Regra 2 e Regra 4).
 * - Permitido somente para perfil autorizado (ADM / MASTER).
 * - Exige justificativa obrigatória (`reason`).
 * - Registra responsável anterior, novo responsável, autor da transferência, data e hora.
 */
export function transferContainerResponsibility({
  container,
  authenticatedUser,
  claimedActor = null,
  newResponsibleUser,
  reason,
  clientId = 'client_interport',
  bookingId = '',
  deviceTimestamp = null,
  serverTimestamp = null,
  eventId = ''
}) {
  if (!container) throw new Error('Container é obrigatório.');
  const actor = resolveAuthenticatedActor(authenticatedUser, claimedActor);
  assertClientAccess(actor, clientId || container.clientId);

  if (!isAuthorizedAdminRole(actor)) {
    throw new Error('Permissão negada: apenas perfis autorizados (ADM ou MASTER) podem transferir a responsabilidade de uma inspeção.');
  }

  const cleanReason = String(reason || '').trim();
  if (!cleanReason || cleanReason.length < 3) {
    throw new Error('Justificativa obrigatória: informe o motivo da transferência de responsabilidade.');
  }

  if (!newResponsibleUser || typeof newResponsibleUser !== 'object') {
    throw new Error('Selecione um novo inspetor responsável válido.');
  }

  const newId = String(newResponsibleUser.uid || newResponsibleUser.id || '').trim();
  const newName = String(newResponsibleUser.name || '').trim();
  if (!newId || !newName || FORBIDDEN_DEFAULT_NAMES.has(newName.toLowerCase())) {
    throw new Error('O novo inspetor responsável deve possuir identificador único e nome válidos.');
  }

  const prevInfo = getResponsibleInspectorInfo(container);
  const previousName = prevInfo.isIdentified ? prevInfo.name : LEGACY_AUTHORSHIP_LABEL;
  const previousId = prevInfo.isIdentified ? prevInfo.id : null;

  const nowIso = new Date().toISOString();
  const devTs = deviceTimestamp || nowIso;
  const srvTs = serverTimestamp || nowIso;

  const nextResponsible = {
    id: newId,
    uid: String(newResponsibleUser.uid || newId),
    name: newName,
    email: String(newResponsibleUser.email || ''),
    role: String(newResponsibleUser.role || 'Inspector'),
    assignedAt: srvTs,
    deviceTimestamp: devTs,
    serverTimestamp: srvTs,
    assignedBy: {
      id: actor.id,
      name: actor.name,
      role: actor.role,
      mode: 'authorized_transfer',
      reason: cleanReason,
      previousResponsibleId: previousId,
      previousResponsibleName: previousName
    }
  };

  const transferEvent = createAuditEvent({
    eventId,
    action: 'responsibility_transferred',
    actor,
    clientId: clientId || container.clientId || 'client_interport',
    bookingId: bookingId || container.bookingId || '',
    containerId: container.id,
    containerNumber: container.containerNumber || container.number || container.id,
    targetItem: 'Responsabilidade da Inspeção',
    oldValue: previousName,
    newValue: newName,
    deviceTimestamp: devTs,
    serverTimestamp: srvTs,
    metadata: {
      previousResponsibleId: previousId,
      previousResponsibleName: previousName,
      newResponsibleId: newId,
      newResponsibleName: newName,
      transferAuthorId: actor.id,
      transferAuthorName: actor.name,
      reason: cleanReason
    }
  });

  const updatedTimeline = appendTimelineEvents(container.auditTimeline || [], [transferEvent], {
    serverNow: srvTs
  });

  return {
    container: {
      ...container,
      responsibleInspector: nextResponsible,
      auditTimeline: updatedTimeline
    },
    event: transferEvent
  };
}

/**
 * Assina digitalmente o certificado da inspeção/Container ou Booking (Regra 3 e Regra 4).
 * - Distingue responsabilidade pela inspeção de assinatura do certificado.
 * - O preenchimento automático do nome NÃO assina o documento nem aplica assinatura de outra pessoa.
 * - A assinatura respeita permissões: apenas o próprio inspetor responsável pela inspeção ou um perfil ADM/MASTER
 *   pode assinar digitalmente, sempre registrando a própria identidade autenticada de quem executou a assinatura.
 */
export function signInspectionCertificate({
  container,
  booking = {},
  authenticatedUser,
  claimedActor = null,
  clientId = 'client_interport',
  bookingId = '',
  deviceTimestamp = null,
  serverTimestamp = null,
  eventId = ''
}) {
  if (!container) throw new Error('Container/Inspeção é obrigatório para assinar o certificado.');
  const actor = resolveAuthenticatedActor(authenticatedUser, claimedActor);
  assertClientAccess(actor, clientId || container.clientId || booking.clientId);

  const respInfo = getResponsibleInspectorInfo(container, booking);
  if (!respInfo.isIdentified) {
    throw new Error('Não é possível assinar o certificado: a inspeção ainda não possui um inspetor responsável identificado.');
  }

  const isResponsibleSelf = respInfo.id === actor.id || respInfo.uid === actor.uid;
  const isAdmin = isAuthorizedAdminRole(actor);

  if (!isResponsibleSelf && !isAdmin) {
    throw new Error(
      `Permissão negada: apenas o inspetor responsável (${respInfo.name}) ou um administrador autorizado pode assinar este certificado.`
    );
  }

  const nowIso = new Date().toISOString();
  const devTs = deviceTimestamp || nowIso;
  const srvTs = serverTimestamp || nowIso;

  // A assinatura SEMPRE registra quem efetivamente assinou (nunca aplica a assinatura de outra pessoa)
  const certificateSignature = {
    isSigned: true,
    signedBy: {
      id: actor.id,
      uid: actor.uid,
      name: actor.name,
      email: actor.email,
      role: actor.role
    },
    responsibleInspectorAtSigning: {
      id: respInfo.id,
      name: respInfo.name
    },
    deviceTimestamp: devTs,
    serverTimestamp: srvTs,
    signedAt: srvTs,
    certificateNumber: booking.certificateNumber || container.certificateNumber || ''
  };

  const signEvent = createAuditEvent({
    eventId,
    action: 'certificate_signed',
    actor,
    clientId: clientId || container.clientId || booking.clientId || 'client_interport',
    bookingId: bookingId || booking.id || container.bookingId || '',
    containerId: container.id,
    containerNumber: container.containerNumber || container.number || container.id,
    targetItem: 'Certificado de Inspeção',
    oldValue: container.certificateSignature?.signedBy?.name || 'Não assinado',
    newValue: `Assinado digitalmente por ${actor.name}`,
    deviceTimestamp: devTs,
    serverTimestamp: srvTs,
    metadata: {
      signedById: actor.id,
      signedByName: actor.name,
      responsibleInspectorId: respInfo.id,
      responsibleInspectorName: respInfo.name,
      certificateNumber: certificateSignature.certificateNumber
    }
  });

  const updatedTimeline = appendTimelineEvents(container.auditTimeline || [], [signEvent], {
    serverNow: srvTs
  });

  return {
    container: {
      ...container,
      certificateSignature,
      auditTimeline: updatedTimeline
    },
    certificateSignature,
    event: signEvent
  };
}

/**
 * Registra geração ou download de relatório/certificado (Regra 3 e Regra 4).
 */
export function recordReportAuditAction({
  container,
  authenticatedUser,
  claimedActor = null,
  actionType = 'report_generated', // 'report_generated' | 'report_downloaded'
  format = 'PDF',
  clientId = 'client_interport',
  bookingId = '',
  deviceTimestamp = null,
  serverTimestamp = null,
  eventId = ''
}) {
  if (!container) throw new Error('Container é obrigatório.');
  const actor = resolveAuthenticatedActor(authenticatedUser, claimedActor);
  assertClientAccess(actor, clientId || container.clientId);

  const validAction = actionType === 'report_downloaded' ? 'report_downloaded' : 'report_generated';
  const event = createAuditEvent({
    eventId,
    action: validAction,
    actor,
    clientId: clientId || container.clientId || 'client_interport',
    bookingId: bookingId || container.bookingId || '',
    containerId: container.id,
    containerNumber: container.containerNumber || container.number || container.id,
    targetItem: 'Relatório / Certificado',
    deviceTimestamp,
    serverTimestamp,
    metadata: { format }
  });

  const updatedTimeline = appendTimelineEvents(container.auditTimeline || [], [event], {
    serverNow: serverTimestamp
  });

  return {
    container: {
      ...container,
      auditTimeline: updatedTimeline
    },
    event
  };
}

/**
 * Fila de auditoria e ações offline com isolamento estrito por usuário (Regra 6):
 * - Preserva a identidade de quem realizou a ação mesmo offline.
 * - Registra horário do dispositivo (`deviceTimestamp`) e, na sincronização, horário do servidor (`serverTimestamp`).
 * - Não atribui pendências do Usuário A ao Usuário B que fizer login em seguida no mesmo dispositivo.
 * - Evita duplicação de eventos em retentativas de sincronização via `event.id`.
 */
let memoryOfflineQueue = [];

function loadOfflineQueue() {
  try {
    if (typeof localStorage === 'undefined') return [...memoryOfflineQueue];
    const raw = localStorage.getItem(OFFLINE_AUDIT_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [...memoryOfflineQueue];
  }
}

function saveOfflineQueue(items) {
  memoryOfflineQueue = Array.isArray(items) ? [...items] : [];
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(OFFLINE_AUDIT_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
}

export function enqueueOfflineInspectionAction({
  authenticatedUser,
  claimedActor = null,
  action,
  clientId = 'client_interport',
  bookingId = '',
  containerId = '',
  containerNumber = '',
  targetItem = '',
  oldValue = undefined,
  newValue = undefined,
  payload = {},
  deviceTimestamp = null,
  eventId = ''
}) {
  const actor = resolveAuthenticatedActor(authenticatedUser, claimedActor);
  assertClientAccess(actor, clientId);

  const devTs = deviceTimestamp || new Date().toISOString();
  const offlineEvent = createAuditEvent({
    eventId,
    action,
    actor,
    clientId,
    bookingId,
    containerId,
    containerNumber,
    targetItem,
    oldValue,
    newValue,
    deviceTimestamp: devTs,
    serverTimestamp: null,
    isOfflineCapture: true,
    metadata: {
      ...(payload?.metadata || {}),
      capturedOffline: true
    }
  });

  const list = loadOfflineQueue();
  const existingIdx = list.findIndex(item => item.eventId === offlineEvent.id);
  const entry = {
    eventId: offlineEvent.id,
    ownerUserId: actor.id,
    ownerUserName: actor.name,
    clientId,
    bookingId,
    containerId,
    action,
    payload,
    deviceTimestamp: devTs,
    event: offlineEvent,
    status: 'pending'
  };

  if (existingIdx >= 0) {
    list[existingIdx] = entry;
  } else {
    list.push(entry);
  }
  saveOfflineQueue(list);
  return entry;
}

/**
 * Retorna apenas os itens offline pertencentes ao usuário informado (isolamento de sessão no mesmo aparelho).
 */
export function getOfflinePendingActionsForUser(user) {
  if (!user) return [];
  const userId = String(user.uid || user.id || '').trim();
  if (!userId) return [];
  return loadOfflineQueue().filter(item => item.ownerUserId === userId && item.status === 'pending');
}

/**
 * Sincroniza os itens offline preservando a identidade original de quem realizou a ação (`ownerUserId` / `event.actor`)
 * e gravando o horário de recebimento pelo servidor (`serverTimestamp`), sem atribuir ao usuário logado posteriormente.
 */
export async function syncOfflineInspectionActions({
  currentLoggedUser = null,
  onlyForCurrentLoggedUser = true,
  serverNowFn = () => new Date().toISOString(),
  applySyncedEntry
} = {}) {
  const allItems = loadOfflineQueue();
  const currentUserId = currentLoggedUser ? String(currentLoggedUser.uid || currentLoggedUser.id || '').trim() : '';

  const synced = [];
  const remaining = [];

  for (const item of allItems) {
    if (item.status !== 'pending') continue;

    // Regra 6: Se outro usuário entrou no dispositivo, não mistura nem atribui as pendências do usuário anterior a ele
    if (onlyForCurrentLoggedUser && currentUserId && item.ownerUserId !== currentUserId) {
      remaining.push(item);
      continue;
    }

    const srvTs = serverNowFn();
    // Preserva rigorosamente o autor original gravado no momento da ação offline
    const syncedEvent = {
      ...item.event,
      actor: item.event.actor,
      userId: item.ownerUserId,
      userName: item.ownerUserName,
      deviceTimestamp: item.deviceTimestamp,
      serverTimestamp: srvTs,
      auditTimestamp: srvTs
    };
    syncedEvent.formattedText = formatTimelineEventPtBr(syncedEvent);

    try {
      if (typeof applySyncedEntry === 'function') {
        await applySyncedEntry({
          ...item,
          serverTimestamp: srvTs,
          syncedEvent
        });
      }
      synced.push({ ...item, serverTimestamp: srvTs, syncedEvent, status: 'synced' });
    } catch {
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining);
  return { synced, remaining };
}

export function clearOfflineAuditQueueForTests() {
  saveOfflineQueue([]);
}
