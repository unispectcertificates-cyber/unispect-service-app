// Shared by preview and persistence. Search normalization is intentionally separate.
export const normalizeBookingNumber = value => String(value ?? '').trim().toUpperCase().replace(/[\s./-]/g, '');
export const normalizeContainerNumber = value => String(value ?? '').trim().toUpperCase().replace(/[\s-]/g, '');
export const importFieldLabels = { containerType: 'tipo', definiteSeal: 'lacre definitivo', bagsQuantity: 'quantidade de sacas',
  netWeight: 'peso líquido', tara: 'tara', grossWeight: 'peso bruto', brand: 'marca' };

export function findBooking(bookings, number) {
  const key = normalizeBookingNumber(number);
  const matches = bookings.filter(b => key && normalizeBookingNumber(b.bookingNumber) === key);
  if (matches.length > 1) throw new Error('Há mais de um Booking com este número. Revise os cadastros antes de importar.');
  return matches[0] || null;
}

export function planImport(existing, incoming) {
  const stored = new Map((existing?.containers || []).map(c => [normalizeContainerNumber(c.containerNumber), c]));
  const seen = new Set();
  const added = [], preserved = [], repeated = [], invalid = [], conflicts = [];
  const fields = ['containerType', 'definiteSeal', 'bagsQuantity', 'netWeight', 'tara', 'grossWeight', 'brand'];
  for (const [index, container] of incoming.entries()) {
    const key = normalizeContainerNumber(container?.containerNumber);
    if (!/^[A-Z]{4}\d{7}$/.test(key)) {
      invalid.push({ row: index + 1, number: container?.containerNumber || '(vazio)' });
      continue;
    }
    if (seen.has(key)) { repeated.push(key); continue; }
    seen.add(key);
    const previous = stored.get(key);
    if (previous) {
      preserved.push(previous);
      const changed = fields.filter(field => container[field] !== '' && container[field] != null &&
        JSON.stringify(container[field]) !== JSON.stringify(previous[field]));
      if (changed.length) conflicts.push({ number: key, fields: changed });
    } else {
      added.push({ ...container, containerNumber: key, originalContainerNumber: container.containerNumber });
    }
  }
  return { added, preserved, repeated, invalid, conflicts, total: (existing?.containers?.length || 0) + added.length };
}

export function previewToken(existing, plan) {
  return JSON.stringify({ target: existing?.id || null, added: plan.added.map(c => c.containerNumber),
    preserved: plan.preserved.map(c => normalizeContainerNumber(c.containerNumber)), repeated: plan.repeated,
    invalid: plan.invalid, conflicts: plan.conflicts, total: plan.total });
}

export function assertUniqueContainers(containers) {
  const keys = new Set();
  for (const c of containers || []) {
    const key = normalizeContainerNumber(c.containerNumber);
    if (!key || keys.has(key)) throw new Error(`Container repetido ou sem número: ${c.containerNumber || '(vazio)'}.`);
    keys.add(key);
  }
}

// Adapter permits deterministic transaction tests without connecting to production.
export function createBookingRepository({ listBookings, reference, newId, transaction, now }) {
  const keyRef = number => reference('bookingNumberKeys', encodeURIComponent(normalizeBookingNumber(number)));
  const certificateRef = () => reference('bookingCounters', 'certificate');
  const certificateSeed = (list, year) => list.reduce((max, b) => {
    const match = String(b.certificateNumber || '').match(new RegExp(`^UN(\\d+)/${year}$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 999);
  const read = async (tx, ref) => { const snap = await tx.get(ref); return snap.exists() ? snap.data() : null; };
  const conflictError = () => new Error('O Booking foi alterado por outro operador. Atualize os dados e tente novamente.');

  return {
    async importBooking(incoming, { expectedPreview, sourceName = '', actor = null, relatedRecords = [] } = {}) {
      const key = normalizeBookingNumber(incoming.bookingNumber);
      if (!key) throw new Error('Informe um número de Booking válido.');
      const list = await listBookings();
      const legacy = findBooking(list, incoming.bookingNumber);
      const id = newId('booking');
      const operationId = newId('import');
      const timestamp = now();
      const year = new Date(timestamp).getFullYear();
      return transaction(async tx => {
        const index = await read(tx, keyRef(key));
        const bookingId = index?.bookingId || legacy?.id || id;
        const bookingRef = reference('bookings', bookingId);
        const existing = await read(tx, bookingRef);
        if ((index || legacy) && !existing) throw conflictError();
        if (existing && normalizeBookingNumber(existing.bookingNumber) !== key) throw conflictError();
        const current = existing ? { ...existing, id: bookingId } : null;
        const plan = planImport(current, incoming.containers || []);
        if (plan.invalid.length) throw new Error('Corrija os números de containers inválidos antes de confirmar.');
        if (expectedPreview !== previewToken(current, plan)) throw new Error('A prévia mudou. Confira os dados atualizados e confirme novamente.');
        if (current && !(incoming.containers || []).length) throw new Error('Selecione um romaneio com containers para atualizar este Booking.');
        const counter = !current && !incoming.certificateNumber ? await read(tx, certificateRef()) : null;
        const next = Math.max(counter?.year === year ? counter.value : 999, certificateSeed(list, year)) + 1;
        let booking;
        if (current) {
          const updatePayload = {
            containers: [...(current.containers || []), ...plan.added.map(c => ({ ...c, id: newId('container') }))],
            _revision: (current._revision || 0) + (plan.added.length ? 1 : 0)
          };
          if (incoming.bagsQuantity !== undefined && incoming.bagsQuantity !== null && incoming.bagsQuantity !== '') {
            updatePayload.bagsQuantity = incoming.bagsQuantity;
          }
          if (incoming.vesselVoyage && incoming.vesselVoyage !== current.vesselVoyage) {
            updatePayload.vesselVoyage = incoming.vesselVoyage;
          }
          if (incoming.vesselName && incoming.vesselName !== current.vesselName) {
            updatePayload.vesselName = incoming.vesselName;
          }
          if (incoming.vesselVoyageNum && incoming.vesselVoyageNum !== current.vesselVoyageNum) {
            updatePayload.vesselVoyageNum = incoming.vesselVoyageNum;
          }
          if (incoming.portoDestino && incoming.portoDestino !== current.portoDestino) {
            updatePayload.portoDestino = incoming.portoDestino;
          }
          if (incoming.armador && incoming.armador !== current.armador) {
            updatePayload.armador = incoming.armador;
          }
          if (incoming.embalagem && incoming.embalagem !== current.embalagem) {
            updatePayload.embalagem = incoming.embalagem;
          }
          if (incoming.importador && incoming.importador !== current.importador) {
            updatePayload.importador = incoming.importador;
          }
          if (incoming.mercadoria && incoming.mercadoria !== current.mercadoria) {
            updatePayload.mercadoria = incoming.mercadoria;
          }
          const hasChanges = plan.added.length > 0 || Object.keys(updatePayload).length > 2;
          if (hasChanges && !plan.added.length) {
            updatePayload._revision = (current._revision || 0) + 1;
          }
          booking = { ...current, ...updatePayload };
          if (hasChanges) tx.update(bookingRef, updatePayload);
        } else {
          if (!incoming.exporterId || !incoming.locationId) throw new Error('Selecione o exportador e o recinto.');
          booking = { ...incoming, id: bookingId, bookingNumber: String(incoming.bookingNumber).trim().toUpperCase(),
            containers: plan.added.map(c => ({ ...c, id: newId('container') })), _revision: 1,
            certificateNumber: incoming.certificateNumber || `UN${next}/${year}` };
          tx.set(bookingRef, booking);
          if (!incoming.certificateNumber) tx.set(certificateRef(), { year, value: next });
          for (const record of relatedRecords) tx.set(reference(record.collection, record.data.id), record.data);
        }
        tx.set(keyRef(key), { bookingId, normalizedNumber: key });
        tx.set(reference('bookingImports', operationId), { id: operationId, bookingId, bookingNumber: booking.bookingNumber,
          createdAt: timestamp, actor: actor ? { id: actor.id || '', name: actor.name || '' } : null, sourceName,
          added: plan.added.map(c => c.containerNumber), addedIds: booking.containers.slice(current?.containers?.length || 0).map(c => c.id),
          existing: plan.preserved.map(c => normalizeContainerNumber(c.containerNumber)), repeated: plan.repeated,
          conflicts: plan.conflicts, before: current?.containers?.length || 0, after: booking.containers.length });
        return { booking, addedCount: plan.added.length, preservedCount: plan.preserved.length, operationId };
      });
    },

    async saveBooking(incoming) {
      const id = incoming.id || newId('booking');
      const key = normalizeBookingNumber(incoming.bookingNumber);
      if (!key) throw new Error('Informe um número de Booking válido.');
      assertUniqueContainers(incoming.containers);
      const list = await listBookings();
      const duplicate = findBooking(list.filter(b => b.id !== id), key);
      if (duplicate) throw new Error('Já existe um Booking com este número. Use a importação incremental.');
      const year = new Date(now()).getFullYear();
      return transaction(async tx => {
        const bookingRef = reference('bookings', id);
        const current = await read(tx, bookingRef);
        if ((current?._revision || 0) !== (incoming._revision || 0)) throw conflictError();
        const index = await read(tx, keyRef(key));
        if (index && index.bookingId !== id) throw new Error('Já existe um Booking com este número.');
        const oldKey = current && normalizeBookingNumber(current.bookingNumber);
        const oldIndex = oldKey && oldKey !== key ? await read(tx, keyRef(oldKey)) : null;
        const counter = !current && !incoming.certificateNumber ? await read(tx, certificateRef()) : null;
        const next = Math.max(counter?.year === year ? counter.value : 999, certificateSeed(list, year)) + 1;
        const booking = { ...incoming, id, containers: incoming.containers || [], _revision: (current?._revision || 0) + 1,
          certificateNumber: incoming.certificateNumber || current?.certificateNumber || `UN${next}/${year}` };
        tx.set(bookingRef, booking);
        tx.set(keyRef(key), { bookingId: id, normalizedNumber: key });
        if (oldIndex?.bookingId === id) tx.delete(keyRef(oldKey));
        if (!current && !incoming.certificateNumber) tx.set(certificateRef(), { year, value: next });
        return booking;
      });
    },

    async deleteBooking(id) {
      return transaction(async tx => {
        const bookingRef = reference('bookings', id);
        const current = await read(tx, bookingRef);
        if (!current) return;
        const key = normalizeBookingNumber(current.bookingNumber);
        const index = key ? await read(tx, keyRef(key)) : null;
        tx.delete(bookingRef);
        if (index?.bookingId === id) tx.delete(keyRef(key));
      });
    }
  };
}
