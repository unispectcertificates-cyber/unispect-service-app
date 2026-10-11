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

  // Normalização de tipos de container (ex: 20" / DV, 40" / HC)
  fullText = fullText.replace(/\b(20|40)\s*["']?\s*[\s|]*\/\s*(DV|HC|Dry|Reefer|GP|HR)\b/gi, (match, p1, p2) => p1 + '"/' + p2);

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
  let defaultContainerType = "40' HC";
  let rawType = extractFieldWithStops(
    fullText,
    /(?:tipo\s*d[oe]\s*cntr|tipo\s*cntr|cntr\s*type|container\s*type|tipo)[.\s:]*([^\n\r]+)/i,
    stopKeywords
  );
  if (rawType) {
    const typeStr = rawType.toUpperCase();
    if (typeStr.includes('20') && (typeStr.includes('DRY') || typeStr.includes('DV'))) {
      defaultContainerType = "20' Dry";
    } else if (typeStr.includes('20')) {
      defaultContainerType = "20' Dry";
    } else if (typeStr.includes('40') && typeStr.includes('DRY')) {
      defaultContainerType = "40' Dry";
    } else if (typeStr.includes('40') && (typeStr.includes('HC') || typeStr.includes('HIGH') || typeStr.includes('45G1'))) {
      defaultContainerType = "40' HC";
    } else if (typeStr.includes('REEFER')) {
      defaultContainerType = "40' Reefer";
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
  const containerRegexLine = /\b([A-Z]{4}[-\s]?\d{6}[-\s]?\d)\b/gi;
  const lines = fullText.split('\n');
  const lineContainers = [];

  for (const line of lines) {
    let cMatch;
    containerRegexLine.lastIndex = 0;
    while ((cMatch = containerRegexLine.exec(line)) !== null) {
      const rawNum = cMatch[1].trim().toUpperCase().replace(/[-\s]/g, '');
      if (rawNum.startsWith('MLB') || rawNum.includes('MLBR')) continue;

      const containerIdx = line.indexOf(cMatch[0]);
      let subAfter = line.substring(containerIdx + cMatch[0].length).trim();

      // Definite Seal
      let definiteSeal = '';
      const sealMatch = subAfter.match(/\b((?:LINE\s*|MLBR\s*|[A-Z]{1,4}\s*)?[A-Z0-9]{6,12})\b/i);
      if (sealMatch) {
        const candidate = sealMatch[1].trim();
        if (!/^(20"|40"|DV|HC|DRY|REEFER|SACAS?|SACA|KG|KGS|45G1|22G1|42G1)$/i.test(candidate)) {
          definiteSeal = candidate;
          subAfter = subAfter.replace(sealMatch[0], ' ');
        }
      }

      // Brand
      let brand = '';
      const oicMatch = subAfter.match(/\b(\d{3}\/\d{3,4}\/\d{3,4}|(?:MAC|GRV|LOTE|OIC)[.\w\/-]+(?:\s*-\s*[A-Z0-9\/-]+)?)\b/i);
      if (oicMatch) {
        brand = oicMatch[1].trim();
        subAfter = subAfter.replace(oicMatch[0], ' ');
      } else {
        const codeMatch = subAfter.match(/^\s*(0\d{3})\b/);
        if (codeMatch) {
          brand = codeMatch[1];
          subAfter = subAfter.replace(codeMatch[0], ' ');
        }
      }

      // Container Type
      let containerType = defaultContainerType;
      const typeMatch = subAfter.match(/(?:20|40)\s*["']?\s*[\s|/]*\s*(?:DV|HC|DRY|REEFER|45G1|22G1|42G1|GP|HR)|(?:45G1|22G1|42G1)\b/i);
      if (typeMatch) {
        const rawT = typeMatch[0].toUpperCase();
        if (rawT.includes('20') || rawT.includes('22G1') || rawT.includes('DV')) containerType = "20' Dry";
        else if (rawT.includes('45G1') || rawT.includes('HC')) containerType = "40' HC";
        else if (rawT.includes('REEFER')) containerType = "40' Reefer";
        else if (rawT.includes('40')) containerType = "40' Dry";
        subAfter = subAfter.replace(typeMatch[0], ' ');
      }

      // Tokens numéricos
      const rawNumTokens = subAfter.match(/[0-9]+(?:[.,][0-9]+)*/g) || [];

      const parseVal = (str) => {
        if (!str) return 0;
        let s = str.trim();
        if (s.includes(',')) {
          s = s.replace(/\./g, '').replace(/,/g, '.');
        } else if (/\.\d{3}$/.test(s)) {
          s = s.replace(/\./g, '');
        }
        return parseFloat(s) || 0;
      };

      let rowBags = 0;
      let netWeight = '';
      let tara = '';
      let grossWeight = '';

      let provisionalSeals = [];
      if (rawNumTokens.length >= 4) {
        const wTokens = rawNumTokens.slice(-4);
        rowBags = parseInt(wTokens[0].replace(/[.,]/g, ''), 10) || 0;
        netWeight = wTokens[1];
        tara = wTokens[2].replace(/[.,]/g, '');
        grossWeight = wTokens[3];

        const extraTokens = rawNumTokens.slice(0, -4);
        if (extraTokens.length > 0) {
          provisionalSeals = extraTokens.map((s, idx) => ({
            id: 'seal_' + Date.now() + '_' + idx,
            sealNumber: s
          }));
        }
      } else if (rawNumTokens.length === 3) {
        const v0 = parseVal(rawNumTokens[0]);
        const v1 = parseVal(rawNumTokens[1]);
        const v2 = parseVal(rawNumTokens[2]);
        if (v1 >= 1800 && v1 <= 4900 && v2 > v0) {
          netWeight = rawNumTokens[0];
          tara = rawNumTokens[1].replace(/[.,]/g, '');
          grossWeight = rawNumTokens[2];
        } else {
          rowBags = parseInt(rawNumTokens[0].replace(/[.,]/g, ''), 10) || 0;
          netWeight = rawNumTokens[1];
          grossWeight = rawNumTokens[2];
        }
      } else if (rawNumTokens.length === 2) {
        netWeight = rawNumTokens[0];
        grossWeight = rawNumTokens[1];
      } else if (rawNumTokens.length === 1) {
        const v0 = parseVal(rawNumTokens[0]);
        if (v0 >= 1800 && v0 <= 4900) {
          tara = rawNumTokens[0].replace(/[.,]/g, '');
        } else if (v0 > 5000) {
          netWeight = rawNumTokens[0];
        } else {
          rowBags = parseInt(rawNumTokens[0].replace(/[.,]/g, ''), 10) || 0;
        }
      }

      if (!tara) {
        const taraCand = rawNumTokens.find(t => {
          const v = parseVal(t);
          return v >= 1800 && v <= 4900 && t !== netWeight && t !== grossWeight;
        });
        if (taraCand) tara = taraCand.replace(/[.,]/g, '');
      }

      lineContainers.push({
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        containerNumber: rawNum,
        containerType: containerType,
        provisionalSeals: provisionalSeals,
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
  }

  let parsedContainers = [];
  if (lineContainers.length > 0) {
    parsedContainers = lineContainers;
  } else {
    // Fallback por segmentos
    const containerRegexGlobal = /\b([A-Z]{4}[-\s]?\d{6}[-\s]?\d)\b/gi;
    const containerMatches = [];
    let match;
    while ((match = containerRegexGlobal.exec(fullText)) !== null) {
      const rawNum = match[1].trim().toUpperCase().replace(/[-\s]/g, '');
      if (rawNum.startsWith('MLB') || rawNum.includes('MLBR')) continue;

      containerMatches.push({
        number: rawNum,
        index: match.index,
        length: match[0].length
      });
    }

    for (let i = 0; i < containerMatches.length; i++) {
      const currentMatch = containerMatches[i];
      const nextMatch = containerMatches[i + 1];

      const startIndex = currentMatch.index;
      const endIndex = nextMatch ? nextMatch.index : fullText.length;
      const segment = fullText.substring(startIndex, endIndex);

      const containerNumber = currentMatch.number;

      let definiteSeal = '';
      const sealMatch = segment.match(/\b((?:LINE\s*|MLBR\s*|[A-Z]{1,4}\s*)?[A-Z0-9]{6,12})\b/i);
      if (sealMatch && sealMatch[1] !== containerNumber) {
        definiteSeal = sealMatch[1].trim();
      }

      let brand = '';
      const oicMatch = segment.match(/\b(\d{3}\/\d{3,4}\/\d{3,4}|(?:MAC|GRV|LOTE|OIC)[.\w\/-]+(?:\s*-\s*[A-Z0-9\/-]+)?)\b/i);
      if (oicMatch) brand = oicMatch[1].trim();

      const rawNumTokens = segment.match(/[0-9]+(?:[.,][0-9]+)*/g) || [];
      const parseVal = (str) => {
        if (!str) return 0;
        let s = str.trim();
        if (s.includes(',')) {
          s = s.replace(/\./g, '').replace(/,/g, '.');
        } else if (/\.\d{3}$/.test(s)) {
          s = s.replace(/\./g, '');
        }
        return parseFloat(s) || 0;
      };

      let rowBags = 0;
      let netWeight = '';
      let tara = '';
      let grossWeight = '';

      const weightTokens = rawNumTokens.filter(t => t !== containerNumber && !containerNumber.includes(t));
      let fallbackProvSeals = [];
      if (weightTokens.length >= 4) {
        const wTokens = weightTokens.slice(-4);
        rowBags = parseInt(wTokens[0].replace(/[.,]/g, ''), 10) || 0;
        netWeight = wTokens[1];
        tara = wTokens[2].replace(/[.,]/g, '');
        grossWeight = wTokens[3];
        const extraTokens = weightTokens.slice(0, -4);
        if (extraTokens.length > 0) {
          fallbackProvSeals = extraTokens.map((s, idx) => ({
            id: 'seal_' + Date.now() + '_' + idx,
            sealNumber: s
          }));
        }
      } else if (weightTokens.length >= 2) {
        netWeight = weightTokens[0];
        grossWeight = weightTokens[weightTokens.length - 1];
        const taraCand = weightTokens.find(t => {
          const v = parseVal(t);
          return v >= 1800 && v <= 4900 && t !== netWeight && t !== grossWeight;
        });
        if (taraCand) tara = taraCand.replace(/[.,]/g, '');
      }

      parsedContainers.push({
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        containerNumber,
        containerType: defaultContainerType,
        provisionalSeals: fallbackProvSeals,
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
  }

  const totalBagsNum = parseBrazilianOrStandardFloat(bagsQuantity);
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
