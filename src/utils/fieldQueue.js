import { validateFieldCapture } from './fieldContainers.js';

const DB_NAME = 'unispect-field-captures-v1';
const STORES = ['drafts', 'outbox', 'photos'];
const uid = prefix => prefix + '_' + crypto.randomUUID();
let databasePromise;
const emitChange = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('unispect-field-change')); };

function openDatabase() {
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Este aparelho não oferece armazenamento local. Use o aplicativo em um navegador compatível.')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore('drafts', { keyPath: 'number' });
      database.createObjectStore('outbox', { keyPath: 'id' });
      database.createObjectStore('photos', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); databasePromise = undefined; };
      resolve(database);
    };
    request.onblocked = () => reject(new Error('Feche outras versões do aplicativo e tente novamente.'));
    request.onerror = () => reject(request.error);
  }).catch(error => { databasePromise = undefined; throw error; });
  return databasePromise;
}

// Only resolve after transaction completion, never after the first successful put.
async function localTransaction(stores, mode, callback) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let result;
    const tx = database.transaction(stores, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error || new Error('Não foi possível salvar no aparelho. Verifique o espaço disponível.'));
    tx.onerror = () => {}; // onabort is the single rejection path
    try { callback(tx, value => { result = value; }); }
    catch (error) { tx.abort(); reject(error); }
  });
}

const requestValue = (tx, store, key, finish) => {
  const request = tx.objectStore(store).get(key);
  request.onsuccess = () => finish(request.result);
};

export const fieldQueue = {
  async save(input, files, actor, context = {}) {
    const fields = validateFieldCapture(input, files.length);
    const timestamp = Date.now();
    const operationId = uid('capture');
    const photos = files.map(file => ({ id: uid('fieldphoto'), blob: file, name: file.name || '', number: fields.containerNumber }));
    const result = await localTransaction(STORES, 'readwrite', (tx, finish) => {
      requestValue(tx, 'drafts', fields.containerNumber, previous => {
        const sourceContainerId = context.sourceContainerId || previous?.sourceContainerId || uid('fieldcontainer');
        const draft = { ...previous, number: fields.containerNumber, fields, sourceContainerId,
          photos: [...(previous?.photos || context.photos || []), ...photos.map(p => ({ id: p.id, name: '', local: true }))],
          pendingOperationIds: [...(previous?.pendingOperationIds || []), operationId], actor,
          createdAt: previous?.createdAt || timestamp, updatedAt: timestamp, remoteStatus: context.status || previous?.remoteStatus || 'pending' };
        const operation = { id: operationId, number: fields.containerNumber, fields, sourceContainerId, actor,
          createdAt: timestamp, photoIds: photos.map(p => p.id), uploaded: {}, attempts: 0, error: '' };
        tx.objectStore('drafts').put(draft);
        tx.objectStore('outbox').put(operation);
        for (const photo of photos) tx.objectStore('photos').put(photo);
        finish(draft);
      });
    });
    emitChange();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('unispect-field-enqueued'));
    // Persistence request is best-effort and must not delay the inspector.
    globalThis.navigator?.storage?.persist?.().catch(() => {});
    return result;
  },
  async listDrafts() {
    return localTransaction(['drafts'], 'readonly', (tx, finish) => {
      const request = tx.objectStore('drafts').getAll(); request.onsuccess = () => finish(request.result);
    });
  },
  async listOperations() {
    return localTransaction(['outbox'], 'readonly', (tx, finish) => {
      const request = tx.objectStore('outbox').getAll();
      request.onsuccess = () => finish(request.result.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)));
    });
  },
  async getPhoto(id) { return localTransaction(['photos'], 'readonly', (tx, finish) => requestValue(tx, 'photos', id, finish)); },
  async checkpoint(id, photo) {
    await localTransaction(['outbox'], 'readwrite', tx => requestValue(tx, 'outbox', id, operation => {
      if (operation) tx.objectStore('outbox').put({ ...operation, uploaded: { ...operation.uploaded, [photo.id]: photo } });
    }));
    emitChange();
  },
  async fail(id, error) {
    await localTransaction(['outbox'], 'readwrite', tx => requestValue(tx, 'outbox', id, operation => {
      if (operation) tx.objectStore('outbox').put({ ...operation, attempts: operation.attempts + 1, error: error.message || String(error) });
    }));
    emitChange();
  },
  async acknowledge(operation, result) {
    await localTransaction(STORES, 'readwrite', tx => requestValue(tx, 'drafts', operation.number, draft => {
      if (draft) {
        const remotePhotos = new Map(result.photos.map(p => [p.id, p]));
        const updated = { ...draft, sourceContainerId: result.sourceContainerId, remoteStatus: result.status,
          bookingId: result.bookingId, linkedContainerId: result.linkedContainerId,
          pendingOperationIds: draft.pendingOperationIds.filter(id => id !== operation.id),
          photos: draft.photos.map(p => remotePhotos.has(p.id) ? { ...remotePhotos.get(p.id), local: false } : p) };
        tx.objectStore('drafts').put(updated);
      }
      tx.objectStore('outbox').delete(operation.id);
      for (const id of operation.photoIds) tx.objectStore('photos').delete(id);
    }));
    emitChange();
  }
};

// No network call is involved in save(). Uploads are resumable by stable photo/operation IDs.
export function createFieldSync({ queue, remote, upload, isOnline = () => true, onState = () => {}, formatError = error => error }) {
  let running;
  let rerunWanted = false;
  const run = () => {
    if (running) { rerunWanted = true; return running; }
    running = (async () => {
      if (!isOnline()) return;
      const operations = await queue.listOperations();
      for (const operation of operations) {
        if (!isOnline()) break;
        onState({ syncing: true, number: operation.number });
        try {
          const prepared = await remote.prepare(operation);
          if (prepared.completed) { await queue.acknowledge(operation, prepared.result); continue; }
          const photos = [];
          // A maximum of two simultaneous uploads balances speed and device memory.
          for (let i = 0; i < operation.photoIds.length; i += 2) {
            const batch = await Promise.all(operation.photoIds.slice(i, i + 2).map(async id => {
              if (operation.uploaded[id]) return operation.uploaded[id];
              const photo = await queue.getPhoto(id);
              if (!photo?.blob) throw new Error('Foto local não encontrada. O registro precisa de revisão; ele não foi descartado.');
              const uploaded = await upload(photo, prepared.record);
              await queue.checkpoint(operation.id, uploaded);
              return uploaded;
            }));
            photos.push(...batch);
          }
          const result = await remote.complete(operation, photos);
          await queue.acknowledge(operation, result);
        } catch (error) { await queue.fail(operation.id, formatError(error)); }
      }
    })().finally(() => {
      running = undefined;
      onState({ syncing: false });
      if (rerunWanted) {
        rerunWanted = false;
        queueMicrotask(() => run().catch(error => onState({ syncing: false, error: error.message })));
      }
    });
    return running;
  };
  return { run };
}
