// Operações pequenas sobre a versão mais recente do booking. Sem consultas à coleção inteira.
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const forbidden = new Set(['id', 'containers', 'bookingNumber', 'certificateNumber', '_revision', 'photos', 'deletedPhotoIds']);
export function applyFieldPatch(current, changes, expected = {}) {
  const result = {...current};
  for (const [field, value] of Object.entries(changes)) {
    if (forbidden.has(field) || value === undefined) throw new Error('Campo não permitido nesta operação: '+field);
    if (!Object.hasOwn(expected, field)) throw new Error('Valor anterior obrigatório: '+field);
    if (!same(current[field], expected[field]) && !same(current[field], value)) {
      throw new Error('Este campo foi alterado por outro usuário: '+field+'. Confira o valor antes de tentar novamente.');
    }
    result[field] = value;
  }
  return result;
}
export function mergeContainerPhotos(container, incoming) {
  const deleted = new Set(container.deletedPhotoIds || []);
  const photos = new Map((container.photos || []).filter(p => !deleted.has(p.id)).map(p => [p.id,p]));
  for (const p of incoming || []) if (p.id && !deleted.has(p.id)) photos.set(p.id, {...photos.get(p.id), ...p});
  return {...container, photos:[...photos.values()]};
}
export const matchesContainerId = (c, id) => {
  if (!c || id === undefined || id === null) return false;
  const target = String(id).trim();
  return String(c.id || '').trim() === target ||
         String(c.containerNumber || '').trim().toUpperCase() === target.toUpperCase() ||
         String(c.number || '').trim().toUpperCase() === target.toUpperCase();
};
export function changeContainer(booking, id, transform) {
  if (!(booking.containers || []).some(c => matchesContainerId(c, id))) throw new Error('O container não está mais neste booking. A foto permanece no aparelho.');
  return {...booking, containers:booking.containers.map(c => matchesContainerId(c, id) ? transform(c) : c), _revision:(booking._revision || 0)+1};
}
export function createConcurrentRepository({reference, transaction}) {
  async function mutate(id, transform) {
    return transaction(async tx => {
      const ref = reference('bookings', id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Booking não encontrado.');
      const saved = transform({...snap.data(), id});
      // Não toca cabeçalho, número, índices de unicidade nem certificados.
      const update = { _revision:saved._revision };
      for (const key of Object.keys(saved)) if (key !== 'id' && !same(saved[key], snap.data()[key])) update[key] = saved[key];
      tx.update(ref, update);
      return saved;
    });
  }
  return {
    patchContainer: (id, containerId, changes, expected) => mutate(id, b => changeContainer(b, containerId, c => applyFieldPatch(c, changes, expected))),
    patchBooking: (id, changes, expected) => mutate(id, b => ({...applyFieldPatch(b, changes, expected), _revision:(b._revision || 0)+1})),
    appendPhoto: (id, containerId, photo) => mutate(id, b => changeContainer(b, containerId, c => {
      if ((c.deletedPhotoIds || []).includes(photo.id)) throw new Error('Esta foto foi excluída; o envio não será restaurado.');
      return mergeContainerPhotos(c, [photo]);
    })),
    removePhoto: (id, containerId, photoId) => mutate(id, b => changeContainer(b, containerId, c => ({...c,
      photos:(c.photos || []).filter(p => p.id !== photoId), deletedPhotoIds:[...new Set([...(c.deletedPhotoIds || []), photoId])]})))
  };
}
