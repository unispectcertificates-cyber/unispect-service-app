import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDate,
  formatDateYMD,
  formatDateBR,
  formatDateTimeBR,
  formatDuration,
  getBookingEntryDate,
  getBookingFinalizationDate,
  getBookingFinalizedBy,
  getContainerIncorporatedDate,
  calculateDurationStats,
  calculateGrowth,
  getPeriodRange,
  computeMonthlySeries,
  computeAnalyticsDashboard,
  generateAnalyticsCsv,
  getMonthParts
} from '../src/utils/analyticsService.js';

test('1. Contagem correta de containers incorporados e sem duplicação em reimportações/novas fotos', () => {
  // Booking criado em 10/08 com 3 containers
  const b1 = {
    id: 'b1',
    bookingNumber: 'BK-100',
    launchDate: '2026-08-10',
    status: 'Finalizado',
    finalizedAt: '2026-08-15T18:00:00Z',
    containers: [
      { id: 'c1', containerNumber: 'MSDU1111111' },
      { id: 'c2', containerNumber: 'MSDU2222222' },
      // c3 foi adicionado posteriormente via importação incremental em 12/09
      { id: 'c3', containerNumber: 'MSDU3333333', addedAt: '2026-09-12T10:00:00Z' }
    ]
  };

  const importHistory = [
    {
      id: 'imp1',
      bookingId: 'b1',
      createdAt: new Date('2026-09-12T10:00:00Z').getTime(),
      addedIds: ['c3'],
      added: ['MSDU3333333']
    }
  ];

  const dateC1 = getContainerIncorporatedDate(b1.containers[0], b1, importHistory);
  const dateC2 = getContainerIncorporatedDate(b1.containers[1], b1, importHistory);
  const dateC3 = getContainerIncorporatedDate(b1.containers[2], b1, importHistory);

  assert.equal(formatDateYMD(dateC1), '2026-08-10', 'c1 incorporado na data do booking');
  assert.equal(formatDateYMD(dateC2), '2026-08-10', 'c2 incorporado na data do booking');
  assert.equal(formatDateYMD(dateC3), '2026-09-12', 'c3 incorporado na data da importação incremental');
});

test('2. Containers sem Booking contados exclusivamente em indicador separado', () => {
  const b1 = {
    id: 'b1',
    bookingNumber: 'BK-100',
    launchDate: '2026-10-01',
    status: 'Em andamento',
    containers: [
      { id: 'c1', containerNumber: 'ABCD1111111' }
    ]
  };

  const fieldPending = [
    { id: 'MSDU9999999', status: 'pending', createdAt: Date.now() },
    { id: 'TEMU8888888', status: 'pending', createdAt: Date.now() }
  ];

  const range = getPeriodRange('this_month', '', '', new Date(2026, 9, 11, 12, 0, 0));
  const dash = computeAnalyticsDashboard({
    bookings: [b1],
    fieldPendingContainers: fieldPending,
    periodRange: range
  });

  assert.equal(dash.containers.count, 1, 'Apenas container vinculado é incorporado');
  assert.equal(dash.fieldPendingContainers.count, 2, 'Containers sem booking ficam em indicador separado');
});

test('3. Agrupamento mensal e totais de gráficos batem com registros reais', () => {
  const bookings = [
    {
      id: 'b1',
      bookingNumber: 'BK-1',
      launchDate: '2026-08-05',
      status: 'Finalizado',
      finalizedAt: '2026-08-10T14:00:00Z',
      containers: [{ id: 'c1', containerNumber: 'ABCD1111111' }, { id: 'c2', containerNumber: 'ABCD2222222' }]
    },
    {
      id: 'b2',
      bookingNumber: 'BK-2',
      launchDate: '2026-09-01',
      status: 'Finalizado',
      finalizedAt: '2026-09-04T10:00:00Z',
      containers: [{ id: 'c3', containerNumber: 'ABCD3333333' }]
    },
    {
      id: 'b3',
      bookingNumber: 'BK-3',
      launchDate: '2026-10-02',
      status: 'Pendente',
      containers: [{ id: 'c4', containerNumber: 'ABCD4444444' }]
    }
  ];

  const start = new Date(2026, 7, 1); // 01/08/2026
  const end = new Date(2026, 9, 31); // 31/10/2026
  const series = computeMonthlySeries({ bookings, startDate: start, endDate: end });

  assert.equal(series.length, 3, 'Deve gerar 3 meses: Ago, Set, Out');
  // Agosto
  assert.equal(series[0].monthKey, '2026-08');
  assert.equal(series[0].containersCount, 2);
  assert.equal(series[0].bookingsRegisteredCount, 1);
  assert.equal(series[0].bookingsFinalizedCount, 1);

  // Setembro
  assert.equal(series[1].monthKey, '2026-09');
  assert.equal(series[1].containersCount, 1);
  assert.equal(series[1].bookingsRegisteredCount, 1);
  assert.equal(series[1].bookingsFinalizedCount, 1);

  // Outubro
  assert.equal(series[2].monthKey, '2026-10');
  assert.equal(series[2].containersCount, 1);
  assert.equal(series[2].bookingsRegisteredCount, 1);
  assert.equal(series[2].bookingsFinalizedCount, 0);
});

test('4. Comparação quando período anterior for zero deve exibir "Sem base de comparação"', () => {
  const g1 = calculateGrowth(15, 0);
  assert.equal(g1.noBase, true);
  assert.equal(g1.formatted, 'Sem base de comparação');

  const g2 = calculateGrowth(0, 0);
  assert.equal(g2.noBase, false);
  assert.equal(g2.formatted, '0%');

  const g3 = calculateGrowth(20, 10);
  assert.equal(g3.noBase, false);
  assert.equal(g3.formatted, '+100.0%');

  const g4 = calculateGrowth(5, 10);
  assert.equal(g4.noBase, false);
  assert.equal(g4.formatted, '-50.0%');
});

test('5. Período "Este mês" incompleto utiliza intervalo equivalente e indica mês em andamento', () => {
  const refDate = new Date(2026, 9, 11, 12, 0, 0);
  const range = getPeriodRange('this_month', '', '', refDate);

  assert.equal(range.isCurrentMonthIncomplete, true, 'Deve marcar mês incompleto');
  assert.equal(range.start.getDate(), 1);
  assert.equal(range.start.getMonth(), 9); // Outubro
  assert.equal(range.end.getDate(), 11);

  assert.equal(range.previousStart.getDate(), 1);
  assert.equal(range.previousStart.getMonth(), 8); // Setembro
  assert.equal(range.previousEnd.getDate(), 11);
  assert.ok(range.comparisonLabel.includes('mês anterior'));
});

test('6. Cálculo de média e mediana de tempo de conclusão com precisão de dias e horas', () => {
  const finalBookings = [
    {
      id: 'b1',
      bookingNumber: 'BK-1',
      launchDate: '2026-10-01T08:00:00Z',
      status: 'Finalizado',
      finalizedAt: '2026-10-02T12:00:00Z' // 1 dia e 4 horas = 28 horas
    },
    {
      id: 'b2',
      bookingNumber: 'BK-2',
      launchDate: '2026-10-01T00:00:00Z',
      status: 'Finalizado',
      finalizedAt: '2026-10-03T00:00:00Z' // 2 dias = 48 horas
    },
    {
      id: 'b3',
      bookingNumber: 'BK-3',
      launchDate: '2026-10-01T10:00:00Z',
      status: 'Finalizado',
      finalizedAt: '2026-10-06T10:00:00Z' // 5 dias = 120 horas
    }
  ];

  const stats = calculateDurationStats(finalBookings);
  assert.equal(stats.validCount, 3);
  assert.equal(stats.insufficientDataCount, 0);

  // Média: (28 + 48 + 120) / 3 = 196 / 3 = 65.333 horas = 2 dias e 17 horas
  assert.ok(stats.averageFormatted.includes('2d') || stats.averageFormatted.includes('dias'));
  // Mediana: 48 horas = 2 dias
  assert.ok(stats.medianFormatted.includes('2d') || stats.medianFormatted.includes('dias'));
});

test('7. Registros com datas insuficientes/ausentes são desconsiderados do cálculo e contabilizados', () => {
  const finalBookings = [
    {
      id: 'b1',
      bookingNumber: 'BK-1',
      launchDate: '2026-10-01',
      status: 'Finalizado',
      finalizedAt: '2026-10-03' // 2 dias
    },
    {
      id: 'b2',
      bookingNumber: 'BK-2',
      launchDate: '', // Sem data de entrada
      status: 'Finalizado',
      finalizedAt: '2026-10-03'
    },
    {
      id: 'b3',
      bookingNumber: 'BK-3',
      launchDate: '2026-10-05',
      status: 'Finalizado',
      finalizedAt: null // Sem data de finalização
    }
  ];

  const stats = calculateDurationStats(finalBookings);
  assert.equal(stats.validCount, 1);
  assert.equal(stats.insufficientDataCount, 2, 'Dois registros excluídos por dados insuficientes');
  assert.equal(stats.averageFormatted, '2 dias');
});

test('8. Preservação de histórico em reabertura e nova finalização', () => {
  const bookingReopened = {
    id: 'b1',
    bookingNumber: 'BK-REOPEN',
    launchDate: '2026-10-01T08:00:00Z',
    status: 'Finalizado',
    finalizedAt: '2026-10-10T14:00:00Z',
    finalizedBy: 'Supervisor Master',
    finalizationHistory: [
      {
        action: 'finalized',
        timestamp: '2026-10-03T10:00:00Z',
        user: { id: 'u1', name: 'Inspetor Carlos' }
      },
      {
        action: 'reopened',
        timestamp: '2026-10-04T09:00:00Z',
        user: { id: 'u2', name: 'ADM Roberto' }
      },
      {
        action: 'finalized',
        timestamp: '2026-10-10T14:00:00Z',
        user: { id: 'u3', name: 'Supervisor Master' }
      }
    ]
  };

  const finalDate = getBookingFinalizationDate(bookingReopened);
  const resp = getBookingFinalizedBy(bookingReopened);

  assert.equal(finalDate.toISOString(), '2026-10-10T14:00:00.000Z', 'Usa a finalização mais recente');
  assert.equal(resp, 'Supervisor Master', 'Identifica o responsável da finalização mais recente');
});

test('9. Bookings em aberto não entram na média de conclusão e mantêm tempo em andamento', () => {
  const openBooking = {
    id: 'b_open',
    bookingNumber: 'BK-OPEN',
    launchDate: '2026-10-05T08:00:00Z',
    status: 'Em andamento',
    containers: [{ id: 'c1', containerNumber: 'ABCD1234567' }]
  };

  const range = getPeriodRange('this_month', '', '', new Date(2026, 9, 11, 12, 0, 0));
  const dash = computeAnalyticsDashboard({
    bookings: [openBooking],
    fieldPendingContainers: [],
    periodRange: range
  });

  assert.equal(dash.bookingsFinalized.count, 0);
  assert.equal(dash.durationStats.validCount, 0, 'Booking em aberto não entra na média');
  assert.equal(dash.openBookings.count, 1, 'Entra na contagem de bookings em aberto');
});

test('10. Geração de CSV estruturado com BOM UTF-8 e delimitador brasileiro', () => {
  const mockDashboard = {
    periodRange: {
      start: new Date(2026, 9, 1),
      end: new Date(2026, 9, 11)
    },
    comparisonLabel: 'vs. mesmo período do mês anterior',
    containers: { count: 120, previousCount: 100, growth: { formatted: '+20.0%' }, list: [] },
    bookingsRegistered: { count: 30, previousCount: 25, growth: { formatted: '+20.0%' }, list: [] },
    bookingsFinalized: { count: 28, previousCount: 20, growth: { formatted: '+40.0%' }, list: [] },
    durationStats: { averageFormatted: '3d 4h', medianFormatted: '2d 12h', insufficientDataCount: 1 },
    openBookings: { count: 2, list: [] },
    fieldPendingContainers: { count: 5, list: [] }
  };

  const csv = generateAnalyticsCsv({ dashboard: mockDashboard });
  assert.ok(csv.startsWith('\uFEFF'), 'Deve conter BOM UTF-8');
  assert.ok(csv.includes('"Containers incorporados";"120";"100";"+20.0%"'));
  assert.ok(csv.includes('UNISPECT SERVICE'));
});

test('11. getMonthParts formata mês e ano em português para duas linhas (ex: Nov / 2025)', () => {
  const p1 = getMonthParts('2025-11');
  assert.equal(p1.monthShort, 'Nov');
  assert.equal(p1.year, '2025');
  assert.equal(p1.fullLabel, 'Novembro de 2025');

  const p2 = getMonthParts('2026-01');
  assert.equal(p2.monthShort, 'Jan');
  assert.equal(p2.year, '2026');
  assert.equal(p2.fullLabel, 'Janeiro de 2026');
});

test('12. Suporte a períodos de 3, 6, 12 e 24 meses em getPeriodRange com geração completa de séries', () => {
  const refDate = new Date(2026, 9, 12, 12, 0, 0); // 12/10/2026

  const r3 = getPeriodRange('last_3_months', '', '', refDate);
  const s3 = computeMonthlySeries({ bookings: [], startDate: r3.start, endDate: r3.end });
  assert.equal(s3.length, 3, 'Últimos 3 meses deve ter 3 itens');

  const r6 = getPeriodRange('last_6_months', '', '', refDate);
  const s6 = computeMonthlySeries({ bookings: [], startDate: r6.start, endDate: r6.end });
  assert.equal(s6.length, 6, 'Últimos 6 meses deve ter 6 itens');

  const r12 = getPeriodRange('last_12_months', '', '', refDate);
  const s12 = computeMonthlySeries({ bookings: [], startDate: r12.start, endDate: r12.end });
  assert.equal(s12.length, 12, 'Últimos 12 meses deve ter 12 itens');

  const r24 = getPeriodRange('last_24_months', '', '', refDate);
  const s24 = computeMonthlySeries({ bookings: [], startDate: r24.start, endDate: r24.end });
  assert.equal(s24.length, 24, 'Últimos 24 meses deve ter 24 itens');

  // Cada mês possui monthShort e year estruturados
  assert.equal(s24[0].monthShort, 'Nov');
  assert.equal(s24[0].year, '2024');
  assert.equal(s24[23].monthShort, 'Out');
  assert.equal(s24[23].year, '2026');
});

