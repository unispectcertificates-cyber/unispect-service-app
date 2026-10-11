import { normalizeContainerNumber } from './containerIdentity.js';

export function validateFieldCapture(input, photoCount) {
  const number = normalizeContainerNumber(input.containerNumber);
  if (!/^[A-Z]{4}\d{7}$/.test(number)) throw new Error('Informe o número completo do container: 4 letras e 7 números.');
  const rawTara = String(input.tara ?? '').trim();
  const tara = Number(rawTara.replace(',', '.'));
  if (!/^\d+(?:[.,]\d+)?$/.test(rawTara) || !Number.isFinite(tara) || tara <= 0) throw new Error('Informe uma tara válida em kg, maior que zero.');
  if (!['definitive', 'provisional'].includes(input.sealType) || !String(input.sealNumber || '').trim()) throw new Error('Informe o tipo e o número do lacre.');
  if (!photoCount) throw new Error('Tire ou selecione pelo menos uma foto antes de salvar.');
  return { containerNumber: number, tara: String(tara), sealType: input.sealType, sealNumber: String(input.sealNumber).trim().toUpperCase() };
}

export const activeBooking = booking => !['finalizado', 'estufado', 'finished'].includes(String(booking.status || '').trim().toLowerCase());
export function findFieldTarget(bookings, number) {
  const key = normalizeContainerNumber(number);
  const matches = bookings.filter(activeBooking).flatMap(booking => (booking.containers || [])
    .filter(container => normalizeContainerNumber(container.containerNumber) === key).map(container => ({ booking, container })));
  if (matches.length > 1) throw new Error('Este container aparece em mais de um Booking ativo. Peça ao administrador para revisar antes de sincronizar.');
  return matches[0] || null;
}

export function captureContainer(input, id, actor, timestamp) {
  return { id, containerNumber: input.containerNumber, tara: input.tara, status: 'Pendente',
    definiteSeal: input.sealType === 'definitive' ? input.sealNumber : '',
    provisionalSeals: input.sealType === 'provisional' ? [input.sealNumber] : [], photos: [],
    fieldCapture: { actor, createdAt: timestamp }, notes: '' };
}

export function mergePhotos(oldPhotos = [], newPhotos = []) {
  const photos = new Map(oldPhotos.map(photo => [photo.id, photo]));
  for (const photo of newPhotos) if (!photos.has(photo.id)) photos.set(photo.id, photo);
  return [...photos.values()];
}
export function fieldErrorMessage(error) {
  const code = String(error.code || '');
  if (code.includes('permission-denied') || code.includes('unauthorized') || code.includes('unauthenticated')) return 'O envio foi bloqueado pelas permissões do sistema. Peça ao administrador para verificar o Firebase.';
  if (code.includes('canceled') || code.includes('retry-limit') || code.includes('unavailable')) return 'O envio foi interrompido. O sistema tentará novamente quando a conexão estiver disponível.';
  return error.message || String(error);
}

// New imported containers keep the field identity. Existing inspected data is never replaced.
export function attachFieldContainer(target, record, { newContainer = false } = {}) {
  const source = record.container;
  const result = { ...target, photos: mergePhotos(target.photos, source.photos),
    fieldPhotoSourceIds: [...new Set([...(target.fieldPhotoSourceIds || []), record.sourceContainerId])] };
  if (target.fieldCapture || source.fieldCapture) result.fieldCapture = target.fieldCapture || source.fieldCapture;
  const conflicts = [...(target.fieldCaptureConflicts || [])];
  if (newContainer) result.id = record.sourceContainerId;
  for (const field of ['tara', 'definiteSeal']) {
    if (!source[field]) continue;
    if (newContainer || !target[field]) result[field] = source[field];
    else if (String(target[field]) !== String(source[field]) && !conflicts.some(c => c.sourceContainerId === record.sourceContainerId && c.field === field && c.value === source[field]))
      conflicts.push({ field, value: source[field], sourceContainerId: record.sourceContainerId });
  }
  const seals = new Map();
  for (const seal of [...(target.provisionalSeals || []), ...(source.provisionalSeals || [])]) {
    const key = String(typeof seal === 'string' ? seal : (seal?.sealNumber || seal?.seal || seal?.number || '')).trim().toUpperCase();
    if (key && !seals.has(key)) seals.set(key, seal);
  }
  result.provisionalSeals = [...seals.values()];
  if (conflicts.length) result.fieldCaptureConflicts = conflicts;
  return result;
}

export function attachPendingFields(booking, records, oldContainerIds = new Set()) {
  const linked = [];
  const containers = (booking.containers || []).map(container => {
    const key = normalizeContainerNumber(container.containerNumber);
    const record = records.get(key);
    if (!record || record.status !== 'pending') return container;
    const attached = attachFieldContainer(container, record, { newContainer: !oldContainerIds.has(container.id) });
    linked.push({ ...record, status: 'linked', bookingId: booking.id, linkedContainerId: attached.id });
    return attached;
  });
  return { booking: { ...booking, containers }, linked };
}

export function createFieldRepository({ listBookings, reference, transaction, now }) {
  const read = async (tx, ref) => { const snapshot = await tx.get(ref); return snapshot.exists() ? snapshot.data() : null; };
  const fieldRef = number => reference('fieldContainers', number);
  const opRef = id => reference('fieldOperations', id);
  return {
    async removePhotoMetadata(photoId) {
      return transaction(async tx => {
        const photoRef = reference('containerPhotos', photoId);
        const photo = await read(tx, photoRef);
        const field = photo?.fieldNumber ? await read(tx, fieldRef(photo.fieldNumber)) : null;
        tx.delete(photoRef);
        if (field) tx.update(fieldRef(photo.fieldNumber), { container: { ...field.container,
          photos: (field.container.photos || []).filter(p => p.id !== photoId) }, updatedAt: now() });
        return photo?.storagePath || null;
      });
    },
    async prepare(operation) {
      return transaction(async tx => {
        const completed = await read(tx, opRef(operation.id));
        if (completed) return { completed: true, result: completed.result };
        const existing = await read(tx, fieldRef(operation.number));
        if (existing) return { completed: false, record: existing };
        const record = { id: operation.number, normalizedNumber: operation.number, sourceContainerId: operation.sourceContainerId,
          container: captureContainer(operation.fields, operation.sourceContainerId, operation.actor, operation.createdAt),
          status: 'pending', bookingId: '', linkedContainerId: '', createdAt: operation.createdAt, updatedAt: now() };
        tx.set(fieldRef(operation.number), record);
        return { completed: false, record };
      });
    },
    async complete(operation, photos) {
      const bookings = await listBookings();
      return transaction(async tx => {
        const completed = await read(tx, opRef(operation.id));
        if (completed) return completed.result;
        const field = await read(tx, fieldRef(operation.number));
        if (!field) throw new Error('Registro de campo não encontrado. Tente sincronizar novamente.');
        const candidate = field.status === 'linked' ? null : findFieldTarget(bookings, operation.number);
        const targetId = field.status === 'linked' ? field.bookingId : candidate?.booking.id;
        const targetRef = targetId ? reference('bookings', targetId) : null;
        const booking = targetRef ? await read(tx, targetRef) : null;
        if (targetId && !booking) throw new Error('O Booking foi removido. O registro continua salvo no aparelho para revisão.');
        if (booking && !activeBooking(booking)) throw new Error('O Booking deste container já foi finalizado. Peça ao administrador para revisar o vínculo. As fotos continuam no aparelho.');
        const target = booking?.containers?.find(c => field.status === 'linked' ? c.id === field.linkedContainerId : normalizeContainerNumber(c.containerNumber) === operation.number);
        if (booking && !target) throw new Error('O container foi removido ou alterado no Booking. Revise antes de sincronizar.');
        const container = { ...field.container, photos: mergePhotos(field.container.photos, photos) };
        const record = { ...field, container, updatedAt: now() };
        if (target) {
          const attached = attachFieldContainer(target, record);
          tx.update(targetRef, { containers: booking.containers.map(c => c.id === target.id ? attached : c), _revision: (booking._revision || 0) + 1 });
          record.status = 'linked'; record.bookingId = targetId; record.linkedContainerId = target.id;
        }
        for (const photo of photos) tx.set(reference('containerPhotos', photo.id), { ...photo, containerId: record.sourceContainerId, fieldNumber: operation.number, createdAt: operation.createdAt });
        tx.set(fieldRef(operation.number), record);
        const result = { status: record.status, bookingId: record.bookingId, linkedContainerId: record.linkedContainerId,
          sourceContainerId: record.sourceContainerId, photos };
        tx.set(opRef(operation.id), { id: operation.id, number: operation.number, actor: operation.actor, createdAt: now(),
          capturedAt: operation.createdAt, submittedFields: operation.fields, photoIds: photos.map(p => p.id), result });
        return result;
      });
    }
  };
}
