import { normalizeContainerNumber } from './containerIdentity.js';
import { validateIso6346CheckDigit } from './containerOcr.js';

/**
 * Normaliza um código de lacre provisório como texto (string),
 * preservando integralmente todos os zeros à esquerda.
 * @param {string|number} raw
 * @returns {string}
 */
export function normalizeProvisionalSealNumber(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim();
}

/**
 * Converte caracteres ambíguos de OCR em dígitos apenas dentro de um token numérico de lacre.
 * Preserva zeros à esquerda.
 */
export function fixSealDigitsOcr(token = '') {
  let substitutions = 0;
  const cleaned = String(token || '')
    .toUpperCase()
    .replace(/[OQCD]/g, () => { substitutions++; return '0'; })
    .replace(/[IL|!]/g, () => { substitutions++; return '1'; })
    .replace(/Z/g, () => { substitutions++; return '2'; })
    .replace(/[S$]/g, () => { substitutions++; return '5'; })
    .replace(/G/g, () => { substitutions++; return '6'; })
    .replace(/B/g, () => { substitutions++; return '8'; });
  return { digits: cleaned, substitutions };
}

/**
 * Verifica se um texto ou linha contém a marca INTERPORT (incluindo variações típicas de OCR
 * sobre superfície cilíndrica amarela, como INTERPORY, INTERPONT, INTERPOR, INTERRRT, INTERP0RT).
 * @param {string} text
 * @returns {{ matched: boolean, exact: boolean, score: number, matchedToken: string }}
 */
export function detectInterportMarker(text = '') {
  const upper = String(text || '').toUpperCase();
  if (!upper) return { matched: false, exact: false, score: 0, matchedToken: '' };

  // Match exato ou quase exato
  const exactRegex = /\b[I1L|]?NTERP[O0Q]R[T1Y7I]?\b/;
  const exactMatch = upper.match(exactRegex);
  if (exactMatch) {
    return {
      matched: true,
      exact: upper.includes('INTERPORT'),
      score: upper.includes('INTERPORT') ? 1.0 : 0.94,
      matchedToken: exactMatch[0]
    };
  }

  // Variações comuns em superfície cilíndrica/curva (ex: INTERRRT, INTERRR, INTERPONT, INTEAPORT, NTERPORT)
  const fuzzyPatterns = [
    /\b[I1L|]?NT[E3]R[PR]{1,3}[O0QA]?[RNM]?[TY17I]?\b/,
    /\bINTER[A-Z0-9]{2,5}\b/,
    /\b[I1L]?NTERP[A-Z0-9]{1,4}\b/,
    /\b[A-Z0-9]{0,2}TERPORT\b/
  ];
  for (const pattern of fuzzyPatterns) {
    const m = upper.match(pattern);
    if (m && m[0].length >= 6) {
      return {
        matched: true,
        exact: false,
        score: 0.85,
        matchedToken: m[0]
      };
    }
  }

  return { matched: false, exact: false, score: 0, matchedToken: '' };
}

/**
 * Verifica se um candidato numérico na verdade faz parte de:
 * - Número de Container ISO 6346 (ex: MSDU8821297, 4 letras + 7 dígitos)
 * - Placa de veículo (ABC1D23 ou ABC-1234)
 * - Pesos (TARE, GROSS, NET, PAYLOAD, KG, LBS)
 * - Código ISO de tipo de container (22G1, 45G1)
 * - Lacre definitivo já cadastrado ou de armador (ML-, MSC, CMA, etc.)
 */
export function isExcludedNonProvisionalNumber(candidateDigits, fullContextText = '', options = {}) {
  const digits = String(candidateDigits || '').trim();
  if (!digits) return true;

  const upper = String(fullContextText || '').toUpperCase();
  const definiteSeal = String(options.definiteSeal || '').trim().toUpperCase();
  const containerNumber = normalizeContainerNumber(options.containerNumber || '');

  // 1. Não confundir com o lacre definitivo cadastrado no container
  if (definiteSeal && (digits === definiteSeal || definiteSeal.endsWith(digits) && digits.length >= 5)) {
    return true;
  }

  // 2. Não confundir com o próprio número do container
  if (containerNumber && containerNumber.includes(digits) && digits.length >= 6) {
    return true;
  }

  // 3. Verifica se faz parte de qualquer número de container ISO 6346 no texto (4 letras + 6/7 dígitos)
  const isoMatches = upper.matchAll(/\b([A-Z]{3}[UJZ])[\s.-]*(\d{6})[\s.-]*(\d?)\b/g);
  for (const m of isoMatches) {
    const serial6 = m[2];
    const serial7 = `${m[2]}${m[3] || ''}`;
    if (digits === serial6 || digits === serial7) {
      return true;
    }
  }
  const compactUpper = upper.replace(/[\s.-]/g, '');
  if (digits.length >= 6) {
    const idx = compactUpper.indexOf(digits);
    if (idx >= 4) {
      const prefix4 = compactUpper.slice(idx - 4, idx);
      if (/^[A-Z]{3}[UJZ]$/.test(prefix4)) {
        return true;
      }
      const full11 = compactUpper.slice(idx - 4, idx + 7);
      if (full11.length === 11 && validateIso6346CheckDigit(full11)) {
        return true;
      }
    }
  }

  // 4. Não confundir com placas Mercosul ou antigas (ex: ABC-1234, ABC1D23)
  const plateRegex = new RegExp(`\\b[A-Z]{3}[\\s-]*${digits.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  if (digits.length === 4 && plateRegex.test(upper)) {
    return true;
  }

  // 5. Não confundir com pesos (KG, KGS, LBS, TARE, TARA, GROSS, MAX, PAYLOAD)
  const escaped = digits.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const weightBefore = new RegExp(`(?:TARE|TARA|GROSS|MAX|NET|PAYLOAD|CAP|WT)[\\s:.-]*${escaped}\\b`, 'i');
  const weightAfter = new RegExp(`\\b${escaped}[\\s.,0]*?(?:KG|KGS|LBS|LB)\\b`, 'i');
  if (weightBefore.test(upper) || weightAfter.test(upper)) {
    return true;
  }

  // 6. Não confundir com prefixos de lacres definitivos de armadores (ML-BR, MSC, CMA, HPL, MAEU, ONEU, etc.)
  const carrierPrefix = new RegExp(`(?:ML-[A-Z]{2}|MSC|CMA|HPL|ONE|MAE|COSCO|HAPAG|SEAL\\s*DEF)[\\s-]*${escaped}\\b`, 'i');
  if (carrierPrefix.test(upper)) {
    return true;
  }

  return false;
}

/**
 * Extrai todos os números de lacres provisórios Interport a partir de um texto OCR
 * (ou múltiplos blocos/linhas de OCR).
 *
 * Regras aplicadas:
 * - Exige vínculo com a identificação INTERPORT (no texto ou confirmado na região do lacre).
 * - Preserva zeros à esquerda como string (ex: "005745", "005723").
 * - Identifica múltiplos lacres se presentes.
 * - Separa leituras confiáveis (`confirmed`) de leituras incompletas ou duvidosas (`doubtful`).
 * - NUNCA inventa dígitos nem preenche silenciosamente números incertos.
 *
 * @param {string|string[]} textInput Texto único ou lista de textos de diferentes rotações/recortes de um mesmo lacre
 * @param {Object} options { containerNumber, definiteSeal, hasYellowSealContext }
 * @returns {{
 *   confirmed: Array<{ sealNumber: string, confidence: number, rawMatch: string }>,
 *   doubtful: Array<{ suggestedNumber: string, confidence: number, reason: string, rawMatch: string }>,
 *   hasInterport: boolean
 * }}
 */
export function extractInterportSealsFromText(textInput = '', options = {}) {
  const texts = Array.isArray(textInput) ? textInput.map(t => String(t || '')) : [String(textInput || '')];
  const combinedText = texts.join('\n');
  const upperCombined = combinedText.toUpperCase();

  const confirmedMap = new Map();
  const doubtfulMap = new Map();
  let globalInterport = detectInterportMarker(upperCombined);

  for (const rawPass of texts) {
    const passUpper = String(rawPass || '').toUpperCase();
    if (!passUpper.trim()) continue;

    const passMarker = detectInterportMarker(passUpper);
    const hasInterportInPass = passMarker.matched;
    if (hasInterportInPass && passMarker.score > globalInterport.score) {
      globalInterport = passMarker;
    }

    // Divide em tokens preservando pontuação de incerteza
    // Procura sequências de dígitos (ou dígitos com 1-2 letras de confusão de OCR como _QUS745 ou 0US723)
    const tokenRegex = /(?:^|[\s_:;|/\\()[\]-])([0-9OQCDILSZB?]{2,8})(?=$|[\s_:;|/\\()[\]-])/g;
    let match;
    while ((match = tokenRegex.exec(passUpper)) !== null) {
      const rawToken = match[1];
      if (!rawToken) continue;

      // Ignora tokens que são apenas letras (como parte de palavras)
      const digitCount = (rawToken.match(/\d/g) || []).length;
      if (digitCount === 0) continue;

      // Se contiver '?' explícito -> leitura incompleta/duvidosa
      if (rawToken.includes('?')) {
        if ((hasInterportInPass || globalInterport.matched || options.hasYellowSealContext) && rawToken.length >= 3) {
          const suggested = rawToken.replace(/[^0-9?]/g, '');
          if (suggested && !doubtfulMap.has(suggested)) {
            doubtfulMap.set(suggested, {
              suggestedNumber: suggested,
              confidence: 0.45,
              reason: 'Dígitos ilegíveis ou encobertos no lacre Interport',
              rawMatch: rawToken
            });
          }
        }
        continue;
      }

      const { digits, substitutions } = fixSealDigitsOcr(rawToken);
      if (!/^\d+$/.test(digits)) continue;

      // Filtra números de container, pesos, placas e lacres definitivos
      if (isExcludedNonProvisionalNumber(digits, passUpper, options)) {
        continue;
      }

      // Caso 1: Lacre padrão Interport completo de 6 dígitos (ex: 005745, 005723) com INTERPORT confirmado
      if (digits.length === 6 && substitutions <= 2 && (hasInterportInPass || globalInterport.matched)) {
        const isCleanDigits = substitutions === 0 || (substitutions === 1 && digits.startsWith('00'));
        const conf = isCleanDigits
          ? (passMarker.exact ? 0.96 : 0.90)
          : (hasInterportInPass && digits.startsWith('00') ? 0.84 : 0.68);

        if (conf >= 0.80) {
          const prev = confirmedMap.get(digits);
          const count = (prev?.occurrences || 0) + 1;
          confirmedMap.set(digits, {
            sealNumber: digits,
            confidence: Math.min(0.99, Math.max(prev?.confidence || 0, conf + (count > 1 ? 0.04 : 0))),
            occurrences: count,
            rawMatch: rawToken
          });
        } else if (!confirmedMap.has(digits)) {
          doubtfulMap.set(digits, {
            suggestedNumber: digits,
            confidence: conf,
            reason: 'Leitura com baixa nitidez nos dígitos do lacre — confirme a numeração',
            rawMatch: rawToken
          });
        }
      } else if (digits.length !== 6 && digits.length >= 2 && digits.length <= 8 && substitutions <= 1 && (hasInterportInPass || globalInterport.matched)) {
        // Regra 6: Leituras com menos ou mais de 6 dígitos (ex: 5 dígitos "00574" ou "5745", ou "23" no pino)
        // são tratadas como leituras incompletas/duvidosas para conferência humana — nunca preenchidas silenciosamente!
        if (!confirmedMap.has(digits)) {
          doubtfulMap.set(digits, {
            suggestedNumber: digits,
            confidence: digits.length === 5 ? 0.68 : 0.55,
            reason: 'Leitura incompleta ou parcial do lacre Interport — confira todos os dígitos na foto',
            rawMatch: rawToken
          });
        }
      } else if (
        // Caso 2: Número de 6 dígitos (ex: 005745) na região do lacre amarelo, mas onde a palavra INTERPORT ficou borrada/ausente
        digits.length === 6 &&
        substitutions <= 1 &&
        options.hasYellowSealContext &&
        !hasInterportInPass &&
        !globalInterport.matched
      ) {
        if (!confirmedMap.has(digits)) {
          doubtfulMap.set(digits, {
            suggestedNumber: digits,
            confidence: 0.70,
            reason: 'Identificação INTERPORT parcialmente legível — confira o número sugerido na foto',
            rawMatch: rawToken
          });
        }
      }
    }
  }

  // Consenso para múltiplos passes de OCR sobre uma mesma região isolada de um único lacre (options.singleSealRegion)
  if (options.singleSealRegion && confirmedMap.size > 1) {
    const entries = [...confirmedMap.values()].sort(
      (a, b) => (b.occurrences - a.occurrences) || (b.confidence - a.confidence)
    );
    const hammingDistance = (a, b) => {
      if (a.length !== b.length) return 99;
      let diff = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
      return diff;
    };
    const top = entries[0];
    for (let i = 1; i < entries.length; i++) {
      const other = entries[i];
      if (hammingDistance(top.sealNumber, other.sealNumber) === 1) {
        if (top.occurrences > other.occurrences) {
          // O vencedor por consenso (ex: lido no pino e na bucha ou em múltiplos modos) prevalece sobre ruído de 1 dígito
          confirmedMap.delete(other.sealNumber);
        } else {
          // Empate 1x1 com divergência de 1 dígito no mesmo lacre -> leitura duvidosa (Regra 6)
          confirmedMap.delete(other.sealNumber);
          confirmedMap.delete(top.sealNumber);
          doubtfulMap.set(top.sealNumber, {
            suggestedNumber: top.sealNumber,
            confidence: 0.72,
            reason: `Dígito duvidoso entre ${top.sealNumber} e ${other.sealNumber} — confira na foto`,
            rawMatch: top.rawMatch
          });
        }
      }
    }
  }

  // Remove de `doubtful` qualquer número que já seja sufixo/prefixo ou idêntico a um número `confirmed`
  // Se for uma região isolada de um único lacre (singleSealRegion) e já houver leitura confirmada, descarta ruídos parciais de outras rotações da mesma região
  const confirmedList = [...confirmedMap.values()];
  if (options.singleSealRegion && confirmedList.length > 0) {
    doubtfulMap.clear();
  } else {
    for (const [dKey] of doubtfulMap.entries()) {
      const cleanD = dKey.replace(/\?/g, '');
      const isCoveredByConfirmed = confirmedList.some(
        c => c.sealNumber === dKey || (cleanD.length >= 2 && c.sealNumber.includes(cleanD))
      );
      if (isCoveredByConfirmed) {
        doubtfulMap.delete(dKey);
      }
    }
  }

  return {
    confirmed: confirmedList.sort((a, b) => b.confidence - a.confidence),
    doubtful: [...doubtfulMap.values()].sort((a, b) => b.confidence - a.confidence),
    hasInterport: globalInterport.matched
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Visão Computacional p/ Lacres Amarelos Interport (Browser Canvas & Node)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Codifica um buffer RGBA { width, height, data } em formato BMP 24-bit puro (sem dependências externas).
 */
export function encodeRgbaToBmp(img) {
  const { width, height, data } = img;
  const rowBytes = width * 3;
  const rowStride = (rowBytes + 3) & ~3;
  const pixelDataSize = rowStride * height;
  const fileSize = 54 + pixelDataSize;
  const buf = new Uint8Array(fileSize);
  const view = new DataView(buf.buffer);

  // Cabeçalho BMP (14 bytes)
  buf[0] = 0x42; // 'B'
  buf[1] = 0x4D; // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);

  // Cabeçalho DIB BITMAPINFOHEADER (40 bytes)
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true); // top-down
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelDataSize, true);

  for (let y = 0; y < height; y++) {
    const rowOffset = 54 + y * rowStride;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = rowOffset + x * 3;
      buf[dst] = data[src + 2];     // Blue
      buf[dst + 1] = data[src + 1]; // Green
      buf[dst + 2] = data[src];     // Red
    }
  }
  return buf;
}

export function isYellowSealPixel(r, g, b) {
  return r > 110 && g > 85 && b < 105 && (r - b) > 45 && (g - b) > 25 && r >= g * 0.80;
}

/**
 * Localiza todas as regiões de lacres amarelos na imagem (suporta múltiplos lacres na mesma foto)
 * e calcula o ângulo de inclinação principal (momentos de 2ª ordem) para lacres inclinados.
 */
export function findYellowSealRegions(img) {
  const { width, height, data } = img;
  if (!width || !height || !data) return [];

  const cellSize = 6;
  const gw = Math.ceil(width / cellSize);
  const gh = Math.ceil(height / cellSize);
  const mask = new Uint8Array(gw * gh);

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let yellowCount = 0;
      let total = 0;
      for (let dy = 0; dy < cellSize; dy++) {
        const y = gy * cellSize + dy;
        if (y >= height) continue;
        for (let dx = 0; dx < cellSize; dx++) {
          const x = gx * cellSize + dx;
          if (x >= width) continue;
          total++;
          const idx = (y * width + x) * 4;
          if (isYellowSealPixel(data[idx], data[idx + 1], data[idx + 2])) {
            yellowCount++;
          }
        }
      }
      if (yellowCount >= total * 0.30) {
        mask[gy * gw + gx] = 1;
      }
    }
  }

  const visited = new Uint8Array(gw * gh);
  const boxes = [];

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const start = gy * gw + gx;
      if (!mask[start] || visited[start]) continue;

      const queue = [[gx, gy]];
      visited[start] = 1;
      let minX = gx, maxX = gx, minY = gy, maxY = gy, count = 0;
      let sumX = 0, sumY = 0;
      const pts = [];

      while (queue.length) {
        const [cx, cy] = queue.pop();
        count++;
        pts.push([cx, cy]);
        sumX += cx;
        sumY += cy;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (let ny = Math.max(0, cy - 1); ny <= Math.min(gh - 1, cy + 1); ny++) {
          for (let nx = Math.max(0, cx - 1); nx <= Math.min(gw - 1, cx + 1); nx++) {
            const nIdx = ny * gw + nx;
            if (mask[nIdx] && !visited[nIdx]) {
              visited[nIdx] = 1;
              queue.push([nx, ny]);
            }
          }
        }
      }

      if (count >= 6) {
        const x0 = Math.max(0, minX * cellSize);
        const y0 = Math.max(0, minY * cellSize);
        const x1 = Math.min(width, (maxX + 1) * cellSize);
        const y1 = Math.min(height, (maxY + 1) * cellSize);
        const bw = x1 - x0;
        const bh = y1 - y0;

        // Ignora faixas horizontais muito largas e finas (ex: adesivo de aviso na base da porta do container)
        const aspect = bw / Math.max(1, bh);
        const isHorizontalSticker = aspect > 3.8 && y0 > height * 0.80;
        if (isHorizontalSticker) continue;

        // Calcula o eixo principal via momentos centrais de 2ª ordem para detectar inclinação (lacre inclinado)
        const meanX = sumX / count;
        const meanY = sumY / count;
        let mu20 = 0, mu02 = 0, mu11 = 0;
        for (const [px, py] of pts) {
          const dx = px - meanX;
          const dy = py - meanY;
          mu20 += dx * dx;
          mu02 += dy * dy;
          mu11 += dx * dy;
        }
        // Ângulo do eixo maior em graus [-90, 90]
        const thetaRad = 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
        const axisDeg = Math.round((thetaRad * 180) / Math.PI);

        boxes.push({
          x: x0,
          y: y0,
          w: bw,
          h: bh,
          cells: count,
          axisDeg
        });
      }
    }
  }

  return boxes.sort((a, b) => b.cells - a.cells);
}

/**
 * Extrai sub-regiões do lacre (corpo completo, núcleo da bucha cilíndrica e face frontal do texto).
 */
export function extractSealSubRegions(img, box) {
  const { width, data } = img;
  const regions = [{ ...box, tag: 'full' }];

  const rowWidths = [];
  for (let y = 0; y < box.h; y++) {
    let minX = box.w, maxX = -1, count = 0;
    for (let x = 0; x < box.w; x++) {
      const idx = ((box.y + y) * width + (box.x + x)) * 4;
      if (isYellowSealPixel(data[idx], data[idx + 1], data[idx + 2])) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        count++;
      }
    }
    rowWidths.push({ y, count, minX, maxX });
  }

  if (box.h > box.w * 1.15) {
    const lowerStart = Math.floor(box.h * 0.35);
    const barrelRows = rowWidths.slice(lowerStart).filter(r => r.count >= box.w * 0.25);
    if (barrelRows.length >= 10) {
      const by0 = barrelRows[0].y;
      const by1 = barrelRows[barrelRows.length - 1].y;
      const sortedMinX = barrelRows.map(r => r.minX).sort((a, b) => a - b);
      const sortedMaxX = barrelRows.map(r => r.maxX).sort((a, b) => a - b);
      const medMinX = sortedMinX[Math.floor(sortedMinX.length * 0.35)];
      const medMaxX = sortedMaxX[Math.floor(sortedMaxX.length * 0.96)];
      const bw = Math.max(16, medMaxX - medMinX + 1);
      const bh = Math.max(16, by1 - by0 + 1);
      regions.push({
        x: box.x + medMinX,
        y: box.y + by0,
        w: bw,
        h: bh,
        axisDeg: box.axisDeg,
        tag: 'barrel-core'
      });
      if (bw >= 24 && bh >= 24) {
        regions.push({
          x: box.x + medMinX + Math.floor(bw * 0.10),
          y: box.y + by0 + Math.floor(bh * 0.12),
          w: Math.max(16, Math.ceil(bw * 0.80)),
          h: Math.max(16, Math.ceil(bh * 0.78)),
          axisDeg: box.axisDeg,
          tag: 'barrel-face'
        });
      }
    }
  }

  return regions;
}

/**
 * Recorta a região do lacre, aplica rotação arbitrária (0°, 90°, 270° ou ângulo de inclinação),
 * mascara o fundo não-amarelo e aplica realce adaptativo local de contraste.
 */
export function prepareSealRegionBmp(img, box, angleDeg, mode = 'contrast') {
  const { width, data } = img;
  const srcW = box.w;
  const srcH = box.h;
  const gray = new Float32Array(srcW * srcH);
  const yellowMask = new Uint8Array(srcW * srcH);

  let yellowSum = 0;
  let yellowCount = 0;
  let varianceSum = 0;
  let varianceSqSum = 0;

  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const idx = ((box.y + y) * width + (box.x + x)) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const lum = 0.45 * r + 0.45 * g + 0.10 * b;
      gray[y * srcW + x] = lum;
      if (r > 70 && g > 55 && (r - b) > 20 && (g - b) > 10) {
        yellowMask[y * srcW + x] = 1;
        varianceSum += lum;
        varianceSqSum += lum * lum;
        if (isYellowSealPixel(r, g, b)) {
          yellowSum += lum;
          yellowCount++;
        }
      }
    }
  }

  const bgLum = yellowCount > 0 ? yellowSum / yellowCount : 200;
  for (let i = 0; i < gray.length; i++) {
    if (!yellowMask[i]) gray[i] = bgLum;
  }

  // Rotação (exata para 0/90/180/270 ou bilinear para ângulo arbitrário de lacre inclinado)
  const normAngle = ((angleDeg % 360) + 360) % 360;
  let rotW = srcW;
  let rotH = srcH;
  let rotGray;

  if (normAngle === 0 || normAngle === 90 || normAngle === 180 || normAngle === 270) {
    if (normAngle === 90 || normAngle === 270) {
      rotW = srcH;
      rotH = srcW;
    }
    rotGray = new Float32Array(rotW * rotH);
    for (let y = 0; y < srcH; y++) {
      for (let x = 0; x < srcW; x++) {
        const v = gray[y * srcW + x];
        if (normAngle === 0) rotGray[y * rotW + x] = v;
        else if (normAngle === 90) rotGray[x * rotW + (srcH - 1 - y)] = v;
        else if (normAngle === 270) rotGray[(srcW - 1 - x) * rotW + y] = v;
        else rotGray[(srcH - 1 - y) * rotW + (srcW - 1 - x)] = v;
      }
    }
  } else {
    const rad = (normAngle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    rotW = Math.max(16, Math.ceil(Math.abs(srcW * cos) + Math.abs(srcH * sin)));
    rotH = Math.max(16, Math.ceil(Math.abs(srcW * sin) + Math.abs(srcH * cos)));
    rotGray = new Float32Array(rotW * rotH);
    const cx = (srcW - 1) / 2;
    const cy = (srcH - 1) / 2;
    const rcx = (rotW - 1) / 2;
    const rcy = (rotH - 1) / 2;
    for (let ry = 0; ry < rotH; ry++) {
      for (let rx = 0; rx < rotW; rx++) {
        const dx = rx - rcx;
        const dy = ry - rcy;
        const sx = Math.round(cx + dx * cos + dy * sin);
        const sy = Math.round(cy - dx * sin + dy * cos);
        if (sx >= 0 && sx < srcW && sy >= 0 && sy < srcH) {
          rotGray[ry * rotW + rx] = gray[sy * srcW + sx];
        } else {
          rotGray[ry * rotW + rx] = bgLum;
        }
      }
    }
  }

  // Upscale adaptativo para garantir altura de fonte ideal para o Tesseract
  const scale = Math.max(2, Math.min(5, Math.ceil(240 / Math.max(1, Math.min(rotW, rotH)))));
  const upW = rotW * scale;
  const upH = rotH * scale;
  const upGray = new Float32Array(upW * upH);

  for (let oy = 0; oy < upH; oy++) {
    const sy = Math.min(rotH - 1, oy / scale);
    const y0 = Math.floor(sy);
    const y1 = Math.min(rotH - 1, y0 + 1);
    const wy = sy - y0;
    for (let ox = 0; ox < upW; ox++) {
      const sx = Math.min(rotW - 1, ox / scale);
      const x0 = Math.floor(sx);
      const x1 = Math.min(rotW - 1, x0 + 1);
      const wx = sx - x0;
      upGray[oy * upW + ox] =
        rotGray[y0 * rotW + x0] * (1 - wx) * (1 - wy) +
        rotGray[y0 * rotW + x1] * wx * (1 - wy) +
        rotGray[y1 * rotW + x0] * (1 - wx) * wy +
        rotGray[y1 * rotW + x1] * wx * wy;
    }
  }

  // Imagem integral para normalização de contraste local
  const integral = new Float64Array((upW + 1) * (upH + 1));
  for (let y = 1; y <= upH; y++) {
    let rowSum = 0;
    for (let x = 1; x <= upW; x++) {
      rowSum += upGray[(y - 1) * upW + (x - 1)];
      integral[y * (upW + 1) + x] = integral[(y - 1) * (upW + 1) + x] + rowSum;
    }
  }

  const radius = Math.max(12, Math.round(Math.min(upW, upH) * 0.14));
  const pad = 24;
  const outW = upW + pad * 2;
  const outH = upH + pad * 2;
  const outRgba = new Uint8Array(outW * outH * 4);
  outRgba.fill(255);

  for (let y = 0; y < upH; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(upH, y + radius + 1);
    for (let x = 0; x < upW; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(upW, x + radius + 1);
      const area = (y1 - y0) * (x1 - x0);
      const localSum =
        integral[y1 * (upW + 1) + x1] -
        integral[y0 * (upW + 1) + x1] -
        integral[y1 * (upW + 1) + x0] +
        integral[y0 * (upW + 1) + x0];
      const localMean = localSum / area;
      const v = upGray[y * upW + x];
      let val;
      if (mode === 'binary') {
        val = v < localMean * 0.91 ? 0 : 255;
      } else {
        const diff = v - localMean * 0.93;
        val = Math.max(0, Math.min(255, Math.round(190 + diff * 5.5)));
      }
      const dst = ((y + pad) * outW + (x + pad)) * 4;
      outRgba[dst] = val;
      outRgba[dst + 1] = val;
      outRgba[dst + 2] = val;
      outRgba[dst + 3] = 255;
    }
  }

  return encodeRgbaToBmp({ width: outW, height: outH, data: outRgba });
}

/**
 * Decodifica o PNG DataURL retornado pelo Tesseract (imageColor) em { width, height, data }
 * quando executado em ambiente Node.js (sem DOM Canvas).
 */
async function decodePngDataUrlNode(dataUrl) {
  const zlibModName = 'node:' + 'zlib';
  const zlib = await import(/* @vite-ignore */ zlibModName);
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
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const bpp = Math.max(1, (bitDepth * channels) >> 3);
  const stride = width * bpp;
  const rgba = new Uint8Array(width * height * 4);
  const prevLine = new Uint8Array(stride);
  const currLine = new Uint8Array(stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
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
      rgba[dst + 1] = currLine[x * channels + (channels >= 3 ? 1 : 0)];
      rgba[dst + 2] = currLine[x * channels + (channels >= 3 ? 2 : 0)];
      rgba[dst + 3] = 255;
    }
  }
  return { width, height, data: rgba };
}

/**
 * Extrai { width, height, data (RGBA) } de uma fonte de imagem no Browser (Canvas) ou Node (via Tesseract imageColor).
 */
async function decodeImagePixels(imageSource, worker) {
  if (imageSource && typeof imageSource === 'object' && imageSource.width && imageSource.height && imageSource.data instanceof Uint8Array) {
    return imageSource;
  }

  // Browser com DOM Canvas
  if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
    let url = '';
    let revoke = false;
    try {
      if (typeof imageSource === 'string') {
        url = imageSource;
      } else if (typeof Blob !== 'undefined' && imageSource instanceof Blob) {
        url = URL.createObjectURL(imageSource);
        revoke = true;
      }
      if (url) {
        const img = await new Promise((resolve, reject) => {
          const el = new Image();
          el.crossOrigin = 'anonymous';
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return { width: canvas.width, height: canvas.height, data: new Uint8Array(imgData.data.buffer) };
      }
    } catch {
      // Fallback para worker.recognize imageColor
    } finally {
      if (revoke && url) URL.revokeObjectURL(url);
    }
  }

  // Fallback universal (Node.js ou CORS canvas): usa Leptonica via Tesseract worker
  const dump = await worker.recognize(imageSource, {}, { text: false, imageColor: true });
  if (dump?.data?.imageColor) {
    return decodePngDataUrlNode(dump.data.imageColor);
  }
  throw new Error('Não foi possível decodificar os pixels da imagem para análise do lacre.');
}

// Worker singleton reutilizável para processamento em segundo plano sem recriar WASM a cada foto
let sharedWorkerPromise = null;
let workerQueueChain = Promise.resolve();

async function getSharedTesseractWorker() {
  if (!sharedWorkerPromise) {
    sharedWorkerPromise = (async () => {
      const Tesseract = await import('tesseract.js');
      const createWorker = Tesseract.createWorker || Tesseract.default?.createWorker;
      const PSM = Tesseract.PSM || Tesseract.default?.PSM || { SINGLE_BLOCK: '6' };
      const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
      const workerOptions = isNode
        ? { langPath: 'public/tessdata', cachePath: '.' }
        : { langPath: '/tessdata' };
      try {
        const worker = await createWorker('eng', 1, workerOptions);
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK || '6' });
        return worker;
      } catch {
        // Fallback para CDN padrão do Tesseract caso /tessdata não esteja servido na rota atual
        const worker = await createWorker('eng', 1);
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK || '6' });
        return worker;
      }
    })().catch(err => {
      sharedWorkerPromise = null;
      throw err;
    });
  }
  return sharedWorkerPromise;
}

export async function terminateSharedSealWorker() {
  if (sharedWorkerPromise) {
    const w = await sharedWorkerPromise.catch(() => null);
    sharedWorkerPromise = null;
    if (w) await w.terminate().catch(() => {});
  }
}

/**
 * Analisa uma foto vinculada ao Container e reconhece todos os lacres provisórios Interport.
 *
 * @param {File|Blob|string|Uint8Array|{width:number,height:number,data:Uint8Array}} imageSource
 * @param {Object} options { containerNumber, definiteSeal, customOcrRunner }
 * @returns {Promise<{
 *   confirmed: Array<{ sealNumber: string, confidence: number }>,
 *   doubtful: Array<{ suggestedNumber: string, confidence: number, reason: string }>,
 *   yellowRegionsFound: number,
 *   rawTexts: string[]
 * }>}
 */
export async function recognizeInterportSealsInPhoto(imageSource, options = {}) {
  // Permite injeção de runner customizado em testes unitários rápidos
  if (typeof options.customOcrRunner === 'function') {
    return options.customOcrRunner(imageSource, options);
  }

  const runJob = async () => {
    const worker = await getSharedTesseractWorker();
    const decoded = await decodeImagePixels(imageSource, worker);
    const yellowBoxes = findYellowSealRegions(decoded);

    const allConfirmed = new Map();
    const allDoubtful = new Map();
    const rawTexts = [];

    // Para cada região de lacre amarelo encontrada na foto (suporta vários lacres na mesma foto)
    for (const box of yellowBoxes) {
      // Verifica variância de luminância dentro dos pixels amarelos do lacre:
      // se a superfície amarela estiver completamente borrada/sem contraste de tinta preta, evita dezenas de chamadas OCR desnecessárias
      let ySum = 0, ySqSum = 0, yCnt = 0;
      for (let py = box.y; py < box.y + box.h; py += 2) {
        for (let px = box.x; px < box.x + box.w; px += 2) {
          const idx = (py * decoded.width + px) * 4;
          const r = decoded.data[idx], g = decoded.data[idx + 1], b = decoded.data[idx + 2];
          if (isYellowSealPixel(r, g, b)) {
            const lum = 0.45 * r + 0.45 * g + 0.10 * b;
            ySum += lum;
            ySqSum += lum * lum;
            yCnt++;
          }
        }
      }
      const yMean = yCnt > 0 ? ySum / yCnt : 0;
      const yStdDev = yCnt > 1 ? Math.sqrt(Math.max(0, ySqSum / yCnt - yMean * yMean)) : 0;

      const subRegions = extractSealSubRegions(decoded, box);
      const boxTexts = [];
      let boxConfirmed = false;

      if (yStdDev >= 4.0) {
        // Calcula ângulos candidatos: testa primeiro 270° (vertical padrão nas portas), depois compensação de inclinação (lacre inclinado) e demais rotações
        const angles = [270];
        if (typeof box.axisDeg === 'number') {
          const tiltFromVertical = Math.abs(Math.abs(box.axisDeg) - 90);
          if (tiltFromVertical >= 6 && tiltFromVertical <= 75) {
            const deskew1 = ((-box.axisDeg) % 360 + 360) % 360;
            const deskew2 = (deskew1 + 180) % 360;
            angles.push(deskew1, deskew2);
          }
        }
        angles.push(248, 292, 90, 0);
        const uniqueAngles = [...new Set(angles)];

        // Prioriza barrel-core e full primeiro, depois barrel-face
        const orderedSubs = [...subRegions].sort((a, b) => {
          const order = { 'barrel-core': 1, full: 2, 'barrel-face': 3 };
          return (order[a.tag] || 9) - (order[b.tag] || 9);
        });

        for (let aIdx = 0; aIdx < uniqueAngles.length; aIdx++) {
          const deg = uniqueAngles[aIdx];
          if (boxConfirmed) break;
          // Se após 2 ângulos completos nenhum caractere alfanumérico foi detectado na região, interrompe rotações extras
          if (aIdx >= 2 && !boxTexts.some(t => /[A-Z0-9]{2,}/i.test(t))) break;
          for (const sub of orderedSubs) {
            if (boxConfirmed) break;
            for (const mode of ['contrast', 'binary']) {
              const bmpBuf = prepareSealRegionBmp(decoded, sub, deg, mode);
              const res = await worker.recognize(bmpBuf);
              const text = String(res?.data?.text || '').replace(/\s+/g, ' ').trim();
              if (text) {
                boxTexts.push(text);
                rawTexts.push(text);
              }
            }
            const partial = extractInterportSealsFromText(boxTexts, {
              ...options,
              hasYellowSealContext: true,
              singleSealRegion: true
            });
            if (partial.confirmed.length > 0 && partial.hasInterport && partial.confirmed[0].occurrences >= 2) {
              boxConfirmed = true;
              break;
            }
          }
        }
      }

      const extracted = extractInterportSealsFromText(boxTexts, {
        ...options,
        hasYellowSealContext: true,
        singleSealRegion: true
      });

      for (const c of extracted.confirmed) {
        const existing = allConfirmed.get(c.sealNumber);
        if (!existing || c.confidence > existing.confidence) {
          allConfirmed.set(c.sealNumber, c);
        }
      }
      for (const d of extracted.doubtful) {
        if (!allConfirmed.has(d.suggestedNumber) && !allDoubtful.has(d.suggestedNumber)) {
          allDoubtful.set(d.suggestedNumber, d);
        }
      }

      // Regra 6: Se detectou claramente um lacre amarelo grande em primeiro plano (ex: foto tirada do lacre),
      // mas a imagem está ilegível/desfocada e não gerou nenhum número confirmado nem sugestão parcial,
      // sinaliza a foto para conferência manual sem inventar dígitos!
      const boxAreaRatio = (box.w * box.h) / Math.max(1, decoded.width * decoded.height);
      if (
        extracted.confirmed.length === 0 &&
        extracted.doubtful.length === 0 &&
        boxAreaRatio >= 0.025 &&
        box.h >= box.w * 1.1
      ) {
        const placeholderKey = `__illegible_box_${box.x}_${box.y}`;
        allDoubtful.set(placeholderKey, {
          suggestedNumber: '',
          confidence: 0.25,
          reason: 'Lacre provisório identificado na foto, mas a numeração está ilegível ou sem foco — confira manualmente'
        });
      }
    }

    // Se houver algum lacre confirmado na foto, remove placeholders vazios de ilegibilidade da mesma foto
    if (allConfirmed.size > 0) {
      for (const key of [...allDoubtful.keys()]) {
        if (key.startsWith('__illegible_box_') || allConfirmed.has(key)) {
          allDoubtful.delete(key);
        }
      }
    }

    return {
      confirmed: [...allConfirmed.values()],
      doubtful: [...allDoubtful.values()],
      yellowRegionsFound: yellowBoxes.length,
      rawTexts
    };
  };

  const queued = workerQueueChain.then(runJob);
  workerQueueChain = queued.catch(() => {});
  return queued;
}
