import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {
  normalizeProvisionalSealNumber,
  detectInterportMarker,
  extractInterportSealsFromText,
  encodeRgbaToBmp,
  recognizeInterportSealsInPhoto,
  terminateSharedSealWorker
} from '../src/utils/interportSealOcr.js';
import {
  mergeContainerProvisionalSeals,
  createConcurrentRepository
} from '../src/utils/bookingConcurrent.js';
import {
  getPhotoVersionKey,
  shouldProcessPhotoForSeals,
  processContainerProvisionalSeals,
  getPendingDoubtfulSealReviews,
  confirmDoubtfulSealReview,
  dismissDoubtfulSealReview
} from '../src/utils/provisionalSealQueue.js';

after(async () => {
  await terminateSharedSealWorker();
});

const PHOTO_005745_PATH = fs.existsSync('tests/fixtures/interport_seal_005745.jpg')
  ? 'tests/fixtures/interport_seal_005745.jpg'
  : 'C:/Users/unisp/.gemini/antigravity/brain/2f2570f4-04b0-4f58-8329-edcbc2fc4c40/.user_uploaded/media_1793570998994_4cd7b494.jpg';

const PHOTO_005723_PATH = fs.existsSync('tests/fixtures/interport_seal_005723.jpg')
  ? 'tests/fixtures/interport_seal_005723.jpg'
  : 'C:/Users/unisp/.gemini/antigravity/brain/2f2570f4-04b0-4f58-8329-edcbc2fc4c40/.user_uploaded/media_1793570998995_bb8863ff.jpg';

// Utilitários de transformação de imagem real para cenários de validação (inclinação, múltiplos lacres, ilegível)
function decodePngDataUrl(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const buf = Buffer.from(b64, 'base64');
  let offset = 8;
  let width = 0, height = 0, bitDepth = 8, colorType = 2;
  const idatChunks = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idatChunks.push(data);
    else if (type === 'IEND') break;
    offset += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const bpp = (bitDepth * channels) >> 3;
  const stride = width * bpp;
  const rgba = new Uint8Array(width * height * 4);
  const prevLine = new Uint8Array(stride);
  const currLine = new Uint8Array(stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
  };
  let srcIdx = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[srcIdx++];
    for (let i = 0; i < stride; i++) {
      const x = raw[srcIdx++];
      const a = i >= bpp ? currLine[i - bpp] : 0;
      const b = prevLine[i];
      const c = i >= bpp ? prevLine[i - bpp] : 0;
      let val = x;
      if (filter === 1) val = (x + a) & 255;
      else if (filter === 2) val = (x + b) & 255;
      else if (filter === 3) val = (x + ((a + b) >> 1)) & 255;
      else if (filter === 4) val = (x + paeth(a, b, c)) & 255;
      currLine[i] = val;
    }
    prevLine.set(currLine);
    for (let x = 0; x < width; x++) {
      const dst = (y * width + x) * 4;
      rgba[dst] = currLine[x * channels];
      rgba[dst + 1] = currLine[x * channels + 1];
      rgba[dst + 2] = currLine[x * channels + 2];
      rgba[dst + 3] = 255;
    }
  }
  return { width, height, data: rgba };
}

function rotateRgba(img, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const w = img.width, h = img.height;
  const out = new Uint8Array(w * h * 4);
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.round(cx + (x - cx) * cos + (y - cy) * sin);
      const sy = Math.round(cy - (x - cx) * sin + (y - cy) * cos);
      const dst = (y * w + x) * 4;
      if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
        const src = (sy * w + sx) * 4;
        out[dst] = img.data[src];
        out[dst + 1] = img.data[src + 1];
        out[dst + 2] = img.data[src + 2];
        out[dst + 3] = 255;
      } else {
        out[dst] = 120; out[dst + 1] = 110; out[dst + 2] = 90; out[dst + 3] = 255;
      }
    }
  }
  return { width: w, height: h, data: out };
}

function combineTwoPhotosSideBySide(img1, img2) {
  const w = img1.width + img2.width;
  const h = Math.max(img1.height, img2.height);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < img1.height; y++) {
    for (let x = 0; x < img1.width; x++) {
      const src = (y * img1.width + x) * 4;
      const dst = (y * w + x) * 4;
      out[dst] = img1.data[src]; out[dst + 1] = img1.data[src + 1]; out[dst + 2] = img1.data[src + 2]; out[dst + 3] = 255;
    }
  }
  for (let y = 0; y < img2.height; y++) {
    for (let x = 0; x < img2.width; x++) {
      const src = (y * img2.width + x) * 4;
      const dst = (y * w + (img1.width + x)) * 4;
      out[dst] = img2.data[src]; out[dst + 1] = img2.data[src + 1]; out[dst + 2] = img2.data[src + 2]; out[dst + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

function makeIllegibleSealPhoto(img) {
  const out = new Uint8Array(img.data);
  const w = img.width, h = img.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = out[idx], g = out[idx + 1], b = out[idx + 2];
      if (r > 120 && g > 95 && b < 110 && (r - b) > 45) {
        out[idx] = 225;
        out[idx + 1] = 195;
        out[idx + 2] = 15;
      }
    }
  }
  return { width: w, height: h, data: out };
}

test('1. Fotos reais Interport: reconhece 005745 e 005723 preservando zeros à esquerda e ignorando container/placa/lacre definitivo', async () => {
  const res1 = await recognizeInterportSealsInPhoto(PHOTO_005745_PATH, {
    containerNumber: 'MSCU1234567',
    definiteSeal: 'DEF998877'
  });
  assert.equal(res1.confirmed.length, 1);
  assert.strictEqual(res1.confirmed[0].sealNumber, '005745');
  assert.strictEqual(typeof res1.confirmed[0].sealNumber, 'string');
  assert.equal(res1.doubtful.length, 0);

  const res2 = await recognizeInterportSealsInPhoto(PHOTO_005723_PATH, {
    containerNumber: 'MSCU1234567',
    definiteSeal: 'DEF998877'
  });
  assert.equal(res2.confirmed.length, 1);
  assert.strictEqual(res2.confirmed[0].sealNumber, '005723');
  assert.strictEqual(typeof res2.confirmed[0].sealNumber, 'string');
  assert.equal(res2.doubtful.length, 0);
});

test('2. Validação com fotos reais: lacre inclinado (22°), vários lacres na mesma foto e imagem ilegível', async () => {
  const Tesseract = await import('tesseract.js');
  const worker = await Tesseract.createWorker('eng', 1, { langPath: 'public/tessdata', cachePath: '.' });
  const d1 = await worker.recognize(PHOTO_005745_PATH, {}, { text: false, imageColor: true });
  const d2 = await worker.recognize(PHOTO_005723_PATH, {}, { text: false, imageColor: true });
  await worker.terminate();

  const img1 = decodePngDataUrl(d1.data.imageColor);
  const img2 = decodePngDataUrl(d2.data.imageColor);

  // 2.1 Lacre inclinado (22°)
  const tiltedImg = rotateRgba(img1, 22);
  const tiltedRes = await recognizeInterportSealsInPhoto(tiltedImg, { containerNumber: 'MSCU1234567' });
  assert.deepEqual(tiltedRes.confirmed.map(c => c.sealNumber), ['005745']);
  assert.equal(tiltedRes.doubtful.length, 0);

  // 2.2 Vários lacres na mesma foto (005745 + 005723)
  const multiImg = combineTwoPhotosSideBySide(img1, img2);
  const multiRes = await recognizeInterportSealsInPhoto(multiImg, { containerNumber: 'MSCU1234567' });
  const multiNumbers = multiRes.confirmed.map(c => c.sealNumber).sort();
  assert.deepEqual(multiNumbers, ['005723', '005745']);

  // 2.3 Imagem ilegível / desfocada: não inventa dígitos e sinaliza para conferência (Regra 6)
  const blurredImg = makeIllegibleSealPhoto(img1);
  const blurredRes = await recognizeInterportSealsInPhoto(blurredImg, { containerNumber: 'MSCU1234567' });
  assert.equal(blurredRes.confirmed.length, 0);
  assert.ok(blurredRes.doubtful.length >= 1, 'Deve sinalizar leitura ilegível/duvidosa para conferência');
  assert.equal(blurredRes.doubtful[0].suggestedNumber, '');
});

test('3. Regras de filtro e desambiguação textual: ignora container ISO 6346, placas Mercosul, pesos e lacre definitivo; captura leitura incompleta para conferência', () => {
  assert.equal(normalizeProvisionalSealNumber('005745'), '005745');
  assert.equal( detectInterportMarker('INTERPORT 005745').matched, true);

  const sample = extractInterportSealsFromText([
    'MSCU 123456-7 22G1 TARE 3780 KG MAX GROSS 30480 KG PLACA ABC1D23 DEF998877',
    'INTERPORT 005745',
    'INTERPORT 00579' // Leitura incompleta de 5 dígitos de outro lacre -> vai para doubtful
  ], {
    containerNumber: 'MSCU1234567',
    definiteSeal: 'DEF998877'
  });

  assert.deepEqual(sample.confirmed.map(c => c.sealNumber), ['005745']);
  assert.equal(sample.doubtful.length, 1);
  assert.equal(sample.doubtful[0].suggestedNumber, '00579');
});

test('4. Campo já preenchido, repetição do mesmo lacre em várias fotos, vínculo de origem (Regra 7) e exclusão manual (Regra 8)', async () => {
  let container = {
    id: 'cont_101',
    containerNumber: 'MSCU1234567',
    definiteSeal: 'DEF998877',
    provisionalSeals: ['MANUAL-01', '001200'], // Campo já preenchido manualmente (Regra 5)
    photos: [
      { id: 'photo_A', url: PHOTO_005745_PATH, compressionVersion: '1', sizeBytes: 41000 },
      { id: 'photo_B', url: PHOTO_005745_PATH, compressionVersion: '1', sizeBytes: 41000 }, // Repetição do mesmo lacre 005745
      { id: 'photo_C', url: PHOTO_005723_PATH, compressionVersion: '1', sizeBytes: 42000 }  // Segundo lacre 005723
    ]
  };

  container = await processContainerProvisionalSeals({
    container,
    bookingId: 'bk_500',
    clientId: 'client_interport'
  });

  // Regra 2, 3, 4 e 5: preserva manuais, adiciona 005745 e 005723 como texto com zeros à esquerda, sem duplicar 005745
  assert.deepEqual(container.provisionalSeals, ['MANUAL-01', '001200', '005745', '005723']);

  // Regra 7: Vínculo com foto de origem, cliente, booking e container
  const prov5745 = container.sealProvenance['005745'];
  assert.ok(prov5745);
  assert.equal(prov5745.clientId, 'client_interport');
  assert.equal(prov5745.bookingId, 'bk_500');
  assert.equal(prov5745.containerId, 'cont_101');
  assert.deepEqual(prov5745.photoIds, ['photo_A', 'photo_B']);

  // Nas próximas atualizações, fotos já processadas na mesma versão não são reprocessadas
  assert.equal(shouldProcessPhotoForSeals(container, container.photos[0]), false);

  // Regra 8: Inspetor exclui manualmente o lacre '005745'
  container = mergeContainerProvisionalSeals(container, {
    removeSeals: [{ sealNumber: '005745' }],
    clientId: 'client_interport',
    bookingId: 'bk_500'
  });
  assert.deepEqual(container.provisionalSeals, ['MANUAL-01', '001200', '005723']);

  // Mesmo se uma tentativa automática rodar novamente pela mesma foto, '005745' NÃO é reinserido sem revisão explícita
  container = mergeContainerProvisionalSeals(container, {
    addSeals: [{ sealNumber: '005745', photoId: 'photo_A', photoVersion: getPhotoVersionKey(container.photos[0]), source: 'ocr' }]
  });
  assert.deepEqual(container.provisionalSeals, ['MANUAL-01', '001200', '005723']);

  // Ação explícita de revisão restaura o lacre
  container = await processContainerProvisionalSeals({
    container,
    bookingId: 'bk_500',
    clientId: 'client_interport',
    explicitReview: true
  });
  assert.deepEqual(container.provisionalSeals, ['MANUAL-01', '001200', '005723', '005745']);
});

test('5. Atualização simultânea por dois usuários e retomada após falha / modo offline', async () => {
  // Simula banco transacional para dois usuários simultâneos
  const store = new Map();
  store.set('bookings/bk_concurrent', {
    id: 'bk_concurrent',
    clientId: 'client_interport',
    _revision: 1,
    containers: [
      {
        id: 'cont_shared',
        containerNumber: 'MSCU7654321',
        provisionalSeals: ['000111'],
        photos: [
          { id: 'p_1', url: 'https://storage.example/p_1.jpg', compressionVersion: '1', sizeBytes: 35000 },
          { id: 'p_2', url: 'https://storage.example/p_2.jpg', compressionVersion: '1', sizeBytes: 36000 }
        ]
      }
    ]
  });

  const repo = createConcurrentRepository({
    reference: (col, id) => `${col}/${id}`,
    transaction: async fn => {
      const tx = {
        get: async ref => ({
          exists: () => store.has(ref),
          data: () => structuredClone(store.get(ref))
        }),
        update: (ref, patch) => {
          const cur = structuredClone(store.get(ref));
          store.set(ref, { ...cur, ...patch });
        }
      };
      return fn(tx);
    }
  });

  // Dois usuários / processos gravando lacres simultaneamente no mesmo container
  await Promise.all([
    repo.mutateProvisionalSeals('bk_concurrent', 'cont_shared', {
      addSeals: [{ sealNumber: '005745', photoId: 'p_1', source: 'ocr' }]
    }),
    repo.mutateProvisionalSeals('bk_concurrent', 'cont_shared', {
      addSeals: [{ sealNumber: '005723', photoId: 'p_2', source: 'manual' }]
    })
  ]);

  const savedBooking = store.get('bookings/bk_concurrent');
  const sharedCont = savedBooking.containers[0];
  assert.deepEqual(sharedCont.provisionalSeals, ['000111', '005745', '005723']);

  // Teste de Offline -> Falha -> Retomada após falha sem duplicar resultados
  let contRetry = {
    id: 'cont_retry',
    containerNumber: 'MSCU9999999',
    provisionalSeals: [],
    photos: [
      { id: 'p_retry', url: 'https://storage.example/p_retry.jpg', compressionVersion: '1', sizeBytes: 40000 }
    ]
  };

  // 1) Offline: mantém tarefa pendente (pending_offline)
  contRetry = await processContainerProvisionalSeals({
    container: contRetry,
    bookingId: 'bk_retry',
    clientId: 'client_interport',
    forceOffline: true
  });
  assert.equal(contRetry.sealRecognitionState.p_retry.status, 'pending_offline');
  assert.deepEqual(contRetry.provisionalSeals, []);

  // 2) Online porém falha na primeira tentativa de leitura
  let shouldFail = true;
  contRetry = await processContainerProvisionalSeals({
    container: contRetry,
    bookingId: 'bk_retry',
    clientId: 'client_interport',
    customOcrRunner: async () => {
      if (shouldFail) throw new Error('Falha temporária de leitura');
      return {
        confirmed: [{ sealNumber: '005745', confidence: 0.96 }],
        doubtful: [
          { suggestedNumber: '00579', confidence: 0.65, reason: 'Leitura parcial de 5 dígitos' }
        ]
      };
    }
  });
  assert.equal(contRetry.sealRecognitionState.p_retry.status, 'failed');
  assert.deepEqual(contRetry.provisionalSeals, []);

  // 3) Retomada após falha (retryFailed: true): reconhece 005745 sem duplicar e apresenta sugestão duvidosa para conferência
  shouldFail = false;
  contRetry = await processContainerProvisionalSeals({
    container: contRetry,
    bookingId: 'bk_retry',
    clientId: 'client_interport',
    retryFailed: true,
    customOcrRunner: async () => ({
      confirmed: [{ sealNumber: '005745', confidence: 0.96 }],
      doubtful: [
        { suggestedNumber: '00579', confidence: 0.65, reason: 'Leitura parcial de 5 dígitos' }
      ]
    })
  });
  assert.deepEqual(contRetry.provisionalSeals, ['005745']);
  const reviews = getPendingDoubtfulSealReviews(contRetry);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].suggestedNumber, '00579');

  // Inspetor confere a sugestão duvidosa e confirma '005790'
  contRetry = await confirmDoubtfulSealReview({
    container: contRetry,
    bookingId: 'bk_retry',
    clientId: 'client_interport',
    reviewKey: reviews[0].reviewKey,
    photoId: reviews[0].photoId,
    photoVersion: reviews[0].photoVersion,
    confirmedNumber: '005790'
  });
  assert.deepEqual(contRetry.provisionalSeals, ['005745', '005790']);
  assert.equal(getPendingDoubtfulSealReviews(contRetry).length, 0);
});
