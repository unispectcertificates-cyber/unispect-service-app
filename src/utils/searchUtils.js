/**
 * Utilitário de Busca e Normalização Inteligente
 * Suporta busca de container, booking, exportador, navio, lacre, etc.
 * Exemplos de formatos suportados simultaneamente para containers:
 * - MSDU-882129-7
 * - MSDU882129-7
 * - MSDU 8821297
 * - MSDU8821297
 * - MSDU 882129-7
 * - msdu 882129 7
 * - 882129 (busca parcial)
 */

/**
 * Normaliza texto removendo acentos/diacríticos e convertendo para minúsculas.
 * Ex: "Café Atlântica" -> "cafe atlantica"
 */
export function normalizeText(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Normaliza código alfanumérico removendo acentos, pontuação, hífens, espaços e barras.
 * Mantém apenas [a-z0-9].
 * Ex: "MSDU-882129-7" -> "msdu8821297"
 *     "MSDU 8821297"  -> "msdu8821297"
 *     "BKG / 2024-01" -> "bkg202401"
 */
export function normalizeCode(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Verifica se um container (objeto ou string) corresponde à consulta de busca.
 */
export function matchesContainerQuery(container, query) {
  if (!query || !query.trim()) return true;
  if (!container) return false;

  const rawNum = typeof container === 'string' ? container : (container.containerNumber || '');
  const contCode = normalizeCode(rawNum);
  const contText = normalizeText(rawNum);
  const qCode = normalizeCode(query);
  const qText = normalizeText(query);

  // 1. Match exato ou parcial de código alfanumérico
  if (qCode && contCode.includes(qCode)) return true;

  // 2. Match de texto normalizado
  if (qText && contText.includes(qText)) return true;

  // 3. Match em lacres (caso seja objeto container)
  if (typeof container === 'object') {
    const seals = [
      container.definiteSeal,
      ...(container.provisionalSeals || []).map(s => {
        if (!s) return '';
        if (typeof s === 'string') return s;
        return s.sealNumber || s.seal || s.number || s.value || s.lacre || '';
      })
    ].filter(Boolean);

    for (const seal of seals) {
      const sCode = normalizeCode(seal);
      const sText = normalizeText(seal);
      if (qCode && sCode.includes(qCode)) return true;
      if (qText && sText.includes(qText)) return true;
    }
  }

  return false;
}

/**
 * Retorna a lista de containers de um booking que correspondem à pesquisa.
 */
export function getMatchedContainers(booking, query) {
  if (!query || !query.trim() || !booking || !Array.isArray(booking.containers)) {
    return [];
  }
  const qCode = normalizeCode(query);
  const qText = normalizeText(query);
  if (!qCode && !qText) return [];

  return booking.containers.filter(c => matchesContainerQuery(c, query));
}

/**
 * Verifica se um Booking corresponde aos critérios de pesquisa.
 * Pesquisa em:
 * - Números de Containers e Lacres (todas as variações de código alfanumérico)
 * - Número de Booking (todas as variações)
 * - Número de Certificado / Romaneio / Stuffing Report
 * - Nome do Exportador (insensível a maiúsculas e acentos)
 * - Nome do Local (insensível a maiúsculas e acentos)
 * - Navio e Viagem
 * - Mercadoria / Embalagem / Status
 * - Múltiplos termos simultâneos (ex: "MSDU8821297 Atlantica")
 */
export function matchesBooking(booking, query, { exportadores = [], locais = [] } = {}) {
  if (!query || !query.trim()) return true;
  if (!booking) return false;

  const rawQuery = query.trim();
  const qText = normalizeText(rawQuery);
  const qCode = normalizeCode(rawQuery);

  if (!qText && !qCode) return true;

  // 1. Verificação direta por código alfanumérico (Containers)
  if (qCode.length > 0) {
    if (Array.isArray(booking.containers)) {
      const hasContMatch = booking.containers.some(c => matchesContainerQuery(c, rawQuery));
      if (hasContMatch) return true;
    }

    // Verificação de código no Booking Number
    const bCode = normalizeCode(booking.bookingNumber);
    if (bCode && bCode.includes(qCode)) return true;

    // Verificação de código no Certificado
    const cCode = normalizeCode(booking.certificateNumber);
    if (cCode && cCode.includes(qCode)) return true;

    // Verificação de código no Stuffing Report
    const sCode = normalizeCode(booking.stuffingReportNumber);
    if (sCode && sCode.includes(qCode)) return true;
  }

  // 2. Resolução de nomes de entidades relacionadas
  const exporter = (exportadores || []).find(e => e.id === booking.exporterId);
  const exporterName = exporter?.name || booking.exporterName || '';

  const local = (locais || []).find(l => l.id === booking.locationId);
  const localName = local?.name || booking.locationName || '';

  // 3. Montagem do corpus textual completo normalizado
  const textFields = [
    booking.bookingNumber,
    booking.certificateNumber,
    booking.stuffingReportNumber,
    booking.vesselVoyage,
    booking.vesselName,
    booking.vesselVoyageNum,
    booking.commodity,
    booking.mercadoria,
    booking.embalagem,
    booking.status,
    booking.pendingItem,
    exporterName,
    localName,
    ...(booking.containers || []).map(c => c?.containerNumber || ''),
    ...(booking.containers || []).flatMap(c => [
      c?.definiteSeal,
      ...(c?.provisionalSeals || []).map(s => typeof s === 'string' ? s : (s?.sealNumber || s?.seal || ''))
    ])
  ];

  const fullNormalizedCorpus = textFields
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');

  // Busca simples de substring
  if (fullNormalizedCorpus.includes(qText)) return true;

  // 4. Busca por múltiplos termos/palavras-chave (ex: "MSDU 8821297 Atlantica")
  const tokens = qText.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const allTokensMatch = tokens.every(token => {
      // Verifica se o token está no texto normalizado
      if (fullNormalizedCorpus.includes(token)) return true;

      // Verifica se o token corresponde a algum código alfanumérico
      const tCode = normalizeCode(token);
      if (tCode.length >= 2) {
        if (normalizeCode(booking.bookingNumber).includes(tCode)) return true;
        if (normalizeCode(booking.certificateNumber).includes(tCode)) return true;
        if (normalizeCode(booking.stuffingReportNumber).includes(tCode)) return true;
        if ((booking.containers || []).some(c => normalizeCode(c?.containerNumber).includes(tCode))) return true;
      }
      return false;
    });

    if (allTokensMatch) return true;
  }

  return false;
}
