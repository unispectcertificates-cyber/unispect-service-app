// Utilitário de extração e interpretação de Romaneios em PDF
// Suporta leitura via window.pdfjsLib no browser e buffers em testes/scripts

export const parseBrazilianOrStandardFloat = (str) => {
  if (!str) return 0;
  let clean = String(str).trim();
  if (clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(/,/g, '.');
  } else if (/\.\d{3}$/.test(clean)) {
    clean = clean.replace(/\./g, '');
  }
  return parseFloat(clean) || 0;
};

export function normalizeContainerType(raw) {
  if (!raw) return '';
  const s = String(raw).trim().toUpperCase();

  // 1. Verificação ISO / Códigos específicos (22G1, 45G1, 42G1)
  if (s.includes('22G1') || s.includes('20"22G1') || s.includes('20/22G1')) {
    return '20"22G1';
  }
  if (s.includes('45G1') || s.includes('40"45G1') || s.includes('40/45G1')) {
    return '40"45G1';
  }

  // 2. 20 pés (DV / Dry / GP)
  if (
    s.includes('20"/DV') ||
    s.includes('20/DV') ||
    s.includes('20"DV') ||
    s.includes('20 DV') ||
    s.includes('20\' DV') ||
    (s.includes('20') && (s.includes('DV') || s.includes('DRY') || s.includes('GP') || s.includes('VAN')))
  ) {
    return '20"/DV';
  }

  // 3. 40 pés High Cube (HC / High Cube)
  if (
    s.includes('40"/HC') ||
    s.includes('40/HC') ||
    s.includes('40"HC') ||
    s.includes('40 HC') ||
    s.includes('40\' HC') ||
    (s.includes('40') && (s.includes('HC') || s.includes('HIGH') || s.includes('CUBE')))
  ) {
    return '40"/HC';
  }

  // 4. Reefer
  if (s.includes('REEFER') || s.includes('REFRIGERADO')) {
    return "40' Reefer";
  }

  // 5. 20 geral
  if (s.includes('20') || s.startsWith('20')) {
    return '20"/DV';
  }

  // 6. 40 geral
  if (s.includes('40') || s.startsWith('40')) {
    return '40"/HC';
  }

  return raw.trim();
}

export function extractContainersFromText(fullText, defaultContainerType = '40"/HC') {
  const containerRegexGlobal = /\b([A-Z]{4}[-\s]?\d{6}[-\s]?\d)\b/gi;
  const containerMatches = [];
  let match;
  while ((match = containerRegexGlobal.exec(fullText)) !== null) {
    const rawNum = match[1].trim().toUpperCase().replace(/[-\s]/g, '');
    if (rawNum.startsWith('MLB') || rawNum.includes('MLBR')) continue;

    if (!containerMatches.some(m => m.number === rawNum && Math.abs(m.index - match.index) < 5)) {
      containerMatches.push({
        number: rawNum,
        index: match.index,
        length: match[0].length
      });
    }
  }

  let defaultType = defaultContainerType || '40"/HC';
  const globalTypeMatch = fullText.match(/(?:20|40)\s*["']?\s*[\s|/]*\s*(?:DV|HC|DRY|REEFER|45G1|22G1|42G1|GP|HR)|(?:40"45G1|20"22G1|45G1|22G1)\b/i);
  if (globalTypeMatch) {
    defaultType = normalizeContainerType(globalTypeMatch[0]) || defaultType;
  }

  // Conjunto de todos os números e seriais (6 dígitos centrais) de containers para evitar que sejam lidos como lacres
  const allContainerSerials = new Set();
  const allContainerFull = new Set();
  containerMatches.forEach(m => {
    allContainerFull.add(m.number);
    const digits = m.number.replace(/\D/g, '');
    if (digits.length >= 6) {
      allContainerSerials.add(digits.slice(0, 6)); // ex: "209037" de MSNU-209037-0
    }
    if (digits.length >= 7) {
      allContainerSerials.add(digits); // ex: "2090370"
    }
  });

  const parsedContainers = [];
  const typePattern = /(?:20|40)\s*["']?\s*[\s|/]*\s*(?:DV|HC|DRY|REEFER|45G1|22G1|42G1|GP|HR)|(?:40"45G1|20"22G1|45G1|22G1|42G1)\b/i;

  for (let i = 0; i < containerMatches.length; i++) {
    const current = containerMatches[i];
    const next = containerMatches[i + 1];

    const startIndex = current.index;
    let endIndex = next ? next.index : fullText.length;

    if (!next) {
      const stopMatch = fullText.substring(startIndex).match(/\n\s*(?:Totais|Total|Observaç[õoa]es?|Observacoes?|Faturamento|Retirada|Estufagem|Booking|Romaneio):/i);
      if (stopMatch) {
        endIndex = startIndex + stopMatch.index;
      }
    }

    const segment = fullText.substring(startIndex, endIndex);

    // 1. Tipo de Container
    let containerType = defaultType;
    const typeMatch = segment.match(typePattern);
    if (typeMatch) {
      containerType = normalizeContainerType(typeMatch[0]);
    }

    // 2. Marca / Lote / OIC
    let brand = '';
    const oicMatch = segment.match(/\b(\d{2,4}\/\d{3,4}\/\d{3,4}|(?:MAC|GRV|LOTE|OIC|COD\.?\s*LOTE)[.\w\/-]+(?:\s*-\s*[A-Z0-9\/-]+)?)\b/i);
    if (oicMatch) {
      brand = oicMatch[1].trim();
    } else {
      const codeMatch = segment.match(/^\s*(0\d{3})\b/);
      if (codeMatch) brand = codeMatch[1];
    }

    // 3. Remove número do container, seriais e brand para evitar falsos positivos
    let cleanText = segment.substring(current.length);
    if (brand) {
      cleanText = cleanText.replace(brand, ' ');
    }

    const currentDigits = current.number.replace(/\D/g, '');
    const currentSerial = currentDigits.slice(0, 6);
    cleanText = cleanText.replace(new RegExp(`\\b${current.number}\\b`, 'gi'), ' ');
    if (currentSerial.length >= 6) {
      cleanText = cleanText.replace(new RegExp(`\\b${currentSerial}\\b`, 'gi'), ' ');
    }
    if (currentDigits.length >= 7) {
      cleanText = cleanText.replace(new RegExp(`\\b${currentDigits}\\b`, 'gi'), ' ');
    }

    const parseVal = (str) => {
      if (!str) return 0;
      let s = String(str).trim();
      if (s.includes(',')) {
        s = s.replace(/\./g, '').replace(/,/g, '.');
      } else if (/\.\d{3}$/.test(s)) {
        s = s.replace(/\./g, '');
      }
      return parseFloat(s) || 0;
    };

    // 4. Tokens numéricos (Sacas, Peso Carga/Net Weight, Tara, Peso Bruto/Gross Weight)
    const rawNumTokens = cleanText.match(/[0-9]+(?:[.,][0-9]+)*/g) || [];
    const numTokens = rawNumTokens.filter(t => {
      const cl = t.replace(/[-\s]/g, '');
      return cl !== current.number;
    });

    let rowBags = 0;
    let netWeight = '';
    let tara = '';
    let grossWeight = '';
    let metricTokens = [];

    // Busca da direita para a esquerda sequência válida de [netWeight, tara, grossWeight]
    // onde tara fica entre 1800 e 4900 e netWeight + tara ~= grossWeight
    for (let j = numTokens.length - 1; j >= 2; j--) {
      const gVal = parseVal(numTokens[j]);
      const tVal = parseVal(numTokens[j - 1]);
      const nVal = parseVal(numTokens[j - 2]);

      const taraValid = (tVal >= 1800 && tVal <= 4900) || numTokens[j - 1].replace(/[.,]/g, '').length === 4;
      const sumValid = Math.abs((nVal + tVal) - gVal) <= 1 || (nVal === 0 && Math.abs(tVal - gVal) <= 1);

      if (taraValid && sumValid) {
        grossWeight = numTokens[j];
        tara = numTokens[j - 1].replace(/[.,]/g, '');
        netWeight = numTokens[j - 2];
        metricTokens = [numTokens[j - 2], numTokens[j - 1], numTokens[j]];

        if (j >= 3) {
          const bVal = parseInt(numTokens[j - 3].replace(/[.,]/g, ''), 10);
          if (!isNaN(bVal) && bVal >= 0 && bVal <= 100000) {
            rowBags = bVal;
            metricTokens.unshift(numTokens[j - 3]);
          }
        }
        break;
      }
    }

    // Fallback caso a soma tenha pequenas variações ou haja 4/3 tokens finais
    if (!tara && numTokens.length >= 4) {
      const last4 = numTokens.slice(-4);
      const tCand = parseVal(last4[2]);
      if (tCand >= 1800 && tCand <= 4900) {
        rowBags = parseInt(last4[0].replace(/[.,]/g, ''), 10) || 0;
        netWeight = last4[1];
        tara = last4[2].replace(/[.,]/g, '');
        grossWeight = last4[3];
        metricTokens = last4;
      }
    } else if (!tara && numTokens.length >= 3) {
      const last3 = numTokens.slice(-3);
      const tCand = parseVal(last3[1]);
      if (tCand >= 1800 && tCand <= 4900) {
        netWeight = last3[0];
        tara = last3[1].replace(/[.,]/g, '');
        grossWeight = last3[2];
        metricTokens = last3;
      }
    } else if (!tara) {
      const taraCand = numTokens.find(t => {
        const v = parseVal(t);
        return v >= 1800 && v <= 4900;
      });
      if (taraCand) tara = taraCand.replace(/[.,]/g, '');
    }

    // 5. Lacres (Lacre Definitivo)
    // No Romaneio, a coluna "Lacres" / "Lacre" corresponde ao Lacre Definitivo.
    // Suporta múltiplos lacres (alfanuméricos do armador e numéricos de 4-12 dígitos como 1168, 1163)
    const collectedSeals = [];
    const metricCleanTokens = metricTokens.map(m => String(m).replace(/[.,]/g, ''));
    if (tara) metricCleanTokens.push(String(tara).replace(/[.,]/g, ''));
    if (rowBags) metricCleanTokens.push(String(rowBags).replace(/[.,]/g, ''));
    if (netWeight) metricCleanTokens.push(String(netWeight).replace(/[.,]/g, ''));
    if (grossWeight) metricCleanTokens.push(String(grossWeight).replace(/[.,]/g, ''));

    const sealRegex = /\b((?:LINE\s*|MLBR\s*|ML-BR\s*|[A-Z]{1,4}[-\s]*)?[A-Z0-9]{4,12})\b/gi;
    let sMatch;
    while ((sMatch = sealRegex.exec(cleanText)) !== null) {
      let cand = sMatch[1].trim();
      cand = cand.replace(/^[:\s\-.]+/, '').replace(/[:\-.\s]+$/, '').trim();
      const cleanCand = cand.replace(/[-\s]/g, '').toUpperCase();
      if (!cleanCand) continue;

      // 1. NUNCA aceitar container ou dígitos de container como lacre
      if (cleanCand === current.number || current.number.includes(cleanCand) || cleanCand.includes(current.number)) continue;
      if (allContainerFull.has(cleanCand)) continue;

      const candDigits = cleanCand.replace(/\D/g, '');
      if (candDigits && allContainerSerials.has(candDigits)) continue;
      if (currentSerial && (candDigits === currentSerial || cleanCand.includes(currentSerial))) continue;
      if (currentDigits && (candDigits === currentDigits || cleanCand.includes(currentDigits))) continue;

      // 2. Palavras reservadas e cabeçalhos de tabela
      if (/^(20"\/DV|40"\/HC|40"45G1|20"22G1|45G1|22G1|42G1|20"|40"|DV|HC|DRY|REEFER|SACAS?|SACA|KG|KGS|TOTAIS|TARA|PESO|BRUTO|CARGA|QUANT|CONTEINER|CONTAINER|ROMANEIO|PAGINA|PÁGINA|LOTE|OIC|BOOKING|NAVIO|VIAGEM|DESTINO|EXPORTADOR|IMPORTADOR|ALPHA|BAGS|FITO)$/i.test(cand)) continue;

      // 3. Marca / Lote / OIC
      if (brand && (cand === brand || brand.includes(cand) || cleanCand === brand.replace(/[^A-Z0-9]/gi, ''))) continue;

      // 4. Métricas numéricas (Sacas, tara, pesos)
      if (metricTokens.includes(cand) || metricCleanTokens.includes(cleanCand)) continue;

      // 5. Anos recentes (ex: 2026, 2025, 2024)
      if (/^202[0-9]$/.test(cleanCand)) continue;

      if (!collectedSeals.includes(cand)) {
        collectedSeals.push(cand);
      }
    }

    const definiteSeal = collectedSeals.join(' / ');
    const provSeals = [];

    parsedContainers.push({
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      containerNumber: current.number,
      containerType,
      provisionalSeals: provSeals,
      definiteSeal: definiteSeal || '',
      fumigationDate: '',
      fitoDate: '',
      definiteSealDate: '',
      notes: '',
      photos: [],
      bagsQuantity: rowBags,
      netWeight: netWeight || '',
      tara: tara || '',
      grossWeight: grossWeight || '',
      brand: brand || ''
    });
  }

  const explicitType = parsedContainers.find(c => c.containerType && c.containerType !== '40"/HC')?.containerType;
  if (explicitType) {
    parsedContainers.forEach(c => {
      if (!c.containerType || c.containerType === '40"/HC') {
        c.containerType = explicitType;
      }
    });
  }

  return parsedContainers;
}

export async function parseRomaneioPdf(fileOrBuffer, { exportadores = [], locais = [] } = {}) {
  const getPdfLib = () => {
    if (typeof window !== 'undefined' && window.pdfjsLib) return window.pdfjsLib;
    if (typeof globalThis !== 'undefined' && globalThis.pdfjsLib) return globalThis.pdfjsLib;
    throw new Error('A biblioteca PDF.js não está carregada no ambiente.');
  };

  const pdfjsLib = getPdfLib();

  let arrayBuffer;
  if (fileOrBuffer instanceof ArrayBuffer) {
    arrayBuffer = fileOrBuffer;
  } else if (fileOrBuffer?.buffer instanceof ArrayBuffer && fileOrBuffer.byteLength !== undefined) {
    arrayBuffer = fileOrBuffer.buffer.slice(fileOrBuffer.byteOffset, fileOrBuffer.byteOffset + fileOrBuffer.byteLength);
  } else if (typeof Blob !== 'undefined' && fileOrBuffer instanceof Blob) {
    arrayBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(fileOrBuffer);
    });
  } else {
    throw new Error('Formato de arquivo inválido para leitura de PDF.');
  }

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  let fullText = '';
  const allPageRows = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = (textContent.items || []).filter(item => item && item.str && item.str.trim());

    if (items.length > 0 && items[0].transform) {
      const rows = [];
      items.forEach(item => {
        const x = item.transform[4];
        const y = item.transform[5];
        let row = rows.find(r => Math.abs(r.y - y) <= 4);
        if (!row) {
          row = { y, items: [] };
          rows.push(row);
        }
        row.items.push({ x, str: item.str });
      });

      rows.sort((a, b) => b.y - a.y);
      rows.forEach(r => r.items.sort((a, b) => a.x - b.x));
      allPageRows.push(...rows);

      const pageText = rows.map(r => r.items.map(it => it.str).join(' ')).join('\n');
      fullText += pageText + '\n';
    } else {
      fullText += textContent.items.map(item => item.str).join(' ') + '\n';
    }
  }

  // Normalização de tipos de container (ex: 20" / DV, 40" / HC, 20" 22G1, 40" 45G1)
  fullText = fullText.replace(/\b(20|40)\s*["']?\s*[\s|]*\/\s*(DV|HC|Dry|Reefer|GP|HR)\b/gi, (match, p1, p2) => p1 + '"/' + p2);
  fullText = fullText.replace(/\b(20|40)\s*["']?\s*[\s|]*(22G1|45G1|42G1)\b/gi, (match, p1, p2) => p1 + '"' + p2);

  const pendingReferences = [];

  const stopKeywords = [
    /\bquantidade\b/i, /\bembalagem\b/i, /\bmercadoria\b/i, /\bmarca\b/i,
    /\barmador\b/i, /\bagente\b/i, /\brecinto\b/i, /\breferencia\b/i,
    /\bref\b/i, /\bimportador\b/i, /\bexportador\b/i, /\bdestino\b/i,
    /\bcnpj\b/i, /\bconteiner\b/i, /\bcontainer\b/i, /\blacres\b/i,
    /\btara\b/i, /\bpeso\b/i, /\bn[oº°ª]\b/i
  ];

  const extractFieldWithStops = (text, labelRegex, stopKeywordsList) => {
    const match = text.match(labelRegex);
    if (!match || !match[1]) return '';
    let val = match[1].split('\n')[0].trim();
    for (const kw of stopKeywordsList) {
      const idx = val.search(kw);
      if (idx !== -1) {
        val = val.substring(0, idx).trim();
      }
    }
    return val.replace(/^[:\s\-.]+/, '').replace(/[:\-.\s]+$/, '').replace(/\s+/g, ' ').trim();
  };

  // 1. Booking Number
  let bookingNumber = extractFieldWithStops(
    fullText,
    /(?:booking(?:\s*[\/|]\s*reserva)?|reserva(?:\s*[\/|]\s*booking)?|reserva\s*n[oºª.]?|booking\s*number|n[oºª.]\s*booking)[.\s:]*([A-Z0-9\/-]+)/i,
    stopKeywords
  );
  bookingNumber = bookingNumber.trim().toUpperCase();

  // 2. Navio / Viagem
  let vesselName = extractFieldWithStops(
    fullText,
    /(?:navio(?:\s*[\/|]\s*viagem)?|vessel(?:\s*[\/|]\s*voyage)?|nome\s*do\s*navio)[.\s:]*([^\n\r]+)/i,
    stopKeywords
  );
  if (vesselName) {
    for (const kw of stopKeywords) {
      const idx = vesselName.search(kw);
      if (idx !== -1) {
        vesselName = vesselName.substring(0, idx).trim();
      }
    }
    vesselName = vesselName.replace(/^[:\s\-.]+/, '').replace(/[:\-.\s]+$/, '').trim();
  }

  let vesselVoyageNum = '';
  if (vesselName && vesselName.includes('/')) {
    const parts = vesselName.split('/');
    vesselName = parts[0].trim();
    if (parts[1]) {
      const vm2 = parts[1].trim().match(/([A-Z0-9]{2,10})/i);
      if (vm2) vesselVoyageNum = vm2[1].toUpperCase();
    }
  }

  if (!vesselVoyageNum) {
    let rawVoyage = extractFieldWithStops(
      fullText,
      /(?:^|[\n\r]|[^a-z0-9])(?:viagem(?:\s*do\s*navio)?|voyage|voy|v\.)[.\s:]*([A-Z0-9\/-]+)/i,
      stopKeywords
    );
    if (rawVoyage) {
      const vm = rawVoyage.match(/([A-Z0-9]{2,10})/i);
      if (vm) vesselVoyageNum = vm[1].toUpperCase();
    }
  }

  let vesselVoyage = '';
  if (vesselName && vesselVoyageNum) {
    vesselVoyage = `${vesselName} V.${vesselVoyageNum}`;
  } else if (vesselName) {
    vesselVoyage = vesselName;
  } else if (vesselVoyageNum) {
    vesselVoyage = vesselVoyageNum;
  }

  // 3. Importador
  let importador = extractFieldWithStops(
    fullText,
    /(?:importador|importer|consignat[áa]rio|consignee)[.\s:]*([^\n\r]+)/i,
    stopKeywords
  );

  // 4. Exportador & CNPJ
  let cnpjExtracted = '';
  const cnpjMatch = fullText.match(/(?:cnpj\s*exportador|cnpj)[^0-9]*(\d{2}[.\s]?\d{3}[.\s]?\d{3}\/?\d{4}[-.\s]?\d{2}|\d{14})/i);
  if (cnpjMatch) cnpjExtracted = cnpjMatch[1].replace(/\D/g, '');

  let exporterNameExtracted = extractFieldWithStops(
    fullText,
    /(?:exportador|exporter|shipper|empresa\s*exportadora)[.\s:]*([^\n\r]+)/i,
    stopKeywords
  );

  let exporterId = '';
  const cleanCnpjDigits = (cnpjExtracted || '').replace(/\D/g, '');

  if (cleanCnpjDigits && cleanCnpjDigits.length >= 11) {
    const foundByCnpj = exportadores.find(exp => (exp.cnpj || '').replace(/\D/g, '') === cleanCnpjDigits);
    if (foundByCnpj) exporterId = foundByCnpj.id;
  }

  if (!exporterId && exporterNameExtracted) {
    const exactMatch = exportadores.find(exp => exp.name.toLowerCase() === exporterNameExtracted.toLowerCase());
    if (exactMatch) {
      exporterId = exactMatch.id;
    } else {
      const commonWords = [
        'exportadora', 'companhia', 'comércio', 'comercio', 'exterior', 'ltda', 'ltda.', 's.a.',
        'logistica', 'exportacao', 'importacao', 'agroindustrial', 'industria', 'indústria',
        'trading', 'cafe', 'café', 'coffee', 'cooperativa', 'coop', 'sa', 'limitada', 'group',
        'grupo', 'brasil', 'brazil', 'alimentos', 'comercial', 'eireli'
      ];
      const partialMatch = exportadores.find(exp => {
        const expWords = exp.name.split(' ')
          .map(w => w.toLowerCase().replace(/[^a-z0-9à-ú]/gi, '').trim())
          .filter(w => w.length > 3 && !commonWords.includes(w));

        if (expWords.length === 0) return false;

        const normalizedExtracted = exporterNameExtracted.toLowerCase().replace(/[^a-z0-9à-ú]/gi, ' ');
        const extractedWords = normalizedExtracted.split(/\s+/).filter(Boolean);

        return expWords.some(w => extractedWords.includes(w));
      });
      if (partialMatch) {
        exporterId = partialMatch.id;
      } else {
        const newId = 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const newExp = {
          id: newId,
          name: exporterNameExtracted,
          cnpj: cnpjExtracted || '',
          email: '',
          phone: ''
        };
        pendingReferences.push({ collection: 'exportadores', data: newExp });
        exporterId = newId;
      }
    }
  }

  // 5. Container Type Padrão
  let defaultContainerType = '40"/HC';
  let rawType = extractFieldWithStops(
    fullText,
    /(?:tipo\s*d[oe]\s*cntr|tipo\s*cntr|cntr\s*type|container\s*type|tipo)[.\s:]*([^\n\r]+)/i,
    stopKeywords
  );
  if (rawType) {
    defaultContainerType = normalizeContainerType(rawType) || '40"/HC';
  } else {
    const globalTypeMatch = fullText.match(/(?:20|40)\s*["']?\s*[\s|/]*\s*(?:DV|HC|DRY|REEFER|45G1|22G1|42G1|GP|HR)|(?:40"45G1|20"22G1|45G1|22G1)\b/i);
    if (globalTypeMatch) {
      defaultContainerType = normalizeContainerType(globalTypeMatch[0]) || '40"/HC';
    }
  }

  // 6. Recinto / Local de Operação
  let rawLocation = extractFieldWithStops(
    fullText,
    /(?:recinto|recinto\s*alfandegado|local\s*de\s*operaç[õo]es|local\s*de\s*operacoes|terminal|local)[.\s:]*([^\n\r]+)/i,
    stopKeywords
  );
  if (/^(tipo|peso|container|lacre|marca|quant|totais)/i.test(rawLocation)) {
    rawLocation = '';
  }

  let locationId = '';
  if (rawLocation) {
    const cleanRawLoc = rawLocation.toLowerCase();
    const foundLoc = locais.find(loc => cleanRawLoc.includes(loc.name.toLowerCase()) || loc.name.toLowerCase().includes(cleanRawLoc));
    if (foundLoc) {
      locationId = foundLoc.id;
    }
  }

  if (!locationId) {
    for (const loc of locais) {
      if (fullText.toLowerCase().includes(loc.name.toLowerCase())) {
        locationId = loc.id;
        break;
      }
    }
  }

  if (!locationId && rawLocation && rawLocation.length > 2) {
    const newId = 'loc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const newLoc = { id: newId, name: rawLocation };
    pendingReferences.push({ collection: 'locais', data: newLoc });
    locationId = newId;
  }

  // 7. Mercadoria
  let rawMercadoria = extractFieldWithStops(
    fullText,
    /(?:mercadoria|produto|commodity|descriç[ãa]o\s*da\s*carga)[.\s:]*([^\n\r]+)/i,
    stopKeywords
  );
  let mercadoria = 'café';
  if (rawMercadoria) {
    const cleanMerc = rawMercadoria.replace(/^[:\s\-.]+/, '').trim();
    const lowerMerc = cleanMerc.toLowerCase();
    if (lowerMerc.includes('pimenta')) {
      if (lowerMerc.includes('vermelha')) mercadoria = 'Pimenta Vermelha';
      else if (lowerMerc.includes('branca')) mercadoria = 'Pimenta Branca';
      else mercadoria = 'Pimenta Preta';
    } else if (lowerMerc.includes('cravo') || lowerMerc.includes('clove')) {
      mercadoria = 'Cravo';
    } else if (lowerMerc.includes('café') || lowerMerc.includes('cafe') || lowerMerc.includes('coffee')) {
      mercadoria = 'café';
    } else {
      mercadoria = cleanMerc;
    }
  }

  // 8. Sacas Totais
  let bagsQuantityStr = extractFieldWithStops(
    fullText,
    /(?:quantidade|quant\.?\s*total|quantidade\s*de\s*sacas|total\s*de\s*sacas|qtd\s*sacas)[.\s:]*([0-9.,]+)/i,
    stopKeywords
  );
  let bagsQuantity = '';
  if (bagsQuantityStr) {
    const matchNum = bagsQuantityStr.match(/([0-9.,]+)/);
    if (matchNum) {
      bagsQuantity = matchNum[1].replace(/\./g, '').replace(/,/g, '').trim();
    }
  }
  if (!bagsQuantity) {
    const totalBagsMatch = fullText.match(/(?:quant\.?\s*total\s*em\s*sacas|quantidade\s*total\s*em\s*sacas|quantidade|total\s*de\s*sacas)[^0-9]*([0-9.,]+)/i);
    if (totalBagsMatch && totalBagsMatch[1]) {
      bagsQuantity = totalBagsMatch[1].replace(/[.\s,]/g, '').trim();
    }
  }
  if (!bagsQuantity) {
    const qtyRegexes = [
      /\b(\d+)\s*(?:bags|sacas|volumes|sacaria|bag|bags\s*qty)\b/i,
      /(?:quantidade|quantity|quant|qty|qtd|bags\s*qty)[^a-zA-Z0-9]*([0-9.,]+)/i
    ];
    for (const rx of qtyRegexes) {
      const match = fullText.match(rx);
      if (match && match[1]) {
        const cleanNum = match[1].replace(/[.\s,]/g, '').trim();
        if (cleanNum && !isNaN(cleanNum)) {
          bagsQuantity = cleanNum;
          break;
        }
      }
    }
  }

  // 9. Porto de Destino
  let portoDestino = extractFieldWithStops(
    fullText,
    /(?:destino|destination|porto\s*de\s*destino|porto\s*destino|port\s*of\s*discharge|pod)[.\s:]*([^\n\r]+)/i,
    stopKeywords
  );
  if (/^(n[oº°ª]|container|conteiner|tipo|peso|quant|lacres|marca|totais)/i.test(portoDestino)) {
    portoDestino = '';
  }

  // 10. Armador
  let armador = extractFieldWithStops(
    fullText,
    /(?:armador|carrier|linha|shipping\s*line)[.\s:]*([^\n\r]+)/i,
    stopKeywords
  );
  if (!armador || armador.toLowerCase().includes('fumigação') || armador.toLowerCase().includes('fumigacao')) {
    armador = '';
    const carriers = ['Maersk', 'MSC', 'CMA CGM', 'Hapag-Lloyd', 'Hapag', 'HMM', 'Cosco', 'ONE', 'Ocean Network Express', 'Zim', 'Log-In', 'Login', 'Evergreen'];
    for (const carrier of carriers) {
      if (fullText.toLowerCase().includes(carrier.toLowerCase())) {
        armador = carrier === 'Hapag' ? 'Hapag-Lloyd' : (carrier === 'Login' ? 'Log-In' : carrier);
        break;
      }
    }
  }

  // 11. Embalagem
  let rawEmbalagem = extractFieldWithStops(
    fullText,
    /(?:embalagem|tipo\s*de\s*embalagem|packaging)[.\s:]*([^\n\r]+)/i,
    stopKeywords
  );
  let embalagem = 'sacaria';
  if (rawEmbalagem) {
    const lowerEmb = rawEmbalagem.toLowerCase();
    if (lowerEmb.includes('big') || lowerEmb.includes('bag')) embalagem = 'Big bags';
    else if (lowerEmb.includes('bulk') || lowerEmb.includes('granel')) embalagem = 'Bulk Line';
    else if (lowerEmb.includes('caixa') || lowerEmb.includes('box')) embalagem = 'Caixa';
    else embalagem = 'sacaria';
  } else {
    const lowercaseText = fullText.toLowerCase();
    if (lowercaseText.includes('big bag') || lowercaseText.includes('bigbag') || lowercaseText.includes('bag 1000') || lowercaseText.includes('bag 1.000')) {
      embalagem = 'Big bags';
    } else if (lowercaseText.includes('bulk') || lowercaseText.includes('granel')) {
      embalagem = 'Bulk Line';
    } else if (lowercaseText.includes('box') || lowercaseText.includes('caixa')) {
      embalagem = 'Caixa';
    } else {
      embalagem = 'sacaria';
    }
  }

  // 12. Containers
  const parsedContainers = extractContainersFromText(fullText, defaultContainerType);

  let totalBagsNum = parseBrazilianOrStandardFloat(bagsQuantity);
  if ((!totalBagsNum || totalBagsNum === 0) && parsedContainers.length > 0) {
    const sumContainers = parsedContainers.reduce((acc, c) => acc + (parseInt(c.bagsQuantity, 10) || 0), 0);
    if (sumContainers > 0) {
      bagsQuantity = String(sumContainers);
      totalBagsNum = sumContainers;
    }
  }

  if (totalBagsNum > 0 && parsedContainers.length > 0) {
    const perContainerBags = Math.round(totalBagsNum / parsedContainers.length);
    parsedContainers.forEach(c => {
      if (!c.bagsQuantity) c.bagsQuantity = perContainerBags;
    });
  }

  return {
    bookingNumber,
    vesselName,
    vesselVoyageNum,
    vesselVoyage,
    exporterId,
    locationId,
    mercadoria,
    bagsQuantity,
    portoDestino,
    importador,
    armador,
    embalagem,
    containers: parsedContainers,
    pendingReferences,
    fullText
  };
}
