import { normalizeContainerNumber } from './containerIdentity.js';
import { attachPendingFields } from './fieldContainers.js';
export { normalizeContainerNumber } from './containerIdentity.js';
// Shared by preview and persistence. Search normalization is intentionally separate.
export const normalizeBookingNumber = value => String(value ?? '').trim().toUpperCase().replace(/[\s./-]/g, '');
export const importFieldLabels = { containerType: 'tipo', definiteSeal: 'lacre definitivo', bagsQuantity: 'quantidade de sacas',
  netWeight: 'peso líquido', tara: 'tara', grossWeight: 'peso bruto', brand: 'marca' };

export const headerSyncFields = [
  'bagsQuantity', 'embalagem', 'vesselVoyage', 'vesselName', 'vesselVoyageNum',
  'portoDestino', 'armador', 'mercadoria', 'importador', 'exporterId', 'locationId'
];

export function detectBookingFieldChanges(current, incoming) {
  if (!current || !incoming) return [];
  const changes = [];
  const labelMap = {
    bagsQuantity: 'Quantidade de Sacas/Bags',
    embalagem: 'Tipo de Embalagem',
    vesselVoyage: 'Navio / Viagem',
    portoDestino: 'Porto de Destino',
    armador: 'Armador / Linha',
    mercadoria: 'Mercadoria',
    importador: 'Importador',
    exporterId: 'Exportador',
    locationId: 'Local da Operação'
  };

  // bagsQuantity
  if (incoming.bagsQuantity !== undefined && incoming.bagsQuantity !== '' && incoming.bagsQuantity !== null) {
    const newBags = parseInt(incoming.bagsQuantity, 10);
    const oldBags = parseInt(current.bagsQuantity, 10) || 0;
    if (!isNaN(newBags) && newBags > 0 && newBags !== oldBags) {
      changes.push({ field: 'bagsQuantity', label: labelMap.bagsQuantity, oldValue: oldBags, newValue: newBags });
    }
  }

  // embalagem
  if (incoming.embalagem && typeof incoming.embalagem === 'string' && incoming.embalagem.trim()) {
    const newEmb = incoming.embalagem.trim();
    const oldEmb = (current.embalagem || '').trim();
    if (newEmb && oldEmb && newEmb.toLowerCase() !== oldEmb.toLowerCase()) {
      changes.push({ field: 'embalagem', label: labelMap.embalagem, oldValue: oldEmb, newValue: newEmb });
    }
  }

  // vesselVoyage
  if (incoming.vesselVoyage && typeof incoming.vesselVoyage === 'string' && incoming.vesselVoyage.trim()) {
    const newVessel = incoming.vesselVoyage.trim();
    const oldVessel = (current.vesselVoyage || '').trim();
    if (newVessel && newVessel !== oldVessel) {
      changes.push({ field: 'vesselVoyage', label: labelMap.vesselVoyage, oldValue: oldVessel, newValue: newVessel });
    }
  }

  // portoDestino
  if (incoming.portoDestino && typeof incoming.portoDestino === 'string' && incoming.portoDestino.trim()) {
    const newDest = incoming.portoDestino.trim();
    const oldDest = (current.portoDestino || '').trim();
    if (newDest && newDest.toLowerCase() !== oldDest.toLowerCase()) {
      changes.push({ field: 'portoDestino', label: labelMap.portoDestino, oldValue: oldDest, newValue: newDest });
    }
  }

  // armador
  if (incoming.armador && typeof incoming.armador === 'string' && incoming.armador.trim()) {
    const newArm = incoming.armador.trim();
    const oldArm = (current.armador || '').trim();
    if (newArm && newArm.toLowerCase() !== oldArm.toLowerCase()) {
      changes.push({ field: 'armador', label: labelMap.armador, oldValue: oldArm, newValue: newArm });
    }
  }

  // mercadoria
  if (incoming.mercadoria && typeof incoming.mercadoria === 'string' && incoming.mercadoria.trim()) {
    const newMerc = incoming.mercadoria.trim();
    const oldMerc = (current.mercadoria || '').trim();
    if (newMerc && newMerc.toLowerCase() !== oldMerc.toLowerCase()) {
      changes.push({ field: 'mercadoria', label: labelMap.mercadoria, oldValue: oldMerc, newValue: newMerc });
    }
  }

  // importador
  if (incoming.importador && typeof incoming.importador === 'string' && incoming.importador.trim()) {
    const newImp = incoming.importador.trim();
    const oldImp = (current.importador || '').trim();
    if (newImp && newImp.toLowerCase() !== oldImp.toLowerCase()) {
      changes.push({ field: 'importador', label: labelMap.importador, oldValue: oldImp, newValue: newImp });
    }
  }

  // exporterId
  if (incoming.exporterId && incoming.exporterId !== current.exporterId) {
    changes.push({ field: 'exporterId', label: labelMap.exporterId, oldValue: current.exporterId, newValue: incoming.exporterId });
  }

  // locationId
  if (incoming.locationId && incoming.locationId !== current.locationId) {
    changes.push({ field: 'locationId', label: labelMap.locationId, oldValue: current.locationId, newValue: incoming.locationId });
  }

  return changes;
}


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
        const fieldRecords = new Map();
        for (const number of new Set((incoming.containers || []).map(c => normalizeContainerNumber(c.containerNumber)))) {
          const field = await read(tx, reference('fieldContainers', number));
          if (field) fieldRecords.set(number, field);
        }
        const next = Math.max(counter?.year === year ? counter.value : 999, certificateSeed(list, year)) + 1;
        let booking;
        let fieldUpdates = {};
        let updatedContainersCount = 0;
        if (current) {
          const changes = detectBookingFieldChanges(current, incoming);
          for (const change of changes) {
            fieldUpdates[change.field] = change.newValue;
          }
          if (fieldUpdates.vesselVoyage) {
            if (incoming.vesselName) fieldUpdates.vesselName = incoming.vesselName;
            if (incoming.vesselVoyageNum) fieldUpdates.vesselVoyageNum = incoming.vesselVoyageNum;
          }

          const incomingByNumber = new Map(
            (incoming.containers || []).map(c => [normalizeContainerNumber(c.containerNumber), c])
          );

          let containerFieldUpdated = false;
          const mergedExistingContainers = (current.containers || []).map(prev => {
            const key = normalizeContainerNumber(prev.containerNumber);
            const inc = incomingByNumber.get(key);
            if (!inc) return prev;

            const updated = { ...prev };
            let changed = false;

            const prevSealStr = String(typeof prev.definiteSeal === 'object' && prev.definiteSeal !== null
              ? (prev.definiteSeal.sealNumber || prev.definiteSeal.seal || prev.definiteSeal.number || '')
              : (prev.definiteSeal || '')).trim();
            const prevSealDigits = prevSealStr.replace(/\D/g, '');
            const isBuggySeal = Boolean(
              prevSealStr && (
                key.includes(prevSealStr.replace(/[-\s]/g, '')) ||
                (prevSealDigits.length >= 6 && key.replace(/\D/g, '').includes(prevSealDigits))
              )
            );

            // Peso Carga (Net Weight)
            if (inc.netWeight !== undefined && inc.netWeight !== '' && inc.netWeight !== null) {
              if (!prev.netWeight || prev.netWeight === '' || prev.netWeight !== inc.netWeight) {
                updated.netWeight = inc.netWeight;
                changed = true;
              }
            }
            // Peso Bruto (Gross Weight)
            if (inc.grossWeight !== undefined && inc.grossWeight !== '' && inc.grossWeight !== null) {
              if (!prev.grossWeight || prev.grossWeight === '' || prev.grossWeight !== inc.grossWeight) {
                updated.grossWeight = inc.grossWeight;
                changed = true;
              }
            }
            // Tara
            if (inc.tara !== undefined && inc.tara !== '' && inc.tara !== null) {
              if (!prev.tara || prev.tara === '' || prev.tara !== inc.tara) {
                updated.tara = inc.tara;
                changed = true;
              }
            }
            // Lacre Definitivo
            if (inc.definiteSeal !== undefined && inc.definiteSeal !== '' && inc.definiteSeal !== null) {
              const cleanIncSeal = String(inc.definiteSeal).trim();
              const prevSeal = String(typeof prev.definiteSeal === 'object' && prev.definiteSeal !== null
                ? (prev.definiteSeal.sealNumber || prev.definiteSeal.seal || prev.definiteSeal.number || '')
                : (prev.definiteSeal || '')).trim();

              if (!prevSeal || isBuggySeal || prevSeal !== cleanIncSeal) {
                updated.definiteSeal = cleanIncSeal;
                changed = true;
              }
            }
            // Marca / Lote / OIC
            if (inc.brand && (!prev.brand || prev.brand === '' || prev.brand !== inc.brand)) {
              updated.brand = inc.brand;
              changed = true;
            }
            // Quantidade de sacas
            if (inc.bagsQuantity && (!prev.bagsQuantity || prev.bagsQuantity === 0 || String(prev.bagsQuantity) !== String(inc.bagsQuantity))) {
              updated.bagsQuantity = inc.bagsQuantity;
              changed = true;
            }
            // Tipo de container
            if (inc.containerType && (!prev.containerType || prev.containerType === '40"/HC' || prev.containerType !== inc.containerType) && inc.containerType !== '40"/HC') {
              updated.containerType = inc.containerType;
              changed = true;
            }

            if (changed) {
              containerFieldUpdated = true;
              updatedContainersCount++;
              return updated;
            }
            return prev;
          });

          const hasContainerChanges = plan.added.length > 0 || containerFieldUpdated;
          const hasFieldChanges = Object.keys(fieldUpdates).length > 0;

          booking = {
            ...current,
            ...fieldUpdates,
            containers: [
              ...mergedExistingContainers,
              ...plan.added.map(c => ({ ...c, id: newId('container') }))
            ],
            _revision: (current._revision || 0) + (hasContainerChanges || hasFieldChanges ? 1 : 0)
          };
        } else {
          if (!incoming.exporterId || !incoming.locationId) throw new Error('Selecione o exportador e o recinto.');
          booking = { ...incoming, id: bookingId, bookingNumber: String(incoming.bookingNumber).trim().toUpperCase(),
            containers: plan.added.map(c => ({ ...c, id: newId('container') })), _revision: 1,
            certificateNumber: incoming.certificateNumber || `UN${next}/${year}` };
          if (!incoming.certificateNumber) tx.set(certificateRef(), { year, value: next });
          for (const record of relatedRecords) tx.set(reference(record.collection, record.data.id), record.data);
        }

        const attached = attachPendingFields(booking, fieldRecords, new Set((current?.containers || []).map(c => c.id)));
        booking = attached.booking;
        if (current) {
          if (attached.linked.length && booking._revision === (current._revision || 0)) booking._revision++;
          if (booking._revision !== (current._revision || 0)) {
            tx.update(bookingRef, { ...fieldUpdates, containers: booking.containers, _revision: booking._revision });
          }
        } else {
          tx.set(bookingRef, booking);
        }
        for (const field of attached.linked) {
          tx.update(reference('fieldContainers', field.id), {
            status: 'linked', bookingId, linkedContainerId: field.linkedContainerId, linkedAt: timestamp
          });
        }
        tx.set(keyRef(key), { bookingId, normalizedNumber: key });
        tx.set(reference('bookingImports', operationId), { id: operationId, bookingId, bookingNumber: booking.bookingNumber,
          createdAt: timestamp, actor: actor ? { id: actor.id || '', name: actor.name || '' } : null, sourceName,
          added: plan.added.map(c => c.containerNumber), addedIds: booking.containers.slice(current?.containers?.length || 0).map(c => c.id),
          existing: plan.preserved.map(c => normalizeContainerNumber(c.containerNumber)), repeated: plan.repeated,
          conflicts: plan.conflicts, fieldLinked: attached.linked.map(f => ({ number: f.id, sourceContainerId: f.sourceContainerId, containerId: f.linkedContainerId })),
          updatedFields: Object.keys(fieldUpdates), before: current?.containers?.length || 0, after: booking.containers.length });
        return { booking, addedCount: plan.added.length, preservedCount: plan.preserved.length, updatedContainersCount, fieldLinkedCount: attached.linked.length, updatedFields: Object.keys(fieldUpdates), operationId };
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
