import { generateUUID } from './uuid.js';
import { normalizeText, normalizeCode } from './searchUtils.js';

export const COFFEE_ANALYSES_COL = 'coffeeAnalyses';
export const COFFEE_ANALYSIS_AUDIT_COL = 'coffeeAnalysisAuditEvents';
export const COFFEE_ANALYSIS_COUNTERS_COL = 'coffeeAnalysisCounters';
export const COFFEE_ANALYSIS_REQ_KEYS_COL = 'coffeeAnalysisRequestKeys';

/**
 * Fonte Oficial do Histórico de Auditoria:
 * A coleção `coffeeAnalysisAuditEvents` (append-only, allow update/delete: if false nas regras do Firestore)
 * é a ÚNICA fonte oficial do histórico de auditoria. O documento `coffeeAnalyses/{laudoId}` não armazena
 * array `auditTimeline` mutável, impedindo divergências e garantindo que nenhum usuário comum possa
 * reescrever o histórico ao editar o documento do rascunho.
 */
export const OFFICIAL_COFFEE_AUDIT_SOURCE = COFFEE_ANALYSIS_AUDIT_COL;

export const COFFEE_ANALYSIS_INITIAL_STATUS = 'Rascunho';
export const COFFEE_ANALYSIS_STATUSES = [
  'Rascunho',
  'Aguardando assinatura',
  'Emitido',
  'Cancelado'
];
export const COFFEE_CLASSIFICATION_BASIS = '300 g de café';
export const COFFEE_SAMPLE_WEIGHT_GRAMS = 300;
export const DEFAULT_CLIENT_ID = 'client_interport';

export const COFFEE_OFFICIAL_DEFECT_ROWS = [
  { key: 'full_black', label: 'Full black beans', order: 1 },
  { key: 'full_sour', label: 'Full sour beans', order: 2 },
  { key: 'dried_cherry', label: 'Dried cherry/pod', order: 3 },
  { key: 'severe_insect', label: 'Severe insect damage', order: 4 },
  { key: 'foreign_matter', label: 'Foreign matter', order: 5 },
  { key: 'partial_black', label: 'Partial black', order: 6 },
  { key: 'partial_sour', label: 'Partial sour', order: 7 },
  { key: 'parchment', label: 'Parchment', order: 8 },
  { key: 'broken_chipped', label: 'Broken/chipped beans', order: 9 }
];

export const COFFEE_OFFICIAL_SCREENS = [
  { key: 'screen_19', label: '#19', order: 1 },
  { key: 'screen_18', label: '#18', order: 2 },
  { key: 'screen_17', label: '#17', order: 3 },
  { key: 'screen_16', label: '#16', order: 4 },
  { key: 'screen_15', label: '#15', order: 5 },
  { key: 'screen_14', label: '#14', order: 6 },
  { key: 'screen_13', label: '#13', order: 7 },
  { key: 'screen_12', label: '#12', order: 8 },
  { key: 'screen_11', label: '#11', order: 9 },
  { key: 'screen_10', label: '#10', order: 10 },
  { key: 'bottom', label: 'Bottom/Fundo', order: 11 }
];

export const COFFEE_DRAFT_NEXT_STAGE_NOTICE =
  'Rascunho cadastrado. O formulário de classificação e o modelo do certificado serão disponibilizados em uma próxima etapa.';

export const COFFEE_EMPTY_LIST_MESSAGE =
  "Nenhum laudo cadastrado. Clique em 'Novo laudo de café' para começar.";

/**
 * Resolve um timestamp que pode ser Date, número (ms), string ISO ou Timestamp do Firestore ({ toMillis(), seconds })
 */
export function resolveTimestampMs(input) {
  if (!input) return 0;
  if (typeof input === 'number') return input;
  if (input instanceof Date) return input.getTime();
  if (typeof input === 'object') {
    if (typeof input.toMillis === 'function') return input.toMillis();
    if (typeof input.seconds === 'number') {
      return input.seconds * 1000 + Math.floor((input.nanoseconds || 0) / 1e6);
    }
  }
  const parsed = Date.parse(String(input));
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Formata data/hora sempre no fuso America/Sao_Paulo
 */
export function formatDateTimeSp(timestampInput) {
  const ms = resolveTimestampMs(timestampInput);
  if (!ms) return '—';
  const dt = new Date(ms);
  if (isNaN(dt.getTime())) return '—';

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(dt);
  } catch {
    return dt.toLocaleString('pt-BR');
  }
}

/**
 * Converte referências de assinatura em Data URI com bytes reais embutidos.
 * Garante que a assinatura efetivamente aplicada fique preservada de forma imutável no snapshot,
 * imune a substituição, exclusão ou alteração posterior de arquivos no servidor.
 */
export async function resolveSignatureDataUri(urlOrData) {
  if (!urlOrData || typeof urlOrData !== 'string') return null;
  const clean = urlOrData.trim();
  if (clean.startsWith('data:image/')) {
    return clean;
  }

  // Ambiente Node.js (testes e ferramentas server-side)
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const relPath = clean.startsWith('/') ? clean.slice(1) : clean;
      const candidates = [
        path.resolve(clean),
        path.resolve('public', relPath),
        path.resolve(process.cwd(), 'public', relPath),
        path.resolve(process.cwd(), clean)
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
          const buf = fs.readFileSync(cand);
          const ext = path.extname(cand).toLowerCase();
          const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : 'image/jpeg';
          return `data:${mime};base64,${buf.toString('base64')}`;
        }
      }
    } catch {
      // Fallback
    }
  }

  // Ambiente do Navegador
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    try {
      const resp = await window.fetch(clean);
      if (resp.ok) {
        const blob = await resp.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    } catch {
      // Fallback
    }
  }

  return clean;
}

/**
 * Extrai a data YYYY-MM-DD no fuso America/Sao_Paulo para filtro de período
 */
export function extractDateYmdSp(timestampInput) {
  const ms = resolveTimestampMs(timestampInput);
  if (!ms) return '';
  const dt = new Date(ms);
  if (isNaN(dt.getTime())) return '';

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(dt);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const d = parts.find(p => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // Fallback
  }
  return dt.toISOString().slice(0, 10);
}

/**
 * Resolve e valida a identidade do usuário autenticado.
 * Bloqueia qualquer tentativa de escolher outro colaborador como autor da ação.
 */
export function resolveAuthenticatedActor(user, attemptedOverrideActor = null) {
  if (!user || typeof user !== 'object') {
    throw new Error('Usuário não autenticado. Faça login novamente para continuar.');
  }

  const id = String(user.id || user.uid || user.login || user.username || '').trim();
  const uid = String(user.uid || user.id || id).trim();
  const name = String(user.name || user.username || user.displayName || user.login || '').trim();

  if (!id || !name) {
    throw new Error('Identidade do usuário autenticado incompleta (ID e nome são obrigatórios).');
  }

  if (attemptedOverrideActor) {
    const overrideId =
      typeof attemptedOverrideActor === 'string'
        ? attemptedOverrideActor.trim()
        : String(
            attemptedOverrideActor.id ||
              attemptedOverrideActor.uid ||
              attemptedOverrideActor.userId ||
              ''
          ).trim();
    const overrideName =
      typeof attemptedOverrideActor === 'object' && attemptedOverrideActor !== null
        ? String(attemptedOverrideActor.name || attemptedOverrideActor.username || '').trim()
        : '';

    if ((overrideId && overrideId !== id && overrideId !== uid) || (overrideName && overrideName !== name)) {
      throw new Error('Não é permitido escolher outra pessoa como autor da ação.');
    }
  }

  return {
    id,
    uid,
    name,
    login: String(user.login || user.username || id),
    role: String(user.role || 'Inspector'),
    clientId: String(user.clientId || DEFAULT_CLIENT_ID),
    authorizedClients: Array.isArray(user.authorizedClients)
      ? user.authorizedClients.map(String)
      : [String(user.clientId || DEFAULT_CLIENT_ID)],
    exporterId: user.exporterId ? String(user.exporterId) : null
  };
}

/**
 * Verifica se o usuário é Master Unispect (acesso transversal)
 */
export function isMasterUser(user) {
  if (!user || typeof user !== 'object') return false;
  const roleNorm = String(user.role || '').toUpperCase().trim();
  return (
    roleNorm === 'ADM' ||
    roleNorm === 'UNISPECT_MASTER' ||
    roleNorm === 'MASTER' ||
    user.isMaster === true
  );
}

/**
 * Verifica se o usuário tem permissão de acesso à rota/módulo "Analysis of coffee"
 */
export function canAccessCoffeeAnalysisModule(user) {
  if (!user || typeof user !== 'object') return false;
  const id = String(user.id || user.uid || user.login || user.username || '').trim();
  if (!id) return false;
  if (isMasterUser(user)) return true;
  const roleNorm = String(user.role || '').toUpperCase().trim();
  const allowedUpper = ['ADM', 'UNISPECT_MASTER', 'MASTER', 'CLIENT_ADMIN', 'INSPECTOR', 'EXPORTADOR'];
  return allowedUpper.includes(roleNorm);
}

/**
 * Verifica se o usuário pode criar ou editar rascunhos de laudos de café.
 * Apenas perfis internos autorizados podem criar ou editar; Exportador é somente leitura.
 */
export function canCreateOrEditCoffeeAnalysis(user) {
  if (!canAccessCoffeeAnalysisModule(user)) return false;
  const roleNorm = String(user.role || '').toUpperCase().trim();
  if (roleNorm === 'EXPORTADOR') return false;
  if (isMasterUser(user)) return true;
  return ['ADM', 'UNISPECT_MASTER', 'MASTER', 'CLIENT_ADMIN', 'INSPECTOR'].includes(roleNorm);
}

/**
 * Verifica se o usuário possui acesso ao clientId do registro
 */
export function isClientAuthorizedForUser(user, recordClientId) {
  if (!user) return false;
  if (isMasterUser(user)) return true;

  const targetClient = String(recordClientId || DEFAULT_CLIENT_ID);
  const userClient = String(user.clientId || DEFAULT_CLIENT_ID);
  const authorizedList = Array.isArray(user.authorizedClients)
    ? user.authorizedClients.map(String)
    : [userClient];

  return authorizedList.includes(targetClient) || userClient === targetClient;
}

/**
 * Filtra os exportadores disponíveis para o usuário autenticado conforme permissões e isolamento de cliente
 */
export function filterExportersForUser(exportadores = [], user) {
  if (!canAccessCoffeeAnalysisModule(user)) return [];
  const list = Array.isArray(exportadores) ? exportadores : [];

  return list.filter(exp => {
    if (!exp || !exp.id) return false;
    const expClientId = exp.clientId || DEFAULT_CLIENT_ID;
    if (!isClientAuthorizedForUser(user, expClientId)) return false;

    if (user.role === 'Exportador') {
      if (!user.exporterId) return false;
      return String(exp.id) === String(user.exporterId);
    }
    return true;
  });
}

/**
 * Filtra os bookings vinculados ao exportador selecionado e autorizados para o usuário
 */
export function filterBookingsForExporterAndUser(bookings = [], exporterId, user, exporterObj = null) {
  if (!canAccessCoffeeAnalysisModule(user)) return [];
  if (!exporterId) return [];

  const targetExporterId = String(exporterId).trim();
  const exporterClientId = exporterObj?.clientId || DEFAULT_CLIENT_ID;
  if (!isClientAuthorizedForUser(user, exporterClientId)) return [];

  if (user.role === 'Exportador' && String(user.exporterId) !== targetExporterId) {
    return [];
  }

  const list = Array.isArray(bookings) ? bookings : [];
  return list.filter(b => {
    if (!b || !b.id) return false;
    if (String(b.exporterId || '') !== targetExporterId) return false;

    const bookingClientId = b.clientId || DEFAULT_CLIENT_ID;
    if (!isClientAuthorizedForUser(user, bookingClientId)) return false;
    if (exporterObj?.clientId && b.clientId && String(b.clientId) !== String(exporterObj.clientId)) {
      return false;
    }
    return true;
  });
}

/**
 * Filtra a lista de laudos de café visíveis para o usuário autenticado
 */
export function filterCoffeeAnalysesForUser(analyses = [], user) {
  if (!canAccessCoffeeAnalysisModule(user)) return [];
  const list = Array.isArray(analyses) ? analyses : [];

  return list.filter(laudo => {
    if (!laudo || !laudo.id) return false;
    const laudoClientId = laudo.clientId || DEFAULT_CLIENT_ID;
    if (!isClientAuthorizedForUser(user, laudoClientId)) return false;

    if (user.role === 'Exportador') {
      if (!user.exporterId) return false;
      return String(laudo.exporterId) === String(user.exporterId);
    }
    return true;
  });
}

/**
 * Extrai de forma segura (sem mutar os dados originais) os Lotes e Containers disponíveis em um Booking.
 */
export function extractBookingLotsAndContainers(booking) {
  if (!booking || typeof booking !== 'object') {
    return { lots: [], containers: [] };
  }

  const rawContainers = Array.isArray(booking.containers) ? booking.containers : [];
  const containers = rawContainers
    .filter(c => c && (c.id || c.containerNumber))
    .map((c, idx) => {
      const containerNumber = String(c.containerNumber || '').trim().toUpperCase();
      const id = String(c.id || containerNumber || `cont_${idx + 1}`);
      return {
        id,
        containerNumber: containerNumber || id,
        containerType: String(c.containerType || "20'"),
        bagsQuantity: Number(c.bagsQuantity) || 0,
        brand: String(c.brand || '').trim(),
        lot: String(c.lot || c.lote || c.oic || '').trim(),
        definiteSeal: String(c.definiteSeal || '').trim()
      };
    });

  const lotsMap = new Map();
  const addLot = (idRaw, labelRaw, meta = {}) => {
    const id = String(idRaw || '').trim();
    if (!id) return;
    if (!lotsMap.has(id)) {
      lotsMap.set(id, {
        id,
        code: String(meta.code || id),
        label: String(labelRaw || id),
        bagsQuantity: Number(meta.bagsQuantity) || 0,
        containerNumber: meta.containerNumber || null
      });
    }
  };

  const explicitLots = Array.isArray(booking.lots)
    ? booking.lots
    : Array.isArray(booking.lotes)
      ? booking.lotes
      : [];

  for (const item of explicitLots) {
    if (typeof item === 'string' || typeof item === 'number') {
      const code = String(item).trim();
      addLot(code, `Lote ${code}`, { code });
    } else if (item && typeof item === 'object') {
      const id = String(item.id || item.code || item.lotNumber || item.lote || item.name || '').trim();
      const code = String(item.code || item.lotNumber || item.lote || item.name || id).trim();
      const bags = Number(item.bagsQuantity || item.bags || 0);
      const label = bags > 0 ? `Lote ${code} (${bags} sacas)` : `Lote ${code}`;
      addLot(id, label, { code, bagsQuantity: bags, containerNumber: item.containerNumber });
    }
  }

  for (const field of ['lot', 'lote', 'oic']) {
    if (booking[field] && String(booking[field]).trim()) {
      const code = String(booking[field]).trim();
      addLot(code, `Lote ${code}`, { code, bagsQuantity: Number(booking.bagsQuantity) || 0 });
    }
  }

  for (const c of containers) {
    if (c.lot) {
      addLot(c.lot, `Lote ${c.lot}${c.containerNumber ? ` — Cont. ${c.containerNumber}` : ''}`, {
        code: c.lot,
        bagsQuantity: c.bagsQuantity,
        containerNumber: c.containerNumber
      });
    } else if (c.brand) {
      const lotId = `LOTE-${c.brand}-${c.containerNumber}`;
      addLot(lotId, `Lote / Marca ${c.brand} (${c.containerNumber})`, {
        code: c.brand,
        bagsQuantity: c.bagsQuantity,
        containerNumber: c.containerNumber
      });
    }
  }

  if (lotsMap.size === 0) {
    if (containers.length > 0) {
      for (const c of containers) {
        const lotId = `LOT-${c.containerNumber}`;
        const label =
          c.bagsQuantity > 0
            ? `Lote Container ${c.containerNumber} (${c.bagsQuantity} sacas)`
            : `Lote Container ${c.containerNumber}`;
        addLot(lotId, label, {
          code: lotId,
          bagsQuantity: c.bagsQuantity,
          containerNumber: c.containerNumber
        });
      }
    } else if (booking.bookingNumber) {
      const lotId = `LOT-${booking.bookingNumber}`;
      const bags = Number(booking.bagsQuantity) || 0;
      addLot(
        lotId,
        bags > 0
          ? `Lote Geral Booking ${booking.bookingNumber} (${bags} sacas)`
          : `Lote Geral Booking ${booking.bookingNumber}`,
        { code: lotId, bagsQuantity: bags }
      );
    }
  }

  return {
    lots: Array.from(lotsMap.values()),
    containers
  };
}

/**
 * Quando o exportador é alterado no formulário de criação/edição, limpa automaticamente
 * quaisquer seleções incompatíveis de booking, lotes e containers.
 */
export function reconcileExporterChange(currentState = {}, newExporterId, bookings = []) {
  const prevExporterId = String(currentState.exporterId || '');
  const nextExporterId = String(newExporterId || '');

  if (prevExporterId === nextExporterId) {
    return { ...currentState, exporterId: nextExporterId };
  }

  const currentBookingId = String(currentState.bookingId || '');
  if (!currentBookingId) {
    return {
      ...currentState,
      exporterId: nextExporterId,
      bookingId: '',
      selectedLots: [],
      selectedContainerIds: []
    };
  }

  const matchingBooking = (bookings || []).find(b => String(b?.id) === currentBookingId);
  const isCompatible =
    matchingBooking && String(matchingBooking.exporterId || '') === nextExporterId;

  if (!isCompatible) {
    return {
      ...currentState,
      exporterId: nextExporterId,
      bookingId: '',
      bookingSearch: '',
      selectedLots: [],
      selectedContainerIds: []
    };
  }

  return {
    ...currentState,
    exporterId: nextExporterId
  };
}

/**
 * Valida todos os vínculos (exportador, booking, lotes e containers) e permissões do usuário.
 */
export function validateCoffeeAnalysisLinks({
  exporterId,
  bookingId = null,
  selectedLots = [],
  selectedContainerIds = [],
  exportadores = [],
  bookings = [],
  user,
  targetClientId = null
}) {
  const actor = resolveAuthenticatedActor(user);

  if (!canCreateOrEditCoffeeAnalysis(user)) {
    throw new Error(
      'Acesso negado: seu perfil não possui permissão para criar ou editar laudos de café.'
    );
  }

  const cleanExporterId = String(exporterId || '').trim();
  if (!cleanExporterId) {
    throw new Error('O campo Exportador é obrigatório.');
  }

  const exporter = (exportadores || []).find(e => String(e?.id) === cleanExporterId);
  if (!exporter) {
    throw new Error('Exportador selecionado não existe nos cadastros do sistema.');
  }

  const resolvedClientId = String(
    targetClientId || exporter.clientId || actor.clientId || DEFAULT_CLIENT_ID
  );

  if (!isClientAuthorizedForUser(user, resolvedClientId)) {
    throw new Error('Acesso negado: você não possui permissão para o cliente deste exportador.');
  }

  if (exporter.clientId && String(exporter.clientId) !== resolvedClientId) {
    throw new Error('Incompatibilidade de cliente entre o laudo e o exportador selecionado.');
  }

  const cleanBookingId = bookingId ? String(bookingId).trim() : '';
  const rawLots = Array.isArray(selectedLots) ? selectedLots.map(s => String(s).trim()).filter(Boolean) : [];
  const rawContainers = Array.isArray(selectedContainerIds)
    ? selectedContainerIds.map(s => String(s).trim()).filter(Boolean)
    : [];

  if (!cleanBookingId) {
    if (rawLots.length > 0 || rawContainers.length > 0) {
      throw new Error('Para vincular lotes ou Containers, selecione primeiro um Booking válido.');
    }
    return {
      actor,
      clientId: resolvedClientId,
      exporter,
      booking: null,
      normalizedLots: [],
      normalizedContainers: [],
      lotDetails: [],
      containerDetails: []
    };
  }

  const booking = (bookings || []).find(b => String(b?.id) === cleanBookingId);
  if (!booking) {
    throw new Error('Booking selecionado não foi encontrado no sistema.');
  }

  if (String(booking.exporterId || '') !== String(exporter.id)) {
    throw new Error(
      'Vínculo bloqueado: o Booking selecionado pertence a outro exportador.'
    );
  }

  const bookingClientId = String(booking.clientId || resolvedClientId);
  if (bookingClientId !== resolvedClientId || !isClientAuthorizedForUser(user, bookingClientId)) {
    throw new Error(
      'Vínculo bloqueado: o Booking selecionado pertence a outro cliente.'
    );
  }

  const { lots: availableLots, containers: availableContainers } =
    extractBookingLotsAndContainers(booking);

  const validLotMap = new Map();
  for (const l of availableLots) {
    validLotMap.set(String(l.id), l);
    validLotMap.set(String(l.code), l);
  }

  const normalizedLots = [];
  const lotDetails = [];
  const seenLots = new Set();

  for (const lotKey of rawLots) {
    const found = validLotMap.get(lotKey);
    if (!found) {
      throw new Error(
        `O lote "${lotKey}" não pertence ao Booking ${booking.bookingNumber}.`
      );
    }
    if (!seenLots.has(found.id)) {
      seenLots.add(found.id);
      normalizedLots.push(found.id);
      lotDetails.push(found);
    }
  }

  const validContainerMap = new Map();
  for (const c of availableContainers) {
    validContainerMap.set(String(c.id), c);
    validContainerMap.set(String(c.containerNumber), c);
  }

  const normalizedContainers = [];
  const containerDetails = [];
  const seenContainers = new Set();

  for (const contKey of rawContainers) {
    const found = validContainerMap.get(contKey);
    if (!found) {
      throw new Error(
        `O Container "${contKey}" não pertence ao Booking ${booking.bookingNumber}.`
      );
    }
    if (!seenContainers.has(found.id)) {
      seenContainers.add(found.id);
      normalizedContainers.push(found.id);
      containerDetails.push({
        id: found.id,
        containerNumber: found.containerNumber,
        containerType: found.containerType,
        bagsQuantity: found.bagsQuantity
      });
    }
  }

  return {
    actor,
    clientId: resolvedClientId,
    exporter,
    booking,
    normalizedLots,
    normalizedContainers,
    lotDetails,
    containerDetails
  };
}

/**
 * Extrai a maior sequência numérica já existente nos laudos do ano informado
 */
export function extractMaxCoffeeLaudoSequence(existingAnalyses = [], referenceYear = 2026) {
  let maxNum = 0;
  for (const item of existingAnalyses || []) {
    const numStr = String(item?.laudoNumber || item?.code || '').trim();
    const match =
      numStr.match(/(?:UN|LCF-|UN-CAF-|CAF-)(\d+)\/(\d{4})/i) ||
      numStr.match(/(?:UN|LCF-|UN-CAF-|CAF-)(\d+)/i);
    if (match) {
      const n = parseInt(match[1], 10);
      const yr = match[2] ? parseInt(match[2], 10) : referenceYear;
      if (yr === referenceYear && !isNaN(n) && n > maxNum) {
        maxNum = n;
      }
    }
  }
  return maxNum;
}

/**
 * Gera a próxima identificação legível para o laudo seguindo o padrão oficial UN0001/AAAA
 * com 4 dígitos mínimos (sem truncar ou reiniciar após 9999).
 */
export function generateNextCoffeeLaudoNumber(existingAnalyses = [], referenceYear = 2026, counterValue = 0) {
  const maxExisting = extractMaxCoffeeLaudoSequence(existingAnalyses, referenceYear);
  const base = Math.max(maxExisting, Number(counterValue) || 0);
  const nextSeq = String(base + 1).padStart(4, '0');
  return {
    laudoNumber: `UN${nextSeq}/${referenceYear}`,
    sequenceNumber: base + 1
  };
}

/**
 * Normaliza valores numéricos com suporte flexível a vírgula ou ponto decimal.
 * Retorna null se vazio ou indefinido, distinguindo explicitamente de 0.
 */
export function parseFlexibleDecimal(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return isNaN(val) ? null : val;
  }
  const str = String(val).trim().replace(',', '.');
  if (str === '') return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

/**
 * Calcula a soma e o status de validação das peneiras (Screen Analysis).
 * Retorna { total, isComplete, hasValues, warning }
 */
export function calculateScreenAnalysisSummary(screens = {}) {
  let sum = 0;
  let filledCount = 0;
  let allNotAnalysed = true;

  for (const row of COFFEE_OFFICIAL_SCREENS) {
    const val = screens?.[row.key];
    if (val === 'NOT_ANALYSED' || val?.notAnalysed) {
      continue;
    }
    const num = parseFlexibleDecimal(typeof val === 'object' ? val?.value : val);
    if (num !== null) {
      allNotAnalysed = false;
      filledCount++;
      sum += num;
    }
  }

  const roundedTotal = Math.round(sum * 100) / 100;
  const isExact100 = Math.abs(roundedTotal - 100) < 0.001;
  const warning =
    filledCount > 0 && !isExact100
      ? `Atenção: a distribuição das peneiras informada totaliza ${roundedTotal.toFixed(2).replace('.', ',')}%, divergindo de 100,00%.`
      : null;

  return {
    total: roundedTotal,
    filledCount,
    allNotAnalysed,
    isExact100,
    warning
  };
}

/**
 * Calcula a soma dos defeitos equivalentes (Defect Analysis - 300 g Sample).
 * A linha TOTAL é exclusivamente calculada pela soma dos resultados de cada linha.
 * Se houver linhas sem resultado ou marcadas como 'Não analisado', não apresenta
 * a soma parcial como total completo.
 */
export function calculateDefectsAnalysisSummary(defects = {}) {
  let totalDefectsSum = 0;
  let allFilled = true;
  let filledCount = 0;
  let notAnalysedCount = 0;

  for (const row of COFFEE_OFFICIAL_DEFECT_ROWS) {
    const item = defects?.[row.key] || {};
    if (item.notAnalysed === true || item === 'NOT_ANALYSED') {
      notAnalysedCount++;
      allFilled = false;
      continue;
    }

    const totalVal = parseFlexibleDecimal(item.totalDefects ?? item.total);
    if (totalVal === null) {
      allFilled = false;
    } else {
      filledCount++;
      totalDefectsSum += totalVal;
    }
  }

  const roundedSum = Math.round(totalDefectsSum * 100) / 100;

  return {
    totalEquivalentDefects: allFilled ? roundedSum : null,
    partialSum: roundedSum,
    isComplete: allFilled,
    filledCount,
    notAnalysedCount,
    hasIncompleteWarning: !allFilled && filledCount > 0
  };
}

/**
 * Constrói um evento imutável de auditoria na fonte oficial `coffeeAnalysisAuditEvents`
 * com horário de referência do servidor (`serverTimestamp`) e fuso America/Sao_Paulo.
 */
export function createCoffeeAuditEvent({
  id = null,
  laudoId,
  laudoNumber,
  clientId = DEFAULT_CLIENT_ID,
  exporterId = '',
  actionType,
  actionLabel,
  actor,
  timestampMs,
  serverTimestamp,
  previousValues = null,
  newValues = null,
  changedFields = [],
  sessionKey = null
}) {
  const ts = Number(timestampMs) || Date.now();
  const iso = new Date(ts).toISOString();
  const spFormatted = formatDateTimeSp(ts);

  return {
    id: id ? String(id) : 'caud_' + generateUUID(),
    laudoId: String(laudoId),
    laudoNumber: String(laudoNumber || ''),
    clientId: String(clientId || DEFAULT_CLIENT_ID),
    exporterId: String(exporterId || ''),
    actionType,
    actionLabel,
    actor: {
      id: actor.id,
      uid: actor.uid || actor.id,
      name: actor.name,
      login: actor.login || actor.id,
      role: actor.role
    },
    timestampMs: ts,
    timestampIso: iso,
    timestampSp: spFormatted,
    serverTimestamp: serverTimestamp !== undefined ? serverTimestamp : ts,
    timezone: 'America/Sao_Paulo',
    previousValues,
    newValues,
    changedFields,
    sessionKey: sessionKey || null
  };
}

/**
 * Filtra e pesquisa laudos na tela principal (pesquisa por identificação do laudo e número do booking,
 * filtros por exportador, status e período de criação).
 */
export function queryCoffeeAnalyses(
  analyses = [],
  {
    user,
    exportadores = [],
    bookings = [],
    searchQuery = '',
    exporterFilter = 'Todos',
    statusFilter = 'Todos',
    dateFrom = '',
    dateTo = ''
  } = {}
) {
  const accessible = filterCoffeeAnalysesForUser(analyses, user);
  const exporterMap = new Map((exportadores || []).map(e => [String(e.id), e]));
  const bookingMap = new Map((bookings || []).map(b => [String(b.id), b]));

  const qNorm = normalizeText(searchQuery);
  const qCode = normalizeCode(searchQuery);

  return accessible
    .map(laudo => {
      const exp = exporterMap.get(String(laudo.exporterId));
      const bk = laudo.bookingId ? bookingMap.get(String(laudo.bookingId)) : null;
      return {
        ...laudo,
        resolvedExporterName: exp?.name || laudo.exporterNameSnapshot || 'Exportador não encontrado',
        resolvedExporterCode: exp?.code || laudo.exporterCodeSnapshot || '',
        resolvedBookingNumber: bk?.bookingNumber || laudo.bookingNumber || null
      };
    })
    .filter(item => {
      if (exporterFilter && exporterFilter !== 'Todos') {
        if (String(item.exporterId) !== String(exporterFilter)) return false;
      }

      if (statusFilter && statusFilter !== 'Todos') {
        if (String(item.status || '') !== String(statusFilter)) return false;
      }

      if (dateFrom || dateTo) {
        const createdYmd = extractDateYmdSp(item.createdAt);
        if (dateFrom && createdYmd && createdYmd < dateFrom) return false;
        if (dateTo && createdYmd && createdYmd > dateTo) return false;
      }

      if (qNorm || qCode) {
        const laudoIdText = normalizeText(item.laudoNumber || item.id || '');
        const laudoIdCode = normalizeCode(item.laudoNumber || item.id || '');
        const bookingText = normalizeText(item.resolvedBookingNumber || '');
        const bookingCode = normalizeCode(item.resolvedBookingNumber || '');

        const matchesLaudo =
          (qNorm && laudoIdText.includes(qNorm)) || (qCode && laudoIdCode.includes(qCode));
        const matchesBookingNum =
          (qNorm && bookingText.includes(qNorm)) || (qCode && bookingCode.includes(qCode));

        if (!matchesLaudo && !matchesBookingNum) return false;
      }

      return true;
    })
    .sort((a, b) => resolveTimestampMs(b.createdAt) - resolveTimestampMs(a.createdAt));
}

/**
 * Cria um repositório transacional e atômico para Laudos de Classificação de Café ("Analysis of coffee").
 *
 * Arquitetura de Consistência e Auditoria:
 * 1. Transação Atômica (`transaction`): toda criação ou atualização de vínculo persiste o documento
 *    em `coffeeAnalyses` e o respectivo evento em `coffeeAnalysisAuditEvents` na MESMA transação.
 *    Se qualquer escrita falhar, nenhuma alteração parcial é gravada.
 * 2. Fonte Oficial Única (`coffeeAnalysisAuditEvents`): o documento `coffeeAnalyses` NÃO possui
 *    array `auditTimeline` editável, evitando divergências e impedindo que usuários comuns reescrevam
 *    o histórico de auditoria ao editar o documento do laudo.
 * 3. Concorrência e Idempotência: o contador `coffeeAnalysisCounters/counter_{year}` e as chaves
 *    `coffeeAnalysisRequestKeys/{requestKey}` são lidos e gravados dentro da transação, garantindo
 *    que cliques repetidos retornem o mesmo rascunho e que dois usuários simultâneos recebam
 *    identificações (`laudoNumber`) distintas e sequenciais.
 */
export function createCoffeeAnalysisRepository({
  listRecords,
  getRecord,
  saveRecord,
  appendAuditEvent,
  listAuditEvents,
  reference = null,
  transaction = null,
  serverTimestamp = null,
  now = () => Date.now(),
  auditAvailable = true
}) {
  const inFlightCreates = new Map();
  const completedRequestKeys = new Map();
  const recordedOpenSessions = new Set();

  // Estado auxiliar quando executado com adaptador simplificado em memória sem `transaction` explícita
  const fallbackCounters = new Map();
  const fallbackReqKeys = new Map();
  const fallbackAuditById = new Map();
  let txMutex = Promise.resolve();

  const getServerTs = () => (typeof serverTimestamp === 'function' ? serverTimestamp() : now());

  const runAtomic = async work => {
    if (typeof transaction === 'function' && typeof reference === 'function') {
      return transaction(work);
    }
    // Serialização atômica em memória para adaptadores simples sem Firestore transaction
    const run = txMutex.then(async () => {
      const stagedRecords = new Map();
      const stagedAudits = new Map();
      const stagedCounters = new Map();
      const stagedReqKeys = new Map();

      const fakeRef = (col, id) => ({ col, id: String(id), key: `${col}/${id}` });
      const fakeTx = {
        get: async refObj => {
          const { col, id } = refObj;
          if (col === COFFEE_ANALYSES_COL) {
            const val = stagedRecords.has(id) ? stagedRecords.get(id) : await getRecord(id);
            return { exists: () => Boolean(val), data: () => (val ? structuredClone(val) : null) };
          }
          if (col === COFFEE_ANALYSIS_COUNTERS_COL) {
            const val = stagedCounters.has(id) ? stagedCounters.get(id) : fallbackCounters.get(id);
            return { exists: () => Boolean(val), data: () => (val ? structuredClone(val) : null) };
          }
          if (col === COFFEE_ANALYSIS_REQ_KEYS_COL) {
            const val = stagedReqKeys.has(id) ? stagedReqKeys.get(id) : fallbackReqKeys.get(id);
            return { exists: () => Boolean(val), data: () => (val ? structuredClone(val) : null) };
          }
          if (col === COFFEE_ANALYSIS_AUDIT_COL) {
            const val = stagedAudits.has(id) ? stagedAudits.get(id) : fallbackAuditById.get(id);
            return { exists: () => Boolean(val), data: () => (val ? structuredClone(val) : null) };
          }
          return { exists: () => false, data: () => null };
        },
        set: (refObj, data) => {
          const { col, id } = refObj;
          const clone = structuredClone(data);
          if (col === COFFEE_ANALYSES_COL) stagedRecords.set(id, clone);
          else if (col === COFFEE_ANALYSIS_COUNTERS_COL) stagedCounters.set(id, clone);
          else if (col === COFFEE_ANALYSIS_REQ_KEYS_COL) stagedReqKeys.set(id, clone);
          else if (col === COFFEE_ANALYSIS_AUDIT_COL) stagedAudits.set(id, clone);
        }
      };

      const result = await work(fakeTx, fakeRef);

      // Commit atômico: se qualquer etapa falhar, nada é persistido
      for (const [, rec] of stagedRecords) {
        await saveRecord(rec);
      }
      for (const [id, aud] of stagedAudits) {
        if (appendAuditEvent) {
          await appendAuditEvent(aud);
        }
        fallbackAuditById.set(id, aud);
      }
      for (const [id, cnt] of stagedCounters) {
        fallbackCounters.set(id, cnt);
      }
      for (const [id, rk] of stagedReqKeys) {
        fallbackReqKeys.set(id, rk);
      }

      return result;
    });
    txMutex = run.catch(() => {});
    return run;
  };

  return {
    isAuditAvailable() {
      return Boolean(auditAvailable);
    },

    getOfficialAuditSource() {
      return OFFICIAL_COFFEE_AUDIT_SOURCE;
    },

    async listForUser(user) {
      if (!canAccessCoffeeAnalysisModule(user)) {
        throw new Error('Acesso negado ao módulo Analysis of coffee.');
      }
      const all = await listRecords();
      return filterCoffeeAnalysesForUser(all, user);
    },

    /**
     * Cria um novo rascunho de laudo de classificação de café de forma atômica,
     * com geração concorrente segura de `laudoNumber` e idempotência por `requestKey`.
     */
    async createDraft(
      {
        exporterId,
        bookingId = null,
        selectedLots = [],
        selectedContainerIds = [],
        exportadores = [],
        bookings = [],
        user,
        attemptedAuthorOverride = null,
        targetClientId = null
      },
      { requestKey = null } = {}
    ) {
      if (!auditAvailable) {
        throw new Error(
          'Dependência de auditoria indisponível: não é possível registrar o laudo sem a trilha de auditoria ativa.'
        );
      }

      resolveAuthenticatedActor(user, attemptedAuthorOverride);

      const cleanReqKey = requestKey ? String(requestKey).trim() : '';
      if (cleanReqKey) {
        if (inFlightCreates.has(cleanReqKey)) {
          return inFlightCreates.get(cleanReqKey);
        }
        if (completedRequestKeys.has(cleanReqKey)) {
          return completedRequestKeys.get(cleanReqKey);
        }
      }

      const task = (async () => {
        const validation = validateCoffeeAnalysisLinks({
          exporterId,
          bookingId,
          selectedLots,
          selectedContainerIds,
          exportadores,
          bookings,
          user,
          targetClientId
        });

        const existingList = await listRecords();

        const createdRecord = await runAtomic(async (tx, refFn = reference) => {
          // 1. Verifica chave de idempotência dentro da transação (impede duplicação por retry ou clique duplo)
          if (cleanReqKey) {
            const reqKeyRef = refFn(COFFEE_ANALYSIS_REQ_KEYS_COL, cleanReqKey);
            const reqKeySnap = await tx.get(reqKeyRef);
            if (reqKeySnap.exists()) {
              const existingMeta = reqKeySnap.data();
              const existingLaudoSnap = await tx.get(
                refFn(COFFEE_ANALYSES_COL, existingMeta.laudoId)
              );
              if (existingLaudoSnap.exists()) {
                return existingLaudoSnap.data();
              }
            }
          }

          // 2. Lê e incrementa contador atômico por ano (impede colisão de numeração entre dois usuários simultâneos)
          const ts = now();
          const year = new Date(ts).getFullYear() || 2026;
          const counterRef = refFn(COFFEE_ANALYSIS_COUNTERS_COL, `counter_${year}`);
          const counterSnap = await tx.get(counterRef);
          const currentCounterVal = counterSnap.exists() ? Number(counterSnap.data()?.value) || 0 : 0;

          const { laudoNumber, sequenceNumber } = generateNextCoffeeLaudoNumber(
            existingList,
            year,
            currentCounterVal
          );

          const laudoId = 'coffee_laudo_' + generateUUID();
          const srvTs = getServerTs();

          const initialSnap = {
            exporterId: String(validation.exporter.id),
            exporterName: String(validation.exporter.name || ''),
            bookingId: validation.booking ? String(validation.booking.id) : null,
            bookingNumber: validation.booking ? String(validation.booking.bookingNumber || '') : null,
            selectedLots: validation.normalizedLots,
            selectedContainerIds: validation.normalizedContainers
          };

          const creationAuditEvent = createCoffeeAuditEvent({
            laudoId,
            laudoNumber,
            clientId: validation.clientId,
            exporterId: String(validation.exporter.id),
            actionType: 'DRAFT_CREATED',
            actionLabel: 'Criação do rascunho',
            actor: validation.actor,
            timestampMs: ts,
            serverTimestamp: srvTs,
            previousValues: null,
            newValues: initialSnap,
            changedFields: ['exporterId', 'bookingId', 'selectedLots', 'selectedContainerIds']
          });

          // Documento do rascunho SEM `auditTimeline` mutável embutido (a fonte oficial é `coffeeAnalysisAuditEvents`)
          const draftRecord = {
            id: laudoId,
            laudoNumber,
            sequenceNumber,
            clientId: validation.clientId,
            exporterId: String(validation.exporter.id),
            bookingId: validation.booking ? String(validation.booking.id) : null,
            bookingNumber: validation.booking ? String(validation.booking.bookingNumber || '') : null,
            selectedLots: validation.normalizedLots,
            selectedLotLabels: validation.lotDetails.map(l => l.label),
            selectedContainerIds: validation.normalizedContainers,
            selectedContainerNumbers: validation.containerDetails.map(c => c.containerNumber),
            status: COFFEE_ANALYSIS_INITIAL_STATUS,
            classificationBasis: COFFEE_CLASSIFICATION_BASIS,
            sampleWeightGrams: COFFEE_SAMPLE_WEIGHT_GRAMS,
            analysisPerformed: false,
            createdBy: {
              id: validation.actor.id,
              uid: validation.actor.uid,
              name: validation.actor.name,
              login: validation.actor.login,
              role: validation.actor.role
            },
            updatedBy: {
              id: validation.actor.id,
              uid: validation.actor.uid,
              name: validation.actor.name,
              login: validation.actor.login,
              role: validation.actor.role
            },
            classifierInspectorId: null,
            certificateSignatoryId: null,
            certificateIssued: false,
            createdAt: ts,
            updatedAt: ts,
            createdAtSp: formatDateTimeSp(ts),
            updatedAtSp: formatDateTimeSp(ts),
            createdServerTimestamp: srvTs,
            updatedServerTimestamp: srvTs,
            lastAuditEventId: creationAuditEvent.id,
            officialAuditCollection: OFFICIAL_COFFEE_AUDIT_SOURCE,
            requestKey: cleanReqKey || null,
            _revision: 1
          };

          // 3. Gravações atômicas dentro da mesma transação
          tx.set(counterRef, { year, value: sequenceNumber, updatedAt: ts });
          tx.set(refFn(COFFEE_ANALYSES_COL, laudoId), draftRecord);
          tx.set(refFn(COFFEE_ANALYSIS_AUDIT_COL, creationAuditEvent.id), creationAuditEvent);

          if (cleanReqKey) {
            tx.set(refFn(COFFEE_ANALYSIS_REQ_KEYS_COL, cleanReqKey), {
              requestKey: cleanReqKey,
              laudoId,
              laudoNumber,
              actorUid: validation.actor.uid,
              createdAt: ts,
              serverTimestamp: srvTs
            });
          }

          return draftRecord;
        });

        if (cleanReqKey) {
          completedRequestKeys.set(cleanReqKey, createdRecord);
        }
        return createdRecord;
      })();

      if (cleanReqKey) {
        inFlightCreates.set(cleanReqKey, task);
      }

      try {
        return await task;
      } finally {
        if (cleanReqKey) {
          inFlightCreates.delete(cleanReqKey);
        }
      }
    },

    /**
     * Abre um laudo para consulta e registra o evento imutável `REPORT_OPENED` na coleção oficial
     * `coffeeAnalysisAuditEvents` (sem duplicar por re-renderização ou sync automático).
     */
    async openDraftForConsultation({
      laudoId,
      user,
      sessionKey = null,
      attemptedAuthorOverride = null
    }) {
      const actor = resolveAuthenticatedActor(user, attemptedAuthorOverride);
      if (!canAccessCoffeeAnalysisModule(user)) {
        throw new Error('Acesso negado ao módulo Analysis of coffee.');
      }

      const cleanSession = String(sessionKey || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
      const effectiveSessionKey = `${laudoId}:${actor.uid}:${cleanSession}`;
      const deterministicEventId = `caud_open_${laudoId}_${actor.uid}_${cleanSession}`;

      return runAtomic(async (tx, refFn = reference) => {
        const laudoRef = refFn(COFFEE_ANALYSES_COL, String(laudoId));
        const laudoSnap = await tx.get(laudoRef);
        if (!laudoSnap.exists()) {
          throw new Error('Laudo de café não encontrado.');
        }

        const record = laudoSnap.data();
        if (!isClientAuthorizedForUser(user, record.clientId || DEFAULT_CLIENT_ID)) {
          throw new Error('Acesso negado: este laudo pertence a outro cliente.');
        }

        if (user.role === 'Exportador' && String(record.exporterId) !== String(user.exporterId)) {
          throw new Error('Acesso negado: você só pode consultar laudos vinculados ao seu exportador.');
        }

        if (recordedOpenSessions.has(effectiveSessionKey) || !auditAvailable) {
          return record;
        }

        const auditRef = refFn(COFFEE_ANALYSIS_AUDIT_COL, deterministicEventId);
        const existingAuditSnap = await tx.get(auditRef);
        if (existingAuditSnap.exists()) {
          recordedOpenSessions.add(effectiveSessionKey);
          return record;
        }

        const ts = now();
        const srvTs = getServerTs();
        const openEvent = createCoffeeAuditEvent({
          id: deterministicEventId,
          laudoId: record.id,
          laudoNumber: record.laudoNumber,
          clientId: record.clientId || DEFAULT_CLIENT_ID,
          exporterId: String(record.exporterId || ''),
          actionType: 'REPORT_OPENED',
          actionLabel: 'Abertura do laudo para consulta',
          actor,
          timestampMs: ts,
          serverTimestamp: srvTs,
          previousValues: null,
          newValues: null,
          changedFields: [],
          sessionKey: effectiveSessionKey
        });

        tx.set(auditRef, openEvent);
        recordedOpenSessions.add(effectiveSessionKey);
        return record;
      });
    },

    /**
     * Atualiza os vínculos (exportador, booking, lotes e Containers) de um laudo em Rascunho
     * de forma atômica junto com seu evento em `coffeeAnalysisAuditEvents`.
     */
    async updateDraftLinks({
      laudoId,
      exporterId,
      bookingId = null,
      selectedLots = [],
      selectedContainerIds = [],
      exportadores = [],
      bookings = [],
      user,
      attemptedAuthorOverride = null
    }) {
      if (!auditAvailable) {
        throw new Error(
          'Dependência de auditoria indisponível: não é possível alterar o rascunho sem registrar na auditoria.'
        );
      }

      const actor = resolveAuthenticatedActor(user, attemptedAuthorOverride);
      if (!canCreateOrEditCoffeeAnalysis(user)) {
        throw new Error(
          'Acesso negado: seu perfil não possui permissão para editar laudos de café.'
        );
      }

      return runAtomic(async (tx, refFn = reference) => {
        const laudoRef = refFn(COFFEE_ANALYSES_COL, String(laudoId));
        const laudoSnap = await tx.get(laudoRef);
        if (!laudoSnap.exists()) {
          throw new Error('Laudo de café não encontrado.');
        }

        const existing = laudoSnap.data();

        if (!isClientAuthorizedForUser(user, existing.clientId || DEFAULT_CLIENT_ID)) {
          throw new Error('Acesso negado: este laudo pertence a outro cliente.');
        }

        if (existing.status !== COFFEE_ANALYSIS_INITIAL_STATUS) {
          throw new Error('Apenas laudos com status "Rascunho" podem ter seus vínculos editados.');
        }

        const validation = validateCoffeeAnalysisLinks({
          exporterId,
          bookingId,
          selectedLots,
          selectedContainerIds,
          exportadores,
          bookings,
          user,
          targetClientId: existing.clientId || DEFAULT_CLIENT_ID
        });

        const prevBookingId = existing.bookingId ? String(existing.bookingId) : null;
        const nextBookingId = validation.booking ? String(validation.booking.id) : null;

        const prevLots = Array.isArray(existing.selectedLots) ? [...existing.selectedLots] : [];
        const nextLots = [...validation.normalizedLots];

        const prevContainers = Array.isArray(existing.selectedContainerIds)
          ? [...existing.selectedContainerIds]
          : [];
        const nextContainers = [...validation.normalizedContainers];

        const changedFields = [];
        if (String(existing.exporterId) !== String(validation.exporter.id)) {
          changedFields.push('exporterId');
        }
        if (prevBookingId !== nextBookingId) {
          changedFields.push('bookingId');
        }
        if (JSON.stringify([...prevLots].sort()) !== JSON.stringify([...nextLots].sort())) {
          changedFields.push('selectedLots');
        }
        if (JSON.stringify([...prevContainers].sort()) !== JSON.stringify([...nextContainers].sort())) {
          changedFields.push('selectedContainerIds');
        }

        if (changedFields.length === 0) {
          return existing;
        }

        const oldExporter = (exportadores || []).find(
          e => String(e?.id) === String(existing.exporterId)
        );
        const oldBooking = prevBookingId
          ? (bookings || []).find(b => String(b?.id) === prevBookingId)
          : null;

        const previousValues = {
          exporterId: String(existing.exporterId),
          exporterName: oldExporter?.name || existing.exporterNameSnapshot || String(existing.exporterId),
          bookingId: prevBookingId,
          bookingNumber: oldBooking?.bookingNumber || existing.bookingNumber || null,
          selectedLots: prevLots,
          selectedContainerIds: prevContainers,
          selectedContainerNumbers: existing.selectedContainerNumbers || prevContainers
        };

        const newValues = {
          exporterId: String(validation.exporter.id),
          exporterName: String(validation.exporter.name || ''),
          bookingId: nextBookingId,
          bookingNumber: validation.booking ? String(validation.booking.bookingNumber || '') : null,
          selectedLots: nextLots,
          selectedContainerIds: nextContainers,
          selectedContainerNumbers: validation.containerDetails.map(c => c.containerNumber)
        };

        const ts = now();
        const srvTs = getServerTs();

        const updateEvent = createCoffeeAuditEvent({
          laudoId: existing.id,
          laudoNumber: existing.laudoNumber,
          clientId: existing.clientId || DEFAULT_CLIENT_ID,
          exporterId: String(validation.exporter.id),
          actionType: 'LINKS_UPDATED',
          actionLabel: 'Alteração de vínculos do rascunho',
          actor,
          timestampMs: ts,
          serverTimestamp: srvTs,
          previousValues,
          newValues,
          changedFields
        });

        // Preserva campos imutáveis (id, laudoNumber, clientId, createdBy, createdAt) e NÃO inclui `auditTimeline`
        const { auditTimeline: _removedLegacyTimeline, ...cleanExisting } = existing;

        const updatedRecord = {
          ...cleanExisting,
          id: existing.id,
          laudoNumber: existing.laudoNumber,
          clientId: existing.clientId || DEFAULT_CLIENT_ID,
          createdBy: existing.createdBy,
          createdAt: existing.createdAt,
          exporterId: String(validation.exporter.id),
          bookingId: nextBookingId,
          bookingNumber: validation.booking ? String(validation.booking.bookingNumber || '') : null,
          selectedLots: nextLots,
          selectedLotLabels: validation.lotDetails.map(l => l.label),
          selectedContainerIds: nextContainers,
          selectedContainerNumbers: validation.containerDetails.map(c => c.containerNumber),
          updatedBy: {
            id: actor.id,
            uid: actor.uid,
            name: actor.name,
            login: actor.login,
            role: actor.role
          },
          updatedAt: ts,
          updatedAtSp: formatDateTimeSp(ts),
          updatedServerTimestamp: srvTs,
          lastAuditEventId: updateEvent.id,
          officialAuditCollection: OFFICIAL_COFFEE_AUDIT_SOURCE,
          _revision: (Number(existing._revision) || 1) + 1
        };

        // Persistência atômica na mesma transação: documento do laudo + evento na coleção oficial de auditoria
        tx.set(laudoRef, updatedRecord);
        tx.set(refFn(COFFEE_ANALYSIS_AUDIT_COL, updateEvent.id), updateEvent);

        return updatedRecord;
      });
    },

    /**
     * Salva o formulário técnico de classificação de café (dados parciais ou completos) no estado Rascunho.
     */
    async saveClassificationDraft({
      laudoId,
      formData = {},
      user,
      expectedRevision = null,
      attemptedAuthorOverride = null
    }) {
      const actor = resolveAuthenticatedActor(user, attemptedAuthorOverride);
      if (!canCreateOrEditCoffeeAnalysis(user)) {
        throw new Error('Acesso negado: seu perfil não possui permissão para editar laudos de café.');
      }

      return runAtomic(async (tx, refFn = reference) => {
        const laudoRef = refFn(COFFEE_ANALYSES_COL, String(laudoId));
        const laudoSnap = await tx.get(laudoRef);
        if (!laudoSnap.exists()) {
          throw new Error('Laudo de café não encontrado.');
        }

        const existing = laudoSnap.data();

        if (existing.status !== 'Rascunho' && existing.status !== 'Aguardando assinatura') {
          throw new Error(`Não é permitido alterar laudo no estado "${existing.status}".`);
        }

        if (!isClientAuthorizedForUser(user, existing.clientId || DEFAULT_CLIENT_ID)) {
          throw new Error('Acesso negado: este laudo pertence a outro cliente.');
        }

        // Detecção de concorrência / conflito de edição
        const currentRev = Number(existing._revision) || 1;
        if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== currentRev) {
          throw new Error(
            'Conflito de edição detectado: este laudo foi alterado por outro usuário enquanto você editava. Por favor, recarregue a página para obter os dados mais recentes.'
          );
        }

        const ts = now();
        const srvTs = getServerTs();

        // Cálculo consistente dos defeitos e peneiras
        const defectsCalc = calculateDefectsAnalysisSummary(formData.defects || {});
        const screensCalc = calculateScreenAnalysisSummary(formData.screens || {});

        const updatedClassification = {
          sampleIdentification: {
            exporterId: existing.exporterId,
            exporterName: formData.exporterName || existing.exporterNameSnapshot || '',
            bookingNumber: formData.bookingNumber || existing.bookingNumber || '',
            lotNumber: formData.lotNumber || '',
            contractReference: formData.contractReference || '',
            cropYear: formData.cropYear || '',
            quantityBags: parseFlexibleDecimal(formData.quantityBags),
            destination: formData.destination || '',
            inspectionLocation: formData.inspectionLocation || '',
            inspectionDate: formData.inspectionDate || '',
            sampleId: formData.sampleId || '',
            oicNumber: String(formData.oicNumber || '').trim(),
            coffeeType: formData.coffeeType || ''
          },
          classificationSummary: {
            sampleWeightGrams: COFFEE_SAMPLE_WEIGHT_GRAMS,
            classificationType: formData.classificationType || formData.type || '',
            type: formData.classificationType || formData.type || '',
            moisturePercent: parseFlexibleDecimal(formData.moisturePercent),
            totalEquivalentDefects: defectsCalc.totalEquivalentDefects,
            defectsComplete: defectsCalc.isComplete
          },
          screenAnalysis: {
            screens: formData.screens || {},
            total: screensCalc.total,
            isExact100: screensCalc.isExact100,
            warning: screensCalc.warning
          },
          defectAnalysis: {
            defects: formData.defects || {},
            totalEquivalentDefects: defectsCalc.totalEquivalentDefects,
            partialSum: defectsCalc.partialSum,
            isComplete: defectsCalc.isComplete,
            recordedMethod: formData.defectMethod || 'Informado pelo classificador nesta versão'
          },
          insectDamage: {
            equivalentDefects: parseFlexibleDecimal(formData.insectDamageEquivalentDefects),
            percentage: parseFlexibleDecimal(formData.insectDamagePercentage)
          },
          impuritiesPercent: parseFlexibleDecimal(formData.impuritiesPercent),
          comments: String(formData.comments || '').trim(),
          classifier: {
            id: formData.classifierId || actor.id,
            name: formData.classifierName || actor.name
          },
          signatory: {
            id: formData.signatoryId || null,
            name: formData.signatoryName || null
          }
        };

        const updateEvent = createCoffeeAuditEvent({
          laudoId: existing.id,
          laudoNumber: existing.laudoNumber,
          clientId: existing.clientId || DEFAULT_CLIENT_ID,
          exporterId: String(existing.exporterId || ''),
          actionType: 'CLASSIFICATION_SAVED',
          actionLabel: 'Salvamento de dados da classificação',
          actor,
          timestampMs: ts,
          serverTimestamp: srvTs,
          changedFields: ['classificationData', 'classificationSummary', 'defectAnalysis', 'screenAnalysis']
        });

        const nextRecord = {
          ...existing,
          ...updatedClassification,
          type: updatedClassification.classificationSummary.classificationType,
          classificationType: updatedClassification.classificationSummary.classificationType,
          totalEquivalentDefects: updatedClassification.classificationSummary.totalEquivalentDefects,
          moisturePercent: updatedClassification.classificationSummary.moisturePercent,
          updatedBy: {
            id: actor.id,
            uid: actor.uid,
            name: actor.name,
            login: actor.login,
            role: actor.role
          },
          updatedAt: ts,
          updatedAtSp: formatDateTimeSp(ts),
          updatedServerTimestamp: srvTs,
          lastAuditEventId: updateEvent.id,
          _revision: currentRev + 1
        };

        tx.set(laudoRef, nextRecord);
        tx.set(refFn(COFFEE_ANALYSIS_AUDIT_COL, updateEvent.id), updateEvent);

        return nextRecord;
      });
    },

    /**
     * Finaliza a análise técnica, conferindo dados obrigatórios e colocando o laudo
     * em "Aguardando assinatura".
     */
    async finalizeCoffeeAnalysis({
      laudoId,
      user,
      signatoryId,
      signatoryName,
      inspectors = [],
      attemptedAuthorOverride = null
    }) {
      const actor = resolveAuthenticatedActor(user, attemptedAuthorOverride);
      if (!canCreateOrEditCoffeeAnalysis(user)) {
        throw new Error('Acesso negado: seu perfil não possui permissão para finalizar laudos de café.');
      }

      return runAtomic(async (tx, refFn = reference) => {
        const laudoRef = refFn(COFFEE_ANALYSES_COL, String(laudoId));
        const laudoSnap = await tx.get(laudoRef);
        if (!laudoSnap.exists()) throw new Error('Laudo de café não encontrado.');
        const existing = laudoSnap.data();

        if (existing.status !== 'Rascunho') {
          throw new Error(`Apenas laudos em "Rascunho" podem ser finalizados (status atual: ${existing.status}).`);
        }

        // Conferência de campos obrigatórios
        const sampleId = existing.sampleIdentification?.sampleId || existing.sampleId;
        const inspDate = existing.sampleIdentification?.inspectionDate || existing.inspectionDate;
        const inspLoc = existing.sampleIdentification?.inspectionLocation || existing.inspectionLocation;
        const classifier = existing.classifier?.name || existing.sampleIdentification?.classifierName;

        if (!sampleId) throw new Error('Conferência obrigatória: "Sample ID" deve estar preenchido.');
        if (!inspDate) throw new Error('Conferência obrigatória: "Date of inspection" deve estar preenchida.');
        if (!inspLoc) throw new Error('Conferência obrigatória: "Local inspection" deve estar preenchido.');
        if (!classifier) throw new Error('Conferência obrigatória: "Classificador responsável" deve estar identificado.');

        const cleanSignatoryId = String(signatoryId || '').trim();
        if (!cleanSignatoryId) {
          throw new Error('É obrigatório indicar o profissional signatário autorizado.');
        }

        // Verifica signatário na lista de inspetores/usuários
        const targetSignatory = (inspectors || []).find(
          i => String(i.id) === cleanSignatoryId || String(i.uid) === cleanSignatoryId
        );
        const canonicalSignatoryUid = String(targetSignatory?.uid || targetSignatory?.id || cleanSignatoryId).trim();
        const resolvedSignatoryName = targetSignatory?.name || signatoryName || cleanSignatoryId;

        const ts = now();
        const srvTs = getServerTs();

        const finalizeEvent = createCoffeeAuditEvent({
          laudoId: existing.id,
          laudoNumber: existing.laudoNumber,
          clientId: existing.clientId || DEFAULT_CLIENT_ID,
          exporterId: String(existing.exporterId || ''),
          actionType: 'ANALYSIS_FINALIZED',
          actionLabel: 'Finalização da análise técnica (Aguardando assinatura)',
          actor,
          timestampMs: ts,
          serverTimestamp: srvTs,
          newValues: {
            signatoryId: canonicalSignatoryUid,
            signatoryUid: canonicalSignatoryUid,
            signatoryName: resolvedSignatoryName,
            status: 'Aguardando assinatura'
          }
        });

        const nextRecord = {
          ...existing,
          status: 'Aguardando assinatura',
          finalizedAt: ts,
          finalizedAtSp: formatDateTimeSp(ts),
          finalizedBy: { id: actor.id, uid: actor.uid, name: actor.name },
          signatory: {
            id: canonicalSignatoryUid,
            uid: canonicalSignatoryUid,
            name: resolvedSignatoryName
          },
          updatedBy: { id: actor.id, uid: actor.uid, name: actor.name, role: actor.role },
          updatedAt: ts,
          updatedAtSp: formatDateTimeSp(ts),
          updatedServerTimestamp: srvTs,
          lastAuditEventId: finalizeEvent.id,
          _revision: (Number(existing._revision) || 1) + 1
        };

        tx.set(laudoRef, nextRecord);
        tx.set(refFn(COFFEE_ANALYSIS_AUDIT_COL, finalizeEvent.id), finalizeEvent);

        return nextRecord;
      });
    },

    /**
     * Assina e emite o certificado Unispect.
     * Regra Mandatória: Apenas o próprio signatário autenticado pode assinar com sua assinatura pessoal cadastrada.
     * Não permite que outro usuário assine em nome de terceiros nem usa assinatura de Bruno como padrão.
     */
    async signAndIssueCertificate({
      laudoId,
      user,
      signatureImageUrl = null,
      signatureImageData = null,
      inspectors = []
    }) {
      const actor = resolveAuthenticatedActor(user);

      return runAtomic(async (tx, refFn = reference) => {
        const laudoRef = refFn(COFFEE_ANALYSES_COL, String(laudoId));
        const laudoSnap = await tx.get(laudoRef);
        if (!laudoSnap.exists()) throw new Error('Laudo de café não encontrado.');
        const existing = laudoSnap.data();

        if (existing.status !== 'Aguardando assinatura') {
          throw new Error(`Para assinar e emitir, o laudo deve estar em "Aguardando assinatura" (status atual: ${existing.status}).`);
        }

        const requiredSignatoryId = String(existing.signatory?.id || '').trim();
        const requiredSignatoryUid = String(existing.signatory?.uid || requiredSignatoryId).trim();
        const actorId = String(actor.id || actor.uid).trim();
        const actorUid = String(actor.uid || actor.id).trim();

        // Validação estrita do UID canônico do signatário
        const isMatchedSignatory =
          requiredSignatoryUid === actorUid ||
          requiredSignatoryId === actorId ||
          requiredSignatoryUid === String(user.uid) ||
          requiredSignatoryId === String(user.id);

        if (!isMatchedSignatory) {
          throw new Error(
            `Acesso negado: o laudo aguarda a assinatura exclusiva do profissional com UID "${existing.signatory?.name || requiredSignatoryUid}". Você está autenticado como "${actor.name}" (${actorUid}). Ter permissão geral não autoriza assinar em nome de outro profissional.`
          );
        }

        // Obter assinatura cadastrada do próprio profissional
        const inspectorObj = (inspectors || []).find(
          i => String(i.uid || i.id) === actorUid || String(i.id) === actorId || (user.email && i.email === user.email)
        );
        const resolvedSignatureUrl =
          signatureImageUrl ||
          inspectorObj?.signatureImageUrl ||
          user?.signatureImageUrl ||
          null;

        const resolvedImageData =
          signatureImageData ||
          inspectorObj?.signatureImageData ||
          user?.signatureImageData ||
          null;

        // Converte a assinatura em Data URI com bytes reais embutidos para imunidade a substituições futuras
        const embeddedSignatureData = await resolveSignatureDataUri(
          resolvedImageData || resolvedSignatureUrl
        );

        if (!embeddedSignatureData) {
          throw new Error(
            `O profissional "${actor.name}" não possui assinatura digital cadastrada no sistema. O documento permanece "Aguardando assinatura" até o cadastro da assinatura pessoal.`
          );
        }

        const ts = now();
        const srvTs = getServerTs();

        // Snapshot fechado e imutável para emissão (preservando versão do layout, dados e assinatura embutida em bytes)
        const issuedSnapshot = {
          issuedAt: ts,
          issuedAtSp: formatDateTimeSp(ts),
          issuedServerTimestamp: srvTs,
          laudoNumber: existing.laudoNumber,
          layoutVersion: 'A4_BLUE_REPORT_V1',
          classificationBasis: existing.classificationBasis || COFFEE_CLASSIFICATION_BASIS,
          sampleIdentification: existing.sampleIdentification || {},
          classificationSummary: existing.classificationSummary || {},
          screenAnalysis: existing.screenAnalysis || {},
          defectAnalysis: existing.defectAnalysis || {},
          insectDamage: existing.insectDamage || {},
          impuritiesPercent: existing.impuritiesPercent ?? null,
          comments: existing.comments || '',
          classifier: existing.classifier || {},
          signatory: {
            id: actorUid,
            uid: actorUid,
            name: actor.name,
            signedAt: ts,
            signedAtSp: formatDateTimeSp(ts),
            signatureImageUrl: resolvedSignatureUrl,
            signatureImageData: embeddedSignatureData
          }
        };

        const issueEvent = createCoffeeAuditEvent({
          laudoId: existing.id,
          laudoNumber: existing.laudoNumber,
          clientId: existing.clientId || DEFAULT_CLIENT_ID,
          exporterId: String(existing.exporterId || ''),
          actionType: 'CERTIFICATE_ISSUED',
          actionLabel: 'Assinatura e emissão oficial do certificado',
          actor,
          timestampMs: ts,
          serverTimestamp: srvTs,
          newValues: {
            status: 'Emitido',
            signatory: actor.name,
            signedAt: formatDateTimeSp(ts)
          }
        });

        const nextRecord = {
          ...existing,
          status: 'Emitido',
          signedAt: ts,
          signedAtSp: formatDateTimeSp(ts),
          signedBy: { id: actorUid, uid: actorUid, name: actor.name },
          signatureImageUrl: resolvedSignatureUrl,
          signatureImageData: embeddedSignatureData,
          signatory: {
            id: actorUid,
            uid: actorUid,
            name: actor.name,
            signedAt: ts,
            signedAtSp: formatDateTimeSp(ts),
            signatureImageUrl: resolvedSignatureUrl,
            signatureImageData: embeddedSignatureData
          },
          issuedSnapshot,
          signedBy: { id: actor.id, uid: actor.uid, name: actor.name },
          signatureImageUrl: resolvedSignatureUrl,
          issuedSnapshot,
          updatedBy: { id: actor.id, uid: actor.uid, name: actor.name, role: actor.role },
          updatedAt: ts,
          updatedAtSp: formatDateTimeSp(ts),
          updatedServerTimestamp: srvTs,
          lastAuditEventId: issueEvent.id,
          _revision: (Number(existing._revision) || 1) + 1
        };

        tx.set(laudoRef, nextRecord);
        tx.set(refFn(COFFEE_ANALYSIS_AUDIT_COL, issueEvent.id), issueEvent);

        return nextRecord;
      });
    },

    /**
     * Cria uma nova revisão do certificado após emissão (preservando o histórico anterior).
     */
    async createNewRevision({
      laudoId,
      reason,
      user
    }) {
      const actor = resolveAuthenticatedActor(user);
      const cleanReason = String(reason || '').trim();
      if (!cleanReason) {
        throw new Error('A justificativa da nova revisão é obrigatória.');
      }

      return runAtomic(async (tx, refFn = reference) => {
        const laudoRef = refFn(COFFEE_ANALYSES_COL, String(laudoId));
        const laudoSnap = await tx.get(laudoRef);
        if (!laudoSnap.exists()) throw new Error('Laudo não encontrado.');
        const existing = laudoSnap.data();

        if (existing.status !== 'Emitido') {
          throw new Error('Apenas laudos emitidos podem gerar nova revisão.');
        }

        const ts = now();
        const srvTs = getServerTs();
        const previousRevisions = Array.isArray(existing.revisions) ? [...existing.revisions] : [];

        previousRevisions.push({
          revisionNumber: previousRevisions.length + 1,
          snapshot: existing.issuedSnapshot || null,
          archivedAt: ts,
          archivedBy: { id: actor.id, name: actor.name },
          revisionReason: cleanReason
        });

        const revEvent = createCoffeeAuditEvent({
          laudoId: existing.id,
          laudoNumber: existing.laudoNumber,
          clientId: existing.clientId || DEFAULT_CLIENT_ID,
          exporterId: String(existing.exporterId || ''),
          actionType: 'REVISION_CREATED',
          actionLabel: `Criação da Revisão ${previousRevisions.length + 1}`,
          actor,
          timestampMs: ts,
          serverTimestamp: srvTs,
          newValues: { reason: cleanReason }
        });

        const nextRecord = {
          ...existing,
          status: 'Rascunho',
          revisions: previousRevisions,
          currentRevision: previousRevisions.length + 1,
          updatedBy: { id: actor.id, uid: actor.uid, name: actor.name, role: actor.role },
          updatedAt: ts,
          updatedAtSp: formatDateTimeSp(ts),
          updatedServerTimestamp: srvTs,
          lastAuditEventId: revEvent.id,
          _revision: (Number(existing._revision) || 1) + 1
        };

        tx.set(laudoRef, nextRecord);
        tx.set(refFn(COFFEE_ANALYSIS_AUDIT_COL, revEvent.id), revEvent);

        return nextRecord;
      });
    },

    /**
     * Cancela o laudo com justificativa obrigatória.
     */
    async cancelCoffeeAnalysis({
      laudoId,
      reason,
      user
    }) {
      const actor = resolveAuthenticatedActor(user);
      const cleanReason = String(reason || '').trim();
      if (!cleanReason) {
        throw new Error('A justificativa do cancelamento é obrigatória.');
      }

      return runAtomic(async (tx, refFn = reference) => {
        const laudoRef = refFn(COFFEE_ANALYSES_COL, String(laudoId));
        const laudoSnap = await tx.get(laudoRef);
        if (!laudoSnap.exists()) throw new Error('Laudo não encontrado.');
        const existing = laudoSnap.data();

        if (existing.status === 'Cancelado') {
          throw new Error('Este laudo já está cancelado.');
        }

        const ts = now();
        const srvTs = getServerTs();

        const cancelEvent = createCoffeeAuditEvent({
          laudoId: existing.id,
          laudoNumber: existing.laudoNumber,
          clientId: existing.clientId || DEFAULT_CLIENT_ID,
          exporterId: String(existing.exporterId || ''),
          actionType: 'REPORT_CANCELLED',
          actionLabel: 'Cancelamento do laudo',
          actor,
          timestampMs: ts,
          serverTimestamp: srvTs,
          newValues: { cancellationReason: cleanReason }
        });

        const nextRecord = {
          ...existing,
          status: 'Cancelado',
          cancelledAt: ts,
          cancelledAtSp: formatDateTimeSp(ts),
          cancelledBy: { id: actor.id, uid: actor.uid, name: actor.name },
          cancellationReason: cleanReason,
          updatedBy: { id: actor.id, uid: actor.uid, name: actor.name, role: actor.role },
          updatedAt: ts,
          updatedAtSp: formatDateTimeSp(ts),
          updatedServerTimestamp: srvTs,
          lastAuditEventId: cancelEvent.id,
          _revision: (Number(existing._revision) || 1) + 1
        };

        tx.set(laudoRef, nextRecord);
        tx.set(refFn(COFFEE_ANALYSIS_AUDIT_COL, cancelEvent.id), cancelEvent);

        return nextRecord;
      });
    },

    /**
     * Consulta o histórico oficial de auditoria diretamente da coleção imutável `coffeeAnalysisAuditEvents`.
     */
    async getAuditTimeline(laudoId, user) {
      const record = await getRecord(laudoId);
      if (!record) throw new Error('Laudo de café não encontrado.');
      if (!isClientAuthorizedForUser(user, record.clientId || DEFAULT_CLIENT_ID)) {
        throw new Error('Acesso negado: este laudo pertence a outro cliente.');
      }
      if (user.role === 'Exportador' && String(record.exporterId) !== String(user.exporterId)) {
        throw new Error('Acesso negado.');
      }

      if (listAuditEvents) {
        const events = await listAuditEvents(laudoId);
        return (Array.isArray(events) ? events : []).sort(
          (a, b) => resolveTimestampMs(a.timestampMs || a.serverTimestamp) - resolveTimestampMs(b.timestampMs || b.serverTimestamp)
        );
      }

      const fallbackList = Array.from(fallbackAuditById.values()).filter(
        ev => String(ev.laudoId) === String(laudoId)
      );
      return fallbackList.sort(
        (a, b) => resolveTimestampMs(a.timestampMs) - resolveTimestampMs(b.timestampMs)
      );
    }
  };
}
