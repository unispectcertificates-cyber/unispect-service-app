import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
// Pequeno adaptador transacional: os cenários exercitam a fila, não o Firebase real.
const stores=new Map();let abortNext=false;
const database={createObjectStore(name){stores.set(name,new Map());},close(){},transaction(names){
 const changes=[];let pending=0;let ended=false;
 const tx={error:null,abort(){ended=true;setImmediate(()=>tx.onabort?.());},objectStore(name){
   const store=stores.get(name);
   const request=fn=>{const r={};pending++;setImmediate(()=>{if(ended)return;r.result=fn();r.onsuccess?.();pending--;finish();});return r;};
   return {get:id=>request(()=>structuredClone(store.get(id))),getAll:()=>request(()=>structuredClone([...store.values()])),
     put:value=>{changes.push(()=>store.set(value.id,structuredClone(value)));finish();},delete:id=>{changes.push(()=>store.delete(id));finish();}};
 }};
 function finish(){setImmediate(()=>{if(ended||pending)return;ended=true;if(abortNext){abortNext=false;tx.onabort?.();return;}changes.forEach(f=>f());tx.oncomplete?.();});}
 finish();return tx;
}};
let opened=false;
globalThis.indexedDB={open(){const r={};setImmediate(()=>{r.result=database;if(!opened){opened=true;r.onupgradeneeded?.();}r.onsuccess?.();});return r;}};
globalThis.window=new EventTarget();globalThis.document=new EventTarget();
Object.defineProperty(globalThis,'navigator',{value:{onLine:false,storage:{persist:async()=>true}},configurable:true});
let owner='one',uploads=0,active=0,maxActive=0,failLink=false;
globalThis.queueTestDb={getUser:()=>({id:owner}),uploadPhoto:async(blob,container,{photoId})=>{
 uploads++;active++;maxActive=Math.max(active,maxActive);await new Promise(r=>setTimeout(r,2));active--;return {id:photoId,url:'https://example.test/'+photoId};
},appendBookingPhoto:async()=>{if(failLink)throw Error('Conexão perdida no vínculo');return {id:'b',containers:[]};}};
let source=await fs.readFile(new URL('../src/utils/bookingPhotoQueue.js',import.meta.url),'utf8');
source=source.replace("import {db} from '../db';","const db=globalThis.queueTestDb;");
const q=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const photo=()=>new Blob(['pixels'],{type:'image/jpeg'});
test('captura offline é persistida; falha no vínculo mantém bytes e não repete upload confirmado',async()=>{
 await q.enqueueBookingPhotos('b','a',[photo()]);assert.equal(uploads,0);assert.equal((await q.listBookingPhotoJobs()).length,1);assert.equal(stores.get('blobs').size,1);
 failLink=true;navigator.onLine=true;await q.syncBookingPhotos();assert.equal(uploads,1);assert.equal(stores.get('blobs').size,1);
 assert.ok((await q.listBookingPhotoJobs())[0].photo);failLink=false;await q.retryBookingPhotos();
 assert.equal(uploads,1);assert.equal((await q.listBookingPhotoJobs()).length,0);assert.equal(stores.get('blobs').size,0);
});
test('falha de gravação local não inicia envio e não deixa registro parcial',async()=>{
 navigator.onLine=false;abortNext=true;await assert.rejects(q.enqueueBookingPhotos('b','a',[photo()]));assert.equal(stores.get('jobs').size,0);assert.equal(stores.get('blobs').size,0);
});
test('limite global de dois envios e isolamento da conta no mesmo aparelho',async()=>{
 owner='two';await q.enqueueBookingPhotos('b','a',[photo()]);owner='one';await q.enqueueBookingPhotos('b','a',[photo(),photo(),photo(),photo()]);
 navigator.onLine=true;await q.syncBookingPhotos();assert.equal(maxActive,2);assert.equal(stores.get('jobs').size,1);
 owner='two';await q.syncBookingPhotos();assert.equal(stores.get('jobs').size,0);
});
test('nova instância do aplicativo retoma uma captura persistida',async()=>{
 navigator.onLine=false;await q.enqueueBookingPhotos('b','a',[photo()]);
 const reopened=await import('data:text/javascript;base64,'+Buffer.from(source+'\n// Reabertura').toString('base64'));
 assert.equal((await reopened.listBookingPhotoJobs()).length,1);
 navigator.onLine=true;await reopened.syncBookingPhotos();assert.equal(stores.get('jobs').size,0);assert.equal(stores.get('blobs').size,0);
});
