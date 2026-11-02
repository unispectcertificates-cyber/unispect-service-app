import { collection, doc, getDocsFromServer, onSnapshot, query, where, runTransaction } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { dbFirestore, storage } from '../firebase';
import { createFieldRepository, fieldErrorMessage } from './fieldContainers.js';
import { fieldQueue, createFieldSync } from './fieldQueue.js';
import { compressImage } from './imageCompression.js';

const repository = createFieldRepository({
  listBookings: async () => {
    const snapshot = await getDocsFromServer(collection(dbFirestore, 'bookings'));
    return snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
  },
  reference: (name, id) => doc(dbFirestore, name, id),
  transaction: callback => runTransaction(dbFirestore, callback),
  now: () => Date.now()
});
export const removeFieldPhotoMetadata = photoId => repository.removePhotoMetadata(photoId);

export async function deleteFieldContainer(number, actor) {
  const result = await repository.deleteFieldContainer(number, actor);
  if (result.photosToDelete?.length) {
    await Promise.allSettled(result.photosToDelete.map(async photo => {
      if (photo.storagePath) {
        try {
          await deleteObject(ref(storage, photo.storagePath));
        } catch (err) {
          if (err.code !== 'storage/object-not-found') console.warn('Erro ao remover foto do storage:', err);
        }
      }
    }));
  }
  try {
    await fieldQueue.deleteLocal(number);
  } catch {
    // ignore
  }
  return result;
}

export function subscribePendingFieldContainers(next, error) {
  return onSnapshot(query(collection(dbFirestore, 'fieldContainers'), where('status', '==', 'pending')),
    snapshot => next(snapshot.docs.map(item => ({ ...item.data(), id: item.id }))), error);
}

async function compressPhoto(blob) {
  const result = await compressImage(blob);
  return result.blob;
}

async function uploadFieldPhoto(photo, record) {
  const compressed = await compressImage(photo.blob);
  const storagePath = `containers/${record.sourceContainerId}/${photo.id}.jpg`;
  const storageRef = ref(storage, storagePath);
  const task = uploadBytesResumable(storageRef, compressed.blob, { contentType: 'image/jpeg' });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      task.cancel();
      reject(new Error('Envio interrompido. A foto continua salva e será reenviada automaticamente.'));
    }, 45000);
    task.on('state_changed', undefined, error => { clearTimeout(timeout); reject(error); }, () => { clearTimeout(timeout); resolve(); });
  });
  const url = await getDownloadURL(storageRef);
  return {
    id: photo.id,
    name: '',
    url,
    storagePath,
    width: compressed.width,
    height: compressed.height,
    sizeBytes: compressed.sizeBytes,
    compressionVersion: compressed.compressionVersion,
    quality: compressed.quality,
    withinLimit: compressed.withinLimit
  };
}

export let fieldSyncState = { syncing: false, error: '' };
const publish = state => {
  fieldSyncState = { ...state, error: state.error || '' };
  window.dispatchEvent(new Event('unispect-field-sync'));
};
const synchronizer = createFieldSync({ queue: fieldQueue, remote: repository, upload: uploadFieldPhoto,
  isOnline: () => navigator.onLine, onState: publish, formatError: error => new Error(fieldErrorMessage(error)) });
let consumers = 0;
let timer;
let activeRun;
let wakeRequested = false;

export function syncFieldNow() {
  wakeRequested = true;
  if (activeRun) return activeRun;
  const drain = async () => {
    while (wakeRequested) {
      wakeRequested = false;
      await synchronizer.run();
    }
  };
  activeRun = (navigator.locks ? navigator.locks.request('unispect-field-sync', { ifAvailable: true }, lock => lock ? drain() : undefined) : drain())
    .catch(error => publish({ syncing: false, error: error.message }))
    .finally(() => { activeRun = undefined; });
  return activeRun;
}
const visible = () => { if (document.visibilityState === 'visible') syncFieldNow(); };
export function startFieldSynchronization() {
  if (++consumers === 1) {
    window.addEventListener('online', syncFieldNow);
    window.addEventListener('unispect-field-enqueued', syncFieldNow);
    document.addEventListener('visibilitychange', visible);
    timer = setInterval(syncFieldNow, 30000);
    syncFieldNow();
  }
  return () => {
    if (--consumers === 0) {
      clearInterval(timer);
      window.removeEventListener('online', syncFieldNow);
      window.removeEventListener('unispect-field-enqueued', syncFieldNow);
      document.removeEventListener('visibilitychange', visible);
    }
  };
}
