import { useState, useMemo } from 'react';
import {
  TrendingUp,
  Calendar,
  Filter,
  RotateCcw,
  Download,
  Printer,
  ChevronRight,
  Clock,
  CheckCircle2,
  Package,
  Layers,
  FileText,
  AlertTriangle,
  ArrowUpDown,
  ExternalLink,
  X,
  HelpCircle
} from 'lucide-react';
import {
  getPeriodRange,
  computeAnalyticsDashboard,
  formatDateBR,
  formatDateTimeBR,
  formatDuration,
  getBookingEntryDate,
  getBookingFinalizationDate,
  getBookingFinalizedBy,
  generateAnalyticsCsv,
  filterBookingsForAnalytics
} from '../utils/analyticsService';

export default function AnalyticsReportsView({
  bookings = [],
  fieldPendingContainers = [],
  exportadores = [],
  locais = [],
  user = null,
  onOpenBooking = () => {},
  onOpenReport = () => {},
  onBackToBookings = () => {},
  importHistoryMap = {}
}) {
  // Filtros
  const [preset, setPreset] = useState('this_month'); // 'this_month' | 'last_3_months' | 'last_12_months' | 'custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedExporter, setSelectedExporter] = useState(
    user?.role === 'Exportador' && user.exporterId ? user.exporterId : ''
  );
  const [selectedLocation, setSelectedLocation] = useState('');

  // Tabela de conferência ativa: 'finalizados' ou 'em_aberto'
  const [conferenceTab, setConferenceTab] = useState('finalizados');
  const [sortField, setSortField] = useState('tempo'); // 'tempo' | 'finalizacao' | 'entrada' | 'booking'
  const [sortOrder, setSortOrder] = useState('desc');

  // Modal de Detalhamento / Registros
  const [breakdownModal, setBreakdownModal] = useState(null); // { title, type, items }

  // Hover Tooltip do Gráfico
  const [chartTooltip, setChartTooltip] = useState(null); // { x, y, content }

  // 1. Resolução do intervalo de datas do período selecionado
  const periodRange = useMemo(() => {
    return getPeriodRange(preset, customFrom, customTo, new Date());
  }, [preset, customFrom, customTo]);

  // 2. Filtragem de bookings por exportador, local e permissões
  const baseFilteredBookings = useMemo(() => {
    return filterBookingsForAnalytics({
      bookings,
      exporterId: selectedExporter,
      locationId: selectedLocation,
      user
    });
  }, [bookings, selectedExporter, selectedLocation, user]);

  // 3. Consolidação geral de indicadores e séries mensais
  const dashboard = useMemo(() => {
    return computeAnalyticsDashboard({
      bookings: baseFilteredBookings,
      fieldPendingContainers,
      periodRange,
      importHistoryMap
    });
  }, [baseFilteredBookings, fieldPendingContainers, periodRange, importHistoryMap]);

  // Limpar filtros
  const handleClearFilters = () => {
    setPreset('this_month');
    setCustomFrom('');
    setCustomTo('');
    if (user?.role !== 'Exportador') {
      setSelectedExporter('');
    }
    setSelectedLocation('');
  };

  // Exportar Planilha CSV
  const handleExportCsv = () => {
    const csvData = generateAnalyticsCsv({
      dashboard,
      exportadores,
      locais
    });
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `unispect_analise_${preset}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Imprimir Relatório
  const handlePrint = () => {
    window.print();
  };

  // Alterna ordenação da tabela de conferência
  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Lista ordenada de Bookings Finalizados
  const sortedFinalizedBookings = useMemo(() => {
    const list = [...dashboard.bookingsFinalized.list];
    list.sort((a, b) => {
      const entryA = getBookingEntryDate(a);
      const entryB = getBookingEntryDate(b);
      const finalA = getBookingFinalizationDate(a);
      const finalB = getBookingFinalizationDate(b);
      const diffA = entryA && finalA ? finalA.getTime() - entryA.getTime() : -1;
      const diffB = entryB && finalB ? finalB.getTime() - entryB.getTime() : -1;

      if (sortField === 'tempo') {
        return sortOrder === 'asc' ? diffA - diffB : diffB - diffA;
      }
      if (sortField === 'finalizacao') {
        const timeA = finalA ? finalA.getTime() : 0;
        const timeB = finalB ? finalB.getTime() : 0;
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      }
      if (sortField === 'entrada') {
        const timeA = entryA ? entryA.getTime() : 0;
        const timeB = entryB ? entryB.getTime() : 0;
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      }
      if (sortField === 'booking') {
        return sortOrder === 'asc'
          ? (a.bookingNumber || '').localeCompare(b.bookingNumber || '')
          : (b.bookingNumber || '').localeCompare(a.bookingNumber || '');
      }
      return 0;
    });
    return list;
  }, [dashboard.bookingsFinalized.list, sortField, sortOrder]);

  // Lista ordenada de Bookings Em Aberto
  const sortedOpenBookings = useMemo(() => {
    const list = [...dashboard.openBookings.list];
    const now = Date.now();
    list.sort((a, b) => {
      const entryA = getBookingEntryDate(a);
      const entryB = getBookingEntryDate(b);
      const elapsedA = entryA ? now - entryA.getTime() : 0;
      const elapsedB = entryB ? now - entryB.getTime() : 0;

      if (sortField === 'tempo') {
        return sortOrder === 'asc' ? elapsedA - elapsedB : elapsedB - elapsedA;
      }
      if (sortField === 'entrada') {
        const timeA = entryA ? entryA.getTime() : 0;
        const timeB = entryB ? entryB.getTime() : 0;
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      }
      return (a.bookingNumber || '').localeCompare(b.bookingNumber || '');
    });
    return list;
  }, [dashboard.openBookings.list, sortField, sortOrder]);

  // Auxiliares de nomes
  const getExporterName = (id) => exportadores.find(e => e.id === id)?.name || id || '-';
  const getLocationName = (id) => locais.find(l => l.id === id)?.name || id || '-';

  return (
    <div className="analytics-view-container">
      {/* 1. Barra de Cabeçalho Compacta */}
      <header className="analytics-top-header no-print">
        <div className="analytics-breadcrumb">
          <span className="breadcrumb-root">UNISPECT</span>
          <ChevronRight size={14} className="breadcrumb-sep" />
          <span className="breadcrumb-current">Análise e Relatórios</span>
        </div>

        <div className="analytics-header-actions">
          <button
            type="button"
            onClick={handleExportCsv}
            className="btn-analytics-header"
            title="Exportar dados filtrados para planilha Excel/CSV"
          >
            <Download size={14} />
            <span>Exportar Planilha (CSV)</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="btn-analytics-header"
            title="Imprimir ou salvar relatório em PDF"
          >
            <Printer size={14} />
            <span>Imprimir / PDF</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenReport(null, 'administrative')}
            className="btn-analytics-header highlight"
            title="Gerar Relatório Geral Consolidado"
          >
            <FileText size={14} />
            <span>Relatório Geral</span>
          </button>

          <button
            type="button"
            onClick={onBackToBookings}
            className="btn-analytics-header"
            title="Voltar para a lista de Bookings"
          >
            <span>Voltar a Bookings</span>
          </button>
        </div>
      </header>

      {/* 2. Barra de Título */}
      <div className="analytics-title-bar">
        <div>
          <h1 className="analytics-main-title">Análise e Relatórios</h1>
          <p className="analytics-subtitle">
            Indicadores operacionais, evolução mensal, comparativos e tempo de conclusão
          </p>
        </div>
      </div>

      {/* 3. Card de Filtros */}
      <div className="analytics-filter-card no-print">
        <div className="analytics-presets-row">
          <span className="filter-label">
            <Calendar size={14} />
            Período:
          </span>

          <div className="filter-preset-buttons">
            <button
              type="button"
              className={`preset-btn ${preset === 'this_month' ? 'active' : ''}`}
              onClick={() => setPreset('this_month')}
            >
              Este mês
            </button>
            <button
              type="button"
              className={`preset-btn ${preset === 'last_3_months' ? 'active' : ''}`}
              onClick={() => setPreset('last_3_months')}
            >
              Últimos 3 meses
            </button>
            <button
              type="button"
              className={`preset-btn ${preset === 'last_6_months' ? 'active' : ''}`}
              onClick={() => setPreset('last_6_months')}
            >
              Últimos 6 meses
            </button>
            <button
              type="button"
              className={`preset-btn ${preset === 'last_12_months' ? 'active' : ''}`}
              onClick={() => setPreset('last_12_months')}
            >
              Últimos 12 meses
            </button>
            <button
              type="button"
              className={`preset-btn ${preset === 'last_24_months' ? 'active' : ''}`}
              onClick={() => setPreset('last_24_months')}
            >
              Últimos 24 meses
            </button>
            <button
              type="button"
              className={`preset-btn ${preset === 'custom' ? 'active' : ''}`}
              onClick={() => setPreset('custom')}
            >
              Personalizado
            </button>
          </div>

          {preset === 'custom' && (
            <div className="custom-date-inputs">
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="analytics-date-input"
                title="Data inicial"
              />
              <span>até</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="analytics-date-input"
                title="Data final"
              />
            </div>
          )}
        </div>

        <div className="analytics-selectors-row">
          <div className="filter-field">
            <label>Exportador:</label>
            <select
              value={selectedExporter}
              disabled={user?.role === 'Exportador'}
              onChange={e => setSelectedExporter(e.target.value)}
              className="analytics-select"
            >
              <option value="">Todos os Exportadores</option>
              {exportadores.map(exp => (
                <option key={exp.id} value={exp.id}>
                  {exp.name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-field">
            <label>Local da Operação:</label>
            <select
              value={selectedLocation}
              onChange={e => setSelectedLocation(e.target.value)}
              className="analytics-select"
            >
              <option value="">Todos os Locais</option>
              {locais.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          {(preset !== 'this_month' || (user?.role !== 'Exportador' && selectedExporter) || selectedLocation) && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="btn-limpar-analytics"
              title="Redefinir filtros para o padrão"
            >
              <RotateCcw size={13} />
              <span>Limpar filtros</span>
            </button>
          )}
        </div>

        {/* Faixa Informativa do Período e Comparativo */}
        <div className="analytics-period-badge-bar">
          <div className="period-dates-chip">
            <strong>Período ativo:</strong>{' '}
            {formatDateBR(dashboard.periodRange.start)} até {formatDateBR(dashboard.periodRange.end)}
          </div>

          {dashboard.isCurrentMonthIncomplete && (
            <div className="period-incomplete-chip" title="Comparação ajustada ao mesmo intervalo proporcional">
              ⏳ Mês em andamento (incompleto)
            </div>
          )}

          <div className="period-comparison-chip">
            <strong>Comparativo:</strong> {dashboard.comparisonLabel}
          </div>
        </div>
      </div>

      {/* 4. Cards de Indicadores Principais */}
      <div className="analytics-cards-grid">
        {/* Card 1: Containers Incorporados aos Bookings */}
        <div
          className="analytics-card clickable"
          onClick={() =>
            setBreakdownModal({
              title: 'Containers Incorporados aos Bookings no Período',
              type: 'containers',
              items: dashboard.containers.list
            })
          }
          title="Clique para ver os containers deste indicador"
        >
          <div className="analytics-card-header">
            <div className="card-icon-badge blue">
              <Package size={20} />
            </div>
            <div className={`card-growth-badge ${dashboard.containers.growth.type}`}>
              {dashboard.containers.growth.formatted}
            </div>
          </div>
          <div className="analytics-card-value">{dashboard.containers.count}</div>
          <div className="analytics-card-title">Containers Incorporados</div>
          <div className="analytics-card-detail">
            Período anterior: <strong>{dashboard.containers.previousCount}</strong>
          </div>
        </div>

        {/* Card 2: Bookings Cadastrados */}
        <div
          className="analytics-card clickable"
          onClick={() =>
            setBreakdownModal({
              title: 'Bookings Cadastrados no Período',
              type: 'bookings',
              items: dashboard.bookingsRegistered.list
            })
          }
          title="Clique para ver os Bookings cadastrados"
        >
          <div className="analytics-card-header">
            <div className="card-icon-badge amber">
              <Layers size={20} />
            </div>
            <div className={`card-growth-badge ${dashboard.bookingsRegistered.growth.type}`}>
              {dashboard.bookingsRegistered.growth.formatted}
            </div>
          </div>
          <div className="analytics-card-value">{dashboard.bookingsRegistered.count}</div>
          <div className="analytics-card-title">Bookings Cadastrados</div>
          <div className="analytics-card-detail">
            Período anterior: <strong>{dashboard.bookingsRegistered.previousCount}</strong>
          </div>
        </div>

        {/* Card 3: Bookings Finalizados */}
        <div
          className="analytics-card clickable"
          onClick={() =>
            setBreakdownModal({
              title: 'Bookings Finalizados no Período',
              type: 'bookings',
              items: dashboard.bookingsFinalized.list
            })
          }
          title="Clique para ver os Bookings finalizados"
        >
          <div className="analytics-card-header">
            <div className="card-icon-badge green">
              <CheckCircle2 size={20} />
            </div>
            <div className={`card-growth-badge ${dashboard.bookingsFinalized.growth.type}`}>
              {dashboard.bookingsFinalized.growth.formatted}
            </div>
          </div>
          <div className="analytics-card-value">{dashboard.bookingsFinalized.count}</div>
          <div className="analytics-card-title">Bookings Finalizados</div>
          <div className="analytics-card-detail">
            Período anterior: <strong>{dashboard.bookingsFinalized.previousCount}</strong>
          </div>
        </div>

        {/* Card 4: Tempo de Conclusão (Média e Mediana) */}
        <div
          className="analytics-card clickable"
          onClick={() => {
            setConferenceTab('finalizados');
            const el = document.getElementById('conferencia-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          title="Clique para ir à tabela de conferência de tempos"
        >
          <div className="analytics-card-header">
            <div className="card-icon-badge purple">
              <Clock size={20} />
            </div>
            {dashboard.durationStats.insufficientDataCount > 0 && (
              <div
                className="insufficient-badge"
                title={`${dashboard.durationStats.insufficientDataCount} registro(s) desconsiderado(s) por falta de datas confiáveis`}
              >
                <AlertTriangle size={12} />
                <span>{dashboard.durationStats.insufficientDataCount} fora</span>
              </div>
            )}
          </div>
          <div className="analytics-card-dual-value">
            <div>
              <span className="dual-label">Média:</span>
              <span className="dual-val">{dashboard.durationStats.averageFormatted}</span>
            </div>
            <div>
              <span className="dual-label">Mediana:</span>
              <span className="dual-val">{dashboard.durationStats.medianFormatted}</span>
            </div>
          </div>
          <div className="analytics-card-title">Tempo de Conclusão</div>
          <div className="analytics-card-detail">
            Base: <strong>{dashboard.durationStats.validCount}</strong> finalizações válidas
          </div>
        </div>

        {/* Card 5: Bookings em Aberto & Containers sem Booking */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <div className="card-icon-badge orange">
              <TrendingUp size={20} />
            </div>
            <span className="badge-active-ops">Operações</span>
          </div>
          <div className="analytics-card-dual-value">
            <div
              className="clickable"
              onClick={() => {
                setConferenceTab('em_aberto');
                const el = document.getElementById('conferencia-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              title="Clique para ver os Bookings em aberto"
            >
              <span className="dual-label">Em aberto:</span>
              <span className="dual-val text-amber">{dashboard.openBookings.count}</span>
            </div>
            <div
              className="clickable"
              onClick={() =>
                setBreakdownModal({
                  title: 'Containers sem Booking Aguardando Vínculo (Campo)',
                  type: 'fieldPending',
                  items: dashboard.fieldPendingContainers.list
                })
              }
              title="Clique para ver os containers sem booking"
            >
              <span className="dual-label">Sem Booking:</span>
              <span className="dual-val text-blue">{dashboard.fieldPendingContainers.count}</span>
            </div>
          </div>
          <div className="analytics-card-title">Bookings em Aberto &amp; Campo</div>
          <div className="analytics-card-detail">Containers de campo não misturados com reservas</div>
        </div>
      </div>

      {/* 5. Seção de Gráficos (4 Gráficos Interativos) */}
      <div className="analytics-charts-grid">
        {/* Gráfico 1: Containers por Mês */}
        <div className="analytics-chart-panel">
          <div className="chart-panel-header">
            <h2 className="chart-panel-title">1. Containers por Mês</h2>
            <span className="chart-panel-hint">Passe o mouse ou clique na barra para ver os registros</span>
          </div>

          <div className="chart-render-box">
            {dashboard.monthlySeries.length === 0 ? (
              <div className="chart-empty-state">Nenhum registro para o período</div>
            ) : (() => {
              const count = dashboard.monthlySeries.length;
              const minColWidth = 58;
              const chartWidth = Math.max(540, count * minColWidth + 70);
              const chartHeight = 230;
              const paddingLeft = 45;
              const paddingRight = 20;
              const availableWidth = chartWidth - paddingLeft - paddingRight;
              const colWidth = availableWidth / count;
              const barWidth = Math.min(34, colWidth * 0.55);

              const maxVal = Math.max(...dashboard.monthlySeries.map(s => s.containersCount), 1);
              const baselineY = 175;
              const maxBarHeight = 135;
              const step = colWidth < 46 ? 2 : 1;

              return (
                <svg
                  className="analytics-svg-chart"
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  style={{ minWidth: `${chartWidth}px` }}
                >
                  {/* Linhas de grade horizontais com valores de referência */}
                  <line x1={paddingLeft} y1="40" x2={chartWidth - paddingRight} y2="40" stroke="#e2e8f0" strokeDasharray="3 3" />
                  <line x1={paddingLeft} y1="95" x2={chartWidth - paddingRight} y2="95" stroke="#e2e8f0" strokeDasharray="3 3" />
                  <line x1={paddingLeft} y1="140" x2={chartWidth - paddingRight} y2="140" stroke="#e2e8f0" strokeDasharray="3 3" />
                  <line x1={paddingLeft} y1={baselineY} x2={chartWidth - paddingRight} y2={baselineY} stroke="#cbd5e1" strokeWidth="1.5" />

                  <text x={paddingLeft - 8} y="44" textAnchor="end" className="chart-axis-text">{maxVal}</text>
                  <text x={paddingLeft - 8} y="99" textAnchor="end" className="chart-axis-text">{Math.round(maxVal / 2)}</text>
                  <text x={paddingLeft - 8} y={baselineY + 3} textAnchor="end" className="chart-axis-text">0</text>

                  {dashboard.monthlySeries.map((s, idx) => {
                    const barHeight = (s.containersCount / maxVal) * maxBarHeight;
                    const centerX = paddingLeft + idx * colWidth + colWidth / 2;
                    const x = centerX - barWidth / 2;
                    const y = baselineY - barHeight;
                    const showAxisLabel = idx % step === 0 || idx === count - 1;

                    return (
                      <g
                        key={s.monthKey}
                        className="chart-bar-group"
                        onClick={() =>
                          setBreakdownModal({
                            title: `Containers Incorporados em ${s.fullLabel || s.label} (${s.containersCount})`,
                            type: 'containers',
                            items: s.containersList
                          })
                        }
                        onMouseEnter={e => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setChartTooltip({
                            x: rect.left + rect.width / 2,
                            y: rect.top - 10,
                            content: (
                              <div>
                                <strong>{s.fullLabel || s.label}</strong>
                                <div>Containers: <strong>{s.containersCount}</strong></div>
                                {s.containerGrowth && (
                                  <div>Variação: {s.containerGrowth.formatted}</div>
                                )}
                              </div>
                            )
                          });
                        }}
                        onMouseLeave={() => setChartTooltip(null)}
                      >
                        {/* Barra de Container */}
                        <rect
                          x={x}
                          y={s.containersCount > 0 ? y : baselineY - 2}
                          width={barWidth}
                          height={s.containersCount > 0 ? Math.max(barHeight, 3) : 2}
                          rx="3"
                          className="chart-bar bar-blue"
                          style={{ opacity: s.containersCount > 0 ? 1 : 0.25 }}
                        />

                        {/* Valor sobre a barra: omitido se 0 para evitar poluição visual */}
                        {s.containersCount > 0 && (
                          <text x={centerX} y={y - 5} textAnchor="middle" className="chart-val-text">
                            {s.containersCount}
                          </text>
                        )}

                        {/* Mês e Ano em duas linhas com alinhamento central */}
                        {showAxisLabel && (
                          <text x={centerX} textAnchor="middle">
                            <tspan x={centerX} y="196" className="chart-label-month">
                              {s.monthShort || s.label}
                            </tspan>
                            <tspan x={centerX} y="210" className="chart-label-year">
                              {s.year || ''}
                            </tspan>
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
          </div>
        </div>

        {/* Gráfico 2: Bookings Cadastrados e Finalizados por Mês */}
        <div className="analytics-chart-panel">
          <div className="chart-panel-header">
            <h2 className="chart-panel-title">2. Bookings: Cadastrados vs. Finalizados por Mês</h2>
            <div className="chart-legend">
              <span className="legend-dot amber" /> Cadastrados
              <span className="legend-dot green" /> Finalizados
            </div>
          </div>

          <div className="chart-render-box">
            {dashboard.monthlySeries.length === 0 ? (
              <div className="chart-empty-state">Nenhum registro para o período</div>
            ) : (() => {
              const count = dashboard.monthlySeries.length;
              const minColWidth = 62;
              const chartWidth = Math.max(540, count * minColWidth + 70);
              const chartHeight = 230;
              const paddingLeft = 45;
              const paddingRight = 20;
              const availableWidth = chartWidth - paddingLeft - paddingRight;
              const colWidth = availableWidth / count;
              const subBarWidth = Math.min(18, colWidth * 0.32);

              const maxVal = Math.max(
                ...dashboard.monthlySeries.map(s => Math.max(s.bookingsRegisteredCount, s.bookingsFinalizedCount)),
                1
              );
              const baselineY = 175;
              const maxBarHeight = 135;
              const step = colWidth < 48 ? 2 : 1;

              return (
                <svg
                  className="analytics-svg-chart"
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  style={{ minWidth: `${chartWidth}px` }}
                >
                  <line x1={paddingLeft} y1="40" x2={chartWidth - paddingRight} y2="40" stroke="#e2e8f0" strokeDasharray="3 3" />
                  <line x1={paddingLeft} y1="95" x2={chartWidth - paddingRight} y2="95" stroke="#e2e8f0" strokeDasharray="3 3" />
                  <line x1={paddingLeft} y1="140" x2={chartWidth - paddingRight} y2="140" stroke="#e2e8f0" strokeDasharray="3 3" />
                  <line x1={paddingLeft} y1={baselineY} x2={chartWidth - paddingRight} y2={baselineY} stroke="#cbd5e1" strokeWidth="1.5" />

                  <text x={paddingLeft - 8} y="44" textAnchor="end" className="chart-axis-text">{maxVal}</text>
                  <text x={paddingLeft - 8} y="99" textAnchor="end" className="chart-axis-text">{Math.round(maxVal / 2)}</text>
                  <text x={paddingLeft - 8} y={baselineY + 3} textAnchor="end" className="chart-axis-text">0</text>

                  {dashboard.monthlySeries.map((s, idx) => {
                    const h1 = (s.bookingsRegisteredCount / maxVal) * maxBarHeight;
                    const h2 = (s.bookingsFinalizedCount / maxVal) * maxBarHeight;
                    const centerX = paddingLeft + idx * colWidth + colWidth / 2;
                    const x1 = centerX - subBarWidth - 2;
                    const x2 = centerX + 2;
                    const y1 = baselineY - h1;
                    const y2 = baselineY - h2;
                    const showAxisLabel = idx % step === 0 || idx === count - 1;

                    return (
                      <g
                        key={s.monthKey}
                        className="chart-bar-group"
                        onClick={() =>
                          setBreakdownModal({
                            title: `Bookings em ${s.fullLabel || s.label}: ${s.bookingsRegisteredCount} Cadastrados / ${s.bookingsFinalizedCount} Finalizados`,
                            type: 'bookings',
                            items: [...s.registeredBookings, ...s.finalizedBookings]
                          })
                        }
                        onMouseEnter={e => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setChartTooltip({
                            x: rect.left + rect.width / 2,
                            y: rect.top - 10,
                            content: (
                              <div>
                                <strong>{s.fullLabel || s.label}</strong>
                                <div>Cadastrados: <strong>{s.bookingsRegisteredCount}</strong></div>
                                <div>Finalizados: <strong>{s.bookingsFinalizedCount}</strong></div>
                              </div>
                            )
                          });
                        }}
                        onMouseLeave={() => setChartTooltip(null)}
                      >
                        {/* Barra Cadastrados */}
                        <rect
                          x={x1}
                          y={s.bookingsRegisteredCount > 0 ? y1 : baselineY - 2}
                          width={subBarWidth}
                          height={s.bookingsRegisteredCount > 0 ? Math.max(h1, 3) : 2}
                          rx="3"
                          className="chart-bar bar-amber"
                          style={{ opacity: s.bookingsRegisteredCount > 0 ? 1 : 0.25 }}
                        />
                        {s.bookingsRegisteredCount > 0 && (
                          <text x={x1 + subBarWidth / 2} y={y1 - 5} textAnchor="middle" className="chart-val-text">
                            {s.bookingsRegisteredCount}
                          </text>
                        )}

                        {/* Barra Finalizados */}
                        <rect
                          x={x2}
                          y={s.bookingsFinalizedCount > 0 ? y2 : baselineY - 2}
                          width={subBarWidth}
                          height={s.bookingsFinalizedCount > 0 ? Math.max(h2, 3) : 2}
                          rx="3"
                          className="chart-bar bar-green"
                          style={{ opacity: s.bookingsFinalizedCount > 0 ? 1 : 0.25 }}
                        />
                        {s.bookingsFinalizedCount > 0 && (
                          <text x={x2 + subBarWidth / 2} y={y2 - 5} textAnchor="middle" className="chart-val-text">
                            {s.bookingsFinalizedCount}
                          </text>
                        )}

                        {/* Mês e Ano em duas linhas centrado */}
                        {showAxisLabel && (
                          <text x={centerX} textAnchor="middle">
                            <tspan x={centerX} y="196" className="chart-label-month">
                              {s.monthShort || s.label}
                            </tspan>
                            <tspan x={centerX} y="210" className="chart-label-year">
                              {s.year || ''}
                            </tspan>
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
          </div>
        </div>

        {/* Gráfico 3: Comparação Mensal de Crescimento de Containers e Bookings */}
        <div className="analytics-chart-panel">
          <div className="chart-panel-header">
            <h2 className="chart-panel-title">3. Comparação de Crescimento Mensal (%)</h2>
            <div className="chart-legend">
              <span className="legend-dot blue" /> Containers
              <span className="legend-dot amber" /> Bookings
            </div>
          </div>

          <div className="chart-render-box">
            {dashboard.monthlySeries.length === 0 ? (
              <div className="chart-empty-state">Nenhum registro para o período</div>
            ) : (() => {
              const count = dashboard.monthlySeries.length;
              const minColWidth = 62;
              const chartWidth = Math.max(540, count * minColWidth + 70);
              const chartHeight = 230;
              const paddingLeft = 52;
              const paddingRight = 20;
              const availableWidth = chartWidth - paddingLeft - paddingRight;
              const colWidth = availableWidth / count;
              const subBarWidth = Math.min(18, colWidth * 0.32);

              // Escala dinâmica real: sem corte silencioso para valores > 100%
              const allPercents = dashboard.monthlySeries.flatMap(s => [
                s.containerGrowth && !s.containerGrowth.noBase && s.containerGrowth.percent !== null ? Math.abs(s.containerGrowth.percent) : 0,
                s.bookingGrowth && !s.bookingGrowth.noBase && s.bookingGrowth.percent !== null ? Math.abs(s.bookingGrowth.percent) : 0
              ]);
              const rawMax = Math.max(100, ...allPercents);
              const maxScale = Math.ceil(rawMax / 50) * 50;

              const zeroY = 105;
              const maxHalfHeight = 65;
              const step = colWidth < 48 ? 2 : 1;

              return (
                <svg
                  className="analytics-svg-chart"
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  style={{ minWidth: `${chartWidth}px` }}
                >
                  {/* Linhas de referência dinâmicas */}
                  <line x1={paddingLeft} y1="40" x2={chartWidth - paddingRight} y2="40" stroke="#f1f5f9" />
                  <line x1={paddingLeft} y1="72" x2={chartWidth - paddingRight} y2="72" stroke="#f8fafc" strokeDasharray="2 2" />
                  <line x1={paddingLeft} y1={zeroY} x2={chartWidth - paddingRight} y2={zeroY} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3 3" />
                  <line x1={paddingLeft} y1="138" x2={chartWidth - paddingRight} y2="138" stroke="#f8fafc" strokeDasharray="2 2" />
                  <line x1={paddingLeft} y1="170" x2={chartWidth - paddingRight} y2="170" stroke="#f1f5f9" />

                  <text x={paddingLeft - 8} y="44" textAnchor="end" className="chart-axis-text">+{maxScale}%</text>
                  <text x={paddingLeft - 8} y="109" textAnchor="end" className="chart-axis-text">0%</text>
                  <text x={paddingLeft - 8} y="174" textAnchor="end" className="chart-axis-text">-{maxScale}%</text>

                  {dashboard.monthlySeries.map((s, idx) => {
                    const centerX = paddingLeft + idx * colWidth + colWidth / 2;
                    const x1 = centerX - subBarWidth - 2;
                    const x2 = centerX + 2;

                    const cGrowth = s.containerGrowth;
                    const bGrowth = s.bookingGrowth;

                    const hasC = cGrowth && !cGrowth.noBase && cGrowth.percent !== null;
                    const hasB = bGrowth && !bGrowth.noBase && bGrowth.percent !== null;

                    const cPercent = hasC ? cGrowth.percent : null;
                    const bPercent = hasB ? bGrowth.percent : null;

                    const h1 = cPercent !== null ? (Math.min(Math.abs(cPercent), maxScale) / maxScale) * maxHalfHeight : 0;
                    const y1 = cPercent !== null ? (cPercent >= 0 ? zeroY - h1 : zeroY) : zeroY;

                    const h2 = bPercent !== null ? (Math.min(Math.abs(bPercent), maxScale) / maxScale) * maxHalfHeight : 0;
                    const y2 = bPercent !== null ? (bPercent >= 0 ? zeroY - h2 : zeroY) : zeroY;

                    const showAxisLabel = idx % step === 0 || idx === count - 1;

                    return (
                      <g
                        key={s.monthKey}
                        className="chart-bar-group"
                        onMouseEnter={e => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setChartTooltip({
                            x: rect.left + rect.width / 2,
                            y: rect.top - 10,
                            content: (
                              <div>
                                <strong>{s.fullLabel || s.label}</strong>
                                <div>
                                  Containers:{' '}
                                  <strong>
                                    {cGrowth?.noBase ? 'Sem base de comparação' : (cGrowth?.formatted || 'Base inicial')}
                                  </strong>
                                </div>
                                <div>
                                  Bookings:{' '}
                                  <strong>
                                    {bGrowth?.noBase ? 'Sem base de comparação' : (bGrowth?.formatted || 'Base inicial')}
                                  </strong>
                                </div>
                              </div>
                            )
                          });
                        }}
                        onMouseLeave={() => setChartTooltip(null)}
                      >
                        {/* Barra Containers */}
                        {hasC ? (
                          <rect
                            x={x1}
                            y={y1}
                            width={subBarWidth}
                            height={Math.max(h1, 3)}
                            rx="2"
                            className="chart-bar bar-blue"
                          />
                        ) : (
                          <rect
                            x={x1}
                            y={zeroY - 1}
                            width={subBarWidth}
                            height="2"
                            rx="1"
                            fill="#94a3b8"
                            opacity="0.3"
                          />
                        )}

                        {/* Barra Bookings */}
                        {hasB ? (
                          <rect
                            x={x2}
                            y={y2}
                            width={subBarWidth}
                            height={Math.max(h2, 3)}
                            rx="2"
                            className="chart-bar bar-amber"
                          />
                        ) : (
                          <rect
                            x={x2}
                            y={zeroY - 1}
                            width={subBarWidth}
                            height="2"
                            rx="1"
                            fill="#94a3b8"
                            opacity="0.3"
                          />
                        )}

                        {/* Rótulo de Mês e Ano em duas linhas centrado */}
                        {showAxisLabel && (
                          <text x={centerX} textAnchor="middle">
                            <tspan x={centerX} y="196" className="chart-label-month">
                              {s.monthShort || s.label}
                            </tspan>
                            <tspan x={centerX} y="210" className="chart-label-year">
                              {s.year || ''}
                            </tspan>
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
          </div>
        </div>

        {/* Gráfico 4: Tempo Médio de Conclusão por Mês */}
        <div className="analytics-chart-panel">
          <div className="chart-panel-header">
            <h2 className="chart-panel-title">4. Tempo Médio de Conclusão por Mês (dias)</h2>
            <span className="chart-panel-hint">Tempo decorrido entre entrada e finalização</span>
          </div>

          <div className="chart-render-box">
            {dashboard.monthlySeries.length === 0 ? (
              <div className="chart-empty-state">Nenhum registro para o período</div>
            ) : (() => {
              const count = dashboard.monthlySeries.length;
              const minColWidth = 58;
              const chartWidth = Math.max(540, count * minColWidth + 70);
              const chartHeight = 230;
              const paddingLeft = 45;
              const paddingRight = 20;
              const availableWidth = chartWidth - paddingLeft - paddingRight;
              const colWidth = availableWidth / count;
              const barWidth = Math.min(32, colWidth * 0.52);

              const maxVal = Math.max(...dashboard.monthlySeries.map(s => s.avgCompletionDays || 0), 1);
              const baselineY = 175;
              const maxBarHeight = 135;
              const step = colWidth < 46 ? 2 : 1;

              return (
                <svg
                  className="analytics-svg-chart"
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  style={{ minWidth: `${chartWidth}px` }}
                >
                  <line x1={paddingLeft} y1="40" x2={chartWidth - paddingRight} y2="40" stroke="#e2e8f0" strokeDasharray="3 3" />
                  <line x1={paddingLeft} y1="95" x2={chartWidth - paddingRight} y2="95" stroke="#e2e8f0" strokeDasharray="3 3" />
                  <line x1={paddingLeft} y1="140" x2={chartWidth - paddingRight} y2="140" stroke="#e2e8f0" strokeDasharray="3 3" />
                  <line x1={paddingLeft} y1={baselineY} x2={chartWidth - paddingRight} y2={baselineY} stroke="#cbd5e1" strokeWidth="1.5" />

                  <text x={paddingLeft - 8} y="44" textAnchor="end" className="chart-axis-text">{maxVal}d</text>
                  <text x={paddingLeft - 8} y="99" textAnchor="end" className="chart-axis-text">{Math.round(maxVal / 2)}d</text>
                  <text x={paddingLeft - 8} y={baselineY + 3} textAnchor="end" className="chart-axis-text">0d</text>

                  {dashboard.monthlySeries.map((s, idx) => {
                    const hasFinalized = s.finalizedBookings && s.finalizedBookings.length > 0;
                    const days = s.avgCompletionDays;
                    const isZeroDuration = hasFinalized && (days === 0 || (days !== null && days < 0.5));
                    const hasData = hasFinalized && days !== null;

                    const barHeight = hasData
                      ? (isZeroDuration ? 10 : Math.max(10, (days / maxVal) * maxBarHeight))
                      : 0;

                    const centerX = paddingLeft + idx * colWidth + colWidth / 2;
                    const x = centerX - barWidth / 2;
                    const y = baselineY - barHeight;
                    const showAxisLabel = idx % step === 0 || idx === count - 1;

                    return (
                      <g
                        key={s.monthKey}
                        className="chart-bar-group"
                        onClick={() =>
                          setBreakdownModal({
                            title: `Bookings Finalizados em ${s.fullLabel || s.label} (${s.finalizedBookings.length})`,
                            type: 'bookings',
                            items: s.finalizedBookings
                          })
                        }
                        onMouseEnter={e => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setChartTooltip({
                            x: rect.left + rect.width / 2,
                            y: rect.top - 10,
                            content: (
                              <div>
                                <strong>{s.fullLabel || s.label}</strong>
                                {!hasFinalized ? (
                                  <div style={{ color: '#94a3b8' }}>Ausência de dados (sem finalizações)</div>
                                ) : isZeroDuration ? (
                                  <>
                                    <div>Tempo médio: <strong>&lt; 1 dia</strong> (mesmo dia)</div>
                                    <div>Total finalizados: {s.finalizedBookings.length}</div>
                                  </>
                                ) : (
                                  <>
                                    <div>Tempo médio: <strong>{days} dia{days === 1 ? '' : 's'}</strong></div>
                                    <div>Total finalizados: {s.finalizedBookings.length}</div>
                                  </>
                                )}
                              </div>
                            )
                          });
                        }}
                        onMouseLeave={() => setChartTooltip(null)}
                      >
                        {/* Barra do Tempo de Conclusão */}
                        {hasData ? (
                          <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={barHeight}
                            rx="3"
                            className="chart-bar bar-purple"
                          />
                        ) : (
                          /* Ausência de dados: traço sutil sem barra falsa */
                          <line
                            x1={x}
                            y1={baselineY}
                            x2={x + barWidth}
                            y2={baselineY}
                            stroke="#cbd5e1"
                            strokeWidth="2"
                            strokeDasharray="2 2"
                            opacity="0.5"
                          />
                        )}

                        {/* Rótulo de Valor: distingue duração zero de ausência de dados, e não polui barras vazias */}
                        {hasData && (
                          <text x={centerX} y={y - 5} textAnchor="middle" className="chart-val-text">
                            {isZeroDuration ? '< 1d' : `${days}d`}
                          </text>
                        )}

                        {/* Mês e Ano em duas linhas centrado */}
                        {showAxisLabel && (
                          <text x={centerX} textAnchor="middle">
                            <tspan x={centerX} y="196" className="chart-label-month">
                              {s.monthShort || s.label}
                            </tspan>
                            <tspan x={centerX} y="210" className="chart-label-year">
                              {s.year || ''}
                            </tspan>
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
          </div>
        </div>
      </div>

      {/* 6. Seção de Tabelas de Conferência */}
      <div className="analytics-conference-section" id="conferencia-section">
        <div className="conference-header-row">
          <div className="conference-tabs-group">
            <button
              type="button"
              className={`conference-tab-btn ${conferenceTab === 'finalizados' ? 'active' : ''}`}
              onClick={() => setConferenceTab('finalizados')}
            >
              <CheckCircle2 size={16} />
              <span>Bookings Finalizados ({dashboard.bookingsFinalized.count})</span>
            </button>

            <button
              type="button"
              className={`conference-tab-btn ${conferenceTab === 'em_aberto' ? 'active' : ''}`}
              onClick={() => setConferenceTab('em_aberto')}
            >
              <Clock size={16} />
              <span>Bookings em Aberto ({dashboard.openBookings.count})</span>
            </button>
          </div>

          <div className="conference-sort-controls no-print">
            <span className="sort-hint">Ordenar por:</span>
            <button
              type="button"
              className={`btn-sort-opt ${sortField === 'tempo' ? 'active' : ''}`}
              onClick={() => handleSort('tempo')}
            >
              Maior Tempo <ArrowUpDown size={12} />
            </button>
            <button
              type="button"
              className={`btn-sort-opt ${sortField === 'entrada' ? 'active' : ''}`}
              onClick={() => handleSort('entrada')}
            >
              Data Entrada <ArrowUpDown size={12} />
            </button>
          </div>
        </div>

        {/* Tabela de Bookings Finalizados */}
        {conferenceTab === 'finalizados' && (
          <div className="analytics-table-card">
            <div className="analytics-table-scroll">
              <table className="desktop-compact-table analytics-confer-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('booking')} className="sortable">
                      Booking / Certificado
                    </th>
                    <th>Exportador</th>
                    <th>Local</th>
                    <th>Containers</th>
                    <th onClick={() => handleSort('entrada')} className="sortable">
                      Entrada
                    </th>
                    <th onClick={() => handleSort('finalizacao')} className="sortable">
                      Finalização
                    </th>
                    <th onClick={() => handleSort('tempo')} className="sortable">
                      Tempo Decorrido
                    </th>
                    <th>Responsável</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFinalizedBookings.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="table-empty-row">
                        Nenhum Booking finalizado no período selecionado.
                      </td>
                    </tr>
                  ) : (
                    sortedFinalizedBookings.map(b => {
                      const entryDate = getBookingEntryDate(b);
                      const finalDate = getBookingFinalizationDate(b);
                      const diffMs = entryDate && finalDate ? finalDate.getTime() - entryDate.getTime() : null;
                      const durText = diffMs !== null && diffMs >= 0 ? formatDuration(diffMs, true) : 'Dados insuficientes';
                      const respName = getBookingFinalizedBy(b);

                      return (
                        <tr key={b.id}>
                          <td>
                            <strong className="text-booking">{b.bookingNumber}</strong>
                            <div className="text-cert-sub">{b.certificateNumber}</div>
                          </td>
                          <td title={getExporterName(b.exporterId)} className="col-ellipsis">
                            {getExporterName(b.exporterId)}
                          </td>
                          <td title={getLocationName(b.locationId)} className="col-ellipsis">
                            {getLocationName(b.locationId)}
                          </td>
                          <td>
                            <span className="col-containers-count">{b.containers?.length || 0} cont.</span>
                          </td>
                          <td>{formatDateTimeBR(entryDate)}</td>
                          <td>{formatDateTimeBR(finalDate)}</td>
                          <td>
                            <span className={`duration-badge ${durText === 'Dados insuficientes' ? 'warning' : 'ok'}`}>
                              {durText}
                            </span>
                          </td>
                          <td className="col-ellipsis">{respName}</td>
                          <td>
                            <span className="badge badge-success">FINALIZADO</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => onOpenBooking(b.id)}
                              className="btn-abrir-booking"
                              title="Abrir detalhes deste Booking"
                            >
                              Abrir Booking
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tabela de Bookings Em Aberto */}
        {conferenceTab === 'em_aberto' && (
          <div className="analytics-table-card">
            <div className="analytics-table-scroll">
              <table className="desktop-compact-table analytics-confer-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('booking')} className="sortable">
                      Booking / Certificado
                    </th>
                    <th>Exportador</th>
                    <th>Local</th>
                    <th>Containers</th>
                    <th onClick={() => handleSort('entrada')} className="sortable">
                      Data Entrada
                    </th>
                    <th onClick={() => handleSort('tempo')} className="sortable">
                      Tempo em Andamento
                    </th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOpenBookings.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="table-empty-row">
                        Nenhum Booking em aberto no período selecionado.
                      </td>
                    </tr>
                  ) : (
                    sortedOpenBookings.map(b => {
                      const entryDate = getBookingEntryDate(b);
                      const elapsedMs = entryDate ? Date.now() - entryDate.getTime() : null;
                      const durText = elapsedMs !== null && elapsedMs >= 0 ? formatDuration(elapsedMs, true) : 'Dados insuficientes';

                      return (
                        <tr key={b.id}>
                          <td>
                            <strong className="text-booking">{b.bookingNumber}</strong>
                            <div className="text-cert-sub">{b.certificateNumber}</div>
                          </td>
                          <td title={getExporterName(b.exporterId)} className="col-ellipsis">
                            {getExporterName(b.exporterId)}
                          </td>
                          <td title={getLocationName(b.locationId)} className="col-ellipsis">
                            {getLocationName(b.locationId)}
                          </td>
                          <td>
                            <span className="col-containers-count">{b.containers?.length || 0} cont.</span>
                          </td>
                          <td>{formatDateTimeBR(entryDate)}</td>
                          <td>
                            <span className="duration-badge in-progress">
                              ⏱️ {durText}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${b.status === 'Em andamento' ? 'badge-progress' : 'badge-pending'}`}>
                              {(b.status || 'Pendente').toUpperCase()}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => onOpenBooking(b.id)}
                              className="btn-abrir-booking"
                              title="Abrir detalhes deste Booking"
                            >
                              Abrir Booking
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 7. Modal de Detalhamento / Registros Reais */}
      {breakdownModal && (
        <div className="modal-overlay" onClick={() => setBreakdownModal(null)}>
          <div className="glass-panel analytics-breakdown-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{breakdownModal.title}</h3>
              <button
                type="button"
                onClick={() => setBreakdownModal(null)}
                className="btn-close-modal"
                title="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="breakdown-modal-body">
              {breakdownModal.type === 'containers' && (
                <table className="desktop-compact-table">
                  <thead>
                    <tr>
                      <th>Container</th>
                      <th>Booking</th>
                      <th>Exportador</th>
                      <th>Data Incorporação</th>
                      <th style={{ textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdownModal.items.map((item, idx) => (
                      <tr key={item.container?.id || idx}>
                        <td>
                          <strong>{item.container?.containerNumber}</strong>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                            ({item.container?.containerType || 'Reefer'})
                          </span>
                        </td>
                        <td>{item.booking?.bookingNumber}</td>
                        <td>{getExporterName(item.booking?.exporterId)}</td>
                        <td>{formatDateTimeBR(item.date || item.incorporatedDate)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setBreakdownModal(null);
                              onOpenBooking(item.booking?.id);
                            }}
                            className="btn-abrir-booking"
                          >
                            Abrir Booking
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {breakdownModal.type === 'bookings' && (
                <table className="desktop-compact-table">
                  <thead>
                    <tr>
                      <th>Booking</th>
                      <th>Certificado</th>
                      <th>Exportador</th>
                      <th>Containers</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdownModal.items.map((b, idx) => (
                      <tr key={b.id || idx}>
                        <td>
                          <strong>{b.bookingNumber}</strong>
                        </td>
                        <td>{b.certificateNumber}</td>
                        <td>{getExporterName(b.exporterId)}</td>
                        <td>{b.containers?.length || 0}</td>
                        <td>
                          <span className="badge badge-success">{(b.status || 'Pendente').toUpperCase()}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setBreakdownModal(null);
                              onOpenBooking(b.id);
                            }}
                            className="btn-abrir-booking"
                          >
                            Abrir Booking
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {breakdownModal.type === 'fieldPending' && (
                <table className="desktop-compact-table">
                  <thead>
                    <tr>
                      <th>Número do Container</th>
                      <th>Tara</th>
                      <th>Lacre</th>
                      <th>Status</th>
                      <th>Data Coleta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdownModal.items.map((c, idx) => (
                      <tr key={c.id || idx}>
                        <td>
                          <strong>{c.id || c.containerNumber}</strong>
                        </td>
                        <td>{c.container?.tara || c.tara || '-'} kg</td>
                        <td>{c.container?.definiteSeal || c.seal || '-'}</td>
                        <td>
                          <span className="badge badge-pending">PENDENTE</span>
                        </td>
                        <td>{formatDateBR(c.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setBreakdownModal(null)}
                className="btn btn-secondary"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip Dinâmico dos Gráficos */}
      {chartTooltip && (
        <div
          className="analytics-chart-tooltip"
          style={{
            left: `${chartTooltip.x}px`,
            top: `${chartTooltip.y}px`
          }}
        >
          {chartTooltip.content}
        </div>
      )}
    </div>
  );
}
