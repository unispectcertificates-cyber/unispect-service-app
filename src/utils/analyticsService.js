/**
 * analyticsService.js
 * Funções puras para cálculo de indicadores operacionais, agrupamento mensal,
 * tempo de conclusão (médio e mediano), comparações temporais e exportações.
 */

// Retorna objeto Date no fuso local ou null
export function parseDate(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    return isNaN(dateInput.getTime()) ? null : dateInput;
  }
  if (typeof dateInput === 'number') {
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    // Se for formato apenas YYYY-MM-DD, cria no fuso local sem deslocamento UTC indesejado
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(Number);
      return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// Normalização de data para string YYYY-MM-DD
export function formatDateYMD(dateInput) {
  if (!dateInput) return '';
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }
  const d = parseDate(dateInput);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Verifica se tem hora explícita (não é apenas meia-noite YYYY-MM-DD sem hora)
export function hasExplicitTime(dateInput) {
  if (!dateInput) return false;
  if (typeof dateInput === 'number') return true;
  if (typeof dateInput === 'string') {
    return dateInput.includes('T') || dateInput.includes(':');
  }
  if (dateInput instanceof Date) {
    return dateInput.getHours() !== 0 || dateInput.getMinutes() !== 0 || dateInput.getSeconds() !== 0;
  }
  return false;
}

// Extrai a data de entrada do Booking
export function getBookingEntryDate(booking) {
  if (!booking) return null;
  // Prioridade: launchDate (se tiver), startDate, ou createdAt
  if (booking.launchDate) {
    const d = parseDate(booking.launchDate);
    if (d) return d;
  }
  if (booking.startDate) {
    const d = parseDate(booking.startDate);
    if (d) return d;
  }
  if (booking.createdAt) {
    const d = parseDate(booking.createdAt);
    if (d) return d;
  }
  return null;
}

// Extrai a data efetiva de finalização do Booking
// Para o indicador principal, usa a finalização mais recente do Booking atualmente finalizado
export function getBookingFinalizationDate(booking) {
  if (!booking || booking.status !== 'Finalizado') return null;

  // Se tiver histórico de finalização, busca o evento 'finalized' mais recente
  if (Array.isArray(booking.finalizationHistory) && booking.finalizationHistory.length > 0) {
    const finalizations = booking.finalizationHistory
      .filter(h => h.action === 'finalized')
      .map(h => ({ ...h, parsedDate: parseDate(h.timestamp) }))
      .filter(h => h.parsedDate !== null)
      .sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime());

    if (finalizations.length > 0) {
      return finalizations[0].parsedDate;
    }
  }

  // Fallback: finalizedAt direto
  if (booking.finalizedAt) {
    return parseDate(booking.finalizedAt);
  }

  // Fallback seguro: se não tiver finalizedAt mas tiver definiteSealDate ou fitoDate
  if (booking.definiteSealDate) {
    return parseDate(booking.definiteSealDate);
  }

  return null;
}

// Extrai o responsável pela finalização
export function getBookingFinalizedBy(booking) {
  if (!booking || booking.status !== 'Finalizado') return '-';
  if (Array.isArray(booking.finalizationHistory) && booking.finalizationHistory.length > 0) {
    const finalizations = booking.finalizationHistory
      .filter(h => h.action === 'finalized')
      .map(h => ({ ...h, parsedDate: parseDate(h.timestamp) }))
      .filter(h => h.parsedDate !== null)
      .sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime());

    if (finalizations.length > 0 && finalizations[0].user?.name) {
      return finalizations[0].user.name;
    }
  }
  if (typeof booking.finalizedBy === 'string' && booking.finalizedBy.trim()) {
    return booking.finalizedBy.trim();
  }
  if (booking.finalizedBy?.name) {
    return booking.finalizedBy.name;
  }
  return 'Não informado';
}

// Extrai data em que o container foi incorporado ao Booking
export function getContainerIncorporatedDate(container, booking, importHistory = []) {
  if (!container || !booking) return null;

  // 1. Se container tem campo addedAt explícito
  if (container.addedAt) {
    const d = parseDate(container.addedAt);
    if (d) return d;
  }

  // 2. Se temos histórico de importação do booking
  if (Array.isArray(importHistory) && importHistory.length > 0) {
    // Procura a operação de importação que adicionou este container
    for (const op of importHistory) {
      const addedIds = op.addedIds || [];
      const addedNums = op.added || [];
      if (addedIds.includes(container.id) || addedNums.includes(container.containerNumber)) {
        const d = parseDate(op.createdAt);
        if (d) return d;
      }
    }
  }

  // 3. Fallback: Data de entrada do próprio Booking
  return getBookingEntryDate(booking);
}

// Formatação amigável de duração (dias e horas, ou apenas dias)
export function formatDuration(durationMs, hasTimePrecision = true) {
  if (durationMs === null || durationMs === undefined || isNaN(durationMs) || durationMs < 0) {
    return 'Dados insuficientes';
  }

  const totalHours = Math.round(durationMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (hasTimePrecision && (hours > 0 || days === 0)) {
    if (days === 0) {
      return `${hours}h`;
    }
    return `${days}d ${hours}h`;
  }

  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}

// Calcula estatísticas de duração para uma lista de bookings finalizados
export function calculateDurationStats(finalizedBookings = []) {
  const validDurations = [];
  let insufficientDataCount = 0;

  for (const b of finalizedBookings) {
    const entryDate = getBookingEntryDate(b);
    const finalDate = getBookingFinalizationDate(b);

    if (!entryDate || !finalDate) {
      insufficientDataCount++;
      continue;
    }

    const diffMs = finalDate.getTime() - entryDate.getTime();
    if (diffMs < 0 || isNaN(diffMs)) {
      insufficientDataCount++;
      continue;
    }

    const hasTime = hasExplicitTime(b.finalizedAt || b.createdAt) || hasExplicitTime(entryDate);
    validDurations.push({
      bookingId: b.id,
      bookingNumber: b.bookingNumber,
      diffMs,
      hasTime
    });
  }

  if (validDurations.length === 0) {
    return {
      averageMs: null,
      medianMs: null,
      averageFormatted: 'Sem dados suficientes',
      medianFormatted: 'Sem dados suficientes',
      validCount: 0,
      insufficientDataCount,
      validDurations: []
    };
  }

  // Média
  const sumMs = validDurations.reduce((acc, curr) => acc + curr.diffMs, 0);
  const averageMs = sumMs / validDurations.length;

  // Mediana
  const sorted = [...validDurations].sort((a, b) => a.diffMs - b.diffMs);
  const mid = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 !== 0
    ? sorted[mid].diffMs
    : (sorted[mid - 1].diffMs + sorted[mid].diffMs) / 2;

  const anyHasTime = validDurations.some(v => v.hasTime);

  return {
    averageMs,
    medianMs,
    averageFormatted: formatDuration(averageMs, anyHasTime),
    medianFormatted: formatDuration(medianMs, anyHasTime),
    validCount: validDurations.length,
    insufficientDataCount,
    validDurations
  };
}

// Gera intervalos de datas para os filtros rápidos
export function getPeriodRange(preset, customFrom = '', customTo = '', referenceDate = new Date()) {
  const ref = parseDate(referenceDate) || new Date();
  const refYear = ref.getFullYear();
  const refMonth = ref.getMonth(); // 0-indexed
  const refDay = ref.getDate();

  let start = null;
  let end = null;
  let previousStart = null;
  let previousEnd = null;
  let isCurrentMonthIncomplete = false;
  let comparisonLabel = '';

  switch (preset) {
    case 'this_month': {
      // Início do mês atual até hoje (ou fim do dia)
      start = new Date(refYear, refMonth, 1, 0, 0, 0, 0);
      end = new Date(refYear, refMonth, refDay, 23, 59, 59, 999);

      // Período anterior equivalente: mesmo intervalo de dias no mês anterior
      const prevMonth = refMonth === 0 ? 11 : refMonth - 1;
      const prevYear = refMonth === 0 ? refYear - 1 : refYear;
      // Trata casos em que o mês anterior tem menos dias
      const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
      const prevDay = Math.min(refDay, daysInPrevMonth);

      previousStart = new Date(prevYear, prevMonth, 1, 0, 0, 0, 0);
      previousEnd = new Date(prevYear, prevMonth, prevDay, 23, 59, 59, 999);

      isCurrentMonthIncomplete = true;
      comparisonLabel = `vs. mesmo período do mês anterior (${formatDateBR(previousStart)} a ${formatDateBR(previousEnd)})`;
      break;
    }
    case 'last_3_months': {
      // Últimos 3 meses completos/correntes
      const startCandidate = new Date(refYear, refMonth - 2, 1, 0, 0, 0, 0);
      start = startCandidate;
      end = new Date(refYear, refMonth, refDay, 23, 59, 59, 999);

      const durationMs = end.getTime() - start.getTime();
      previousEnd = new Date(start.getTime() - 1);
      previousStart = new Date(previousEnd.getTime() - durationMs);

      comparisonLabel = `vs. período anterior de 3 meses (${formatDateBR(previousStart)} a ${formatDateBR(previousEnd)})`;
      break;
    }
    case 'last_6_months': {
      // Últimos 6 meses
      const startCandidate = new Date(refYear, refMonth - 5, 1, 0, 0, 0, 0);
      start = startCandidate;
      end = new Date(refYear, refMonth, refDay, 23, 59, 59, 999);

      const durationMs = end.getTime() - start.getTime();
      previousEnd = new Date(start.getTime() - 1);
      previousStart = new Date(previousEnd.getTime() - durationMs);

      comparisonLabel = `vs. 6 meses anteriores (${formatDateBR(previousStart)} a ${formatDateBR(previousEnd)})`;
      break;
    }
    case 'last_12_months': {
      // Últimos 12 meses
      const startCandidate = new Date(refYear, refMonth - 11, 1, 0, 0, 0, 0);
      start = startCandidate;
      end = new Date(refYear, refMonth, refDay, 23, 59, 59, 999);

      const durationMs = end.getTime() - start.getTime();
      previousEnd = new Date(start.getTime() - 1);
      previousStart = new Date(previousEnd.getTime() - durationMs);

      comparisonLabel = `vs. 12 meses anteriores (${formatDateBR(previousStart)} a ${formatDateBR(previousEnd)})`;
      break;
    }
    case 'last_24_months': {
      // Últimos 24 meses
      const startCandidate = new Date(refYear, refMonth - 23, 1, 0, 0, 0, 0);
      start = startCandidate;
      end = new Date(refYear, refMonth, refDay, 23, 59, 59, 999);

      const durationMs = end.getTime() - start.getTime();
      previousEnd = new Date(start.getTime() - 1);
      previousStart = new Date(previousEnd.getTime() - durationMs);

      comparisonLabel = `vs. 24 meses anteriores (${formatDateBR(previousStart)} a ${formatDateBR(previousEnd)})`;
      break;
    }
    case 'custom':
    default: {
      if (customFrom) {
        const [y, m, d] = customFrom.split('-').map(Number);
        start = new Date(y, m - 1, d, 0, 0, 0, 0);
      } else {
        start = new Date(refYear, 0, 1, 0, 0, 0, 0);
      }

      if (customTo) {
        const [y, m, d] = customTo.split('-').map(Number);
        end = new Date(y, m - 1, d, 23, 59, 59, 999);
      } else {
        end = new Date(refYear, refMonth, refDay, 23, 59, 59, 999);
      }

      const durationMs = end.getTime() - start.getTime();
      if (durationMs > 0) {
        previousEnd = new Date(start.getTime() - 1);
        previousStart = new Date(previousEnd.getTime() - durationMs);
        comparisonLabel = `vs. período anterior equivalente (${formatDateBR(previousStart)} a ${formatDateBR(previousEnd)})`;
      } else {
        previousStart = null;
        previousEnd = null;
        comparisonLabel = 'Sem base de comparação';
      }
      break;
    }
  }

  return {
    start,
    end,
    previousStart,
    previousEnd,
    isCurrentMonthIncomplete,
    comparisonLabel
  };
}

export function formatDateBR(dateInput) {
  if (!dateInput) return '-';
  const d = parseDate(dateInput);
  if (!d) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Formata data e hora em formato brasileiro
export function formatDateTimeBR(dateInput) {
  if (!dateInput) return '-';
  const d = parseDate(dateInput);
  if (!d) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  if (hasExplicitTime(dateInput)) {
    return `${day}/${month}/${year} ${hours}:${mins}`;
  }
  return `${day}/${month}/${year}`;
}

// Calcula taxa de variação percentual com tratamento de base zero
export function calculateGrowth(currentVal, previousVal) {
  if (previousVal === 0 || previousVal === null || previousVal === undefined) {
    if (currentVal === 0) {
      return {
        percent: 0,
        formatted: '0%',
        type: 'neutral',
        noBase: false
      };
    }
    return {
      percent: null,
      formatted: 'Sem base de comparação',
      type: 'no_base',
      noBase: true
    };
  }

  const change = ((currentVal - previousVal) / previousVal) * 100;
  const rounded = Math.round(change * 10) / 10;
  const sign = rounded > 0 ? '+' : '';

  return {
    percent: rounded,
    formatted: `${sign}${rounded.toFixed(1)}%`,
    type: rounded > 0 ? 'positive' : rounded < 0 ? 'negative' : 'neutral',
    noBase: false
  };
}

// Filtra bookings por período, exportador e local
export function filterBookingsForAnalytics({
  bookings = [],
  exporterId = '',
  locationId = '',
  user = null
}) {
  return bookings.filter(b => {
    // Permissão de exportador: restringe estritamente ao seu próprio exporterId
    if (user?.role === 'Exportador' && user.exporterId && b.exporterId !== user.exporterId) {
      return false;
    }
    if (exporterId && b.exporterId !== exporterId) {
      return false;
    }
    if (locationId && b.locationId !== locationId) {
      return false;
    }
    return true;
  });
}

// Gera a lista de meses (chaves YYYY-MM) dentro de um intervalo
export function generateMonthKeys(startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) return [];
  const keys = [];
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    keys.push(`${y}-${m}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return keys;
}

// Nome amigável do mês (ex: "Out/2026")
export function formatMonthLabel(monthKey) {
  if (!monthKey || !monthKey.includes('-')) return monthKey;
  const [y, m] = monthKey.split('-').map(Number);
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${months[m - 1]}/${y}`;
}

// Decomposição estruturada do mês e ano em português para eixos e tooltips
export function getMonthParts(monthKey) {
  if (!monthKey || !monthKey.includes('-')) {
    return { monthShort: monthKey || '', year: '', fullLabel: monthKey || '' };
  }
  const [y, m] = monthKey.split('-').map(Number);
  const monthsShort = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const monthsFull = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const mIdx = Math.max(0, Math.min(11, (m || 1) - 1));
  return {
    monthShort: monthsShort[mIdx] || '',
    year: String(y || ''),
    fullLabel: `${monthsFull[mIdx] || ''} de ${y}`
  };
}

// Agrupamento mensal para os 4 gráficos
export function computeMonthlySeries({
  bookings = [],
  startDate,
  endDate,
  importHistoryMap = {} // bookingId -> array de imports
}) {
  const monthKeys = generateMonthKeys(startDate, endDate);
  const map = new Map();

  for (const k of monthKeys) {
    const parts = getMonthParts(k);
    map.set(k, {
      monthKey: k,
      label: formatMonthLabel(k),
      monthShort: parts.monthShort,
      year: parts.year,
      fullLabel: parts.fullLabel,
      containersCount: 0,
      bookingsRegisteredCount: 0,
      bookingsFinalizedCount: 0,
      registeredBookings: [],
      finalizedBookings: [],
      containersList: [],
      durationsMs: []
    });
  }

  // 1. Processa Bookings cadastrados (por data de entrada)
  for (const b of bookings) {
    const entryDate = getBookingEntryDate(b);
    if (entryDate) {
      const k = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}`;
      if (map.has(k)) {
        const item = map.get(k);
        item.bookingsRegisteredCount++;
        item.registeredBookings.push(b);
      }
    }

    // 2. Processa Bookings finalizados (por data de finalização)
    if (b.status === 'Finalizado') {
      const finalDate = getBookingFinalizationDate(b);
      if (finalDate) {
        const k = `${finalDate.getFullYear()}-${String(finalDate.getMonth() + 1).padStart(2, '0')}`;
        if (map.has(k)) {
          const item = map.get(k);
          item.bookingsFinalizedCount++;
          item.finalizedBookings.push(b);

          if (entryDate) {
            const diffMs = finalDate.getTime() - entryDate.getTime();
            if (diffMs >= 0) {
              item.durationsMs.push(diffMs);
            }
          }
        }
      }
    }

    // 3. Processa Containers incorporados
    const history = importHistoryMap[b.id] || [];
    for (const c of b.containers || []) {
      const incDate = getContainerIncorporatedDate(c, b, history);
      if (incDate) {
        const k = `${incDate.getFullYear()}-${String(incDate.getMonth() + 1).padStart(2, '0')}`;
        if (map.has(k)) {
          const item = map.get(k);
          item.containersCount++;
          item.containersList.push({
            container: c,
            booking: b,
            incorporatedDate: incDate
          });
        }
      }
    }
  }

  // 4. Calcula médias de tempo e crescimento mês a mês
  const result = [];
  let prevContainers = null;
  let prevBookings = null;

  for (const k of monthKeys) {
    const item = map.get(k);

    // Tempo médio de conclusão no mês (em dias)
    let avgDays = null;
    if (item.durationsMs.length > 0) {
      const sum = item.durationsMs.reduce((a, b) => a + b, 0);
      avgDays = Math.round((sum / item.durationsMs.length / (1000 * 60 * 60 * 24)) * 10) / 10;
    }

    // Crescimento em relação ao mês imediatamente anterior
    const containerGrowth = prevContainers !== null ? calculateGrowth(item.containersCount, prevContainers) : null;
    const bookingGrowth = prevBookings !== null ? calculateGrowth(item.bookingsRegisteredCount, prevBookings) : null;

    result.push({
      ...item,
      avgCompletionDays: avgDays,
      containerGrowth,
      bookingGrowth
    });

    prevContainers = item.containersCount;
    prevBookings = item.bookingsRegisteredCount;
  }

  return result;
}

// Consolidação geral de indicadores para o período selecionado
export function computeAnalyticsDashboard({
  bookings = [],
  fieldPendingContainers = [],
  periodRange,
  importHistoryMap = {}
}) {
  const { start, end, previousStart, previousEnd, isCurrentMonthIncomplete, comparisonLabel } = periodRange;

  const isInRange = (d, s, e) => d && s && e && d.getTime() >= s.getTime() && d.getTime() <= e.getTime();

  // 1. Período Atual
  let currentContainersCount = 0;
  const currentContainersList = [];
  let currentBookingsRegistered = 0;
  const currentRegisteredList = [];
  let currentBookingsFinalized = 0;
  const currentFinalizedList = [];
  const currentOpenBookingsList = [];

  // 2. Período Anterior Equivalente
  let previousContainersCount = 0;
  let previousBookingsRegistered = 0;
  let previousBookingsFinalized = 0;

  for (const b of bookings) {
    const entryDate = getBookingEntryDate(b);
    const finalDate = getBookingFinalizationDate(b);
    const history = importHistoryMap[b.id] || [];

    // Bookings Cadastrados
    if (isInRange(entryDate, start, end)) {
      currentBookingsRegistered++;
      currentRegisteredList.push(b);
    }
    if (isInRange(entryDate, previousStart, previousEnd)) {
      previousBookingsRegistered++;
    }

    // Bookings Finalizados
    if (b.status === 'Finalizado') {
      if (isInRange(finalDate, start, end)) {
        currentBookingsFinalized++;
        currentFinalizedList.push(b);
      }
      if (isInRange(finalDate, previousStart, previousEnd)) {
        previousBookingsFinalized++;
      }
    } else {
      // Bookings em aberto cuja entrada esteja no período ou ativos no momento
      if (isInRange(entryDate, start, end) || (!start && !end)) {
        currentOpenBookingsList.push(b);
      }
    }

    // Containers incorporados
    for (const c of b.containers || []) {
      const incDate = getContainerIncorporatedDate(c, b, history);
      if (isInRange(incDate, start, end)) {
        currentContainersCount++;
        currentContainersList.push({ container: c, booking: b, date: incDate });
      }
      if (isInRange(incDate, previousStart, previousEnd)) {
        previousContainersCount++;
      }
    }
  }

  // Cálculos de crescimento vs período anterior
  const growthContainers = calculateGrowth(currentContainersCount, previousContainersCount);
  const growthRegistered = calculateGrowth(currentBookingsRegistered, previousBookingsRegistered);
  const growthFinalized = calculateGrowth(currentBookingsFinalized, previousBookingsFinalized);

  // Estatísticas de tempo de conclusão para os bookings finalizados no período
  const durationStats = calculateDurationStats(currentFinalizedList);

  // Séries mensais para os 4 gráficos
  const monthlySeries = computeMonthlySeries({
    bookings,
    startDate: start,
    endDate: end,
    importHistoryMap
  });

  return {
    periodRange,
    comparisonLabel,
    isCurrentMonthIncomplete,
    // Indicadores
    containers: {
      count: currentContainersCount,
      previousCount: previousContainersCount,
      growth: growthContainers,
      list: currentContainersList
    },
    bookingsRegistered: {
      count: currentBookingsRegistered,
      previousCount: previousBookingsRegistered,
      growth: growthRegistered,
      list: currentRegisteredList
    },
    bookingsFinalized: {
      count: currentBookingsFinalized,
      previousCount: previousBookingsFinalized,
      growth: growthFinalized,
      list: currentFinalizedList
    },
    durationStats,
    openBookings: {
      count: currentOpenBookingsList.length,
      list: currentOpenBookingsList
    },
    fieldPendingContainers: {
      count: fieldPendingContainers.length,
      list: fieldPendingContainers
    },
    // Gráficos
    monthlySeries
  };
}

// Gera conteúdo CSV formatado para download com codificação UTF-8 BOM
export function generateAnalyticsCsv({
  dashboard,
  exportadores = [],
  locais = []
}) {
  const getExpName = id => exportadores.find(e => e.id === id)?.name || id || '-';
  const getLocName = id => locais.find(l => l.id === id)?.name || id || '-';

  const rows = [];
  // Cabeçalho de metadados
  rows.push(['UNISPECT SERVICE - RELATORIO ANALITICO E INDICADORES OPERACIONAIS']);
  rows.push([`Periodo: ${formatDateBR(dashboard.periodRange?.start)} a ${formatDateBR(dashboard.periodRange?.end)}`]);
  rows.push([`Comparativo: ${dashboard.comparisonLabel || ''}`]);
  rows.push([]);

  // Resumo de Indicadores
  rows.push(['INDICADOR', 'VALOR ATUAL', 'VALOR ANTERIOR', 'VARIACAO']);
  rows.push([
    'Containers incorporados',
    dashboard.containers?.count ?? 0,
    dashboard.containers?.previousCount ?? 0,
    dashboard.containers?.growth?.formatted || '-'
  ]);
  rows.push([
    'Bookings cadastrados',
    dashboard.bookingsRegistered?.count ?? 0,
    dashboard.bookingsRegistered?.previousCount ?? 0,
    dashboard.bookingsRegistered?.growth?.formatted || '-'
  ]);
  rows.push([
    'Bookings finalizados',
    dashboard.bookingsFinalized?.count ?? 0,
    dashboard.bookingsFinalized?.previousCount ?? 0,
    dashboard.bookingsFinalized?.growth?.formatted || '-'
  ]);
  rows.push([
    'Tempo medio de conclusao',
    dashboard.durationStats?.averageFormatted || '-',
    '-',
    `${dashboard.durationStats?.insufficientDataCount || 0} registros com dados insuficientes`
  ]);
  rows.push([
    'Tempo mediano de conclusao',
    dashboard.durationStats?.medianFormatted || '-',
    '-',
    '-'
  ]);
  rows.push([
    'Bookings em aberto',
    dashboard.openBookings?.count ?? 0,
    '-',
    'Operacoes em andamento'
  ]);
  rows.push([
    'Containers sem Booking (Campo)',
    dashboard.fieldPendingContainers?.count ?? 0,
    '-',
    'Aguardando vinculo com romaneio'
  ]);
  rows.push([]);

  // Tabela de Bookings Finalizados
  rows.push(['TABELA DE CONFERENCIA - BOOKINGS FINALIZADOS']);
  rows.push([
    'Certificado',
    'Booking',
    'Exportador',
    'Local',
    'Containers',
    'Entrada',
    'Finalizacao',
    'Tempo Decorrido',
    'Responsavel',
    'Status'
  ]);

  for (const b of dashboard.bookingsFinalized?.list || []) {
    const entryDate = getBookingEntryDate(b);
    const finalDate = getBookingFinalizationDate(b);
    const diffMs = entryDate && finalDate ? finalDate.getTime() - entryDate.getTime() : null;
    const dur = diffMs !== null && diffMs >= 0 ? formatDuration(diffMs, true) : 'Dados insuficientes';
    const resp = getBookingFinalizedBy(b);

    rows.push([
      b.certificateNumber || '-',
      b.bookingNumber || '-',
      getExpName(b.exporterId),
      getLocName(b.locationId),
      b.containers?.length || 0,
      formatDateTimeBR(entryDate),
      formatDateTimeBR(finalDate),
      dur,
      resp,
      b.status || 'Finalizado'
    ]);
  }
  rows.push([]);

  // Tabela de Bookings em Aberto
  rows.push(['TABELA DE CONFERENCIA - BOOKINGS EM ABERTO (TEMPO EM ANDAMENTO)']);
  rows.push([
    'Certificado',
    'Booking',
    'Exportador',
    'Local',
    'Containers',
    'Entrada',
    'Tempo em Andamento',
    'Status'
  ]);

  const now = new Date();
  for (const b of dashboard.openBookings?.list || []) {
    const entryDate = getBookingEntryDate(b);
    const elapsedMs = entryDate ? now.getTime() - entryDate.getTime() : null;
    const dur = elapsedMs !== null && elapsedMs >= 0 ? formatDuration(elapsedMs, true) : 'Dados insuficientes';

    rows.push([
      b.certificateNumber || '-',
      b.bookingNumber || '-',
      getExpName(b.exporterId),
      getLocName(b.locationId),
      b.containers?.length || 0,
      formatDateTimeBR(entryDate),
      dur,
      b.status || 'Pendente'
    ]);
  }

  // Monta CSV com delimitador ';' e escapa aspas
  const csvContent = rows
    .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');

  // Adiciona BOM UTF-8 (\uFEFF) para compatibilidade perfeita com Excel no Brasil
  return '\uFEFF' + csvContent;
}
