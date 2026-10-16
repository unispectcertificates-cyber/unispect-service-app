import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../src/utils/bookingConcurrent.js',import.meta.url),'utf8');
const {createConcurrentRepository}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function fixture(initial = {}){
 let booking={id:'b',bookingNumber:'BK1',certificateNumber:'UN1000/2026',_revision:1,containers:[{id:'a',notes:'',tara:'100',photos:[]},{id:'c',notes:'',photos:[]}],...initial};
 let version=0;
 const repository=createConcurrentRepository({reference:(collection,id)=>({collection,id}),transaction:async callback=>{
   for(let attempt=0;attempt<100;attempt++){
     const seen=version;const snapshot=structuredClone(booking);let update;
     const result=await callback({get:async()=>({exists:()=>true,data:()=>snapshot}),update:(_,value)=>{update=value;}});
     await Promise.resolve();
     if(seen!==version)continue;
     booking={...booking,...structuredClone(update)};version++;return result;
   }throw Error('Contention');
 }});
 return {repository,current:()=>structuredClone(booking)};
}
test('20 envios simultâneos preservam fotos dos dois containers e o cabeçalho',async()=>{
 const f=fixture();await Promise.all(Array.from({length:20},(_,i)=>f.repository.appendPhoto('b',i%2?'a':'c',{id:'p'+i,url:'https://example.test/'+i})));
 assert.equal(f.current().containers[0].photos.length,10);assert.equal(f.current().containers[1].photos.length,10);
 assert.equal(f.current().bookingNumber,'BK1');assert.equal(f.current().certificateNumber,'UN1000/2026');
});
test('campos distintos e foto no mesmo container se preservam',async()=>{
 const f=fixture();await Promise.all([f.repository.patchContainer('b','a',{notes:'OK'},{notes:''}),f.repository.patchContainer('b','a',{tara:'200'},{tara:'100'}),f.repository.appendPhoto('b','a',{id:'p'})]);
 assert.equal(f.current().containers[0].notes,'OK');assert.equal(f.current().containers[0].tara,'200');assert.equal(f.current().containers[0].photos[0].id,'p');
});
test('alteração incompatível do mesmo campo é recusada sem apagar a primeira',async()=>{
 const f=fixture();await f.repository.patchContainer('b','a',{notes:'A'},{notes:''});
 await assert.rejects(f.repository.patchContainer('b','a',{notes:'B'},{notes:''}),/outro usuário/);
 assert.equal(f.current().containers[0].notes,'A');
});
test('nova tentativa da mesma foto é idempotente e exclusão impede restauração',async()=>{
 const f=fixture();await f.repository.appendPhoto('b','a',{id:'p'});await f.repository.appendPhoto('b','a',{id:'p'});
 assert.equal(f.current().containers[0].photos.length,1);await f.repository.removePhoto('b','a','p');
 await assert.rejects(f.repository.appendPhoto('b','a',{id:'p'}),/excluída/);assert.equal(f.current().containers[0].photos.length,0);
});
test('container removido e substituição estrutural são recusados',async()=>{
 const f=fixture();await assert.rejects(f.repository.appendPhoto('b','missing',{id:'p'}),/não está mais/);
 await assert.rejects(f.repository.patchBooking('b',{containers:[]},{containers:[]}),/não permitido/);
 assert.equal(f.current().containers.length,2);
});
test('vínculo de foto localiza container por containerNumber ou id alternativo',async()=>{
 const f=fixture({
   containers: [
     { id: 'a', notes: '', tara: '100', photos: [] },
     { id: 'c', containerNumber: 'MSDU8821297', notes: '', photos: [] }
   ]
 });
 await f.repository.appendPhoto('b','MSDU8821297',{id:'p_by_num',url:'https://example.test/num'});
 assert.equal(f.current().containers[1].photos.length,1);
 assert.equal(f.current().containers[1].photos[0].id,'p_by_num');
});

