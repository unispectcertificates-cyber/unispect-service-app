// Operações pequenas sobre a versão mais recente do booking. Sem consultas à coleção inteira.
import {
  SYSTEM_ACTOR,
  resolveAuthenticatedActor,
  assertClientAccess,
  assignOrPreserveResponsibleInspector,
  createAuditEvent,
  appendTimelineEvents,
  applyViewAccessToContainer,
  transferContainerResponsibility,
  signInspectionCertificate,
  recordReportAuditAction,
  getActiveAuthenticatedUser
} from './inspectionAudit.js';

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const forbidden = new Set([
  'id',
  'containers',
  'bookingNumber',
  'certificateNumber',
  '_revision',
  'photos',
  'deletedPhotoIds',
  'responsibleInspector',
  'auditTimeline',
  'certificateSignature'
]);

export function applyFieldPatch(current, changes, expected = {}) {
  const result = { ...current };
  for (const [field, value] of Object.entries(changes)) {
    if (forbidden.has(field) || value === undefined) throw new Error('Campo não permitido nesta operação: ' + field);
    if (!Object.hasOwn(expected, field)) throw new Error('Valor anterior obrigatório: ' + field);
    if (!same(current[field], expected[field]) && !same(current[field], value)) {
      throw new Error('Este campo foi alterado por outro usuário: ' + field + '. Confira o valor antes de tentar novamente.');
    }
    result[field] = value;
  }
  return result;
}

export function mergeContainerPhotos(container, incoming) {
  const deleted = new Set(container.deletedPhotoIds || []);
  const photos = new Map((container.photos || []).filter(p => !deleted.has(p.id)).map(p => [p.id, p]));
  for (const p of incoming || []) if (p.id && !deleted.has(p.id)) photos.set(p.id, { ...photos.get(p.id), ...p });
  return { ...container, photos: [...photos.values()] };
}

const normalizeSealStr = val => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') return String(val.sealNumber || val.seal || val.number || val.value || '').trim();
  return String(val).trim();
};

/**
 * Combina lacres provisórios, exclusões manuais, vínculo de origem (foto/cliente/booking/container),
 * estado de reconhecimento por foto/versão e eventos de auditoria de forma atômica e segura para múltiplos usuários.
 */
export function mergeContainerProvisionalSeals(container, mutation = {}) {
  const {
    addSeals = [],           // Array<string | { sealNumber, photoId, photoVersion, source, confidence, capturedBy, capturedByName, requestedBy, requestedByName }>
    removeSeals = [],        // Array<string | { sealNumber, photoIds, photoVersions, removedBy }>
    photoRecognition = null, // { photoId, photoVersion, status, confirmedSeals, doubtfulSeals, clientId, bookingId, containerId, error, updatedAt }
    resolveReviewKeys = [],  // Array<string> (ex: `${photoId}::${photoVersion}::${suggestedNumber}`)
    clearRemovedForPhotoIds = [], // Array<string> quando o inspetor solicita revisão explícita
    forceReinsert = false,
    clientId = '',
    bookingId = '',
    authenticatedUser = null,
    actor = null,
    requestedBy = null,
    deviceTimestamp = null,
    serverTimestamp = null
  } = mutation;

  const effectiveClientId = clientId || container.clientId || 'client_interport';
  const effectiveBookingId = bookingId || container.bookingId || '';
  const nowIso = new Date().toISOString();
  const devTs = deviceTimestamp || nowIso;
  const srvTs = serverTimestamp || nowIso;

  // Mapa de fotos para recuperar quem capturou a foto de origem (Regra 5)
  const photosById = new Map((container.photos || []).map(p => [String(p.id), p]));

  const currentSeals = (container.provisionalSeals || []).map(normalizeSealStr).filter(Boolean);
  const sealSet = new Map();
  for (const s of currentSeals) {
    const key = s.toUpperCase();
    if (!sealSet.has(key)) sealSet.set(key, s);
  }

  // Mapa de lacres excluídos manualmente: sealKey -> { sealNumber, photoIds: string[], photoVersions: string[], removedAt }
  const removedMap = new Map();
  for (const item of container.removedProvisionalSeals || []) {
    const num = normalizeSealStr(item);
    if (!num) continue;
    const key = num.toUpperCase();
    removedMap.set(key, {
      sealNumber: num,
      photoIds: Array.isArray(item?.photoIds) ? [...new Set(item.photoIds)] : [],
      photoVersions: Array.isArray(item?.photoVersions) ? [...new Set(item.photoVersions)] : [],
      removedAt: item?.removedAt || Date.now()
    });
  }

  // Se o inspetor acionou revisão explícita de fotos, libera os bloqueios de exclusão manual daquelas fotos
  if (clearRemovedForPhotoIds.length > 0) {
    const clearSet = new Set(clearRemovedForPhotoIds.map(String));
    for (const [key, entry] of removedMap.entries()) {
      const remainingPhotoIds = (entry.photoIds || []).filter(pid => !clearSet.has(String(pid)));
      if (remainingPhotoIds.length === 0) {
        removedMap.delete(key);
      } else {
        removedMap.set(key, { ...entry, photoIds: remainingPhotoIds });
      }
    }
  }

  // Proveniência vinculada à foto, cliente, booking e container (Regra 7 de OCR + Regra 5 de Auditoria)
  const provenance = { ...(container.sealProvenance || {}) };

  const newAuditEvents = [];
  let workingContainer = { ...container };

  // Verifica se há ação manual humana (remoção manual, adição manual ou revisão explícita)
  const hasHumanSealAction =
    removeSeals.length > 0 ||
    addSeals.some(item => {
      const src = typeof item === 'object' && item?.source ? item.source : 'ocr';
      return src === 'manual' || src === 'review' || forceReinsert;
    });

  let humanActor = null;
  if (hasHumanSealAction && (authenticatedUser || actor || getActiveAuthenticatedUser())) {
    humanActor = resolveAuthenticatedActor(authenticatedUser, actor);
    assertClientAccess(humanActor, effectiveClientId);
    const respResult = assignOrPreserveResponsibleInspector({
      container: workingContainer,
      actor: humanActor,
      isTechnicalAction: true,
      clientId: effectiveClientId,
      bookingId: effectiveBookingId,
      deviceTimestamp: devTs,
      serverTimestamp: srvTs
    });
    workingContainer.responsibleInspector = respResult.responsibleInspector;
    if (respResult.startedEvent) {
      newAuditEvents.push(respResult.startedEvent);
    }
  }

  // 1. Processa exclusões manuais (Regra 8 OCR + Regra 4 Auditoria)
  const currentPhotoIds = (container.photos || []).map(p => p.id).filter(Boolean);
  const currentPhotoVersions = (container.photos || []).map(p => `${p.id}::${p.compressionVersion || '1'}::${p.sizeBytes || 0}`).filter(Boolean);

  for (const rem of removeSeals) {
    const num = normalizeSealStr(rem);
    if (!num) continue;
    const key = num.toUpperCase();
    const existed = sealSet.has(key);
    sealSet.delete(key);

    const existingOrigin = provenance[key];
    const originPhotoIds = Array.isArray(rem?.photoIds) && rem.photoIds.length
      ? rem.photoIds
      : (existingOrigin?.photoIds?.length ? existingOrigin.photoIds : currentPhotoIds);
    const originVersions = Array.isArray(rem?.photoVersions) && rem.photoVersions.length
      ? rem.photoVersions
      : (existingOrigin?.photoVersions?.length ? existingOrigin.photoVersions : currentPhotoVersions);

    const prevRemoved = removedMap.get(key);
    removedMap.set(key, {
      sealNumber: num,
      photoIds: [...new Set([...(prevRemoved?.photoIds || []), ...originPhotoIds])],
      photoVersions: [...new Set([...(prevRemoved?.photoVersions || []), ...originVersions])],
      removedBy: humanActor ? { id: humanActor.id, name: humanActor.name } : undefined,
      removedAt: Date.now()
    });

    if (existed && humanActor) {
      newAuditEvents.push(
        createAuditEvent({
          eventId: `evt_seal_removed_${effectiveBookingId}_${workingContainer.id}_${key}_${devTs}`,
          action: 'seal_removed',
          actor: humanActor,
          clientId: effectiveClientId,
          bookingId: effectiveBookingId,
          containerId: workingContainer.id,
          containerNumber: workingContainer.containerNumber || workingContainer.number || workingContainer.id,
          targetItem: `Lacre provisório ${num}`,
          oldValue: num,
          newValue: null,
          deviceTimestamp: devTs,
          serverTimestamp: srvTs,
          metadata: {
            sealNumber: num,
            photoIds: originPhotoIds
          }
        })
      );
    }
  }

  // 2. Processa adições (automáticas via OCR por "Sistema" ou manuais/revisadas pelo inspetor)
  for (const item of addSeals) {
    const num = normalizeSealStr(item);
    if (!num) continue;
    const key = num.toUpperCase();
    const source = (typeof item === 'object' && item?.source) ? item.source : 'ocr';
    const photoId = (typeof item === 'object' && item?.photoId) ? String(item.photoId) : '';
    const photoVersion = (typeof item === 'object' && item?.photoVersion) ? String(item.photoVersion) : '';
    const isExplicitUserAction = forceReinsert || source === 'manual' || source === 'review';

    // Regra 8: Se foi excluído manualmente e a adição é automática (OCR) pela mesma foto/versão, não reinserir!
    if (!isExplicitUserAction && removedMap.has(key)) {
      const remEntry = removedMap.get(key);
      const blockedByPhoto = !photoId ||
        remEntry.photoIds.length === 0 ||
        remEntry.photoIds.includes(photoId) ||
        (photoVersion && remEntry.photoVersions.includes(photoVersion));
      if (blockedByPhoto) {
        continue;
      }
    }

    // Se foi ação explícita do usuário (manual ou revisão), remove do bloqueio de excluídos
    if (isExplicitUserAction && removedMap.has(key)) {
      removedMap.delete(key);
    }

    const wasAlreadyPresent = sealSet.has(key);
    if (!wasAlreadyPresent) {
      sealSet.set(key, num);
    }

    const originPhoto = photoId ? photosById.get(photoId) : null;
    const capturedById =
      (typeof item === 'object' && item?.capturedBy?.id) ||
      (typeof item === 'object' && item?.capturedById) ||
      originPhoto?.capturedBy?.id ||
      originPhoto?.authorId ||
      null;
    const capturedByName =
      (typeof item === 'object' && item?.capturedBy?.name) ||
      (typeof item === 'object' && item?.capturedByName) ||
      originPhoto?.capturedBy?.name ||
      originPhoto?.authorName ||
      (workingContainer.responsibleInspector?.name) ||
      'não identificado';

    const reqActor = requestedBy || (typeof item === 'object' && item?.requestedBy) || humanActor || null;
    const requestedById = reqActor?.id || reqActor?.uid || (typeof item === 'object' && item?.requestedById) || null;
    const requestedByName = reqActor?.name || (typeof item === 'object' && item?.requestedByName) || null;

    // Regra 7 OCR + Regra 5 Auditoria: Vincula reconhecimento à foto de origem, cliente, booking, container, quem capturou e quem solicitou
    const prevProv = provenance[key] || {};
    const mergedPhotoIds = [...new Set([...(prevProv.photoIds || []), ...(photoId ? [photoId] : [])])];
    const mergedPhotoVersions = [...new Set([...(prevProv.photoVersions || []), ...(photoVersion ? [photoVersion] : [])])];
    provenance[key] = {
      sealNumber: sealSet.get(key) || num,
      source: prevProv.source === 'manual' ? 'manual' : source,
      actorType: source === 'ocr' ? 'system' : 'user',
      actorName: source === 'ocr' ? 'Sistema' : (humanActor?.name || prevProv.actorName || ''),
      photoIds: mergedPhotoIds,
      photoVersions: mergedPhotoVersions,
      capturedBy: capturedById ? { id: capturedById, name: capturedByName } : (prevProv.capturedBy || { id: null, name: capturedByName }),
      requestedBy: requestedById ? { id: requestedById, name: requestedByName } : (prevProv.requestedBy || null),
      clientId: (typeof item === 'object' && item?.clientId) || effectiveClientId || prevProv.clientId || 'client_interport',
      bookingId: (typeof item === 'object' && item?.bookingId) || effectiveBookingId || prevProv.bookingId || '',
      containerId: workingContainer.id || prevProv.containerId || '',
      containerNumber: workingContainer.containerNumber || prevProv.containerNumber || '',
      recognizedAt: prevProv.recognizedAt || Date.now()
    };

    // Emite evento de auditoria se o lacre foi efetivamente adicionado agora
    if (!wasAlreadyPresent) {
      if (source === 'ocr') {
        // Regra 5: Ação automática registrada em nome de "Sistema", vinculada à foto, quem capturou e quem solicitou
        newAuditEvents.push(
          createAuditEvent({
            eventId: `evt_seal_ocr_${effectiveBookingId}_${workingContainer.id}_${photoId || 'p'}_${key}`,
            action: 'seal_recognized_auto',
            actor: SYSTEM_ACTOR,
            clientId: effectiveClientId,
            bookingId: effectiveBookingId,
            containerId: workingContainer.id,
            containerNumber: workingContainer.containerNumber || workingContainer.number || workingContainer.id,
            targetItem: `Lacre provisório ${num}`,
            oldValue: null,
            newValue: num,
            deviceTimestamp: devTs,
            serverTimestamp: srvTs,
            metadata: {
              sealNumber: num,
              source: 'ocr',
              photoId: photoId || null,
              photoVersion: photoVersion || null,
              capturedBy: capturedById,
              capturedByName,
              requestedBy: requestedById,
              requestedByName
            }
          })
        );
      } else if (humanActor) {
        newAuditEvents.push(
          createAuditEvent({
            eventId: `evt_seal_added_${effectiveBookingId}_${workingContainer.id}_${key}_${devTs}`,
            action: 'seal_added',
            actor: humanActor,
            clientId: effectiveClientId,
            bookingId: effectiveBookingId,
            containerId: workingContainer.id,
            containerNumber: workingContainer.containerNumber || workingContainer.number || workingContainer.id,
            targetItem: `Lacre provisório ${num}`,
            oldValue: null,
            newValue: num,
            deviceTimestamp: devTs,
            serverTimestamp: srvTs,
            metadata: {
              sealNumber: num,
              source,
              photoId: photoId || null,
              photoVersion: photoVersion || null
            }
          })
        );
      }
    }
  }

  // 3. Atualiza estado de processamento por foto e versão da imagem
  const recognitionState = { ...(workingContainer.sealRecognitionState || {}) };
  if (photoRecognition && photoRecognition.photoId) {
    const pid = String(photoRecognition.photoId);
    recognitionState[pid] = {
      ...(recognitionState[pid] || {}),
      ...photoRecognition,
      clientId: photoRecognition.clientId || effectiveClientId || recognitionState[pid]?.clientId || 'client_interport',
      bookingId: photoRecognition.bookingId || effectiveBookingId || recognitionState[pid]?.bookingId || '',
      containerId: workingContainer.id || photoRecognition.containerId || '',
      updatedAt: photoRecognition.updatedAt || Date.now()
    };
  }

  // 4. Registra sugestões duvidosas já conferidas/descartadas pelo inspetor
  const dismissedReviews = [...new Set([
    ...(workingContainer.dismissedSealReviews || []),
    ...resolveReviewKeys.filter(Boolean).map(String)
  ])];

  const updatedTimeline = newAuditEvents.length > 0
    ? appendTimelineEvents(workingContainer.auditTimeline || [], newAuditEvents, { serverNow: srvTs })
    : (workingContainer.auditTimeline || []);

  return {
    ...workingContainer,
    provisionalSeals: [...sealSet.values()],
    removedProvisionalSeals: [...removedMap.values()],
    sealProvenance: provenance,
    sealRecognitionState: recognitionState,
    dismissedSealReviews: dismissedReviews,
    auditTimeline: updatedTimeline
  };
}

export const matchesContainerId = (c, id) => {
  if (!c || id === undefined || id === null) return false;
  const target = String(id).trim();
  return String(c.id || '').trim() === target ||
         String(c.containerNumber || '').trim().toUpperCase() === target.toUpperCase() ||
         String(c.number || '').trim().toUpperCase() === target.toUpperCase();
};

export function changeContainer(booking, id, transform) {
  if (!(booking.containers || []).some(c => matchesContainerId(c, id))) {
    throw new Error('O container não está mais neste booking. A foto permanece no aparelho.');
  }
  return {
    ...booking,
    containers: booking.containers.map(c => matchesContainerId(c, id) ? transform(c) : c),
    _revision: (booking._revision || 0) + 1
  };
}

const FINALIZED_STATUSES = new Set(['concluído', 'concluido', 'finalizado', 'completed', 'inspecionado', 'aprovado']);

function isFinalizedStatus(st) {
  if (!st) return false;
  return FINALIZED_STATUSES.has(String(st).trim().toLowerCase());
}

export function createConcurrentRepository({
  reference,
  transaction,
  getAuthenticatedUser = null,
  requireAuth = false,
  serverNow = () => new Date().toISOString()
}) {
  function resolveCallActor(auditContext = {}, { allowSystem = false } = {}) {
    // Sincronização offline preserva o autor original que capturou o item offline (Regra 6)
    if (auditContext?.isOfflineSync && auditContext?.offlineActor) {
      return resolveAuthenticatedActor(auditContext.offlineActor, auditContext.actor, { allowSystem });
    }
    const authUser =
      auditContext?.authenticatedUser ||
      (typeof getAuthenticatedUser === 'function' ? getAuthenticatedUser() : null) ||
      getActiveAuthenticatedUser();

    if (requireAuth || authUser || auditContext?.actor) {
      return resolveAuthenticatedActor(authUser, auditContext?.actor, { allowSystem });
    }
    return null;
  }

  async function mutate(id, transform) {
    return transaction(async tx => {
      const ref = reference('bookings', id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Booking não encontrado.');
      const saved = transform({ ...snap.data(), id });
      // Não toca cabeçalho, número, índices de unicidade nem certificados de forma inválida.
      const update = { _revision: saved._revision };
      for (const key of Object.keys(saved)) {
        if (key !== 'id' && !same(saved[key], snap.data()[key])) {
          update[key] = saved[key];
        }
      }
      tx.update(ref, update);
      return saved;
    });
  }

  return {
    patchContainer: (id, containerId, changes, expected, auditContext = {}) =>
      mutate(id, b => {
        const actor = resolveCallActor(auditContext);
        if (actor) {
          assertClientAccess(actor, b.clientId);
        }
        const srvTs = auditContext?.serverTimestamp || serverNow();
        const devTs = auditContext?.deviceTimestamp || srvTs;

        let assignedBookingResponsible = null;

        const nextBooking = changeContainer(b, containerId, c => {
          const patched = applyFieldPatch(c, changes, expected);
          if (!actor) return patched;

          const events = [];
          const respResult = assignOrPreserveResponsibleInspector({
            container: c,
            actor,
            isTechnicalAction: true,
            clientId: b.clientId || c.clientId || 'client_interport',
            bookingId: b.id || id,
            deviceTimestamp: devTs,
            serverTimestamp: srvTs,
            startEventId: auditContext?.startEventId
          });

          if (respResult.startedEvent) {
            events.push(respResult.startedEvent);
          }
          if (respResult.responsibleInspector && !b.responsibleInspector) {
            assignedBookingResponsible = respResult.responsibleInspector;
          }

          for (const [field, newVal] of Object.entries(changes)) {
            const oldVal = c[field];
            if (same(oldVal, newVal)) continue;

            if (field === 'status') {
              const wasFinal = isFinalizedStatus(oldVal);
              const nowFinal = isFinalizedStatus(newVal);
              if (!wasFinal && nowFinal) {
                events.push(
                  createAuditEvent({
                    eventId: auditContext?.eventId ? `${auditContext.eventId}_finalized` : '',
                    action: 'inspection_finalized',
                    actor,
                    clientId: b.clientId || c.clientId || 'client_interport',
                    bookingId: b.id || id,
                    containerId: c.id,
                    containerNumber: c.containerNumber || c.number || c.id,
                    targetItem: 'Status da inspeção',
                    oldValue: oldVal ?? 'Em Andamento',
                    newValue: newVal,
                    deviceTimestamp: devTs,
                    serverTimestamp: srvTs,
                    metadata: { field: 'status' }
                  })
                );
                continue;
              }
              if (wasFinal && !nowFinal) {
                events.push(
                  createAuditEvent({
                    eventId: auditContext?.eventId ? `${auditContext.eventId}_reopened` : '',
                    action: 'inspection_reopened',
                    actor,
                    clientId: b.clientId || c.clientId || 'client_interport',
                    bookingId: b.id || id,
                    containerId: c.id,
                    containerNumber: c.containerNumber || c.number || c.id,
                    targetItem: 'Status da inspeção',
                    oldValue: oldVal,
                    newValue: newVal,
                    deviceTimestamp: devTs,
                    serverTimestamp: srvTs,
                    metadata: { field: 'status' }
                  })
                );
                continue;
              }
            }

            if (field === 'provisionalSeals' && Array.isArray(newVal)) {
              const oldSet = new Set((Array.isArray(oldVal) ? oldVal : []).map(normalizeSealStr).filter(Boolean));
              const newSet = new Set(newVal.map(normalizeSealStr).filter(Boolean));
              for (const s of newSet) {
                if (!oldSet.has(s)) {
                  events.push(
                    createAuditEvent({
                      action: 'seal_added',
                      actor,
                      clientId: b.clientId || c.clientId || 'client_interport',
                      bookingId: b.id || id,
                      containerId: c.id,
                      containerNumber: c.containerNumber || c.number || c.id,
                      targetItem: `Lacre provisório ${s}`,
                      oldValue: null,
                      newValue: s,
                      deviceTimestamp: devTs,
                      serverTimestamp: srvTs,
                      metadata: { sealNumber: s, source: 'manual' }
                    })
                  );
                }
              }
              for (const s of oldSet) {
                if (!newSet.has(s)) {
                  events.push(
                    createAuditEvent({
                      action: 'seal_removed',
                      actor,
                      clientId: b.clientId || c.clientId || 'client_interport',
                      bookingId: b.id || id,
                      containerId: c.id,
                      containerNumber: c.containerNumber || c.number || c.id,
                      targetItem: `Lacre provisório ${s}`,
                      oldValue: s,
                      newValue: null,
                      deviceTimestamp: devTs,
                      serverTimestamp: srvTs,
                      metadata: { sealNumber: s }
                    })
                  );
                }
              }
              continue;
            }

            events.push(
              createAuditEvent({
                eventId: auditContext?.eventId ? `${auditContext.eventId}_${field}` : '',
                action: 'field_updated',
                actor,
                clientId: b.clientId || c.clientId || 'client_interport',
                bookingId: b.id || id,
                containerId: c.id,
                containerNumber: c.containerNumber || c.number || c.id,
                targetItem: field,
                oldValue: oldVal ?? null,
                newValue: newVal ?? null,
                deviceTimestamp: devTs,
                serverTimestamp: srvTs,
                metadata: { field }
              })
            );
          }

          return {
            ...patched,
            responsibleInspector: respResult.responsibleInspector,
            auditTimeline: appendTimelineEvents(c.auditTimeline || [], events, { serverNow: srvTs })
          };
        });

        if (assignedBookingResponsible && !nextBooking.responsibleInspector) {
          nextBooking.responsibleInspector = assignedBookingResponsible;
        }
        return nextBooking;
      }),

    patchBooking: (id, changes, expected, auditContext = {}) =>
      mutate(id, b => {
        const actor = resolveCallActor(auditContext);
        if (actor) {
          assertClientAccess(actor, b.clientId);
        }
        return {
          ...applyFieldPatch(b, changes, expected),
          _revision: (b._revision || 0) + 1
        };
      }),

    appendPhoto: (id, containerId, photo, auditContext = {}) =>
      mutate(id, b => {
        const effectiveContext = photo?.capturedBy && !auditContext?.authenticatedUser && !auditContext?.actor
          ? { ...auditContext, isOfflineSync: true, offlineActor: photo.capturedBy }
          : auditContext;
        const actor = resolveCallActor(effectiveContext);
        if (actor) {
          assertClientAccess(actor, b.clientId);
        }

        const srvTs = auditContext?.serverTimestamp || serverNow();
        const devTs =
          auditContext?.deviceTimestamp ||
          photo?.deviceTimestamp ||
          (photo?.createdAt ? new Date(photo.createdAt).toISOString() : srvTs);

        let assignedBookingResponsible = null;

        const nextBooking = changeContainer(b, containerId, c => {
          if ((c.deletedPhotoIds || []).includes(photo.id)) {
            throw new Error('Esta foto foi excluída; o envio não será restaurado.');
          }
          const enrichedPhoto = actor
            ? {
                ...photo,
                authorId: photo.authorId || actor.id,
                authorName: photo.authorName || actor.name,
                capturedBy: photo.capturedBy || {
                  id: actor.id,
                  uid: actor.uid,
                  name: actor.name,
                  role: actor.role
                },
                deviceTimestamp: devTs,
                serverTimestamp: srvTs
              }
            : photo;

          const merged = mergeContainerPhotos(c, [enrichedPhoto]);
          if (!actor) return merged;

          const events = [];
          const respResult = assignOrPreserveResponsibleInspector({
            container: c,
            actor,
            isTechnicalAction: true,
            clientId: b.clientId || c.clientId || 'client_interport',
            bookingId: b.id || id,
            deviceTimestamp: devTs,
            serverTimestamp: srvTs,
            startEventId: auditContext?.startEventId
          });

          if (respResult.startedEvent) {
            events.push(respResult.startedEvent);
          }
          if (respResult.responsibleInspector && !b.responsibleInspector) {
            assignedBookingResponsible = respResult.responsibleInspector;
          }

          events.push(
            createAuditEvent({
              eventId: auditContext?.eventId || `evt_photo_added_${b.id || id}_${c.id}_${photo.id}`,
              action: 'photo_added',
              actor,
              clientId: b.clientId || c.clientId || 'client_interport',
              bookingId: b.id || id,
              containerId: c.id,
              containerNumber: c.containerNumber || c.number || c.id,
              targetItem: photo.stepLabel || photo.name || photo.id,
              oldValue: null,
              newValue: photo.id,
              deviceTimestamp: devTs,
              serverTimestamp: srvTs,
              metadata: {
                photoId: photo.id,
                stepLabel: photo.stepLabel || '',
                photoCount: auditContext?.photoCount || 1,
                capturedOffline: Boolean(auditContext?.isOfflineSync || photo?.capturedOffline)
              }
            })
          );

          return {
            ...merged,
            responsibleInspector: respResult.responsibleInspector,
            auditTimeline: appendTimelineEvents(c.auditTimeline || [], events, { serverNow: srvTs })
          };
        });

        if (assignedBookingResponsible && !nextBooking.responsibleInspector) {
          nextBooking.responsibleInspector = assignedBookingResponsible;
        }
        return nextBooking;
      }),

    removePhoto: (id, containerId, photoId, auditContext = {}) =>
      mutate(id, b => {
        const actor = resolveCallActor(auditContext);
        if (actor) {
          assertClientAccess(actor, b.clientId);
        }
        const srvTs = auditContext?.serverTimestamp || serverNow();
        const devTs = auditContext?.deviceTimestamp || srvTs;

        return changeContainer(b, containerId, c => {
          const oldPhoto = (c.photos || []).find(p => p.id === photoId);
          const updated = {
            ...c,
            photos: (c.photos || []).filter(p => p.id !== photoId),
            deletedPhotoIds: [...new Set([...(c.deletedPhotoIds || []), photoId])]
          };
          if (!actor) return updated;

          const events = [];
          const respResult = assignOrPreserveResponsibleInspector({
            container: c,
            actor,
            isTechnicalAction: true,
            clientId: b.clientId || c.clientId || 'client_interport',
            bookingId: b.id || id,
            deviceTimestamp: devTs,
            serverTimestamp: srvTs
          });
          if (respResult.startedEvent) {
            events.push(respResult.startedEvent);
          }

          events.push(
            createAuditEvent({
              eventId: auditContext?.eventId || `evt_photo_deleted_${b.id || id}_${c.id}_${photoId}_${devTs}`,
              action: 'photo_deleted',
              actor,
              clientId: b.clientId || c.clientId || 'client_interport',
              bookingId: b.id || id,
              containerId: c.id,
              containerNumber: c.containerNumber || c.number || c.id,
              targetItem: oldPhoto?.stepLabel || oldPhoto?.name || photoId,
              oldValue: photoId,
              newValue: null,
              deviceTimestamp: devTs,
              serverTimestamp: srvTs,
              metadata: {
                photoId,
                stepLabel: oldPhoto?.stepLabel || ''
              }
            })
          );

          return {
            ...updated,
            responsibleInspector: respResult.responsibleInspector,
            auditTimeline: appendTimelineEvents(c.auditTimeline || [], events, { serverNow: srvTs })
          };
        });
      }),

    mutateProvisionalSeals: (id, containerId, mutation, auditContext = {}) =>
      mutate(id, b => {
        const srvTs = mutation?.serverTimestamp || auditContext?.serverTimestamp || serverNow();
        const devTs = mutation?.deviceTimestamp || auditContext?.deviceTimestamp || srvTs;
        const authUser =
          mutation?.authenticatedUser ||
          auditContext?.authenticatedUser ||
          (typeof getAuthenticatedUser === 'function' ? getAuthenticatedUser() : null) ||
          getActiveAuthenticatedUser();

        return changeContainer(b, containerId, c =>
          mergeContainerProvisionalSeals(c, {
            ...mutation,
            authenticatedUser: authUser,
            actor: mutation?.actor || auditContext?.actor || null,
            deviceTimestamp: devTs,
            serverTimestamp: srvTs,
            clientId: mutation?.clientId || b.clientId || 'client_interport',
            bookingId: mutation?.bookingId || b.id || id
          })
        );
      }),

    recordContainerAccess: (id, containerId, auditContext = {}) =>
      mutate(id, b => {
        const srvTs = auditContext?.serverTimestamp || serverNow();
        const devTs = auditContext?.deviceTimestamp || srvTs;
        const authUser =
          auditContext?.authenticatedUser ||
          (typeof getAuthenticatedUser === 'function' ? getAuthenticatedUser() : null) ||
          getActiveAuthenticatedUser();

        return changeContainer(b, containerId, c => {
          const res = applyViewAccessToContainer({
            container: c,
            authenticatedUser: authUser,
            claimedActor: auditContext?.actor || null,
            clientId: b.clientId || c.clientId || 'client_interport',
            bookingId: b.id || id,
            sessionKey: auditContext?.sessionKey || '',
            deviceTimestamp: devTs,
            serverTimestamp: srvTs
          });
          return res.container;
        });
      }),

    transferResponsibility: (id, containerId, transferParams = {}) =>
      mutate(id, b => {
        const srvTs = transferParams?.serverTimestamp || serverNow();
        const devTs = transferParams?.deviceTimestamp || srvTs;
        const authUser =
          transferParams?.authenticatedUser ||
          (typeof getAuthenticatedUser === 'function' ? getAuthenticatedUser() : null) ||
          getActiveAuthenticatedUser();

        let nextBookingResp = null;
        const nextBooking = changeContainer(b, containerId, c => {
          const res = transferContainerResponsibility({
            container: c,
            authenticatedUser: authUser,
            claimedActor: transferParams?.actor || null,
            newResponsibleUser: transferParams?.newResponsibleUser,
            reason: transferParams?.reason,
            clientId: b.clientId || c.clientId || 'client_interport',
            bookingId: b.id || id,
            deviceTimestamp: devTs,
            serverTimestamp: srvTs,
            eventId: transferParams?.eventId || ''
          });
          nextBookingResp = res.container.responsibleInspector;
          return res.container;
        });

        if (nextBookingResp) {
          nextBooking.responsibleInspector = nextBookingResp;
        }
        return nextBooking;
      }),

    signCertificate: (id, containerId, signParams = {}) =>
      mutate(id, b => {
        const srvTs = signParams?.serverTimestamp || serverNow();
        const devTs = signParams?.deviceTimestamp || srvTs;
        const authUser =
          signParams?.authenticatedUser ||
          (typeof getAuthenticatedUser === 'function' ? getAuthenticatedUser() : null) ||
          getActiveAuthenticatedUser();

        let signedCert = null;
        const nextBooking = changeContainer(b, containerId, c => {
          const res = signInspectionCertificate({
            container: c,
            booking: b,
            authenticatedUser: authUser,
            claimedActor: signParams?.actor || null,
            clientId: b.clientId || c.clientId || 'client_interport',
            bookingId: b.id || id,
            deviceTimestamp: devTs,
            serverTimestamp: srvTs,
            eventId: signParams?.eventId || ''
          });
          signedCert = res.certificateSignature;
          return res.container;
        });

        if (signedCert) {
          nextBooking.certificateSignature = signedCert;
        }
        return nextBooking;
      }),

    recordReportAction: (id, containerId, reportParams = {}) =>
      mutate(id, b => {
        const srvTs = reportParams?.serverTimestamp || serverNow();
        const devTs = reportParams?.deviceTimestamp || srvTs;
        const authUser =
          reportParams?.authenticatedUser ||
          (typeof getAuthenticatedUser === 'function' ? getAuthenticatedUser() : null) ||
          getActiveAuthenticatedUser();

        return changeContainer(b, containerId, c => {
          const res = recordReportAuditAction({
            container: c,
            authenticatedUser: authUser,
            claimedActor: reportParams?.actor || null,
            actionType: reportParams?.actionType || 'report_generated',
            format: reportParams?.format || 'PDF',
            clientId: b.clientId || c.clientId || 'client_interport',
            bookingId: b.id || id,
            deviceTimestamp: devTs,
            serverTimestamp: srvTs,
            eventId: reportParams?.eventId || ''
          });
          return res.container;
        });
      })
  };
}
