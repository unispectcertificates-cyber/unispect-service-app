/**
 * storage-ownership.mjs
 * 
 * Mecanismo de comprovação de propriedade de fotos legadas do Firebase Storage.
 * 
 * PREMISSA:
 * As fotos legadas estão em 'containers/{containerId}/{photoId}.jpg' e NÃO possuem o clientId no caminho.
 * Mover ou renomear arquivos quebraria URLs históricas já emitidas em laudos.
 * 
 * SOLUÇÃO:
 * A propriedade do arquivo binário é comprovada através do grafo de vínculos de metadados:
 * 1. Consulta o documento /containerPhotos/{photoId} -> extrai clientId.
 * 2. Caso ausente, busca o contêiner containerId nos Bookings -> extrai clientId do Booking proprietário.
 * 3. Valida se o usuário solicitante possui autorização ativa para o clientId proprietário.
 */

export function resolvePhotoOwnership({
  storagePath,
  containerPhotosMap = {},
  bookingsMap = {},
  fieldContainersMap = {}
}) {
  // Extrai containerId e photoId a partir do storagePath legado: containers/{containerId}/{photoId}.jpg
  const match = String(storagePath || '').match(/^containers\/([^/]+)\/([^/]+)\.(?:jpg|jpeg|webp|png)$/i);
  if (!match) {
    return {
      validPath: false,
      ownerClientId: null,
      provenVia: 'invalid_path',
      orphan: true
    };
  }

  const [, containerId, photoFileName] = match;
  const photoId = photoFileName; // id estável da foto

  // 1. Comprovação via metadados diretos de /containerPhotos
  const directPhoto = containerPhotosMap[photoId];
  if (directPhoto && directPhoto.clientId) {
    return {
      validPath: true,
      photoId,
      containerId,
      ownerClientId: directPhoto.clientId,
      provenVia: 'containerPhotos',
      orphan: false
    };
  }

  // 2. Comprovação via Booking pai que contém o contêiner
  for (const [bkgId, booking] of Object.entries(bookingsMap)) {
    if (Array.isArray(booking.containers)) {
      const cont = booking.containers.find(c => c.id === containerId || c.containerNumber === containerId);
      if (cont && Array.isArray(cont.photos)) {
        const hasPhoto = cont.photos.some(p => p.id === photoId || p.storagePath === storagePath);
        if (hasPhoto) {
          return {
            validPath: true,
            photoId,
            containerId,
            bookingId: bkgId,
            ownerClientId: booking.clientId,
            provenVia: 'booking_container',
            orphan: false
          };
        }
      }
    }
  }

  // 3. Comprovação via Modo Campo (/fieldContainers)
  for (const [num, fc] of Object.entries(fieldContainersMap)) {
    if (fc.sourceContainerId === containerId || num === containerId) {
      if (Array.isArray(fc.photos) && fc.photos.some(p => p.id === photoId)) {
        return {
          validPath: true,
          photoId,
          containerId,
          ownerClientId: fc.clientId,
          provenVia: 'fieldContainer',
          orphan: false
        };
      }
    }
  }

  return {
    validPath: true,
    photoId,
    containerId,
    ownerClientId: null,
    provenVia: 'none',
    orphan: true // Arquivo físico no Storage sem metadado proprietário vinculado no Firestore
  };
}

export function authorizeStorageAccess({
  storagePath,
  userAuth,
  ownershipResolver = resolvePhotoOwnership,
  dataset = {}
}) {
  if (!userAuth || !userAuth.uid) return { allowed: false, reason: 'unauthenticated' };
  if (userAuth.token?.isUnispectMaster === true) return { allowed: true, reason: 'unispect_master' };

  const ownership = ownershipResolver({
    storagePath,
    containerPhotosMap: dataset.containerPhotos || {},
    bookingsMap: dataset.bookings || {},
    fieldContainersMap: dataset.fieldContainers || {}
  });

  if (!ownership.validPath) return { allowed: false, reason: 'invalid_path' };
  if (ownership.orphan || !ownership.ownerClientId) return { allowed: false, reason: 'orphan_file' };

  const authorizedClients = userAuth.token?.authorizedClients || [];
  if (!authorizedClients.includes(ownership.ownerClientId)) {
    return {
      allowed: false,
      reason: 'forbidden_cross_tenant',
      ownerClientId: ownership.ownerClientId
    };
  }

  return {
    allowed: true,
    reason: 'authorized',
    ownerClientId: ownership.ownerClientId,
    provenVia: ownership.provenVia
  };
}
