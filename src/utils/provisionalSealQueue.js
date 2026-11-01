import { recognizeInterportSealsInPhoto, normalizeProvisionalSealNumber } from './interportSealOcr.js';
import { mergeContainerProvisionalSeals } from './bookingConcurrent.js';

const STORAGE_KEY = 'unispect_provisional_seal_queue_v1';

// Estado em memória para evitar processamento duplicado simultâneo da mesma foto+versão
const activeTasks = new Map(); // taskKey -> Promise
const runtimeListeners = new Set();
let onlineListenerAttached = false;
let defaultMutator = null;

/**
 * Configura o mutador persistente padrão (ex: db.mutateContainerProvisionalSeals).
 */
export function setDefaultSealMutator(mutatorFn) {
  defaultMutator = mutatorFn;
}

/**
 * Gera chave determinística de versão para uma foto.
 * Controla o processamento por foto e versão da imagem.
 */
export function getPhotoVersionKey(photo) {
  if (!photo || !photo.id) return '';
  const ver = photo.compressionVersion ?? photo.version ?? '1';
  const size = photo.sizeBytes ?? photo.size ?? 0;
  const tag = photo.updatedAt || photo.storagePath || '';
  return `${photo.id}::v${ver}::s${size}::${tag}`;
}

function getTaskKey(clientId, bookingId, containerId, photoId, photoVersion) {
  return `${clientId || 'client_interport'}__${bookingId || 'local'}__${containerId || ''}__${photoId || ''}__${photoVersion || ''}`;
}

function loadPersistedQueue() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePersistedQueue(items) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignora quota exceeded em storage restrito
  }
}

function upsertQueueTask(task) {
  const list = loadPersistedQueue();
  const idx = list.findIndex(
    t => t.bookingId === task.bookingId && t.containerId === task.containerId && t.photoId === task.photoId
  );
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...task, updatedAt: Date.now() };
  } else {
    list.push({ ...task, createdAt: Date.now(), updatedAt: Date.now() });
  }
  savePersistedQueue(list);
  notifyQueueListeners();
}

function removeQueueTask(bookingId, containerId, photoId, photoVersion) {
  const list = loadPersistedQueue().filter(
    t => !(
      t.bookingId === bookingId &&
      t.containerId === containerId &&
      t.photoId === photoId &&
      (!photoVersion || t.photoVersion === photoVersion)
    )
  );
  savePersistedQueue(list);
  notifyQueueListeners();
}

export function getPendingSealTasks(filter = {}) {
  return loadPersistedQueue().filter(t => {
    if (filter.bookingId && t.bookingId !== filter.bookingId) return false;
    if (filter.containerId && t.containerId !== filter.containerId) return false;
    return true;
  });
}

function notifyQueueListeners(detail = {}) {
  for (const fn of runtimeListeners) {
    try {
      fn(detail);
    } catch {
      // ignore listener errors
    }
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('unispect-provisional-seals-updated', { detail }));
    } catch {
      // ignore
    }
  }
}

export function subscribeProvisionalSealQueue(listener) {
  runtimeListeners.add(listener);
  return () => runtimeListeners.delete(listener);
}

/**
 * Verifica se a foto possui fonte local imediata (Blob, DataURL, ObjectURL ou buffer de pixels)
 * que pode ser processada mesmo sem internet.
 */
function hasLocalImageSource(photo) {
  if (!photo) return false;
  if (photo.file && typeof Blob !== 'undefined' && photo.file instanceof Blob) return true;
  if (photo.blob && typeof Blob !== 'undefined' && photo.blob instanceof Blob) return true;
  if (photo.rawPixels && photo.rawPixels.data) return true;
  const src = String(photo.dataUrl || photo.localUrl || photo.url || '');
  return src.startsWith('data:') || src.startsWith('blob:');
}

function isOfflineAndRemoteOnly(photo, forceOffline = false) {
  const isOffline = forceOffline || (typeof navigator !== 'undefined' && navigator.onLine === false);
  if (!isOffline) return false;
  return !hasLocalImageSource(photo);
}

/**
 * Determina se uma foto precisa ser analisada pelo reconhecimento de lacres provisórios.
 * - Analisa inicialmente as fotos existentes (sem estado gravado).
 * - Nas próximas atualizações, processa somente fotos novas, com nova versão de imagem, ou ainda pendentes.
 * - Fotos com status 'failed' só reprocessam quando retryFailed=true ou explicitReview=true.
 */
export function shouldProcessPhotoForSeals(container, photo, options = {}) {
  if (!photo || !photo.id) return false;
  const source = photo.rawPixels || photo.file || photo.blob || photo.dataUrl || photo.localUrl || photo.url;
  if (!source) return false;

  const currentVersion = getPhotoVersionKey(photo);
  const stateMap = container?.sealRecognitionState || {};
  const prevState = stateMap[photo.id];

  if (options.explicitReview) return true;
  if (!prevState) return true;

  // Se a versão da imagem mudou, precisa processar a nova versão
  if (prevState.photoVersion !== currentVersion) return true;

  if (prevState.status === 'pending' || prevState.status === 'pending_offline') return true;
  if (prevState.status === 'failed' && options.retryFailed) return true;

  return false;
}

/**
 * Retorna a lista de sugestões duvidosas/incompletas pendentes de conferência para um container (Regra 6).
 */
export function getPendingDoubtfulSealReviews(container) {
  if (!container) return [];
  const stateMap = container.sealRecognitionState || {};
  const dismissed = new Set(container.dismissedSealReviews || []);
  const currentSeals = new Set(
    (container.provisionalSeals || []).map(s => normalizeProvisionalSealNumber(s).toUpperCase()).filter(Boolean)
  );
  const photosById = new Map((container.photos || []).map(p => [String(p.id), p]));

  const reviews = [];
  for (const [photoId, st] of Object.entries(stateMap)) {
    // Se a foto foi excluída do container, não exibe revisão para ela
    if (photosById.size > 0 && !photosById.has(String(photoId))) continue;
    const photo = photosById.get(String(photoId)) || { id: photoId, url: st.photoUrl || '' };
    const doubtfulList = Array.isArray(st?.doubtfulSeals) ? st.doubtfulSeals : [];

    for (let idx = 0; idx < doubtfulList.length; idx++) {
      const item = doubtfulList[idx];
      const suggested = normalizeProvisionalSealNumber(item?.suggestedNumber || '');
      const reviewKey = `${photoId}::${st.photoVersion || ''}::${suggested || `illegible_${idx}`}`;
      if (dismissed.has(reviewKey)) continue;
      if (suggested && currentSeals.has(suggested.toUpperCase())) continue;

      reviews.push({
        reviewKey,
        photoId: String(photoId),
        photoVersion: st.photoVersion || getPhotoVersionKey(photo),
        photoUrl: photo.url || photo.dataUrl || photo.localUrl || st.photoUrl || '',
        suggestedNumber: suggested,
        confidence: item?.confidence || 0,
        reason: item?.reason || 'Leitura incompleta ou duvidosa — confira a foto antes de confirmar',
        clientId: st.clientId || 'client_interport',
        bookingId: st.bookingId || '',
        containerId: container.id
      });
    }
  }
  return reviews;
}

/**
 * Executa o reconhecimento em segundo plano das fotos vinculadas a um Container.
 * Não bloqueia a interface, a captura de fotos ou os uploads.
 */
export async function processContainerProvisionalSeals({
  container,
  bookingId = '',
  clientId = 'client_interport',
  photos = null,
  retryFailed = false,
  explicitReview = false,
  forceOffline = false,
  requestedBy = null,
  authenticatedUser = null,
  customOcrRunner = null,
  mutateContainerSeals = null,
  onContainerUpdated = null
} = {}) {
  if (!container || !container.id) return container;

  const effectiveClientId = clientId || container.clientId || 'client_interport';
  const effectiveBookingId = bookingId || container.bookingId || '';
  const photoList = Array.isArray(photos) ? photos : (container.photos || []);
  const mutator = mutateContainerSeals || defaultMutator;

  let workingContainer = { ...container };

  // Se o inspetor solicitou revisão explícita (Regra 8), libera o bloqueio das fotos revisadas
  const targetPhotos = photoList.filter(p =>
    shouldProcessPhotoForSeals(workingContainer, p, { retryFailed, explicitReview })
  );

  if (targetPhotos.length === 0) {
    return workingContainer;
  }

  for (const photo of targetPhotos) {
    const photoId = String(photo.id);
    const photoVersion = getPhotoVersionKey(photo);
    const taskKey = getTaskKey(effectiveClientId, effectiveBookingId, workingContainer.id, photoId, photoVersion);

    // Se estiver offline e a foto não tiver fonte local em memória, mantém pendente na fila para retomada
    if (isOfflineAndRemoteOnly(photo, forceOffline)) {
      const offlineMutation = {
        clientId: effectiveClientId,
        bookingId: effectiveBookingId,
        photoRecognition: {
          photoId,
          photoVersion,
          photoUrl: photo.url || '',
          status: 'pending_offline',
          confirmedSeals: [],
          doubtfulSeals: [],
          error: 'Aguardando conexão para analisar esta foto.',
          updatedAt: Date.now()
        }
      };
      workingContainer = mergeContainerProvisionalSeals(workingContainer, offlineMutation);
      upsertQueueTask({
        taskKey,
        clientId: effectiveClientId,
        bookingId: effectiveBookingId,
        containerId: workingContainer.id,
        containerNumber: workingContainer.containerNumber || '',
        definiteSeal: workingContainer.definiteSeal || '',
        photo: {
          id: photo.id,
          url: photo.url || '',
          storagePath: photo.storagePath || '',
          sizeBytes: photo.sizeBytes || 0,
          compressionVersion: photo.compressionVersion || '1'
        },
        photoId,
        photoVersion,
        status: 'pending_offline'
      });
      if (onContainerUpdated) onContainerUpdated(workingContainer);
      continue;
    }

    // Evita trabalho concorrente duplicado para a mesma foto e mesma versão da imagem
    if (activeTasks.has(taskKey)) {
      try {
        await activeTasks.get(taskKey);
      } catch {
        // ignore
      }
      continue;
    }

    const taskPromise = (async () => {
      try {
        notifyQueueListeners({
          type: 'processing_started',
          bookingId: effectiveBookingId,
          containerId: workingContainer.id,
          photoId,
          photoVersion
        });

        const imageSource = photo.rawPixels || photo.file || photo.blob || photo.dataUrl || photo.localUrl || photo.url;
        const ocrResult = await recognizeInterportSealsInPhoto(imageSource, {
          containerNumber: workingContainer.containerNumber || '',
          definiteSeal: workingContainer.definiteSeal || '',
          customOcrRunner
        });

        const confirmedNumbers = (ocrResult?.confirmed || [])
          .map(c => normalizeProvisionalSealNumber(c.sealNumber))
          .filter(Boolean);
        const doubtfulItems = (ocrResult?.doubtful || []).map(d => ({
          suggestedNumber: normalizeProvisionalSealNumber(d.suggestedNumber || ''),
          confidence: d.confidence || 0,
          reason: d.reason || 'Leitura incompleta ou duvidosa — confira na foto'
        }));

        const capturedByObj = photo.capturedBy || (photo.authorId || photo.authorName
          ? { id: photo.authorId || null, name: photo.authorName || 'não identificado' }
          : (workingContainer.responsibleInspector
              ? { id: workingContainer.responsibleInspector.id, name: workingContainer.responsibleInspector.name }
              : null));
        const effectiveRequestedBy = requestedBy || authenticatedUser || null;

        const mutation = {
          clientId: effectiveClientId,
          bookingId: effectiveBookingId,
          forceReinsert: Boolean(explicitReview),
          clearRemovedForPhotoIds: explicitReview ? [photoId] : [],
          requestedBy: effectiveRequestedBy,
          addSeals: confirmedNumbers.map(num => ({
            sealNumber: num,
            photoId,
            photoVersion,
            clientId: effectiveClientId,
            bookingId: effectiveBookingId,
            containerId: workingContainer.id,
            // Reconhecimento automático a partir da foto SEMPRE registra source: 'ocr' (executado por "Sistema"),
            // mesmo quando disparado por botão de revisão explícita (forceReinsert libera bloqueio de exclusão manual).
            source: 'ocr',
            capturedBy: capturedByObj,
            requestedBy: effectiveRequestedBy
          })),
          photoRecognition: {
            photoId,
            photoVersion,
            photoUrl: photo.url || photo.dataUrl || '',
            status: doubtfulItems.length > 0 ? 'review_required' : 'completed',
            confirmedSeals: confirmedNumbers,
            doubtfulSeals: doubtfulItems,
            error: null,
            updatedAt: Date.now()
          }
        };

        workingContainer = mergeContainerProvisionalSeals(workingContainer, mutation);

        if (typeof mutator === 'function' && effectiveBookingId) {
          const savedBooking = await mutator(effectiveBookingId, workingContainer.id, mutation);
          const remoteCont = (savedBooking?.containers || []).find(c => c.id === workingContainer.id);
          if (remoteCont) {
            workingContainer = {
              ...workingContainer,
              ...remoteCont,
              photos: workingContainer.photos || remoteCont.photos
            };
          }
        }

        removeQueueTask(effectiveBookingId, workingContainer.id, photoId, photoVersion);
        if (onContainerUpdated) onContainerUpdated(workingContainer);
        notifyQueueListeners({
          type: 'processing_completed',
          bookingId: effectiveBookingId,
          containerId: workingContainer.id,
          photoId,
          photoVersion,
          confirmedSeals: confirmedNumbers,
          doubtfulSeals: doubtfulItems
        });
      } catch (err) {
        const errMsg = err?.message || String(err || 'Falha ao analisar foto');
        const failMutation = {
          clientId: effectiveClientId,
          bookingId: effectiveBookingId,
          photoRecognition: {
            photoId,
            photoVersion,
            photoUrl: photo.url || '',
            status: 'failed',
            confirmedSeals: [],
            doubtfulSeals: [],
            error: errMsg,
            attempts: ((workingContainer.sealRecognitionState?.[photoId]?.attempts) || 0) + 1,
            updatedAt: Date.now()
          }
        };
        workingContainer = mergeContainerProvisionalSeals(workingContainer, failMutation);
        upsertQueueTask({
          taskKey,
          clientId: effectiveClientId,
          bookingId: effectiveBookingId,
          containerId: workingContainer.id,
          containerNumber: workingContainer.containerNumber || '',
          definiteSeal: workingContainer.definiteSeal || '',
          photo: {
            id: photo.id,
            url: photo.url || '',
            storagePath: photo.storagePath || '',
            sizeBytes: photo.sizeBytes || 0,
            compressionVersion: photo.compressionVersion || '1'
          },
          photoId,
          photoVersion,
          status: 'failed',
          error: errMsg
        });
        if (typeof mutator === 'function' && effectiveBookingId) {
          await mutator(effectiveBookingId, workingContainer.id, failMutation).catch(() => {});
        }
        if (onContainerUpdated) onContainerUpdated(workingContainer);
        notifyQueueListeners({
          type: 'processing_failed',
          bookingId: effectiveBookingId,
          containerId: workingContainer.id,
          photoId,
          photoVersion,
          error: errMsg
        });
      } finally {
        activeTasks.delete(taskKey);
      }
    })();

    activeTasks.set(taskKey, taskPromise);
    await taskPromise;
  }

  return workingContainer;
}

/**
 * Confirma uma leitura duvidosa/incompleta após conferência humana (Regra 6).
 */
export async function confirmDoubtfulSealReview({
  container,
  bookingId = '',
  clientId = 'client_interport',
  reviewKey,
  photoId,
  photoVersion,
  confirmedNumber,
  authenticatedUser = null,
  mutateContainerSeals = null,
  onContainerUpdated = null
}) {
  const cleanNum = normalizeProvisionalSealNumber(confirmedNumber);
  if (!cleanNum) throw new Error('Informe a numeração completa do lacre provisório para confirmar.');

  const mutator = mutateContainerSeals || defaultMutator;
  const mutation = {
    clientId: clientId || container?.clientId || 'client_interport',
    bookingId: bookingId || container?.bookingId || '',
    authenticatedUser,
    forceReinsert: true,
    addSeals: [{
      sealNumber: cleanNum,
      photoId: String(photoId || ''),
      photoVersion: String(photoVersion || ''),
      clientId: clientId || 'client_interport',
      bookingId: bookingId || '',
      containerId: container?.id || '',
      source: 'review'
    }],
    resolveReviewKeys: reviewKey ? [reviewKey] : []
  };

  let updatedContainer = mergeContainerProvisionalSeals(container, mutation);
  if (typeof mutator === 'function' && bookingId) {
    const savedBooking = await mutator(bookingId, container.id, mutation);
    const remoteCont = (savedBooking?.containers || []).find(c => c.id === container.id);
    if (remoteCont) {
      updatedContainer = { ...updatedContainer, ...remoteCont, photos: updatedContainer.photos || remoteCont.photos };
    }
  }
  if (onContainerUpdated) onContainerUpdated(updatedContainer);
  notifyQueueListeners({ type: 'review_confirmed', bookingId, containerId: container.id, sealNumber: cleanNum });
  return updatedContainer;
}

/**
 * Descarta uma sugestão duvidosa após conferência humana (Regra 6).
 */
export async function dismissDoubtfulSealReview({
  container,
  bookingId = '',
  clientId = 'client_interport',
  reviewKey,
  mutateContainerSeals = null,
  onContainerUpdated = null
}) {
  const mutator = mutateContainerSeals || defaultMutator;
  const mutation = {
    clientId: clientId || container?.clientId || 'client_interport',
    bookingId: bookingId || container?.bookingId || '',
    resolveReviewKeys: reviewKey ? [reviewKey] : []
  };

  let updatedContainer = mergeContainerProvisionalSeals(container, mutation);
  if (typeof mutator === 'function' && bookingId) {
    const savedBooking = await mutator(bookingId, container.id, mutation);
    const remoteCont = (savedBooking?.containers || []).find(c => c.id === container.id);
    if (remoteCont) {
      updatedContainer = { ...updatedContainer, ...remoteCont, photos: updatedContainer.photos || remoteCont.photos };
    }
  }
  if (onContainerUpdated) onContainerUpdated(updatedContainer);
  notifyQueueListeners({ type: 'review_dismissed', bookingId, containerId: container.id, reviewKey });
  return updatedContainer;
}

/**
 * Retoma automaticamente as tarefas que ficaram pendentes offline quando a conexão retorna.
 */
export async function resumePendingOfflineSealTasks({ customOcrRunner = null, mutateContainerSeals = null } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return [];
  const tasks = loadPersistedQueue().filter(t => t.status === 'pending_offline' || t.status === 'failed');
  const results = [];
  for (const task of tasks) {
    if (!task.photo?.url) continue;
    const dummyContainer = {
      id: task.containerId,
      containerNumber: task.containerNumber || '',
      definiteSeal: task.definiteSeal || '',
      photos: [task.photo],
      sealRecognitionState: {}
    };
    const res = await processContainerProvisionalSeals({
      container: dummyContainer,
      bookingId: task.bookingId,
      clientId: task.clientId,
      photos: [task.photo],
      retryFailed: true,
      customOcrRunner,
      mutateContainerSeals: mutateContainerSeals || defaultMutator
    });
    results.push(res);
  }
  return results;
}

export function startProvisionalSealQueueListener() {
  if (onlineListenerAttached || typeof window === 'undefined') return;
  onlineListenerAttached = true;
  window.addEventListener('online', () => {
    void resumePendingOfflineSealTasks().catch(() => {});
  });
}

