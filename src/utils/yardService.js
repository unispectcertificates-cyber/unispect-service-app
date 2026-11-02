/**
 * yardService.js
 * Serviço de sincronização, fila offline e operações em tempo real
 * do Inventário de Pátio com o Firestore.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  query,
  where,
  orderBy,
  runTransaction,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { dbFirestore } from '../firebase';
import {
  normalizeContainerCode,
  generateYardPassageId,
  generateYardAuditId,
  startYardAuditSession,
  recordAuditReading,
  reconcileAuditReading,
  beginYardAuditClosing,
  closeYardAuditSession,
  confirmInventoryExit,
  resolveYardAuditConflict,
  getAuditSessionSummary
} from './yardInventory.js';
import { createYardRepository, makeYardLockKey } from './yardRepository.js';

// Repositório Firestore com transação real
export const yardRepo = createYardRepository({
  reference: (col, id) => doc(dbFirestore, col, id),
  transaction: callback => runTransaction(dbFirestore, callback),
  now: () => Date.now()
});

// Chaves de armazenamento local
const QUEUE_KEY = 'unispect_yard_queue_v1';
const SYNCED_KEY = 'unispect_yard_synced_v1';
const DEVICE_ID_KEY = 'unispect_yard_device_id';

export function getDeviceId() {
  if (typeof window === 'undefined') return 'server_device';
  let devId = localStorage.getItem(DEVICE_ID_KEY);
  if (!devId) {
    devId = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    localStorage.setItem(DEVICE_ID_KEY, devId);
  }
  return devId;
}

// ────────────────────────────────────────────────────────────────────────────
// Fila Local e Estado de Sincronização
// ────────────────────────────────────────────────────────────────────────────

function loadLocalQueue() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalQueue(queue) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Erro ao salvar fila local de inventário:', e);
  }
}

function getSyncedRecords() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SYNCED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addSyncedRecord(item) {
  if (typeof window === 'undefined') return;
  try {
    const current = getSyncedRecords();
    current.unshift(item);
    if (current.length > 50) current.length = 50; // Limita a 50 itens locais recentes
    localStorage.setItem(SYNCED_KEY, JSON.stringify(current));
  } catch {}
}

export function getYardSyncStatus() {
  const queue = loadLocalQueue();
  const synced = getSyncedRecords();
  const lastSyncStr = typeof window !== 'undefined' ? localStorage.getItem('unispect_yard_last_sync') : null;
  const lastSyncConfirmedAt = lastSyncStr ? Number(lastSyncStr) : null;

  return {
    pendingCount: queue.length,
    pendingItems: queue,
    syncedCount: synced.length,
    syncedItems: synced,
    lastSyncConfirmedAt,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true
  };
}

const notifySyncChange = (hasPending = false) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('unispect-yard-sync-change'));
    if (hasPending) {
      window.dispatchEvent(new Event('unispect-yard-enqueued'));
    }
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Operações do Modo Campo (com fallback offline)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Registra leitura na conferência diária no Modo Campo.
 * Se houver conexão, envia atômico ao Firestore.
 * Se offline ou falha de rede, enfileira localmente sem travar o inspetor.
 */
export async function submitYardReading({
  auditId,
  yardId,
  containerNumber,
  actor,
  notes = '',
  photo = null
}) {
  const normalizedNumber = normalizeContainerCode(containerNumber);
  if (!normalizedNumber) throw new Error('Número de container inválido.');

  const timestamp = Date.now();
  const item = {
    id: `read_${normalizedNumber}_${timestamp}`,
    auditId,
    yardId,
    containerNumber: containerNumber.trim(),
    normalizedNumber,
    actor: { id: actor?.id || 'sys', name: actor?.name || 'Inspetor', role: actor?.role || 'Inspector' },
    notes,
    timestamp,
    photoData: photo || null,
    attempts: 0
  };

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (isOnline) {
    try {
      await processReadingRemote(item);
      addSyncedRecord({ ...item, syncedAt: Date.now() });
      if (typeof window !== 'undefined') {
        localStorage.setItem('unispect_yard_last_sync', String(Date.now()));
      }
      notifySyncChange();
      return { status: 'synced', item };
    } catch (err) {
      console.warn('Falha ao enviar leitura remotamente, enfileirando local:', err);
    }
  }

  // Enfileira localmente
  const queue = loadLocalQueue();
  queue.push(item);
  saveLocalQueue(queue);
  notifySyncChange(true);
  return { status: 'pending_local', item };
}

async function processReadingRemote(item) {
  const auditRef = doc(dbFirestore, 'yardAudits', item.auditId);
  return runTransaction(dbFirestore, async (tx) => {
    const snap = await tx.get(auditRef);
    if (!snap.exists()) throw new Error('Conferência não encontrada.');
    const audit = snap.data();

    // Se estiver em closing, rejeita leitura sem reconciliação
    if (audit.status === 'closing') {
      throw new Error('A conferência está na etapa de fechamento. Novas leituras requerem reconciliação.');
    }
    if (audit.status === 'closed') {
      // Leitura extemporânea pós-fechamento
      return yardRepo.processLateAuditReadingAtomic({
        auditId: item.auditId,
        containerNumber: item.containerNumber,
        capturedAt: item.timestamp,
        actor: item.actor,
        notes: item.notes
      });
    }

    // Registra leitura regular na conferência
    const updatedAudit = recordAuditReading({
      audit,
      containerNumber: item.containerNumber,
      actor: item.actor,
      notes: item.notes,
      now: () => Date.now()
    });

    tx.set(auditRef, updatedAudit);

    // Atualiza ou cria passagem atômica no pátio
    const lockKey = makeYardLockKey(item.yardId, item.normalizedNumber);
    const lockRef = doc(dbFirestore, 'yardActiveLocks', lockKey);
    const lockSnap = await tx.get(lockRef);

    if (lockSnap.exists() && lockSnap.data().status === 'active') {
      const pRef = doc(dbFirestore, 'yardPassages', lockSnap.data().passageId);
      const pSnap = await tx.get(pRef);
      if (pSnap.exists()) {
        const pData = pSnap.data();
        const updatedPassage = {
          ...pData,
          status: 'active',
          lastConfirmedAt: item.timestamp,
          lastConfirmedBy: { id: item.actor.id, name: item.actor.name },
          updatedAt: Date.now()
        };
        tx.set(pRef, updatedPassage);
      }
    } else {
      // Cria nova passagem se não existia ativa
      const newPassage = {
        id: generateYardPassageId(item.normalizedNumber, item.timestamp),
        containerNumber: item.containerNumber,
        normalizedNumber: item.normalizedNumber,
        yardId: item.yardId,
        status: 'active',
        firstObservedAt: item.timestamp,
        lastConfirmedAt: item.timestamp,
        firstObservedBy: item.actor,
        lastConfirmedBy: item.actor,
        photos: item.photoData ? [item.photoData] : [],
        events: [{
          id: `yev_${item.normalizedNumber}_${item.timestamp}`,
          type: 'first_seen',
          title: 'Primeira presença observada no pátio',
          actor: item.actor,
          timestamp: item.timestamp,
          notes: item.notes || 'Registrado via Inventário do Pátio.'
        }],
        createdAt: item.timestamp,
        updatedAt: item.timestamp
      };
      tx.set(doc(dbFirestore, 'yardPassages', newPassage.id), newPassage);
      tx.set(lockRef, {
        lockKey,
        passageId: newPassage.id,
        normalizedNumber: item.normalizedNumber,
        yardId: item.yardId,
        status: 'active',
        createdAt: item.timestamp
      });
    }

    return updatedAudit;
  });
}

/**
 * Sincroniza fila local pendente com o servidor.
 */
export async function syncYardQueueNow() {
  const queue = loadLocalQueue();
  if (queue.length === 0) return { synced: 0, pending: 0 };

  const remaining = [];
  let synced = 0;

  for (const item of queue) {
    try {
      await processReadingRemote(item);
      addSyncedRecord({ ...item, syncedAt: Date.now() });
      synced++;
    } catch (err) {
      console.warn(`Falha ao sincronizar item ${item.containerNumber}:`, err);
      item.attempts = (item.attempts || 0) + 1;
      item.lastError = err.message || 'Erro de sincronização';
      remaining.push(item);
    }
  }

  saveLocalQueue(remaining);
  if (synced > 0 && typeof window !== 'undefined') {
    localStorage.setItem('unispect_yard_last_sync', String(Date.now()));
  }
  notifySyncChange();
  return { synced, pending: remaining.length };
}

/**
 * Envia batimento/handshake de presença do aparelho na conferência.
 */
export async function updateDeviceHeartbeat({ auditId, inspectorName }) {
  if (!auditId) return;
  const devId = getDeviceId();
  const queue = loadLocalQueue();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const now = Date.now();

  const auditRef = doc(dbFirestore, 'yardAudits', auditId);
  try {
    await updateDoc(auditRef, {
      [`participatingDevices.${devId}`]: {
        deviceId: devId,
        inspectorName: inspectorName || 'Inspetor',
        pendingUploads: queue.length,
        isConfirmedSynced: queue.length === 0,
        lastSyncConfirmedAt: queue.length === 0 ? now : null,
        lastHeartbeatAt: now,
        isOnline
      }
    });
  } catch (err) {
    // ignore offline
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Assinaturas em Tempo Real para Desktop e Campo
// ────────────────────────────────────────────────────────────────────────────

export function subscribeYardAudits(yardId, callback, errorCallback) {
  const q = yardId
    ? query(collection(dbFirestore, 'yardAudits'), where('yardId', '==', yardId), orderBy('openedAt', 'desc'))
    : query(collection(dbFirestore, 'yardAudits'), orderBy('openedAt', 'desc'));

  return onSnapshot(
    q,
    snapshot => callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
    error => {
      console.error('Erro na subscrição de yardAudits:', error);
      if (errorCallback) errorCallback(error);
    }
  );
}

export function subscribeYardPassages(callback, errorCallback) {
  const q = query(collection(dbFirestore, 'yardPassages'), orderBy('lastConfirmedAt', 'desc'));
  return onSnapshot(
    q,
    snapshot => callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
    error => {
      console.error('Erro na subscrição de yardPassages:', error);
      if (errorCallback) errorCallback(error);
    }
  );
}

export function subscribeSingleAudit(auditId, callback, errorCallback) {
  if (!auditId) return () => {};
  return onSnapshot(
    doc(dbFirestore, 'yardAudits', auditId),
    snapshot => {
      if (snapshot.exists()) callback({ id: snapshot.id, ...snapshot.data() });
      else callback(null);
    },
    error => {
      console.error('Erro na subscrição de auditoria:', error);
      if (errorCallback) errorCallback(error);
    }
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Persistência de Armazenamento e Auto-Sincronização em Pano de Fundo
// ────────────────────────────────────────────────────────────────────

/**
 * Solicita ao Android/Chromium armazenamento persistente contra exclusão por baixa memória.
 */
export async function requestPersistentStorage() {
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        return await navigator.storage.persist();
      }
      return isPersisted;
    } catch {
      return false;
    }
  }
  return false;
}

let yardSyncConsumers = 0;
let yardSyncTimer;
let yardSyncRunning = false;

async function runYardSync() {
  if (yardSyncRunning) return;
  yardSyncRunning = true;
  try {
    await syncYardQueueNow();
  } catch (err) {
    console.warn('Falha no ciclo automático de sincronização do pátio:', err);
  } finally {
    yardSyncRunning = false;
  }
}

const onVisibilityChange = () => {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    runYardSync();
  }
};

/**
 * Inicia ciclo contínuo de sincronização do Inventário de Pátio.
 * Reage a reconexão (online), retomada do app em primeiro plano (visibility/focus)
 * e novos itens salvos na fila local.
 */
export function startYardSynchronization() {
  if (typeof window === 'undefined') return () => {};
  requestPersistentStorage();
  if (++yardSyncConsumers === 1) {
    window.addEventListener('online', runYardSync);
    window.addEventListener('unispect-yard-enqueued', runYardSync);
    window.addEventListener('focus', runYardSync);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    yardSyncTimer = setInterval(runYardSync, 25000);
    runYardSync();
  }
  return () => {
    if (--yardSyncConsumers === 0) {
      clearInterval(yardSyncTimer);
      window.removeEventListener('online', runYardSync);
      window.removeEventListener('unispect-yard-enqueued', runYardSync);
      window.removeEventListener('focus', runYardSync);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    }
  };
}
