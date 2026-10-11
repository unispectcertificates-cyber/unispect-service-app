import test from 'node:test';
import assert from 'node:assert/strict';
import { createFieldRepository, validateFieldCapture, findFieldTarget, attachFieldContainer, attachPendingFields } from '../src/utils/fieldContainers.js';
import { createBookingRepository, planImport, previewToken } from '../src/utils/bookingImport.js';
import { createFieldSync } from '../src/utils/fieldQueue.js';

const number = 'ABCU0000001';
const fields = { containerNumber: number, tara: '3800', sealType: 'definitive', sealNumber: 'SEAL1' };
const operation = (id = 'op1') => ({ id, number, fields, sourceContainerId: 'field-identity', actor: { id: 'inspector', name: 'Inspector' }, createdAt: 1000, photoIds: ['p1'], uploaded: {} });
const photo = id => ({ id, url: `https://example.test/${id}`, storagePath: `containers/field/${id}.jpg`, name: '' });
const container = { id: 'existing', containerNumber: number, tara: '4000', definiteSeal: 'OLD', photos: [photo('old')], status: 'Pendente' };
const booking = (containers = [container]) => ({ id: 'booking', bookingNumber: 'BK123', containers, status: 'Em andamento', exporterId: 'e', locationId: 'l', certificateNumber: 'UN1000/2026' });

function harness(seed = {}) {
  const data = new Map(Object.entries(structuredClone(seed)));
  const versions = new Map(); let serial = 0; let fail = false;
  const adapter = {
    listBookings: async () => [...data].filter(([key]) => key.startsWith('bookings/')).map(([, value]) => structuredClone(value)),
    reference: (col, id) => `${col}/${id}`, newId: prefix => `${prefix}_${++serial}`, now: () => Date.UTC(2026, 9, 11),
    transaction: async callback => {
      for (let i = 0; i < 10; i++) {
        const reads = new Map(), writes = [];
        const result = await callback({
          get: async key => {
            assert.equal(writes.length, 0, 'read after write'); reads.set(key, versions.get(key) || 0);
            const value = structuredClone(data.get(key)); return { exists: () => value !== undefined, data: () => value };
          },
          set: (key, value) => writes.push({ key, value: structuredClone(value) }),
          update: (key, value) => writes.push({ key, value: { ...structuredClone(data.get(key)), ...structuredClone(value) } }),
          delete: key => writes.push({ key, remove: true })
        });
        if ([...reads].some(([key, version]) => (versions.get(key) || 0) !== version)) continue;
        if (fail) throw new Error('simulated transaction failure');
        for (const write of writes) {
          if (write.remove) data.delete(write.key); else data.set(write.key, write.value);
          versions.set(write.key, (versions.get(write.key) || 0) + 1);
        }
        return result;
      }
      throw new Error('retries exhausted');
    }
  };
  return { data, field: createFieldRepository(adapter), bookings: createBookingRepository(adapter), fail: () => { fail = true; } };
}

test('number, tara, seal and a new photo are required', () => {
  assert.deepEqual(validateFieldCapture({ ...fields, containerNumber: 'abcu-000000-1', tara: '3800,5' }, 1), { ...fields, tara: '3800.5' });
  for (const input of [{ ...fields, containerNumber: 'invalid' }, { ...fields, tara: '' }, { ...fields, tara: '-1' }, { ...fields, tara: 'NaN' }, { ...fields, sealNumber: '' }, { ...fields, sealType: 'invalid' }])
    assert.throws(() => validateFieldCapture(input, 1));
  assert.throws(() => validateFieldCapture(fields, 0), /foto/);
});

test('pending capture saves fields, photographs and inspection identity once', async () => {
  const h = harness();
  await h.field.prepare(operation());
  const result = await h.field.complete(operation(), [photo('p1')]);
  assert.equal(result.status, 'pending');
  const record = h.data.get(`fieldContainers/${number}`);
  assert.equal(record.container.tara, '3800');
  assert.equal(record.container.definiteSeal, 'SEAL1');
  assert.equal(record.container.fieldCapture.actor.id, 'inspector');
  assert.equal(record.container.photos.length, 1);
  await h.field.complete(operation(), [photo('p1')]);
  assert.equal(h.data.get(`fieldContainers/${number}`).container.photos.length, 1);
});

test('two offline inspectors converge to one pending identity without losing photos', async () => {
  const h = harness();
  const first = operation('first'); const second = { ...operation('second'), sourceContainerId: 'another-local-id' };
  await Promise.all([h.field.prepare(first), h.field.prepare(second)]);
  await Promise.all([h.field.complete(first, [photo('p1')]), h.field.complete(second, [photo('p2')])]);
  assert.equal([...h.data.keys()].filter(key => key.startsWith('fieldContainers/')).length, 1);
  const record = h.data.get(`fieldContainers/${number}`);
  assert.equal(record.container.photos.length, 2);
  assert.equal(new Set(record.container.photos.map(p => p.id)).size, 2);
  assert.equal(h.data.get('containerPhotos/p1').containerId, h.data.get('containerPhotos/p2').containerId);
});

test('new romaneio automatically adopts the field ID, measured fields and photos', async () => {
  const h = harness();
  await h.field.prepare(operation()); await h.field.complete(operation(), [photo('p1')]);
  const incoming = { bookingNumber: 'NEW', exporterId: 'e', locationId: 'l', containers: [{ ...container, id: 'parser', tara: '9999', definiteSeal: 'PDF', photos: [] }] };
  const result = await h.bookings.importBooking(incoming, { expectedPreview: previewToken(null, planImport(null, incoming.containers)) });
  const saved = result.booking.containers[0];
  assert.equal(saved.id, 'field-identity'); assert.equal(saved.tara, '3800'); assert.equal(saved.definiteSeal, 'SEAL1');
  assert.equal(saved.photos[0].id, 'p1'); assert.equal(result.fieldLinkedCount, 1);
  assert.equal(h.data.get(`fieldContainers/${number}`).status, 'linked');
  assert.equal(h.data.get(`fieldContainers/${number}`).bookingId, result.booking.id);
  assert.equal(h.data.get(`bookingImports/${result.operationId}`).fieldLinked.length, 1);
});

test('incremental import links to an existing container without overwriting inspection data', async () => {
  const old = booking(); const h = harness({ 'bookings/booking': old });
  // Capture first, simulate pre-existing pending record by leaving the uploaded capture unlinked.
  const prepared = await h.field.prepare(operation());
  h.data.set(`fieldContainers/${number}`, { ...prepared.record, container: { ...prepared.record.container, photos: [photo('p1')] } });
  const incoming = { ...old, containers: [container] };
  const result = await h.bookings.importBooking(incoming, { expectedPreview: previewToken(old, planImport(old, incoming.containers)) });
  const saved = result.booking.containers[0];
  assert.equal(saved.id, 'existing'); assert.equal(saved.tara, '4000'); assert.equal(saved.definiteSeal, 'OLD');
  assert.deepEqual(saved.photos.map(p => p.id), ['old', 'p1']);
  assert.equal(saved.fieldCaptureConflicts.length, 2);
  assert.equal(result.booking._revision, 1);
});

test('romaneio during upload: late photos go directly to the newly linked Booking', async () => {
  const h = harness(); await h.field.prepare(operation());
  const incoming = { bookingNumber: 'NEW', exporterId: 'e', locationId: 'l', containers: [{ ...container, photos: [] }] };
  const result = await h.bookings.importBooking(incoming, { expectedPreview: previewToken(null, planImport(null, incoming.containers)) });
  await h.field.complete(operation(), [photo('p1')]);
  assert.equal(h.data.get(`bookings/${result.booking.id}`).containers[0].photos[0].id, 'p1');
  assert.equal(h.data.get(`fieldContainers/${number}`).status, 'linked');
});

test('offline capture synced after romaneio finds the already existing Booking', async () => {
  const h = harness({ 'bookings/booking': booking([{ ...container, tara: '', definiteSeal: '', photos: [] }]) });
  await h.field.prepare(operation()); const result = await h.field.complete(operation(), [photo('p1')]);
  assert.equal(result.status, 'linked'); assert.equal(result.linkedContainerId, 'existing');
  assert.equal(h.data.get('bookings/booking').containers[0].tara, '3800');
  assert.equal(h.data.get('bookings/booking').containers[0].photos.length, 1);
});

test('more photographs after linking append without creating another container', async () => {
  const h = harness({ 'bookings/booking': booking() });
  await h.field.prepare(operation()); await h.field.complete(operation(), [photo('p1')]);
  const extra = operation('op2'); await h.field.prepare(extra); await h.field.complete(extra, [photo('p2')]);
  const saved = h.data.get('bookings/booking');
  assert.equal(saved.containers.length, 1); assert.deepEqual(saved.containers[0].photos.map(p => p.id), ['old', 'p1', 'p2']);
});

test('ambiguous active Bookings block association; finalised Bookings never claim pending captures', async () => {
  assert.throws(() => findFieldTarget([booking(), { ...booking(), id: 'other' }], number), /mais de um/);
  assert.equal(findFieldTarget([{ ...booking(), status: 'Finalizado' }], number), null);
  const h = harness({ 'bookings/booking': booking(), 'bookings/other': { ...booking(), id: 'other' } });
  await h.field.prepare(operation());
  await assert.rejects(h.field.complete(operation(), [photo('p1')]), /mais de um/);
  assert.equal(h.data.has('fieldOperations/op1'), false);
});

test('a linked Booking finalised during upload blocks commit and preserves the operation', async () => {
  const h = harness({ 'bookings/booking': booking() });
  await h.field.prepare(operation()); await h.field.complete(operation(), [photo('p1')]);
  h.data.set('bookings/booking', { ...h.data.get('bookings/booking'), status: 'Finalizado' });
  const extra = operation('op2'); await h.field.prepare(extra);
  await assert.rejects(h.field.complete(extra, [photo('p2')]), /finalizado/);
  assert.equal(h.data.has('fieldOperations/op2'), false);
});

test('failure of import leaves both pending ownership and Booking unchanged', async () => {
  const h = harness({ 'bookings/booking': booking() }); await h.field.prepare(operation());
  h.fail();
  const incoming = booking();
  await assert.rejects(h.bookings.importBooking(incoming, { expectedPreview: previewToken(incoming, planImport(incoming, incoming.containers)) }), /simulated/);
  assert.equal(h.data.get(`fieldContainers/${number}`).status, 'pending');
  assert.deepEqual(h.data.get('bookings/booking'), incoming);
});

test('pure attachment leaves source unchanged and preserves provisional seals', () => {
  const record = { sourceContainerId: 'field', container: { ...container, provisionalSeals: ['NEW'], photos: [photo('p1')] } };
  const target = { ...container, provisionalSeals: ['OLD'] }; const before = structuredClone(record);
  const result = attachFieldContainer(target, record);
  assert.deepEqual(result.provisionalSeals, ['OLD', 'NEW']); assert.deepEqual(record, before);
  const attached = attachPendingFields(booking(), new Map([[number, { ...record, status: 'linked' }]]));
  assert.deepEqual(attached.booking, booking());
});

test('deleting a field photo clears its source so future uploads cannot restore it', async () => {
  const h = harness(); await h.field.prepare(operation()); await h.field.complete(operation(), [photo('p1')]);
  assert.equal(await h.field.removePhotoMetadata('p1'), photo('p1').storagePath);
  assert.equal(h.data.has('containerPhotos/p1'), false);
  assert.equal(h.data.get(`fieldContainers/${number}`).container.photos.length, 0);
  const next = operation('op2'); await h.field.prepare(next); await h.field.complete(next, [photo('p2')]);
  assert.deepEqual(h.data.get(`fieldContainers/${number}`).container.photos.map(p => p.id), ['p2']);
});

test('object and string representations do not duplicate the same provisional seal', () => {
  const result = attachFieldContainer({ ...container, provisionalSeals: [{ sealNumber: 'S1' }] }, {
    sourceContainerId: 'field', container: { ...container, provisionalSeals: ['s1', 'S2'] }
  });
  assert.deepEqual(result.provisionalSeals, [{ sealNumber: 'S1' }, 'S2']);
});

function fakeQueue() {
  const jobs = new Map([['op1', { ...operation(), uploaded: {} }]]);
  let acknowledged = 0, failures = 0;
  return { jobs, stats: () => ({ acknowledged, failures }),
    listOperations: async () => structuredClone([...jobs.values()]), getPhoto: async id => ({ id, blob: new Blob(['photo']) }),
    checkpoint: async (id, p) => { jobs.get(id).uploaded[p.id] = p; },
    acknowledge: async op => { jobs.delete(op.id); acknowledged++; },
    fail: async () => { failures++; }
  };
}

test('offline worker keeps the queue and makes zero network calls', async () => {
  const queue = fakeQueue(); let calls = 0;
  const runner = createFieldSync({ queue, isOnline: () => false, remote: { prepare: () => { calls++; } }, upload: () => { calls++; } });
  await runner.run(); assert.equal(calls, 0); assert.equal(queue.jobs.size, 1);
});

test('failed remote commit retries using the uploaded checkpoint and stable operation ID', async () => {
  const queue = fakeQueue(); let uploads = 0, completes = 0;
  const runner = createFieldSync({ queue, remote: {
    prepare: async () => ({ record: {} }),
    complete: async () => { if (++completes === 1) throw new Error('lost signal'); return { photos: [photo('p1')] }; }
  }, upload: async () => { uploads++; return photo('p1'); } });
  await runner.run(); assert.equal(queue.jobs.size, 1);
  await runner.run(); assert.equal(uploads, 1); assert.equal(queue.jobs.size, 0);
  assert.deepEqual(queue.stats(), { failures: 1, acknowledged: 1 });
});

test('acknowledgement lost after cloud commit is recovered without a second upload', async () => {
  const queue = fakeQueue(); let uploads = 0;
  const runner = createFieldSync({ queue, remote: { prepare: async () => ({ completed: true, result: { photos: [photo('p1')] } }) }, upload: () => { uploads++; } });
  await runner.run(); assert.equal(uploads, 0); assert.equal(queue.jobs.size, 0);
});

test('exclusão de container sem Booking permitida para criador e ADM, bloqueada para outro inspetor', async () => {
  const h = harness();
  const creator = { id: 'insp_1', name: 'Carlos', role: 'Inspector' };
  const otherInspector = { id: 'insp_2', name: 'Marcos', role: 'Inspector' };
  const adm = { id: 'adm_1', name: 'Admin', role: 'ADM' };

  await h.field.prepare({ ...operation('op1'), actor: creator });
  await h.field.complete({ ...operation('op1'), actor: creator }, [photo('p1'), photo('p2')]);
  assert.ok(h.data.has(`fieldContainers/${number}`));
  assert.ok(h.data.has('containerPhotos/p1'));
  assert.ok(h.data.has('containerPhotos/p2'));

  // Outro inspetor tenta excluir -> deve falhar
  await assert.rejects(
    () => h.field.deleteFieldContainer(number, otherInspector),
    /Permissão negada/
  );
  assert.ok(h.data.has(`fieldContainers/${number}`));

  // Criador exclui com sucesso
  const delRes = await h.field.deleteFieldContainer(number, creator);
  assert.equal(delRes.success, true);
  assert.equal(delRes.photosToDelete.length, 2);
  assert.equal(h.data.has(`fieldContainers/${number}`), false);
  assert.equal(h.data.has('containerPhotos/p1'), false);
  assert.equal(h.data.has('containerPhotos/p2'), false);

  // Histórico de exclusão registrado com autor e data
  const delRecord = h.data.get('fieldContainerDeletions/field-identity');
  assert.ok(delRecord);
  assert.equal(delRecord.containerNumber, number);
  assert.equal(delRecord.deletedBy.name, 'Carlos');
  assert.equal(delRecord.photoCount, 2);

  // Recadastro e exclusão por ADM
  await h.field.prepare({ ...operation('op2'), sourceContainerId: 'field-identity-2', actor: creator });
  await h.field.complete({ ...operation('op2'), sourceContainerId: 'field-identity-2', actor: creator }, [photo('p3')]);
  assert.ok(h.data.has(`fieldContainers/${number}`));

  const admDelRes = await h.field.deleteFieldContainer(number, adm);
  assert.equal(admDelRes.success, true);
  assert.equal(h.data.has(`fieldContainers/${number}`), false);
  assert.equal(h.data.has('containerPhotos/p3'), false);
});

test('exclusão é bloqueada atomicamente se container já foi vinculado ao Booking', async () => {
  const h = harness();
  const creator = { id: 'insp_1', name: 'Carlos', role: 'Inspector' };
  const adm = { id: 'adm_1', name: 'Admin', role: 'ADM' };

  await h.field.prepare({ ...operation('op1'), actor: creator });
  await h.field.complete({ ...operation('op1'), actor: creator }, [photo('p1')]);

  // Vincula ao Booking (simulando importação de romaneio)
  const bookingData = booking();
  h.data.set('bookings/booking', bookingData);
  const rec = h.data.get(`fieldContainers/${number}`);
  rec.status = 'linked';
  rec.bookingId = 'BK-2026-XYZ';
  h.data.set(`fieldContainers/${number}`, rec);

  // Tentativa de exclusão deve ser bloqueada informando o Booking
  await assert.rejects(
    () => h.field.deleteFieldContainer(number, adm),
    /já foi vinculado ao Booking BK-2026-XYZ/
  );
  // O container e as fotos continuam intactos
  assert.ok(h.data.has(`fieldContainers/${number}`));
  assert.ok(h.data.has('containerPhotos/p1'));
});

test('envios antigos de outros aparelhos não recriam container excluído, mas novo cadastro intencional é aceito', async () => {
  const h = harness();
  const creator = { id: 'insp_1', name: 'Carlos', role: 'Inspector' };
  const adm = { id: 'adm_1', name: 'Admin', role: 'ADM' };

  // Aparelho 1 cadastra e sincroniza
  await h.field.prepare({ ...operation('op1'), sourceContainerId: 'identity-v1', actor: creator });
  await h.field.complete({ ...operation('op1'), sourceContainerId: 'identity-v1', actor: creator }, [photo('p1')]);

  // Admin exclui o container
  await h.field.deleteFieldContainer(number, adm);
  assert.equal(h.data.has(`fieldContainers/${number}`), false);

  // Aparelho 2 (estava offline com a mesma identity-v1) tenta sincronizar atrasado
  const stalePrepare = await h.field.prepare({ ...operation('op-stale'), sourceContainerId: 'identity-v1', actor: creator });
  assert.equal(stalePrepare.completed, true);
  assert.equal(stalePrepare.result.discarded, true);
  // Não recriou o fieldContainer
  assert.equal(h.data.has(`fieldContainers/${number}`), false);

  const staleComplete = await h.field.complete({ ...operation('op-stale'), sourceContainerId: 'identity-v1', actor: creator }, [photo('p_stale')]);
  assert.equal(staleComplete.discarded, true);
  assert.equal(h.data.has(`fieldContainers/${number}`), false);

  // Novo cadastro intencional do mesmo número (gera nova identity)
  const freshPrepare = await h.field.prepare({ ...operation('op-fresh'), sourceContainerId: 'identity-v2', actor: creator });
  assert.equal(freshPrepare.completed, false);
  const freshComplete = await h.field.complete({ ...operation('op-fresh'), sourceContainerId: 'identity-v2', actor: creator }, [photo('p_fresh')]);
  assert.equal(freshComplete.status, 'pending');
  assert.equal(h.data.has(`fieldContainers/${number}`), true);
  assert.equal(h.data.get(`fieldContainers/${number}`).sourceContainerId, 'identity-v2');
});

test('sincronizador executa operação de exclusão offline com sucesso', async () => {
  let deletedNumber = null;
  const deleteOp = { id: 'del_1', type: 'delete', number, sourceContainerId: 'id1', actor: { id: 'adm', role: 'ADM' } };
  const jobs = new Map([['del_1', deleteOp]]);
  let acknowledged = 0;
  const queue = {
    listOperations: async () => [...jobs.values()],
    acknowledgeDeletion: async op => { jobs.delete(op.id); acknowledged++; },
    fail: async () => {}
  };
  const runner = createFieldSync({
    queue,
    isOnline: () => true,
    remote: {
      deleteFieldContainer: async (num, act) => { deletedNumber = num; return { success: true }; }
    },
    upload: async () => {}
  });

  await runner.run();
  assert.equal(deletedNumber, number);
  assert.equal(acknowledged, 1);
  assert.equal(jobs.size, 0);
});

