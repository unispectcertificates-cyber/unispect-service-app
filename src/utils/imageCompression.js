/**
 * imageCompression.js
 * Módulo padronizado de compressão e redimensionamento adaptativo de fotos para o Unispect.
 * Atende câmera, galeria e Modo Campo com regra estrita de até 45.000 bytes por foto.
 * 
 * Regras:
 * - Saída em JPEG (image/jpeg).
 * - Fotos horizontais (landscape): caber em 1024 × 768 px.
 * - Fotos verticais (portrait): caber em 768 × 1024 px.
 * - Preserva proporção e orientação, sem cortes ou ampliação de imagens menores.
 * - Limite de 45.000 bytes medido por Blob.size.
 * - Ajuste adaptativo de qualidade JPEG buscando a maior qualidade possível que caiba no limite.
 * - Cada tentativa parte do mesmo canvas preparado (sem recompressões sucessivas em cascata).
 * - Caso não atinja o limite nas dimensões alvo, não reduz resolução silenciosamente nem descarta a foto:
 *   registra explicitamente targetLimitExceeded e devolve a melhor qualidade viável.
 * - Tratamento seguro de exceções para nunca perder a captura do inspetor.
 */

export const MAX_DIMENSIONS = {
  landscape: { width: 1024, height: 768 },
  portrait: { width: 768, height: 1024 }
};

export const MAX_PHOTO_BYTES = 45000; // 45.000 bytes
export const COMPRESSION_VERSION = '2.0';

/**
 * Calcula dimensões mantendo proporção exata e orientação,
 * sem cortar e sem ampliar imagens menores.
 */
export function calculateTargetDimensions(naturalWidth, naturalHeight) {
  if (!naturalWidth || !naturalHeight || naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: 1024, height: 768, scale: 1, isLandscape: true };
  }

  const isLandscape = naturalWidth >= naturalHeight;
  const box = isLandscape ? MAX_DIMENSIONS.landscape : MAX_DIMENSIONS.portrait;

  // scale <= 1 garante que imagens menores NUNCA sejam ampliadas
  const scale = Math.min(1, box.width / naturalWidth, box.height / naturalHeight);
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  return {
    width,
    height,
    scale,
    isLandscape,
    maxAllowedWidth: box.width,
    maxAllowedHeight: box.height
  };
}

/**
 * Converte canvas em Blob com formato e qualidade especificados.
 */
export function canvasToBlob(canvas, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (typeof canvas?.toBlob === 'function') {
      canvas.toBlob(
        blob => {
          if (blob) resolve(blob);
          else reject(new Error('Falha ao converter canvas para Blob.'));
        },
        'image/jpeg',
        quality
      );
    } else if (typeof canvas?.toDataURL === 'function') {
      // Fallback para ambientes sem toBlob nativo
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const parts = dataUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        const binStr = atob(parts[1]);
        const len = binStr.length;
        const u8arr = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          u8arr[i] = binStr.charCodeAt(i);
        }
        resolve(new Blob([u8arr], { type: mime }));
      } catch (err) {
        reject(err);
      }
    } else {
      reject(new Error('Canvas não suporta conversão para Blob ou DataURL.'));
    }
  });
}

/**
 * Converte Blob para DataURL Base64
 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Falha ao ler Blob para DataURL.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Carrega elemento Image a partir de um File, Blob ou DataURL.
 */
function loadImageElement(fileOrBlob) {
  return new Promise((resolve, reject) => {
    let url = '';
    let isObjectUrl = false;

    if (typeof fileOrBlob === 'string') {
      url = fileOrBlob;
    } else if (fileOrBlob instanceof Blob) {
      url = URL.createObjectURL(fileOrBlob);
      isObjectUrl = true;
    } else {
      reject(new Error('Entrada inválida: esperado File, Blob ou DataURL.'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      if (isObjectUrl) URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (isObjectUrl) URL.revokeObjectURL(url);
      reject(new Error('Falha ao carregar e decodificar os pixels da imagem.'));
    };
    img.src = url;
  });
}

/**
 * Executa a compressão adaptativa a partir de um mesmo canvas preparado.
 * Procura pela maior qualidade JPEG que produza um Blob <= maxBytes.
 */
export async function compressCanvasAdaptively(canvas, {
  maxBytes = MAX_PHOTO_BYTES,
  minQuality = 0.20,
  maxQuality = 0.90,
  iterations = 5
} = {}) {
  let attempts = 0;

  // 1. Testa a qualidade máxima inicial (0.90)
  attempts++;
  const maxBlob = await canvasToBlob(canvas, maxQuality);
  if (maxBlob.size <= maxBytes) {
    // Imagem simples que já cabe com alta fidelidade
    return {
      blob: maxBlob,
      quality: maxQuality,
      sizeBytes: maxBlob.size,
      withinLimit: true,
      attempts
    };
  }

  // 2. Testa o piso mínimo de qualidade aceitável (0.20)
  attempts++;
  const minBlob = await canvasToBlob(canvas, minQuality);
  if (minBlob.size > maxBytes) {
    // Imagem de altíssima complexidade/ruído: mesmo na qualidade 0.20 excede 45KB.
    // REGRA: NÃO reduz a resolução silenciosamente nem descarta a foto!
    return {
      blob: minBlob,
      quality: minQuality,
      sizeBytes: minBlob.size,
      withinLimit: false,
      targetLimitExceeded: true,
      attempts
    };
  }

  // 3. Busca binária adaptativa no intervalo [minQuality, maxQuality]
  // Cada tentativa chama canvasToBlob diretamente no canvas original preparado.
  let low = minQuality;
  let high = maxQuality;
  let bestBlob = minBlob;
  let bestQuality = minQuality;

  for (let i = 0; i < iterations; i++) {
    attempts++;
    const mid = Math.round(((low + high) / 2) * 100) / 100;
    const blob = await canvasToBlob(canvas, mid);

    if (blob.size <= maxBytes) {
      bestBlob = blob;
      bestQuality = mid;
      low = mid + 0.02; // Tenta uma qualidade um pouco superior
    } else {
      high = mid - 0.02; // Qualidade muito pesada, reduz
    }

    if (high - low < 0.02) break;
  }

  return {
    blob: bestBlob,
    quality: bestQuality,
    sizeBytes: bestBlob.size,
    withinLimit: true,
    attempts
  };
}

/**
 * Função principal compartilhada de compressão para novas fotos.
 * 
 * @param {File|Blob|string} fileOrBlob 
 * @param {Object} options 
 * @returns {Promise<{
 *   blob: Blob,
 *   dataUrl: string,
 *   width: number,
 *   height: number,
 *   originalWidth: number,
 *   originalHeight: number,
 *   sizeBytes: number,
 *   quality: number,
 *   withinLimit: boolean,
 *   targetLimitBytes: number,
 *   targetLimitExceeded?: boolean,
 *   compressionVersion: string,
 *   fallback?: boolean
 * }>}
 */
export async function compressImage(fileOrBlob, options = {}) {
  const maxBytes = options.maxBytes || MAX_PHOTO_BYTES;

  try {
    if (!fileOrBlob) {
      throw new Error('Nenhum arquivo ou Blob foi fornecido para compressão.');
    }

    // 1. Carrega os pixels
    const img = await loadImageElement(fileOrBlob);
    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;

    // 2. Calcula dimensões alvo (1024x768 landscape ou 768x1024 portrait)
    const targetDim = calculateTargetDimensions(origW, origH);

    // 3. Prepara o canvas UMA ÚNICA VEZ
    const canvas = document.createElement('canvas');
    canvas.width = targetDim.width;
    canvas.height = targetDim.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Contexto 2D do Canvas indisponível no ambiente.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetDim.width, targetDim.height);

    // 4. Executa a compressão adaptativa partindo sempre deste mesmo canvas
    const compression = await compressCanvasAdaptively(canvas, {
      maxBytes,
      minQuality: options.minQuality || 0.20,
      maxQuality: options.maxQuality || 0.90,
      iterations: options.iterations || 5
    });

    // 5. Gera dataURL para visualização imediata se necessário
    const dataUrl = await blobToDataUrl(compression.blob);

    return {
      blob: compression.blob,
      dataUrl,
      width: targetDim.width,
      height: targetDim.height,
      originalWidth: origW,
      originalHeight: origH,
      sizeBytes: compression.sizeBytes,
      quality: compression.quality,
      withinLimit: compression.withinLimit,
      targetLimitBytes: maxBytes,
      targetLimitExceeded: Boolean(compression.targetLimitExceeded),
      compressionVersion: COMPRESSION_VERSION,
      format: 'image/jpeg',
      attempts: compression.attempts
    };
  } catch (err) {
    console.warn('compressImage: fallback ativado por erro:', err);

    // Garantia de não perder a captura em caso de erro de decodificação ou canvas
    const fallbackBlob = fileOrBlob instanceof Blob ? fileOrBlob : new Blob([], { type: 'image/jpeg' });
    const fallbackSize = fallbackBlob.size || 0;

    return {
      blob: fallbackBlob,
      dataUrl: typeof fileOrBlob === 'string' ? fileOrBlob : '',
      width: null,
      height: null,
      originalWidth: null,
      originalHeight: null,
      sizeBytes: fallbackSize,
      quality: null,
      withinLimit: fallbackSize > 0 && fallbackSize <= maxBytes,
      targetLimitBytes: maxBytes,
      targetLimitExceeded: fallbackSize > maxBytes,
      compressionVersion: `${COMPRESSION_VERSION}-fallback`,
      format: fallbackBlob.type || 'image/jpeg',
      fallback: true,
      error: err.message || String(err)
    };
  }
}
