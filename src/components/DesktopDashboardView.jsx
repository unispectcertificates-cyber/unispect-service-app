import { useState, useEffect } from 'react';
import {
  Search,
  ShieldAlert,
  Hourglass,
  CheckCircle2,
  X,
  Trash2,
  UploadCloud,
  RefreshCw,
  Plus,
  PackagePlus,
  MoreVertical,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  FileText,
  RotateCcw
} from 'lucide-react';
import { matchesBooking, getMatchedContainers } from '../db';
import ExportadoresList from './ExportadoresList';
import LocaisList from './LocaisList';
import InspectorsList from './InspectorsList';
import ReportView from './ReportView';
import UsersList from './UsersList';
import FieldContainersView from './FieldContainersView';
import YardInventoryView from './YardInventoryView';
import AnalyticsReportsView from './AnalyticsReportsView';
import MobileAppView from './MobileAppView';
import { subscribePendingFieldContainers } from '../utils/fieldService';

export default function DesktopDashboardView({
  currentTab,
  setCurrentTab,
  user,
  bookings,
  exportadores,
  locais,
  isOnline,
  setIsOnline,
  isRefreshing,
  handleSystemRefresh,
  activeReport,
  setActiveReport,
  setSelectedBookingId,
  setInitialOpenUpdateRomaneio,
  setShowCreateModal,
  setShowUpdateRomaneioPicker,
  handleRefreshData,
  handleFinalizeBooking,
  handleDeleteBooking,
  handleLogout,
  serverIp,
  handleServerIpChange,
  pendingFieldCount
}) {
  // Estados de busca, filtros e paginação
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [tableTab, setTableTab] = useState('em_aberto'); // 'em_aberto' | 'finalizados' | 'todos'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortField, setSortField] = useState('certificateNumber');
  const [sortDirection, setSortDirection] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [openActionMenuId, setOpenActionMenuId] = useState(null);

  // Fecha menu de ações ao clicar fora
  useEffect(() => {
    const handleCloseActionMenu = (e) => {
      if (!e.target.closest('.desktop-row-actions')) {
        setOpenActionMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleCloseActionMenu);
    return () => document.removeEventListener('mousedown', handleCloseActionMenu);
  }, []);

  // Subscrição de containers sem booking de campo
  const [fieldPendingContainers, setFieldPendingContainers] = useState([]);
  useEffect(() => {
    const unsub = subscribePendingFieldContainers(
      records => setFieldPendingContainers(records),
      () => setFieldPendingContainers([])
    );
    return () => unsub();
  }, []);

  // Ordenação
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (field) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} style={{ opacity: 0.35, marginLeft: '4px', verticalAlign: 'middle' }} />;
    }
    return sortDirection === 'asc' ? (
      <ChevronUp size={12} style={{ color: '#b45309', marginLeft: '4px', verticalAlign: 'middle' }} />
    ) : (
      <ChevronDown size={12} style={{ color: '#b45309', marginLeft: '4px', verticalAlign: 'middle' }} />
    );
  };

  // Limpar filtros
  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('Todos');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  // Contagens globais dos cards
  const countPendentes = bookings.filter(b => b.status === 'Pendente').length;
  const countAndamento = bookings.filter(b => b.status === 'Em andamento').length;
  const countFinalizados = bookings.filter(b => b.status === 'Finalizado').length;

  // 1. Filtragem global de todos os registros acessíveis (busca universal + status + datas)
  const baseFilteredBookings = bookings.filter(b => {
    const matchesSearch = matchesBooking(b, searchQuery, { exportadores, locais });
    const matchesStatus = statusFilter === 'Todos' || b.status === statusFilter;

    let matchesDate = true;
    const bookingDate = b.launchDate || b.startDate || (b.createdAt ? b.createdAt.split('T')[0] : '');
    if (dateFrom && bookingDate) {
      matchesDate = matchesDate && bookingDate >= dateFrom;
    }
    if (dateTo && bookingDate) {
      matchesDate = matchesDate && bookingDate <= dateTo;
    }

    return matchesSearch && matchesStatus && matchesDate;
  });

  // Contagens para as abas respeitando a busca e datas aplicadas
  const tabCountEmAberto = baseFilteredBookings.filter(b => b.status !== 'Finalizado').length;
  const tabCountFinalizados = baseFilteredBookings.filter(b => b.status === 'Finalizado').length;
  const tabCountTodos = baseFilteredBookings.length;

  // 2. Filtragem pela aba ativa
  const tabFilteredBookings = baseFilteredBookings.filter(b => {
    if (tableTab === 'em_aberto') return b.status !== 'Finalizado';
    if (tableTab === 'finalizados') return b.status === 'Finalizado';
    return true; // 'todos'
  });

  // 3. Ordenação das colunas
  const sortedBookings = [...tabFilteredBookings].sort((a, b) => {
    let valA = '';
    let valB = '';

    if (sortField === 'certificateNumber') {
      valA = a.certificateNumber || '';
      valB = b.certificateNumber || '';
    } else if (sortField === 'bookingNumber') {
      valA = a.bookingNumber || '';
      valB = b.bookingNumber || '';
    } else if (sortField === 'exporter') {
      valA = exportadores.find(e => e.id === a.exporterId)?.name || '';
      valB = exportadores.find(e => e.id === b.exporterId)?.name || '';
    } else if (sortField === 'vesselVoyage') {
      valA = a.vesselVoyage || '';
      valB = b.vesselVoyage || '';
    } else if (sortField === 'local') {
      valA = locais.find(l => l.id === a.locationId)?.name || '';
      valB = locais.find(l => l.id === b.locationId)?.name || '';
    } else if (sortField === 'containers') {
      valA = a.containers?.length || 0;
      valB = b.containers?.length || 0;
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    } else if (sortField === 'status') {
      valA = a.status || '';
      valB = b.status || '';
    }

    return sortDirection === 'asc'
      ? String(valA).localeCompare(String(valB), 'pt-BR', { numeric: true })
      : String(valB).localeCompare(String(valA), 'pt-BR', { numeric: true });
  });

  // 4. Paginação com contagem real de resultados
  const totalItems = sortedBookings.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginationStart = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const paginationEnd = Math.min(safeCurrentPage * pageSize, totalItems);
  const displayedBookings = sortedBookings.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  return (
    <div className="desktop-main-wrapper">
      {/* Cabeçalho compacto com localização, conexão e atualizar */}
      <header className="desktop-compact-header no-print">
        <div className="desktop-breadcrumb">
          <span>UNISPECT</span>
          <span>/</span>
          <span className="desktop-breadcrumb-current">
            {currentTab === 'bookings' && 'Bookings e operações'}
            {currentTab === 'yard-inventory' && 'Inventário do Pátio'}
            {currentTab === 'containers-sem-booking' && 'Containers sem Booking'}
            {currentTab === 'analytics-reports' && 'Análise e Relatórios'}
            {currentTab === 'exportadores' && 'Exportadores'}
            {currentTab === 'locais' && 'Locais da Operação'}
            {currentTab === 'inspectors' && 'Cadastro de Inspetores'}
            {currentTab === 'usuarios' && 'Gerenciar Usuários'}
            {currentTab === 'settings' && 'Configurações'}
            {currentTab === 'field-portal' && 'Modo Campo'}
          </span>
        </div>

        <div className="desktop-header-actions">
          {/* Status Online/Offline */}
          <div className="desktop-status-pill no-select">
            <span
              className="desktop-status-dot"
              style={{ backgroundColor: isOnline ? '#10b981' : '#ef4444' }}
            />
            <span style={{ color: isOnline ? '#10b981' : 'var(--text-muted)' }}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
            <input
              type="checkbox"
              checked={isOnline}
              onChange={() => setIsOnline(!isOnline)}
              style={{ width: '28px', height: '14px', cursor: 'pointer', margin: 0 }}
            />
          </div>

          {/* Botão de Atualizar Sistema */}
          <button
            type="button"
            onClick={handleSystemRefresh}
            disabled={isRefreshing}
            className="desktop-refresh-btn"
            title="Recarregar dados do sistema"
          >
            <RefreshCw
              size={13}
              className={isRefreshing ? 'spin' : ''}
              style={{ color: '#f59e0b' }}
            />
            <span>{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
          </button>
        </div>
      </header>

      {/* Área rolável de conteúdo Desktop */}
      <main className="desktop-content-scroll">
        {activeReport ? (
          <ReportView
            bookingId={activeReport.id}
            reportType={activeReport.type}
            onBack={() => {
              setActiveReport(null);
              if (activeReport.id) setSelectedBookingId(activeReport.id);
            }}
          />
        ) : currentTab === 'bookings' ? (
          <>
            {/* Título da tela e botões de ação de topo destacados */}
            <div className="desktop-page-title-row">
              <div className="desktop-page-title-left">
                <h1>Bookings e operações</h1>
                <p>Gestão operacional, acompanhamento de romaneios e vistorias</p>
              </div>

              <div className="desktop-page-actions">
                {user.role === 'ADM' && (
                  <button
                    type="button"
                    id="btn-desktop-novo-romaneio"
                    onClick={() => setShowCreateModal(true)}
                    className="btn-novo-romaneio"
                    title="Importar novo romaneio PDF ou cadastrar booking"
                  >
                    <Plus size={16} />
                    <span>Novo romaneio</span>
                  </button>
                )}

                {(user.role === 'ADM' || user.role === 'Inspector') && (
                  <button
                    type="button"
                    id="btn-desktop-atualizar-romaneio"
                    onClick={() => setShowUpdateRomaneioPicker(true)}
                    className="btn-atualizar-romaneio"
                    title="Inserir atualização de romaneio PDF em um booking existente"
                  >
                    <UploadCloud size={16} />
                    <span>Atualizar romaneio</span>
                  </button>
                )}
              </div>
            </div>

            {/* 4 Cards compactos com contagens reais */}
            <div className="desktop-summary-cards-grid">
              {/* Card Pendentes */}
              <div
                id="card-pendentes"
                className={`summary-card-compact ${statusFilter === 'Pendente' ? 'active' : ''}`}
                onClick={() => {
                  setTableTab('em_aberto');
                  setStatusFilter(statusFilter === 'Pendente' ? 'Todos' : 'Pendente');
                  setCurrentPage(1);
                }}
                title="Filtrar por Bookings Pendentes"
              >
                <div
                  className="summary-card-icon-box"
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
                >
                  <ShieldAlert size={22} />
                </div>
                <div className="summary-card-data">
                  <div className="summary-card-value">{countPendentes}</div>
                  <div className="summary-card-label">Pendentes</div>
                </div>
              </div>

              {/* Card Em Andamento */}
              <div
                id="card-em-andamento"
                className={`summary-card-compact ${statusFilter === 'Em andamento' ? 'active' : ''}`}
                onClick={() => {
                  setTableTab('em_aberto');
                  setStatusFilter(statusFilter === 'Em andamento' ? 'Todos' : 'Em andamento');
                  setCurrentPage(1);
                }}
                title="Filtrar por Bookings Em Andamento"
              >
                <div
                  className="summary-card-icon-box"
                  style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#d97706' }}
                >
                  <Hourglass size={22} />
                </div>
                <div className="summary-card-data">
                  <div className="summary-card-value">{countAndamento}</div>
                  <div className="summary-card-label">Em andamento</div>
                </div>
              </div>

              {/* Card Finalizados */}
              <div
                id="card-finalizados"
                className={`summary-card-compact ${tableTab === 'finalizados' ? 'active' : ''}`}
                onClick={() => {
                  setTableTab('finalizados');
                  setStatusFilter('Todos');
                  setCurrentPage(1);
                }}
                title="Ver Bookings Finalizados"
              >
                <div
                  className="summary-card-icon-box"
                  style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}
                >
                  <CheckCircle2 size={22} />
                </div>
                <div className="summary-card-data">
                  <div className="summary-card-value">{countFinalizados}</div>
                  <div className="summary-card-label">Finalizados</div>
                </div>
              </div>

              {/* Card Containers sem Booking */}
              <div
                id="card-containers-sem-booking"
                className="summary-card-compact"
                onClick={() => setCurrentTab('containers-sem-booking')}
                title="Abrir tela de Containers sem Booking"
              >
                <div
                  className="summary-card-icon-box"
                  style={{ backgroundColor: 'rgba(99, 102, 241, 0.12)', color: '#6366f1' }}
                >
                  <PackagePlus size={22} />
                </div>
                <div className="summary-card-data">
                  <div className="summary-card-value">{pendingFieldCount}</div>
                  <div className="summary-card-label">Containers sem Booking</div>
                </div>
              </div>
            </div>

            {/* Barra de Busca e Filtros */}
            <div className="desktop-filter-card">
              <div className="desktop-filters-row">
                <div className="desktop-search-wrapper">
                  <Search
                    size={16}
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)'
                    }}
                  />
                  <input
                    type="text"
                    id="desktop-universal-search"
                    placeholder="Buscar container (MSDU-882129-7), Booking, exportador, navio..."
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="desktop-search-input"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setCurrentPage(1);
                      }}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer'
                      }}
                      title="Limpar texto da busca"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <select
                  value={statusFilter}
                  onChange={e => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="desktop-filter-select"
                >
                  <option value="Todos">Todos os Status</option>
                  <option value="Pendente">Pendentes</option>
                  <option value="Em andamento">Em andamento</option>
                  <option value="Finalizado">Finalizados</option>
                </select>

                <div className="desktop-date-filter">
                  <span>Período:</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => {
                      setDateFrom(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="desktop-date-input"
                    title="Data inicial"
                  />
                  <span>até</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => {
                      setDateTo(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="desktop-date-input"
                    title="Data final"
                  />
                </div>

                {(searchQuery || statusFilter !== 'Todos' || dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="btn-limpar-filtros"
                    title="Redefinir filtros"
                  >
                    <RotateCcw size={13} />
                    <span>Limpar</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setActiveReport({ id: null, type: 'administrative' })}
                  className="btn-relatorio-geral"
                  title="Gerar Relatório Geral Consolidado"
                >
                  <FileText size={14} />
                  <span>Relatório Geral</span>
                </button>
              </div>
            </div>

            {/* Abas da Tabela */}
            <div className="desktop-table-tabs-row">
              <div className="desktop-tabs-group">
                <button
                  type="button"
                  onClick={() => {
                    setTableTab('em_aberto');
                    setCurrentPage(1);
                  }}
                  className={`desktop-tab-btn ${tableTab === 'em_aberto' ? 'active' : ''}`}
                >
                  <span>Em aberto</span>
                  <span className="desktop-tab-badge">{tabCountEmAberto}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTableTab('finalizados');
                    setCurrentPage(1);
                  }}
                  className={`desktop-tab-btn ${tableTab === 'finalizados' ? 'active' : ''}`}
                >
                  <span>Finalizados</span>
                  <span className="desktop-tab-badge">{tabCountFinalizados}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTableTab('todos');
                    setCurrentPage(1);
                  }}
                  className={`desktop-tab-btn ${tableTab === 'todos' ? 'active' : ''}`}
                >
                  <span>Todos</span>
                  <span className="desktop-tab-badge">{tabCountTodos}</span>
                </button>
              </div>
            </div>

            {/* Tabela Compacta de Bookings */}
            <div className="desktop-table-card">
              <div className="desktop-table-scroll">
                <table className="desktop-compact-table">
                  <thead>
                    <tr>
                      <th className="sortable" onClick={() => handleSort('certificateNumber')}>
                        Certificado {renderSortIcon('certificateNumber')}
                      </th>
                      <th className="sortable" onClick={() => handleSort('bookingNumber')}>
                        Booking {renderSortIcon('bookingNumber')}
                      </th>
                      <th className="sortable" onClick={() => handleSort('exporter')}>
                        Exportador {renderSortIcon('exporter')}
                      </th>
                      <th className="sortable" onClick={() => handleSort('vesselVoyage')}>
                        Navio / Viagem {renderSortIcon('vesselVoyage')}
                      </th>
                      <th className="sortable" onClick={() => handleSort('local')}>
                        Local {renderSortIcon('local')}
                      </th>
                      <th className="sortable" onClick={() => handleSort('containers')}>
                        Containers {renderSortIcon('containers')}
                      </th>
                      <th className="sortable" onClick={() => handleSort('status')}>
                        Status {renderSortIcon('status')}
                      </th>
                      <th>Pendência</th>
                      <th style={{ textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedBookings.map(b => {
                      const exp = exportadores.find(e => e.id === b.exporterId)?.name || 'N/A';
                      const loc = locais.find(l => l.id === b.locationId)?.name || 'N/A';
                      const contCount = b.containers?.length || 0;

                      const statusColors = {
                        Pendente: 'badge-pending',
                        'Em andamento': 'badge-progress',
                        Finalizado: 'badge-success'
                      };

                      return (
                        <tr key={b.id}>
                          <td className="col-certificado">{b.certificateNumber}</td>
                          <td className="col-booking">
                            <div>{b.bookingNumber}</div>
                            {searchQuery.trim() &&
                              getMatchedContainers(b, searchQuery).map(mc => (
                                <div
                                  key={mc.id || mc.containerNumber}
                                  style={{
                                    fontSize: '11px',
                                    color: 'var(--color-brand)',
                                    fontWeight: '700',
                                    marginTop: '2px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    backgroundColor: 'rgba(197, 168, 128, 0.15)',
                                    padding: '1px 5px',
                                    borderRadius: '4px'
                                  }}
                                >
                                  📦 {mc.containerNumber}
                                </div>
                              ))}
                          </td>
                          <td
                            title={exp}
                            style={{
                              maxWidth: '165px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {exp}
                          </td>
                          <td
                            title={b.vesselVoyage || '-'}
                            style={{
                              maxWidth: '135px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {b.vesselVoyage || '-'}
                          </td>
                          <td
                            title={loc}
                            style={{
                              maxWidth: '125px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {loc}
                          </td>
                          <td>
                            <span className="col-containers-count">{contCount} cont.</span>
                          </td>
                          <td>
                            <span className={`badge ${statusColors[b.status] || 'badge-pending'}`}>
                              {(b.status || 'Pendente').toUpperCase()}
                            </span>
                          </td>
                          <td>
                            {b.pendingItem ? (
                              <span
                                style={{
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                  color: '#ef4444',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  border: '1px solid #ef4444',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                ⚠️ {b.pendingItem}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>-</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="desktop-row-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  setInitialOpenUpdateRomaneio(false);
                                  setSelectedBookingId(b.id);
                                }}
                                className="btn-abrir-booking"
                              >
                                Abrir Booking
                              </button>

                              {(user.role === 'ADM' ||
                                (b.status !== 'Finalizado' && user.role !== 'Exportador')) && (
                                <div style={{ position: 'relative' }}>
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      setOpenActionMenuId(
                                        openActionMenuId === b.id ? null : b.id
                                      );
                                    }}
                                    className="btn-dots-menu"
                                    title="Mais opções"
                                  >
                                    <MoreVertical size={15} />
                                  </button>

                                  {openActionMenuId === b.id && (
                                    <div className="desktop-dropdown-menu">
                                      {b.status !== 'Finalizado' &&
                                        user.role !== 'Exportador' && (
                                          <button
                                            type="button"
                                            onClick={e => {
                                              setOpenActionMenuId(null);
                                              handleFinalizeBooking(b.id, e);
                                            }}
                                            className="desktop-dropdown-item"
                                          >
                                            <CheckCircle2
                                              size={14}
                                              style={{ color: '#10b981' }}
                                            />
                                            <span>Finalizar</span>
                                          </button>
                                        )}

                                      {user.role === 'ADM' && (
                                        <button
                                          type="button"
                                          onClick={e => {
                                            setOpenActionMenuId(null);
                                            handleDeleteBooking(b.id, e);
                                          }}
                                          className="desktop-dropdown-item danger"
                                        >
                                          <Trash2 size={14} />
                                          <span>Excluir</span>
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {displayedBookings.length === 0 && (
                      <tr>
                        <td
                          colSpan="9"
                          style={{
                            textAlign: 'center',
                            padding: '36px',
                            color: 'var(--text-muted)'
                          }}
                        >
                          Nenhum booking encontrado com os filtros aplicados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginação com quantidade de resultados */}
              <div className="desktop-pagination-bar">
                <div className="desktop-pagination-info">
                  {totalItems > 0
                    ? `Mostrando ${paginationStart}–${paginationEnd} de ${totalItems} bookings`
                    : '0 bookings'}
                </div>

                <div className="desktop-pagination-controls">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Exibir:</span>
                    <select
                      value={pageSize}
                      onChange={e => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="desktop-page-size-select"
                    >
                      <option value={15}>15 por tela</option>
                      <option value={25}>25 por tela</option>
                      <option value={50}>50 por tela</option>
                      <option value={100}>100 por tela</option>
                    </select>
                  </div>

                  <div className="desktop-page-nav-btns">
                    <button
                      type="button"
                      disabled={safeCurrentPage === 1}
                      onClick={() => setCurrentPage(1)}
                      className="btn-page-nav"
                      title="Primeira página"
                    >
                      &laquo;
                    </button>
                    <button
                      type="button"
                      disabled={safeCurrentPage === 1}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      className="btn-page-nav"
                      title="Página anterior"
                    >
                      &lsaquo;
                    </button>
                    <span style={{ padding: '0 8px', fontWeight: '700' }}>
                      Página {safeCurrentPage} de {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      className="btn-page-nav"
                      title="Próxima página"
                    >
                      &rsaquo;
                    </button>
                    <button
                      type="button"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={() => setCurrentPage(totalPages)}
                      className="btn-page-nav"
                      title="Última página"
                    >
                      &raquo;
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : currentTab === 'yard-inventory' ? (
          <YardInventoryView user={user} />
        ) : currentTab === 'containers-sem-booking' ? (
          <FieldContainersView user={user} />
        ) : currentTab === 'analytics-reports' ? (
          <AnalyticsReportsView
            bookings={bookings}
            fieldPendingContainers={fieldPendingContainers}
            exportadores={exportadores}
            locais={locais}
            user={user}
            onOpenBooking={id => setSelectedBookingId(id)}
            onOpenReport={(id, type) => setActiveReport({ id, type: type || 'administrative' })}
            onBackToBookings={() => setCurrentTab('bookings')}
          />
        ) : currentTab === 'exportadores' ? (
          <ExportadoresList onDataChange={handleRefreshData} />
        ) : currentTab === 'locais' ? (
          <LocaisList onDataChange={handleRefreshData} />
        ) : currentTab === 'inspectors' ? (
          <InspectorsList onDataChange={handleRefreshData} />
        ) : currentTab === 'usuarios' && user.role === 'ADM' ? (
          <UsersList onDataChange={handleRefreshData} />
        ) : currentTab === 'field-portal' ? (
          <MobileAppView
            user={user}
            onLogout={handleLogout}
            hideHeader={true}
            onRefresh={handleSystemRefresh}
            isRefreshing={isRefreshing}
          />
        ) : (
          /* Configurações */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px' }}>
            <div
              className="glass-panel"
              style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <h3
                style={{
                  fontSize: '18px',
                  fontWeight: '800',
                  color: 'var(--text-primary)',
                  margin: 0
                }}
              >
                Configurações do Sistema
              </h3>

              <div>
                <label>Servidor de Sincronização</label>
                <input
                  type="text"
                  placeholder="IP do Servidor (ex: 192.168.1.15)"
                  value={serverIp}
                  onChange={e => handleServerIpChange(e.target.value)}
                  style={{ padding: '10px' }}
                />
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    fontStyle: 'italic',
                    marginTop: '4px',
                    display: 'block'
                  }}
                >
                  Deixe em branco para usar o IP atual ({window.location.hostname}). Funciona em
                  Wi-Fi, 5G ou VPN (Tailscale).
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '14px'
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: '600' }}>Status da Rede</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: isOnline ? '#10b981' : '#ef4444'
                    }}
                  />
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: '700',
                      color: isOnline ? '#10b981' : 'var(--text-muted)'
                    }}
                  >
                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                  <input
                    type="checkbox"
                    checked={isOnline}
                    onChange={() => setIsOnline(!isOnline)}
                    style={{ width: '32px', height: '16px', borderRadius: '10px', cursor: 'pointer' }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '14px'
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: '600' }}>Manutenção de Cache</span>
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      window.confirm(
                        'Deseja limpar o cache e atualizar o aplicativo para a versão mais recente?'
                      )
                    ) {
                      if ('serviceWorker' in navigator) {
                        const registrations = await navigator.serviceWorker.getRegistrations();
                        for (let registration of registrations) {
                          await registration.unregister();
                        }
                      }
                      if ('caches' in window) {
                        const keys = await caches.keys();
                        for (let key of keys) {
                          await caches.delete(key);
                        }
                      }
                      window.location.reload(true);
                    }
                  }}
                  className="btn btn-secondary"
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    color: 'var(--color-brand)',
                    fontWeight: '700'
                  }}
                >
                  🔄 Limpar Cache &amp; Atualizar Sistema
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
