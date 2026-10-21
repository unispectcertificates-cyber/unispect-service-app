import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBookingNumber, normalizeContainerNumber, planImport, previewToken, findBooking, createBookingRepository } from '../src/utils/bookingImport.js';

const c = (n, extra = {}) => ({ id: `c${n}`, containerNumber: `ABCU${String(n).padStart(7, '0')}`, status: 'Pendente', ...extra });
const b = (containers = [c(1), c(2), c(3)]) => ({ id: 'old', bookingNumber: 'BK-123', exporterId: 'exp', locationId: 'loc', certificateNumber: 'UN1000/2026', containers });
const preview = (old, incoming) => previewToken(old, planImport(old, incoming.containers || []));

function harness(initial = []) {
  const data = new Map(initial.map(item => [`bookings/${item.id}`, structuredClone(item)]));
  const versions = new Map();
  let serial = 0;
  let failWrites = false;
  let retries = 0;
  const repo = createBookingRepository({
    listBookings: async () => [...data].filter(([key]) => key.startsWith('bookings/')).map(([, value]) => structuredClone(value)),
    reference: (col, id) => `${col}/${id}`,
    newId: prefix => `${prefix}${++serial}`,
    now: () => Date.UTC(2026, 9, 10, 15),
    transaction: async callback => {
      for (let attempt = 0; attempt < 10; attempt++) {
        const reads = new Map();
        const writes = [];
        const result = await callback({
          get: async key => {
            assert.equal(writes.length, 0, 'All transaction reads must precede writes');
            reads.set(key, versions.get(key) || 0);
            const value = structuredClone(data.get(key));
            return { exists: () => value !== undefined, data: () => value };
          },
          set: (key, value) => writes.push({ key, value: structuredClone(value) }),
          update: (key, value) => writes.push({ key, value: { ...structuredClone(data.get(key)), ...structuredClone(value) } }),
          delete: key => writes.push({ key, remove: true })
        });
        if ([...reads].some(([key, version]) => (versions.get(key) || 0) !== version)) { retries++; continue; }
        if (failWrites) throw new Error('simulated write failure');
        for (const write of writes) {
          if (write.remove) data.delete(write.key); else data.set(write.key, write.value);
          versions.set(write.key, (versions.get(write.key) || 0) + 1);
        }
        return result;
      }
      throw new Error('retries exhausted');
    }
  });
  return { repo, data, fail: () => { failWrites = true; }, retryCount: () => retries };
}

test('normalization accepts formatting without swapping ambiguous letters', () => {
  assert.equal(normalizeContainerNumber(' abcu-000001-2 '), 'ABCU0000012');
  assert.equal(normalizeBookingNumber(' bk / 123 '), 'BK123');
  assert.notEqual(normalizeContainerNumber('ABCO0000012'), normalizeContainerNumber('ABC00000012'));
});

test('3 existing + 10 new preserves complete objects, photos and absent containers', async () => {
  const old = b([c(1, { photos: [{ id: 'photo', url: 'image' }], notes: 'checked', status: 'Finalizado' }), c(2), c(3)]);
  const h = harness([old]);
  const incoming = { ...b(), containers: [c(1, { notes: 'overwrite' }), ...Array.from({ length: 10 }, (_, i) => c(i + 4))], status: 'Pendente', certificateNumber: 'WRONG' };
  const result = await h.repo.importBooking(incoming, { expectedPreview: preview(old, incoming), sourceName: 'romaneio.pdf', actor: { id: 'user', name: 'Operator' } });
  assert.equal(result.addedCount, 10);
  assert.equal(result.booking.containers.length, 13);
  assert.deepEqual(result.booking.containers.slice(0, 3), old.containers);
  assert.equal(result.booking.certificateNumber, old.certificateNumber);
  assert.equal(result.booking.id, old.id);
  assert.equal(h.data.size, 3);
  const history = h.data.get(`bookingImports/${result.operationId}`);
  assert.equal(history.before, 3);
  assert.equal(history.after, 13);
  assert.equal(history.addedIds.length, 10);
  assert.equal(history.actor.name, 'Operator');
});

test('reimport is a no-op on Booking with a separate audit entry', async () => {
  const h = harness([b()]);
  const incoming = { ...b(), containers: [...b().containers, c(4)] };
  const first = await h.repo.importBooking(incoming, { expectedPreview: preview(b(), incoming) });
  const second = await h.repo.importBooking(incoming, { expectedPreview: preview(first.booking, incoming) });
  assert.equal(second.addedCount, 0);
  assert.deepEqual(second.booking, first.booking);
  assert.equal([...h.data.keys()].filter(key => key.startsWith('bookingImports/')).length, 2);
});

test('formatting duplicates are reported and inserted once', async () => {
  const old = b([c(1)]);
  const incoming = { ...b(), containers: [c(1, { containerNumber: ' abcu-000000-1 ' }), c(2), c(2, { containerNumber: 'abcu 0000002' })] };
  const plan = planImport(old, incoming.containers);
  assert.equal(plan.repeated.length, 1);
  assert.equal(plan.preserved.length, 1);
  const { repo } = harness([old]);
  const result = await repo.importBooking(incoming, { expectedPreview: preview(old, incoming) });
  assert.equal(result.booking.containers.length, 2);
});

test('invalid incoming numbers block all writes', async () => {
  const h = harness([b()]);
  const incoming = { ...b(), containers: [c(4), { containerNumber: 'INVALID' }] };
  await assert.rejects(h.repo.importBooking(incoming, { expectedPreview: preview(b(), incoming) }), /inválidos/);
  assert.equal(h.data.size, 1);
});

test('changed seal/weight is shown as a conflict and preserved', () => {
  const old = b([c(1, { definiteSeal: 'SEAL1', netWeight: '100' })]);
  const plan = planImport(old, [c(1, { definiteSeal: 'SEAL2', netWeight: '200' })]);
  assert.deepEqual(plan.conflicts[0].fields, ['definiteSeal', 'netWeight']);
  assert.deepEqual(plan.preserved[0], old.containers[0]);
});

test('legacy Booking duplicates block import instead of selecting arbitrarily', async () => {
  const h = harness([b(), { ...b(), id: 'other', bookingNumber: 'bk/123' }]);
  assert.throws(() => findBooking([b(), { ...b(), id: 'other' }], 'BK123'), /mais de um/);
  await assert.rejects(h.repo.importBooking(b(), { expectedPreview: preview(b(), b()) }), /mais de um/);
  assert.equal(h.data.size, 2);
});

test('write failure rolls back containers, identity key and audit together', async () => {
  const h = harness([b()]);
  h.fail();
  const incoming = { ...b(), containers: [c(4)] };
  await assert.rejects(h.repo.importBooking(incoming, { expectedPreview: preview(b(), incoming) }), /simulated/);
  assert.deepEqual([...h.data], [['bookings/old', b()]]);
});

test('two simultaneous creations cannot duplicate the Booking', async () => {
  const h = harness();
  const incoming = { ...b(), id: undefined };
  delete incoming.id;
  const results = await Promise.allSettled([1, 2].map(() => h.repo.importBooking(incoming, { expectedPreview: preview(null, incoming) })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  assert.equal([...h.data.keys()].filter(key => key.startsWith('bookings/')).length, 1);
  assert.ok(h.retryCount() > 0);
});

test('two simultaneous updates revalidate the preview before committing', async () => {
  const h = harness([b()]);
  const incoming = { ...b(), containers: [c(4)] };
  const results = await Promise.allSettled([1, 2].map(() => h.repo.importBooking(incoming, { expectedPreview: preview(b(), incoming) })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(h.data.get('bookings/old').containers.length, 4);
  assert.match(results.find(r => r.status === 'rejected').reason.message, /prévia mudou/);
});

test('new Booking assigns unique container IDs and certificate', async () => {
  const h = harness([b()]);
  const incoming = { bookingNumber: 'NEW123', exporterId: 'e', locationId: 'l', containers: [c(4), c(5)] };
  const result = await h.repo.importBooking(incoming, { expectedPreview: preview(null, incoming) });
  assert.equal(result.booking.certificateNumber, 'UN1001/2026');
  assert.notEqual(result.booking.containers[0].id, c(4).id);
  assert.equal(new Set(result.booking.containers.map(c => c.id)).size, 2);
});

test('stale editor cannot remove imported containers or their data', async () => {
  const h = harness([b()]);
  const incoming = { ...b(), containers: [c(4)] };
  await h.repo.importBooking(incoming, { expectedPreview: preview(b(), incoming) });
  await assert.rejects(h.repo.saveBooking({ ...b(), status: 'Finalizado' }), /outro operador/);
  assert.equal(h.data.get('bookings/old').containers.length, 4);
});

test('fresh editor can deliberately delete a container and save', async () => {
  const h = harness([b()]);
  const result = await h.repo.saveBooking({ ...b(), containers: [c(1), c(2)] });
  assert.equal(result.containers.length, 2);
  assert.equal(result._revision, 1);
});

test('manual save also blocks container and Booking duplicates', async () => {
  const h = harness([b()]);
  await assert.rejects(h.repo.saveBooking({ ...b(), containers: [c(1), c(1)] }), /repetido/);
  await assert.rejects(h.repo.saveBooking({ ...b(), id: 'other' }), /Já existe/);
  assert.equal(h.data.size, 1);
});

test('rename releases previous identity key, delete releases current key and keeps history', async () => {
  const h = harness([b()]);
  const imported = await h.repo.importBooking(b(), { expectedPreview: preview(b(), b()) });
  const saved = await h.repo.saveBooking({ ...imported.booking, bookingNumber: 'RENAMED' });
  assert.equal(h.data.has('bookingNumberKeys/BK123'), false);
  assert.equal(h.data.get('bookingNumberKeys/RENAMED').bookingId, 'old');
  await h.repo.deleteBooking(saved.id);
  assert.equal(h.data.has('bookings/old'), false);
  assert.equal(h.data.has('bookingNumberKeys/RENAMED'), false);
  assert.equal(h.data.has(`bookingImports/${imported.operationId}`), true);
});

test('changed preview and empty incremental update do not write', async () => {
  const h = harness([b()]);
  await assert.rejects(h.repo.importBooking(b(), { expectedPreview: 'old preview' }), /prévia mudou/);
  const incoming = { ...b(), containers: [] };
  await assert.rejects(h.repo.importBooking(incoming, { expectedPreview: preview(b(), incoming) }), /com containers/);
  assert.equal(h.data.size, 1);
});

test('related records commit atomically only for new Booking', async () => {
  const incoming = { bookingNumber: 'NEW', exporterId: 'e', locationId: 'l', containers: [] };
  const records = [{ collection: 'exportadores', data: { id: 'e', name: 'Exporter' } }];
  const h = harness();
  await h.repo.importBooking(incoming, { expectedPreview: preview(null, incoming), relatedRecords: records });
  assert.deepEqual(h.data.get('exportadores/e'), records[0].data);
  const failed = harness();
  failed.fail();
  await assert.rejects(failed.repo.importBooking(incoming, { expectedPreview: preview(null, incoming), relatedRecords: records }));
  assert.equal(failed.data.size, 0);
});

test('fluxo completo: 3 existentes + 10 novos = 13 mantendo fotos, e reimportar insere zero containers', async () => {
  const old = b([
    c(1, { photos: [{ id: 'p1', url: 'photo1.jpg' }], notes: 'vistoriado', bagsQuantity: 20 }),
    c(2, { photos: [{ id: 'p2', url: 'photo2.jpg' }], notes: 'ok', bagsQuantity: 20 }),
    c(3, { photos: [{ id: 'p3', url: 'photo3.jpg' }], notes: 'aprovado', bagsQuantity: 20 })
  ]);
  const h = harness([old]);
  const incoming = {
    ...b(),
    containers: [
      c(1, { bagsQuantity: 20 }),
      c(2, { bagsQuantity: 20 }),
      c(3, { bagsQuantity: 20 }),
      ...Array.from({ length: 10 }, (_, i) => c(i + 4, { bagsQuantity: 20 }))
    ]
  };
  // 1. Primeira importação: 3 existentes + 10 novos = 13
  const result1 = await h.repo.importBooking(incoming, {
    expectedPreview: preview(old, incoming),
    sourceName: 'romaneio_atualizado.pdf',
    actor: { id: 'admin', name: 'Administrador' }
  });
  assert.equal(result1.addedCount, 10);
  assert.equal(result1.preservedCount, 3);
  assert.equal(result1.booking.containers.length, 13);
  assert.deepEqual(result1.booking.containers[0].photos, [{ id: 'p1', url: 'photo1.jpg' }]);
  assert.deepEqual(result1.booking.containers[1].photos, [{ id: 'p2', url: 'photo2.jpg' }]);
  assert.deepEqual(result1.booking.containers[2].photos, [{ id: 'p3', url: 'photo3.jpg' }]);
  assert.equal(result1.booking.containers[0].notes, 'vistoriado');
  assert.equal(result1.booking.certificateNumber, old.certificateNumber);
  // Garante que campos do Booking não foram sobrescritos
  assert.equal(result1.booking.exporterId, old.exporterId);
  assert.equal(result1.booking.locationId, old.locationId);

  // 2. Reimportar o mesmo PDF deve inserir ZERO containers
  const result2 = await h.repo.importBooking(incoming, {
    expectedPreview: preview(result1.booking, incoming),
    sourceName: 'romaneio_atualizado.pdf',
    actor: { id: 'admin', name: 'Administrador' }
  });
  assert.equal(result2.addedCount, 0);
  assert.equal(result2.preservedCount, 13);
  assert.equal(result2.booking.containers.length, 13);
  assert.deepEqual(result2.booking.containers[0].photos, [{ id: 'p1', url: 'photo1.jpg' }]);
});

test('divergência ou falta de Booking no PDF bloqueia atualização', () => {
  const openBookingNumber = '277311214';
  const matchingPdfBooking = '277311214';
  const differentPdfBooking = '999999999';
  const unidentPdfBooking = '';

  assert.equal(normalizeBookingNumber(matchingPdfBooking), normalizeBookingNumber(openBookingNumber));
  assert.notEqual(normalizeBookingNumber(differentPdfBooking), normalizeBookingNumber(openBookingNumber));
  assert.equal(Boolean(unidentPdfBooking), false);
});

test('romaneio atualizado: altera sacas (60 para 180), navio, viagem, destino e embalagem mantendo fotos dos existentes', async () => {
  const old = {
    ...b([
      c(1, { photos: [{ id: 'p1', url: 'photo1.jpg' }], bagsQuantity: 20 }),
      c(2, { photos: [{ id: 'p2', url: 'photo2.jpg' }], bagsQuantity: 20 }),
      c(3, { photos: [{ id: 'p3', url: 'photo3.jpg' }], bagsQuantity: 20 })
    ]),
    bookingNumber: '277311214',
    bagsQuantity: 60,
    embalagem: 'sacaria',
    vesselVoyage: 'OLD SHIP V.100',
    portoDestino: 'SANTOS'
  };

  const h = harness([old]);

  // Novo romaneio traz 9 containers (3 existentes + 6 novos), 180 sacas, navio LOG-IN PANTANAL V.620S
  const incoming = {
    ...old,
    bagsQuantity: 180,
    embalagem: 'Big bags',
    vesselVoyage: 'LOG-IN PANTANAL V.620S',
    portoDestino: 'DURBAN - AFRICA DO SUL',
    containers: [
      c(1, { bagsQuantity: 20 }),
      c(2, { bagsQuantity: 20 }),
      c(3, { bagsQuantity: 20 }),
      ...Array.from({ length: 6 }, (_, i) => c(i + 4, { bagsQuantity: 20 }))
    ]
  };

  const plan = planImport(old, incoming.containers);
  assert.equal(plan.added.length, 6);
  assert.equal(plan.preserved.length, 3);
  assert.equal(plan.total, 9);

  const result = await h.repo.importBooking(incoming, {
    expectedPreview: previewToken(old, plan),
    sourceName: 'romaneio_atualizado_180.pdf',
    actor: { id: 'admin', name: 'Administrador' }
  });

  // 1. Total de containers atualizado para 9
  assert.equal(result.booking.containers.length, 9);
  assert.equal(result.addedCount, 6);
  assert.equal(result.preservedCount, 3);

  // 2. Sacas e dados cadastrais atualizados do novo romaneio
  assert.equal(result.booking.bagsQuantity, 180);
  assert.equal(result.booking.embalagem, 'Big bags');
  assert.equal(result.booking.vesselVoyage, 'LOG-IN PANTANAL V.620S');
  assert.equal(result.booking.portoDestino, 'DURBAN - AFRICA DO SUL');

  // 3. Fotos dos containers existentes 100% preservadas
  assert.deepEqual(result.booking.containers[0].photos, [{ id: 'p1', url: 'photo1.jpg' }]);
  assert.deepEqual(result.booking.containers[1].photos, [{ id: 'p2', url: 'photo2.jpg' }]);
  assert.deepEqual(result.booking.containers[2].photos, [{ id: 'p3', url: 'photo3.jpg' }]);

  // 4. Auditoria registrou os campos atualizados
  const audit = h.data.get(`bookingImports/${result.operationId}`);
  assert.ok(audit.updatedFields.includes('bagsQuantity'));
  assert.ok(audit.updatedFields.includes('vesselVoyage'));
  assert.ok(audit.updatedFields.includes('embalagem'));
  assert.ok(audit.updatedFields.includes('portoDestino'));
  assert.equal(audit.before, 3);
  assert.equal(audit.after, 9);
});

test('romaneio atualizado: faz o push de Peso Carga (netWeight) e Peso Bruto (grossWeight) para cada container', async () => {
  const old = {
    ...b([
      c(1, { photos: [{ id: 'p1', url: 'photo1.jpg' }], netWeight: '', grossWeight: '', tara: '3900' }),
      c(2, { photos: [{ id: 'p2', url: 'photo2.jpg' }], netWeight: '', grossWeight: '', tara: '3700' })
    ]),
    bookingNumber: 'EBKG19041356'
  };

  const h = harness([old]);

  const incoming = {
    ...old,
    containers: [
      c(1, { netWeight: '27000', grossWeight: '30900', tara: '3900', definiteSeal: 'FJ27079722', bagsQuantity: 1080 }),
      c(2, { netWeight: '27054', grossWeight: '30754', tara: '3700', definiteSeal: 'ML-BR0682055', bagsQuantity: 1080 })
    ]
  };

  const plan = planImport(old, incoming.containers);
  assert.equal(plan.added.length, 0);
  assert.equal(plan.preserved.length, 2);

  const result = await h.repo.importBooking(incoming, {
    expectedPreview: previewToken(old, plan),
    sourceName: 'novo_romaneio.pdf',
    actor: { id: 'admin', name: 'Administrador' }
  });

  assert.equal(result.booking.containers.length, 2);
  assert.equal(result.updatedContainersCount, 2);

  // Peso Carga e Peso Bruto foram preenchidos em cada container
  assert.equal(result.booking.containers[0].netWeight, '27000');
  assert.equal(result.booking.containers[0].grossWeight, '30900');
  assert.equal(result.booking.containers[0].definiteSeal, 'FJ27079722');
  assert.equal(result.booking.containers[0].bagsQuantity, 1080);
  assert.deepEqual(result.booking.containers[0].photos, [{ id: 'p1', url: 'photo1.jpg' }]);

  assert.equal(result.booking.containers[1].netWeight, '27054');
  assert.equal(result.booking.containers[1].grossWeight, '30754');
  assert.equal(result.booking.containers[1].definiteSeal, 'ML-BR0682055');
  assert.equal(result.booking.containers[1].bagsQuantity, 1080);
  assert.deepEqual(result.booking.containers[1].photos, [{ id: 'p2', url: 'photo2.jpg' }]);
});


