import { normalizeContainerNumber } from './containerIdentity.js';

// Tabela de valores oficiais ISO 6346 (múltiplos de 11 são pulados)
const ISO_LETTER_VALUES = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
  K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31,
  U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38
};

/**
 * Valida o dígito verificador segundo a norma ISO 6346.
 * @param {string} rawNumber Ex: 'MSDU8821297'
 * @returns {boolean}
 */
export function validateIso6346CheckDigit(rawNumber) {
  const clean = normalizeContainerNumber(rawNumber);
  if (!/^[A-Z]{4}\d{7}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const char = clean[i];
    const val = i < 4 ? ISO_LETTER_VALUES[char] : parseInt(char, 10);
    if (val === undefined || isNaN(val)) return false;
    sum += val * Math.pow(2, i);
  }

  const expectedCheckDigit = (sum % 11) % 10;
  const actualCheckDigit = parseInt(clean[10], 10);
  return expectedCheckDigit === actualCheckDigit;
}

/**
 * Formata um número de container padrão para leitura humana: ABCD 123456-7
 */
export function formatContainerNumber(raw) {
  const clean = normalizeContainerNumber(raw);
  if (/^[A-Z]{4}\d{7}$/.test(clean)) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 10)}-${clean.slice(10)}`;
  }
  return clean;
}

/**
 * Substituições inteligentes para erros comuns de OCR
 */
function fixOcrLetterToDigit(str) {
  return str
    .replace(/O/gi, '0')
    .replace(/I/gi, '1')
    .replace(/L/gi, '1')
    .replace(/Z/gi, '2')
    .replace(/S/gi, '5')
    .replace(/B/gi, '8');
}

function fixOcrDigitToLetter(str) {
  return str
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/2/g, 'Z')
    .replace(/5/g, 'S')
    .replace(/8/g, 'B');
}

/**
 * Extrai número de container e tara a partir do texto bruto retornado por OCR.
 * @param {string} text Texto OCR
 * @returns {{ containerNumber: string, formattedNumber: string, tara: string, confidence: number, rawText: string }}
 */
export function extractContainerInfoFromText(text = '') {
  const rawText = String(text || '');
  // Normaliza quebras de linha e limpa caracteres estranhos
  const upper = rawText.toUpperCase();

  const candidates = [];

  // Padrão 1: Formato padrão com ou sem separadores (espaços, traços, pontos)
  // Ex: MSDU 882129-7 ou CXRU1234567 ou TGHU-123456-7
  const regexStandard = /\b([A-Z0-9]{4})[\s.-]*([A-Z0-9]{6})[\s.-]*([A-Z0-9]{1})\b/g;
  let match;
  while ((match = regexStandard.exec(upper)) !== null) {
    const letters = fixOcrDigitToLetter(match[1]);
    const serial = fixOcrLetterToDigit(match[2]);
    const check = fixOcrLetterToDigit(match[3]);
    const full = `${letters}${serial}${check}`;

    if (/^[A-Z]{4}\d{7}$/.test(full)) {
      const isIsoValid = validateIso6346CheckDigit(full);
      candidates.push({
        number: full,
        confidence: isIsoValid ? 0.98 : 0.85
      });
    }
  }

  // Padrão 2: 4 letras seguidas de 7 dígitos contíguos
  const regexMerged = /\b([A-Z]{4})(\d{7})\b/g;
  while ((match = regexMerged.exec(upper)) !== null) {
    const full = `${match[1]}${match[2]}`;
    const isIsoValid = validateIso6346CheckDigit(full);
    candidates.push({
      number: full,
      confidence: isIsoValid ? 0.99 : 0.88
    });
  }

  // Padrão 3: Identificações verticais ou em linhas separadas
  // Exemplo:
  // MSDU
  // 882129
  // 7
  const lines = upper.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length - 1; i++) {
    const l1 = fixOcrDigitToLetter(lines[i].replace(/[\s-]/g, ''));
    if (/^[A-Z]{4}$/.test(l1)) {
      const rest = fixOcrLetterToDigit((lines[i + 1] + (lines[i + 2] || '')).replace(/[\s-]/g, ''));
      if (/^\d{7}/.test(rest)) {
        const full = `${l1}${rest.slice(0, 7)}`;
        const isIsoValid = validateIso6346CheckDigit(full);
        candidates.push({
          number: full,
          confidence: isIsoValid ? 0.97 : 0.80
        });
      }
    }
  }

  // Ordena candidatos pela maior confiança
  candidates.sort((a, b) => b.confidence - a.confidence);
  const bestCandidate = candidates[0] || null;

  // Extração de Tara
  // Padrões como: TARE 3.820 KG, TARE: 3820 KG, TARE WT 3850KG, TARA: 3800
  let tara = '';
  const taraRegexList = [
    /(?:TARE|TARA|TAR\.?|TARE\s*WT)\s*[:.]?\s*(\d{1,2}[.,\s]?\d{3})\s*(?:KG|KGS)?/i,
    /(?:TARE|TARA|TAR\.?|TARE\s*WT)\s*[:.]?\s*(\d{4,5})\s*(?:KG|KGS)?/i,
    /\b(\d{1,2}[.,]?\d{3})\s*KG\b/i
  ];

  for (const regex of taraRegexList) {
    const tMatch = upper.match(regex);
    if (tMatch && tMatch[1]) {
      const cleanTare = tMatch[1].replace(/[.,\s]/g, '');
      const parsed = parseInt(cleanTare, 10);
      // Tara típica de container de 20'/40' varia entre 1.800 kg e 5.500 kg
      if (parsed >= 1500 && parsed <= 6500) {
        tara = String(parsed);
        break;
      }
    }
  }

  const containerNumber = bestCandidate ? bestCandidate.number : '';
  return {
    containerNumber,
    formattedNumber: containerNumber ? formatContainerNumber(containerNumber) : '',
    tara,
    confidence: bestCandidate ? bestCandidate.confidence : 0,
    rawText
  };
}

/**
 * Reconhece a imagem capturada utilizando Web APIs nativas (TextDetector) ou Tesseract.js
 * @param {File|Blob|string} imageSource Arquivo de imagem ou URL
 * @returns {Promise<{ containerNumber: string, formattedNumber: string, tara: string, confidence: number, rawText: string }>}
 */
export async function recognizeContainerPhoto(imageSource) {
  let objectUrl = '';
  try {
    if (typeof imageSource !== 'string') {
      objectUrl = URL.createObjectURL(imageSource);
    } else {
      objectUrl = imageSource;
    }

    // 1. Tenta TextDetector nativo (se suportado no Android/Chromium)
    if (typeof window !== 'undefined' && 'TextDetector' in window) {
      try {
        const img = new Image();
        img.src = objectUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        // @ts-ignore
        const detector = new window.TextDetector();
        const detected = await detector.detect(img);
        const joinedText = detected.map(d => d.rawValue).join('\n');
        const extracted = extractContainerInfoFromText(joinedText);
        if (extracted.containerNumber) {
          return extracted;
        }
      } catch (nativeErr) {
        console.warn('TextDetector nativo não detectou ou falhou, tentando fallback:', nativeErr);
      }
    }

    // 2. Fallback com Tesseract.js
    const Tesseract = await import('tesseract.js');
    const result = await Tesseract.recognize(
      objectUrl,
      'eng',
      {
        logger: () => {}
      }
    );

    const extracted = extractContainerInfoFromText(result?.data?.text || '');
    return extracted;
  } catch (err) {
    console.error('Erro no reconhecimento OCR do container:', err);
    return {
      containerNumber: '',
      formattedNumber: '',
      tara: '',
      confidence: 0,
      rawText: '',
      error: err.message
    };
  } finally {
    if (objectUrl && typeof imageSource !== 'string') {
      // Deixa a URL disponível brevemente para renderização se necessário
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    }
  }
}
