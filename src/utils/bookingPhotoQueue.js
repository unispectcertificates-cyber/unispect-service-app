import {db} from '../db';

// Fila separada: não altera o esquema nem os registros da fila de campo existente.
let connection;
const listeners = new Set();
let running;
let timer;
let wakeAgain = false;
const localUrls = new Map();

export const photoQueueOwner = () => {
  const u = db.getUser?.();
  return String(u?.id || u?.login || u?.username || 'unispect_user');
};
const notify = () => window.dispatchEvent(new Event('unispect-booking-photo-queue'));

export function getLocalPhotoUrl(jobId) {
  return localUrls.get(jobId) || null;
}

function open() {
  if (!connection) connection = new Promise((resolve,reject) => {
    const req = indexedDB.open('unispect-booking-photo-outbox-v1', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('jobs', {keyPath:'id'});
      req.result.createObjectStore('blobs', {keyPath:'id'});
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Feche outras versões do aplicativo para abrir a fila de fotos.'));
    req.onsuccess = () => {
      req.result.onversionchange = () => { req.result.close(); connection = undefined; };
      resolve(req.result);
    };
  }).catch(e => {connection = undefined; throw e;});
  return connection;
}

async function transaction(stores, mode, action) {
  const database = await open();
  return new Promise((resolve,reject) => {
    const tx = database.transaction(stores,mode);
    let value;
    tx.oncomplete = () => resolve(value);
    tx.onabort = () => reject(tx.error || new Error('Não foi possível guardar a foto no aparelho. Verifique o espaço disponível.'));
    tx.onerror = () => {};
    try { action(tx, x => {value=x;}); } catch(e) {tx.abort();reject(e);}
  });
}

const get = (store,id) => transaction([store],'readonly',(tx,done) => {
  const req=tx.objectStore(store).get(id); req.onsuccess=()=>done(req.result);
});

export async function getPhotoBlob(jobId) {
  const local = await get('blobs', jobId);
  return local?.blob || null;
}

export async function listBookingPhotoJobs() {
  const owner=photoQueueOwner();
  return transaction(['jobs'],'readonly',(tx,done)=>{
    const req=tx.objectStore('jobs').getAll();
    req.onsuccess=()=>done(req.result.filter(j=>j.owner===owner).sort((a,b)=>a.createdAt-b.createdAt).map(j=>({
      ...j,
      localUrl: localUrls.get(j.id) || null
    })));
  });
}

export async function enqueueBookingPhotos(bookingId,containerId,files) {
  const owner=photoQueueOwner();
  if (!bookingId || !containerId) throw new Error('Selecione um container antes de fotografar.');
  const jobs=Array.from(files).map(file=>{
    const id='bookingphoto_'+crypto.randomUUID();
    let localUrl = null;
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && file instanceof Blob) {
      try {
        localUrl = URL.createObjectURL(file);
        localUrls.set(id, localUrl);
      } catch (err) {
        void err;
      }
    }
    return {
      id,
      owner,
      bookingId,
      containerId,
      file,
      localUrl,
      createdAt:Date.now(),
      attempts:0,
      nextAttempt:0,
      error:''
    };
  });
  if (!jobs.length || jobs.some(j=>!(j.file instanceof Blob) || !j.file.size)) throw new Error('Foto vazia ou inválida.');
  await transaction(['jobs','blobs'],'readwrite',tx=>{
    for(const job of jobs){
      const jobData = { ...job };
      delete jobData.file;
      delete jobData.localUrl;
      tx.objectStore('jobs').put(jobData);
      tx.objectStore('blobs').put({id:job.id,blob:job.file});
    }
  });
  notify();
  navigator.storage?.persist?.().catch(()=>{});
  void syncBookingPhotos().catch(()=>{});
  return jobs;
}

export async function cancelBookingPhoto(jobId) {
  const url = localUrls.get(jobId);
  if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try {
      URL.revokeObjectURL(url);
    } catch (err) {
      void err;
    }
  }
  localUrls.delete(jobId);
  try {
    await transaction(['jobs','blobs'],'readwrite',tx=>{
      tx.objectStore('jobs').delete(jobId);
      tx.objectStore('blobs').delete(jobId);
    });
    notify();
  } catch (err) {
    console.warn('cancelBookingPhoto error:', err);
  }
}

async function saveJob(job) {
  await transaction(['jobs'],'readwrite',tx=>tx.objectStore('jobs').put(job)); notify();
}

async function processJob(job) {
  try {
    if (photoQueueOwner()!==job.owner) return;
    let photo=job.photo;
    if (!photo) {
      const local=await get('blobs',job.id);
      if (!local?.blob?.size) throw new Error('Foto local não encontrada. O registro foi mantido para revisão.');
      photo=await db.uploadPhoto(local.blob,job.containerId,{photoId:job.id});
      job={...job,photo};
      await saveJob(job); // Upload confirmado: retentar vínculo não reenvia o arquivo.
    }
    if (photoQueueOwner()!==job.owner) return;
    const booking=await db.appendBookingPhoto(job.bookingId,job.containerId,photo);
    // Só remove os bytes locais depois de confirmar upload E vínculo remoto.
    await transaction(['jobs','blobs'],'readwrite',tx=>{
      tx.objectStore('jobs').delete(job.id);tx.objectStore('blobs').delete(job.id);
    });
    const url = localUrls.get(job.id);
    if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(url);
      } catch (err) {
        void err;
      }
    }
    localUrls.delete(job.id);
    window.dispatchEvent(new CustomEvent('unispect-booking-photo-saved',{detail:{booking,containerId:job.containerId,photoId:job.id}}));
    notify();
  } catch(e) {
    const attempts=job.attempts+1;
    await saveJob({...job,attempts,error:e.message || String(e),nextAttempt:Date.now()+Math.min(300000,5000*2**Math.min(attempts-1,6))});
  }
}

export function syncBookingPhotos() {
  if(running){wakeAgain=true;return running;}
  const drain=async()=>{
    do {
      wakeAgain=false;
      if(!navigator.onLine || !photoQueueOwner())return;
      const jobs=(await listBookingPhotoJobs()).filter(j=>j.nextAttempt<=Date.now());
      let index=0;
      // Dois trabalhadores no total por aparelho, inclusive entre containers.
      await Promise.all([0,1].map(async()=>{while(index<jobs.length && navigator.onLine){const job=jobs[index++];await processJob(job);}}));
    }while(wakeAgain);
  };
  running=(navigator.locks ? navigator.locks.request('unispect-booking-photo-upload',{ifAvailable:true},lock=>lock?drain():undefined) : drain())
    .finally(()=>{running=undefined;});
  return running;
}

export async function retryBookingPhotos() {
  for(const job of await listBookingPhotoJobs())await saveJob({...job,nextAttempt:0});
  return syncBookingPhotos();
}

export function startBookingPhotoQueue() {
  if(timer)return;
  const wake=()=>void syncBookingPhotos().catch(e=>console.error('Fila de fotos:',e));
  const onReconnect=()=>{
    void retryBookingPhotos().catch(e=>console.error('Fila de fotos (reconexão):',e));
  };
  listeners.add(wake);
  listeners.add(onReconnect);
  window.addEventListener('online',onReconnect);
  document.addEventListener('visibilitychange',()=>{
    if (document.visibilityState === 'visible') onReconnect();
    else wake();
  });
  timer=setInterval(wake,10000);
  wake();
}
