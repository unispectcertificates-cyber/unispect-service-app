/**
 * yardInventory.js
 * Módulo de regras de negócio, ciclo de vida e integridade do Inventário de Pátio do UNISPECT.
 */

import { normalizeCode } from './searchUtils.js';
export { formatContainerNumber } from './containerOcr.js';

export function normalizeContainerCode(raw) {
  return normalizeCode(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Cria identificador único e determinístico para nova passagem.
 */
export function generateYardPassageId(normalizedNumber, timestamp = Date.now()) {
  const rand = Math.random().toString(36).substring(2, 8);
  return `yp_${normalizedNumber}_${timestamp}_${rand}`;
}

export function generateYardAuditId(yardId, dateStr, timestamp = Date.now()) {
  const cleanDate = (dateStr || new Date(timestamp).toISOString().slice(0, 10)).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6);
  return `audit_${yardId}_${cleanDate}_${rand}`;
}

export function generateYardEventId(passageId, timestamp = Date.now()) {
  const rand = Math.random().toString(36).substring(2, 7);
  return `yev_${passageId}_${timestamp}_${rand}`;
}

/**
 * Validação de duplicidade de passagem ativa no mesmo pátio.
 * Impede duas passagens ativas ou em revisão para o mesmo container no mesmo pátio.
 */
export function findActivePassageInYard(passages, normalizedNumber, yardId) {
  const target = normalizeContainerCode(normalizedNumber);
  return (passages || []).find(p =>
    p.normalizedNumber === target &&
    p.yardId === yardId &&
    (p.status === 'active' || p.status === 'under_review')
  ) || null;
}

/**
 * Inicializa uma nova passagem de container pelo pátio.
 */
export function createYardPassage({
  containerNumber,
  yardId,
  yardName,
  actor,
  bookingId = null,
  bookingNumber = null,
  photos = [],
  notes = '',
  now = () => Date.now()
}) {
  const normalizedNumber = normalizeContainerCode(containerNumber);
  if (!normalizedNumber || normalizedNumber.length < 4) {
    throw new Error('Número de container inválido para inventário.');
  }
  if (!yardId) {
    throw new Error('Pátio/Local é obrigatório para registrar presença de inventário.');
  }

  const timestamp = now();
  const id = generateYardPassageId(normalizedNumber, timestamp);

  const initialEvent = {
    id: generateYardEventId(id, timestamp),
    passageId: id,
    containerNumber: containerNumber.trim(),
    yardId,
    type: 'first_seen',
    title: 'Primeira presença observada no pátio',
    actor: { id: actor?.id || 'sys', name: actor?.name || 'Sistema', role: actor?.role || 'Inspector' },
    timestamp,
    notes: notes || 'Registrado via Inventário do Pátio.'
  };

  const passage = {
    id,
    containerNumber: containerNumber.trim(),
    normalizedNumber,
    yardId,
    yardName: yardName || 'Pátio não informado',
    status: 'active', // 'active' | 'under_review' | 'exited'
    firstObservedAt: timestamp,
    lastConfirmedAt: timestamp,
    firstObservedBy: { id: actor?.id || 'sys', name: actor?.name || 'Inspetor' },
    lastConfirmedBy: { id: actor?.id || 'sys', name: actor?.name || 'Inspetor' },
    bookingId: bookingId || null,
    bookingNumber: bookingNumber || null,
    photos: Array.isArray(photos) ? photos : [],
    notes: notes || '',
    exitInfo: {
      type: null, // 'inventory_exit' | 'dispatch'
      confirmedAt: null,
      confirmedBy: null,
      lastKnownPresenceAt: null,
      actualExitTime: null // Permanece null (desconhecido) por padrão
    },
    events: [initialEvent],
    createdAt: timestamp,
    updatedAt: timestamp
  };

  return passage;
}

/**
 * Registra leitura de presença em container já existente no pátio.
 * Idempotente: atualiza última presença e adiciona evento histórico sem duplicar passagem.
 */
export function confirmYardPresence({
  passage,
  auditId = null,
  actor,
  photos = [],
  notes = '',
  now = () => Date.now()
}) {
  if (!passage) throw new Error('Passagem não fornecida.');
  if (passage.status === 'exited') {
    throw new Error('Esta passagem já foi finalizada como saída. Inicie uma nova passagem para este container.');
  }

  const timestamp = now();
  const event = {
    id: generateYardEventId(passage.id, timestamp),
    passageId: passage.id,
    containerNumber: passage.containerNumber,
    yardId: passage.yardId,
    auditId: auditId || null,
    type: auditId ? 'audit_confirmed' : 'presence_confirmed',
    title: auditId ? 'Presença confirmada em conferência diária' : 'Presença confirmada no pátio',
    actor: { id: actor?.id || 'sys', name: actor?.name || 'Inspetor', role: actor?.role || 'Inspector' },
    timestamp,
    notes: notes || ''
  };

  const mergedPhotos = [...(passage.photos || [])];
  if (Array.isArray(photos) && photos.length > 0) {
    photos.forEach(p => {
      if (!mergedPhotos.some(existing => existing.id === p.id || existing.url === p.url)) {
        mergedPhotos.push(p);
      }
    });
  }

  return {
    ...passage,
    status: 'active', // Reativa se estava under_review
    lastConfirmedAt: timestamp,
    lastConfirmedBy: { id: actor?.id || 'sys', name: actor?.name || 'Inspetor' },
    photos: mergedPhotos,
    notes: notes ? (passage.notes ? `${passage.notes} | ${notes}` : notes) : passage.notes,
    events: [...(passage.events || []), event],
    updatedAt: timestamp
  };
}

/**
 * Inicia uma sessão de conferência diária compartilhada no pátio.
 */
export function startYardAuditSession({
  yardId,
  yardName,
  actor,
  activePassagesInYard = [],
  dateStr = null,
  now = () => Date.now()
}) {
  const timestamp = now();
  const effectiveDate = dateStr || new Date(timestamp).toISOString().slice(0, 10);
  const id = generateYardAuditId(yardId, effectiveDate, timestamp);

  const expectedList = (activePassagesInYard || [])
    .filter(p => p.yardId === yardId && (p.status === 'active' || p.status === 'under_review'))
    .map(p => ({
      normalizedNumber: p.normalizedNumber,
      containerNumber: p.containerNumber,
      passageId: p.id,
      bookingNumber: p.bookingNumber || null,
      lastConfirmedAt: p.lastConfirmedAt
    }));

  return {
    id,
    yardId,
    yardName: yardName || 'Pátio',
    date: effectiveDate,
    status: 'in_progress', // 'in_progress' | 'reviewing' | 'closed'
    openedAt: timestamp,
    closedAt: null,
    openedBy: { id: actor?.id || 'sys', name: actor?.name || 'Inspetor' },
    closedBy: null,
    participatingInspectors: [
      { id: actor?.id || 'sys', name: actor?.name || 'Inspetor', lastActiveAt: timestamp }
    ],
    expectedContainers: expectedList,
    // Mapa indexado por normalizedNumber
    readings: {},
    notes: ''
  };
}

/**
 * Inicia a etapa de fechamento da conferência de pátio.
 * REGRA CRÍTICA: Uma vez iniciada a etapa de fechamento, novas leituras não podem
 * entrar diretamente sem o processo explícito de reconciliação.
 */
export function beginYardAuditClosing({
  audit,
  actor,
  now = () => Date.now()
}) {
  if (!audit) throw new Error('Conferência não fornecida.');
  if (audit.status === 'closed') throw new Error('A conferência já está fechada.');
  if (audit.status === 'closing') return audit;

  const timestamp = now();
  return {
    ...audit,
    status: 'closing',
    closingStartedAt: timestamp,
    closingStartedBy: { id: actor?.id || 'sys', name: actor?.name || 'Supervisor', role: actor?.role || 'ADM' },
    updatedAt: timestamp
  };
}

/**
 * Registra leitura dentro de uma conferência de pátio em andamento.
 * Leituras repetidas contam como uma única presença, mantendo histórico de auditoria.
 * Impede novas leituras se a conferência estiver na etapa de fechamento (sem reconciliação) ou fechada.
 */
export function recordAuditReading({
  audit,
  containerNumber,
  actor,
  notes = '',
  isReconciled = false,
  now = () => Date.now()
}) {
  if (!audit) throw new Error('Conferência não fornecida.');
  if (audit.status === 'closed') throw new Error('Esta conferência de inventário já está fechada.');
  if (audit.status === 'closing' && !isReconciled) {
    throw new Error('A conferência está na etapa de fechamento. Novas leituras não são permitidas sem reconciliação.');
  }

  const normalized = normalizeContainerCode(containerNumber);
  if (!normalized) throw new Error('Número de container inválido.');

  const timestamp = now();
  const readings = { ...(audit.readings || {}) };
  const existingReading = readings[normalized];

  const wasExpected = (audit.expectedContainers || []).some(c => c.normalizedNumber === normalized);

  if (existingReading) {
    // Leitura repetida do mesmo container: mantém primeira leitura, atualiza última e incrementa contador
    readings[normalized] = {
      ...existingReading,
      lastReadAt: timestamp,
      readCount: (existingReading.readCount || 1) + 1,
      lastInspector: { id: actor?.id || 'sys', name: actor?.name || 'Inspetor' },
      isReconciled: isReconciled || Boolean(existingReading.isReconciled),
      notes: notes ? (existingReading.notes ? `${existingReading.notes}; ${notes}` : notes) : existingReading.notes
    };
  } else {
    // Nova presença identificada nesta conferência
    readings[normalized] = {
      normalizedNumber: normalized,
      containerNumber: containerNumber.trim(),
      firstReadAt: timestamp,
      lastReadAt: timestamp,
      readCount: 1,
      firstInspector: { id: actor?.id || 'sys', name: actor?.name || 'Inspetor' },
      lastInspector: { id: actor?.id || 'sys', name: actor?.name || 'Inspetor' },
      wasExpected,
      isReconciled: Boolean(isReconciled),
      notes: notes || ''
    };
  }

  // Atualiza inspetores participantes
  const inspectors = [...(audit.participatingInspectors || [])];
  const inspIndex = inspectors.findIndex(i => i.id === (actor?.id || 'sys'));
  if (inspIndex >= 0) {
    inspectors[inspIndex] = { ...inspectors[inspIndex], lastActiveAt: timestamp };
  } else {
    inspectors.push({ id: actor?.id || 'sys', name: actor?.name || 'Inspetor', lastActiveAt: timestamp });
  }

  return {
    ...audit,
    readings,
    participatingInspectors: inspectors,
    updatedAt: timestamp
  };
}

/**
 * Reconcilia leitura especificamente autorizada na etapa de fechamento.
 */
export function reconcileAuditReading(args) {
  return recordAuditReading({ ...args, isReconciled: true });
}

/**
 * Calcula o resumo analítico da conferência de pátio:
 * Encontrados, Novos, e Esperados ainda não encontrados.
 */
export function getAuditSessionSummary(audit) {
  if (!audit) {
    return { found: [], newContainers: [], missing: [], totalExpected: 0, totalFound: 0, totalNew: 0, totalMissing: 0 };
  }

  const readings = audit.readings || {};
  const expected = audit.expectedContainers || [];

  const found = [];
  const newContainers = [];

  Object.values(readings).forEach(r => {
    if (r.wasExpected) {
      found.push(r);
    } else {
      newContainers.push(r);
    }
  });

  const missing = expected.filter(exp => !readings[exp.normalizedNumber]);

  return {
    found,
    newContainers,
    missing,
    totalExpected: expected.length,
    totalFound: found.length,
    totalNew: newContainers.length,
    totalMissing: missing.length
  };
}

/**
 * Fecha a sessão de conferência diária.
 * REGRA CRÍTICA:
 * 1. Uma conferência parcial NUNCA gera saída de container.
 * 2. O fechamento exige confirmação recente de sincronização de todos os aparelhos participantes.
 *    Informação antiga de "online" ou fila zerada não é suficiente.
 * 3. Containers ausentes NÃO recebem saída automática: são colocados sob 'under_review' para conferência humana do administrador.
 */
export function closeYardAuditSession({
  audit,
  actor,
  isPartial = false,
  pendingUploadsCount = 0,
  participatingDevices = null,
  maxStalenessMs = 60000,
  now = () => Date.now()
}) {
  if (!audit) throw new Error('Conferência não fornecida.');
  if (audit.status === 'closed') throw new Error('A conferência já está fechada.');

  if (pendingUploadsCount > 0) {
    throw new Error(`Existem ${pendingUploadsCount} envios pendentes sincronizando neste aparelho. Aguarde a sincronização antes de fechar a conferência.`);
  }

  const timestamp = now();

  // Se a lista de aparelhos participantes for informada, valida confirmação recente
  if (participatingDevices && typeof participatingDevices === 'object') {
    const unconfirmedDevices = [];
    Object.entries(participatingDevices).forEach(([deviceId, info]) => {
      const isSynced = Boolean(info.isConfirmedSynced);
      const pendings = Number(info.pendingUploads || 0);
      const lastSync = Number(info.lastSyncConfirmedAt || 0);
      const isFresh = lastSync > 0 && (timestamp - lastSync) <= maxStalenessMs;

      if (pendings > 0 || !isSynced || !isFresh) {
        let reason = '';
        if (pendings > 0) reason = `${pendings} pendentes`;
        else if (!isSynced) reason = 'não sincronizado';
        else if (!isFresh) reason = `sincronização desatualizada (${Math.round((timestamp - lastSync) / 1000)}s atrás)`;

        unconfirmedDevices.push({
          deviceId,
          inspectorName: info.inspectorName || 'Inspetor',
          reason
        });
      }
    });

    if (unconfirmedDevices.length > 0) {
      const details = unconfirmedDevices.map(d => `${d.inspectorName} (${d.reason})`).join(', ');
      throw new Error(`Não é possível fechar a conferência. Há aparelhos participantes sem confirmação recente de sincronização: ${details}.`);
    }
  }

  const summary = getAuditSessionSummary(audit);

  return {
    ...audit,
    status: 'closed',
    isPartial: Boolean(isPartial),
    closedAt: timestamp,
    closedBy: { id: actor?.id || 'sys', name: actor?.name || 'Administrador' },
    summarySnapshot: {
      totalExpected: summary.totalExpected,
      totalFound: summary.totalFound,
      totalNew: summary.totalNew,
      totalMissing: summary.totalMissing
    },
    updatedAt: timestamp
  };
}

/**
 * Resolução administrativa de conflito registrado em conferência de pátio (ex: leitura atrasada em passagem encerrada).
 */
export function resolveYardAuditConflict({
  audit,
  conflictId,
  resolution = 'keep_exited',
  actor,
  notes = '',
  now = () => Date.now()
}) {
  if (!audit) throw new Error('Conferência não fornecida.');
  if (!actor || actor.role !== 'ADM') {
    throw new Error('Apenas administradores podem resolver conflitos de conferência de pátio.');
  }

  const timestamp = now();
  const conflicts = Array.isArray(audit.pendingConflicts) ? [...audit.pendingConflicts] : [];
  const idx = conflicts.findIndex(c => c.id === conflictId);

  if (idx >= 0) {
    conflicts[idx] = {
      ...conflicts[idx],
      resolved: true,
      resolvedAt: timestamp,
      resolvedBy: { id: actor.id, name: actor.name || 'Administrador' },
      resolution,
      notes: notes || conflicts[idx].notes
    };
  }

  return {
    ...audit,
    pendingConflicts: conflicts,
    updatedAt: timestamp
  };
}

/**
 * Confirmação administrativa de saída identificada por inventário.
 * REGRA CRÍTICA:
 * - Responsável e data da confirmação obrigatórios.
 * - Registra última presença conhecida.
 * - Horário real da saída permanece desconhecido quando não houver evidência física.
 */
export function confirmInventoryExit({
  passage,
  actor,
  notes = '',
  now = () => Date.now()
}) {
  if (!passage) throw new Error('Passagem não fornecida.');
  if (passage.status === 'exited') {
    throw new Error('Esta passagem já foi finalizada como saída.');
  }
  if (!actor || !actor.id) {
    throw new Error('Responsável obrigatório para confirmar saída de inventário.');
  }

  const timestamp = now();
  const event = {
    id: generateYardEventId(passage.id, timestamp),
    passageId: passage.id,
    containerNumber: passage.containerNumber,
    yardId: passage.yardId,
    type: 'exit_confirmed',
    title: 'Saída identificada por inventário',
    actor: { id: actor.id, name: actor.name || 'Administrador', role: actor.role || 'ADM' },
    timestamp,
    notes: notes || 'Saída confirmada após revisão de ausência no pátio.'
  };

  return {
    ...passage,
    status: 'exited',
    exitInfo: {
      type: 'inventory_exit',
      confirmedAt: timestamp,
      confirmedBy: { id: actor.id, name: actor.name || 'Administrador' },
      lastKnownPresenceAt: passage.lastConfirmedAt,
      actualExitTime: null // Horário real desconhecido na falta de registro na portaria
    },
    notes: notes ? (passage.notes ? `${passage.notes} | ${notes}` : notes) : passage.notes,
    events: [...(passage.events || []), event],
    updatedAt: timestamp
  };
}

/**
 * Vinculação independente com Booking.
 * Não altera a presença física no pátio nem a data da última confirmação.
 */
export function linkBookingToPassage({
  passage,
  bookingId,
  bookingNumber,
  actor,
  now = () => Date.now()
}) {
  if (!passage) throw new Error('Passagem não fornecida.');
  const timestamp = now();

  const event = {
    id: generateYardEventId(passage.id, timestamp),
    passageId: passage.id,
    containerNumber: passage.containerNumber,
    yardId: passage.yardId,
    type: 'booking_linked',
    title: `Vínculo estabelecido com Booking ${bookingNumber}`,
    actor: { id: actor?.id || 'sys', name: actor?.name || 'Sistema', role: actor?.role || 'Inspector' },
    timestamp,
    notes: `Vínculo com Booking ID: ${bookingId}`
  };

  return {
    ...passage,
    bookingId,
    bookingNumber,
    events: [...(passage.events || []), event],
    updatedAt: timestamp
  };
}
