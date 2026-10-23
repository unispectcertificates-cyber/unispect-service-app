import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Mock transacional do IndexedDB para testes da fila contínua
const stores = new Map();
let abortNext = false;
const database = {
  createObjectStore(name) { stores.set(name, new Map()); },
  close() {},
  transaction(names) {
    const changes = [];
    let pending = 0;
    let ended = false;
    const tx = {
      error: null,
      abort() { ended = true; setImmediate(() => tx.onabort?.()); },
      objectStore(name) {
        const store = stores.get(name);
        const request = fn => {
          const r = {};
          pending++;
          setImmediate(() => {
            if (ended) return;
            r.result = fn();
            r.onsuccess?.();
            pending--;
            finish();
          });
          return r;
        };
        return {
          get: id => request(() => structuredClone(store.get(id))),
          getAll: () => request(() => structuredClone([...store.values()])),
          put: value => { changes.push(() => store.set(value.id, structuredClone(value))); finish(); },
          delete: id => { changes.push(() => store.delete(id)); finish(); }
        };
      }
    };
    function finish() {
      setImmediate(() => {
        if (ended || pending) return;
        ended = true;
        if (abortNext) { abortNext = false; tx.onabort?.(); return; }
        changes.forEach(f => f());
        tx.oncomplete?.();
      });
    }
    finish();
    return tx;
  }
};

let opened = false;
globalThis.indexedDB = {
  open() {
    const r = {};
    setImmediate(() => {
      r.result = database;
      if (!opened) { opened = true; r.onupgradeneeded?.(); }
      r.onsuccess?.();
    });
    return r;
  }
};
globalThis.window = new EventTarget();
globalThis.document = new EventTarget();
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true, storage: { persist: async () => true } },
  configurable: true
});

let uploadsCount = 0;
let linkedPhotos = [];
let deletedPhotos = [];
let uploadFail = false;

globalThis.continuousTestDb = {
  getUser: () => ({ id: 'inspetor_1' }),
  uploadPhoto: async (blob, container, { photoId }) => {
    if (uploadFail) throw new Error('Falha de rede transitória');
    uploadsCount++;
    await new Promise(r => setTimeout(r, 2));
    return { id: photoId, url: 'https://storage.test/' + photoId, containerId: container, storagePath: 'containers/' + container + '/' + photoId + '.jpg' };
  },
  appendBookingPhoto: async (bookingId, containerId, photo) => {
    linkedPhotos.push({ bookingId, containerId, photoId: photo.id });
    return { id: bookingId, containers: [{ id: containerId, photos: [photo] }] };
  },
  deletePhoto: async (photoId, storagePath) => {
    deletedPhotos.push({ photoId, storagePath });
  }
};

let queueSrc = await fs.readFile(new URL('../src/utils/bookingPhotoQueue.js', import.meta.url), 'utf8');
queueSrc = queueSrc.replace("import {db} from '../db';", "const db = globalThis.continuousTestDb;");
const q = await import('data:text/javascript;base64,' + Buffer.from(queueSrc).toString('base64'));

const makePhoto = name => new Blob(['pixels_' + name], { type: 'image/jpeg' });

test('1. Capturas consecutivas rápidas: enfileiramento sem bloqueio e liberação imediata', async () => {
  navigator.onLine = false; // offline para checar gravação local imediata
  stores.get('jobs')?.clear();
  stores.get('blobs')?.clear();
  uploadsCount = 0;

  // Três fotos em sequência rápida no container 'C1'
  const jobs1 = await q.enqueueBookingPhotos('B1', 'C1', [makePhoto('f1')]);
  const jobs2 = await q.enqueueBookingPhotos('B1', 'C1', [makePhoto('f2')]);
  const jobs3 = await q.enqueueBookingPhotos('B1', 'C1', [makePhoto('f3')]);

  assert.equal(jobs1.length, 1);
  assert.equal(jobs2.length, 1);
  assert.equal(jobs3.length, 1);

  // Verificação de que todos foram persistidos imediatamente no IndexedDB
  const list = await q.listBookingPhotoJobs();
  assert.equal(list.length, 3);
  assert.equal(stores.get('blobs').size, 3);
  assert.equal(uploadsCount, 0, 'Uploads não começaram enquanto offline');
});

test('2. Navegação entre containers durante uploads: fotos permanecem no container de origem', async () => {
  // Adiciona foto no container C2 enquanto outros de C1 estão na fila
  const jobsC2 = await q.enqueueBookingPhotos('B1', 'C2', [makePhoto('f4')]);
  assert.equal(jobsC2[0].containerId, 'C2');

  navigator.onLine = true;
  linkedPhotos = [];
  await q.syncBookingPhotos();

  // Todos os 4 uploads confirmados
  assert.equal(stores.get('jobs').size, 0);
  assert.equal(stores.get('blobs').size, 0);
  assert.equal(linkedPhotos.length, 4);

  // 3 fotos vinculadas ao C1 e 1 foto vinculada ao C2
  const c1Photos = linkedPhotos.filter(p => p.containerId === 'C1');
  const c2Photos = linkedPhotos.filter(p => p.containerId === 'C2');
  assert.equal(c1Photos.length, 3);
  assert.equal(c2Photos.length, 1);
});

test('3. Cancelamento de foto pendente na fila: remove blob e job sem disparar upload', async () => {
  navigator.onLine = false;
  const jobs = await q.enqueueBookingPhotos('B1', 'C1', [makePhoto('f_cancel')]);
  const jobId = jobs[0].id;

  assert.equal((await q.listBookingPhotoJobs()).length, 1);
  assert.equal(stores.get('blobs').size, 1);

  // Usuário tocou na lixeira da foto antes de subir
  await q.cancelBookingPhoto(jobId);

  assert.equal((await q.listBookingPhotoJobs()).length, 0);
  assert.equal(stores.get('blobs').size, 0, 'Blob local removido com sucesso');
});

test('4. Retomada automática após retorno de conexão sem duplicar envios', async () => {
  navigator.onLine = false;
  stores.get('jobs')?.clear();
  stores.get('blobs')?.clear();
  uploadsCount = 0;

  // Foto entra offline
  await q.enqueueBookingPhotos('B1', 'C1', [makePhoto('f_offline')]);
  assert.equal(uploadsCount, 0);

  // Sinal volta (evento online)
  navigator.onLine = true;
  await q.retryBookingPhotos();

  assert.equal(uploadsCount, 1);
  assert.equal((await q.listBookingPhotoJobs()).length, 0);
  assert.equal(stores.get('blobs').size, 0);
});

test('5. Verificação separada e explícita da conclusão de uploads: upload -> append -> cleanup -> evento', async () => {
  navigator.onLine = true;
  stores.get('jobs')?.clear();
  stores.get('blobs')?.clear();
  uploadsCount = 0;
  linkedPhotos = [];

  const savedEvents = [];
  const listener = ev => savedEvents.push(ev.detail);
  window.addEventListener('unispect-booking-photo-saved', listener);

  try {
    const jobs = await q.enqueueBookingPhotos('B_VERIFY', 'C_VERIFY', [
      makePhoto('test_complete_1'),
      makePhoto('test_complete_2')
    ]);

    assert.equal(jobs.length, 2);

    // Aguarda conclusão dos uploads em segundo plano
    await q.syncBookingPhotos();

    // 1. db.uploadPhoto foi chamado para cada foto
    assert.equal(uploadsCount, 2, 'Todos os arquivos foram enviados');

    // 2. db.appendBookingPhoto vinculou cada foto ao container e booking corretos
    assert.equal(linkedPhotos.length, 2, 'Todas as fotos foram vinculadas remotamente');
    assert.equal(linkedPhotos[0].bookingId, 'B_VERIFY');
    assert.equal(linkedPhotos[0].containerId, 'C_VERIFY');
    assert.equal(linkedPhotos[1].bookingId, 'B_VERIFY');
    assert.equal(linkedPhotos[1].containerId, 'C_VERIFY');

    // 3. Os registros locais (jobs e blobs) são removidos do IndexedDB após confirmação
    assert.equal(stores.get('jobs').size, 0, 'Object store jobs foi drenada');
    assert.equal(stores.get('blobs').size, 0, 'Object store blobs foi drenada');
    const pendingJobs = await q.listBookingPhotoJobs();
    assert.equal(pendingJobs.length, 0, 'Nenhum job pendente listado');

    // 4. O evento de sucesso é disparado para que a interface atualize a miniatura de "pendente" para "remota"
    assert.equal(savedEvents.length, 2, 'Evento unispect-booking-photo-saved disparado para cada upload');
    assert.equal(savedEvents[0].containerId, 'C_VERIFY');
    assert.equal(savedEvents[1].containerId, 'C_VERIFY');
  } finally {
    window.removeEventListener('unispect-booking-photo-saved', listener);
  }
});

test('6. Cancelamento de foto durante envio em andamento não vincula ao Booking', async () => {
  navigator.onLine = true;
  stores.get('jobs')?.clear();
  stores.get('blobs')?.clear();
  linkedPhotos = [];
  deletedPhotos = [];

  const savedEvents = [];
  const listener = ev => savedEvents.push(ev.detail);
  window.addEventListener('unispect-booking-photo-saved', listener);

  try {
    const jobs = await q.enqueueBookingPhotos('B_RACE', 'C_RACE', [makePhoto('race_1')]);
    const jobId = jobs[0].id;
    // Usuário tocou na lixeira para excluir enquanto estava subindo
    await q.cancelBookingPhoto(jobId);
    await q.syncBookingPhotos();

    // A foto cancelada NÃO foi vinculada ao Booking
    assert.equal(linkedPhotos.filter(p => p.photoId === jobId).length, 0, 'Foto cancelada não deve ser vinculada ao booking');
    // Nenhum evento foi disparado para ela
    assert.equal(savedEvents.filter(e => e.photoId === jobId).length, 0, 'Evento não deve disparar para foto cancelada');
  } finally {
    window.removeEventListener('unispect-booking-photo-saved', listener);
  }
});

