import {db} from '../db';

// Fila separada: não altera o esquema nem os registros da fila de campo existente.
let connection;
const listeners = new Set();
let running;
let timer;
let wakeAgain = false;
export const photoQueueOwner = () => String(db.getUser()?.id || db.getUser()?.login || '');
const notify = () => window.dispatchEvent(new Event('unispect-booking-photo-queue'));
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
export async function listBookingPhotoJobs() {
  const owner=photoQueueOwner();
  return transaction(['jobs'],'readonly',(tx,done)=>{
    const req=tx.objectStore('jobs').getAll();
    req.onsuccess=()=>done(req.result.filter(j=>j.owner===owner).sort((a,b)=>a.createdAt-b.createdAt));
  });
}
export async function enqueueBookingPhotos(bookingId,containerId,files) {
  const owner=photoQueueOwner();
  if (!owner || !bookingId || !containerId) throw new Error('Entre no sistema e selecione um container antes de fotografar.');
  const jobs=Array.from(files).map(file=>({id:'bookingphoto_'+crypto.randomUUID(),owner,bookingId,containerId,
    file,createdAt:Date.now(),attempts:0,nextAttempt:0,error:''}));
  if (!jobs.length || jobs.some(j=>!(j.file instanceof Blob) || !j.file.size)) throw new Error('Foto vazia ou inválida.');
  await transaction(['jobs','blobs'],'readwrite',tx=>{
    for(const {file,...job} of jobs){tx.objectStore('jobs').put(job);tx.objectStore('blobs').put({id:job.id,blob:file});}
  });
  notify();
  navigator.storage?.persist?.().catch(()=>{});
  void syncBookingPhotos().catch(()=>{});
  return jobs.length;
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
    window.dispatchEvent(new CustomEvent('unispect-booking-photo-saved',{detail:{booking,containerId:job.containerId}}));
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
  listeners.add(wake);
  window.addEventListener('online',wake);
  document.addEventListener('visibilitychange',wake);
  timer=setInterval(wake,15000);
  wake();
}
