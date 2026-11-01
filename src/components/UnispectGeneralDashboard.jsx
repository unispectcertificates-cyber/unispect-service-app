import { useState, useMemo } from 'react';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Hourglass,
  ClipboardList,
  Package,
  Layers,
  ArrowRight,
  ChevronDown,
  Filter,
  RotateCcw,
  TrendingUp,
  ShieldCheck,
  FolderOpen,
  PieChart,
  BarChart3,
  ExternalLink,
  Clock,
  AlertCircle
} from 'lucide-react';
import { parseDate, formatDateYMD, getBookingEntryDate } from '../utils/analyticsService';

export default function UnispectGeneralDashboard({
  allBookings = [],
  clients = [],
  user = null,
  selectedClientId = 'client_interport',
  onSelectClient = () => {},
  onAccessOperation = () => {},
  onRefresh = () => {}
}) {
  // 1. Estados de Filtro de Período
  const [periodPreset, setPeriodPreset] = useState('all'); // 'all' | '2026' | 'this_month' | 'last_month' | 'last_30_days' | 'custom'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Dropdown de seleção de cliente para a ação rápida
  const [targetClientId, setTargetClientId] = useState(selectedClientId || 'client_interport');

  // Atualiza targetClientId quando selectedClientId mudar externamente
  useState(() => {
    if (selectedClientId) setTargetClientId(selectedClientId);
  }, [selectedClientId]);

  // 2. Resolução do intervalo de datas do período
  const activeDateRange = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    if (periodPreset === 'all') {
      return { start: null, end: null, label: 'Todo o histórico (sem restrição)' };
    }

    if (periodPreset === '2026') {
      const start = new Date(2026, 0, 1, 0, 0, 0, 0);
      const end = new Date(2026, 11, 31, 23, 59, 59, 999);
      return { start, end, label: 'Ano de 2026 (01/01/2026 a 31/12/2026)' };
    }

    if (periodPreset === 'this_month') {
      const start = new Date(curYear, curMonth, 1, 0, 0, 0, 0);
      const end = new Date(curYear, curMonth + 1, 0, 23, 59, 59, 999);
      return {
        start,
        end,
        label: `Mês Atual (${String(curMonth + 1).padStart(2, '0')}/${curYear})`
      };
    }

    if (periodPreset === 'last_month') {
      const prevMonth = curMonth === 0 ? 11 : curMonth - 1;
      const prevYear = curMonth === 0 ? curYear - 1 : curYear;
      const start = new Date(prevYear, prevMonth, 1, 0, 0, 0, 0);
      const end = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59, 999);
      return {
        start,
        end,
        label: `Mês Anterior (${String(prevMonth + 1).padStart(2, '0')}/${prevYear})`
      };
    }

    if (periodPreset === 'last_30_days') {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { start, end, label: 'Últimos 30 dias' };
    }

    if (periodPreset === 'custom') {
      let start = null;
      let end = null;
      if (dateFrom) {
        const [y, m, d] = dateFrom.split('-').map(Number);
        start = new Date(y, m - 1, d, 0, 0, 0, 0);
      }
      if (dateTo) {
        const [y, m, d] = dateTo.split('-').map(Number);
        end = new Date(y, m - 1, d, 23, 59, 59, 999);
      }
      return {
        start,
        end,
        label: `Personalizado (${dateFrom || 'Início'} a ${dateTo || 'Hoje'})`
      };
    }

    return { start: null, end: null, label: 'Personalizado' };
  }, [periodPreset, dateFrom, dateTo]);

  // 3. Filtragem e Atribuição Estrita de Bookings (Sem duplicação de registros)
  const filteredBookings = useMemo(() => {
    const { start, end } = activeDateRange;
    return (allBookings || []).filter(b => {
      if (!start && !end) return true;
      const bDate = getBookingEntryDate(b);
      if (!bDate) return true; // Mantém registros sem data no filtro global
      if (start && bDate.getTime() < start.getTime()) return false;
      if (end && bDate.getTime() > end.getTime()) return false;
      return true;
    });
  }, [allBookings, activeDateRange]);

  // 4. Mapeamento dos Clientes e Atribuição de Bookings
  const clientMetrics = useMemo(() => {
    // Normalização dos clientes cadastrados
    const clientList = [...clients];
    if (!clientList.some(c => c.id === 'client_interport')) {
      clientList.unshift({
        id: 'client_interport',
        name: 'INTERPORT Logística',
        code: 'INTERPORT',
        isDefault: true,
        description: 'Terminal e Operador Logístico Principal'
      });
    }

    // Mapa de métricas por cliente
    const map = new Map();
    clientList.forEach(c => {
      map.set(c.id, {
        client: c,
        totalBookings: 0,
        concludedBookings: 0,
        inProgressBookings: 0,
        pendingBookings: 0,
        totalContainers: 0,
        concludedContainers: 0,
        inProgressContainers: 0,
        pendingContainers: 0
      });
    });

    // Cada booking é computado estritamente para UM único cliente (zero duplicidade)
    filteredBookings.forEach(b => {
      // Regra de isolamento e compatibilidade histórica:
      // Bookings sem clientId ou vinculados a client_interport pertencem à INTERPORT
      let cId = b.clientId;
      if (!cId || !map.has(cId)) {
        cId = 'client_interport';
      }

      const metric = map.get(cId);
      if (!metric) return;

      metric.totalBookings++;

      const st = (b.status || '').toLowerCase().trim();
      const isConcluded = st === 'finalizado' || st === 'estufado' || st === 'concluido' || st === 'concluído';
      const isInProgress = st === 'em andamento';

      if (isConcluded) {
        metric.concludedBookings++;
      } else if (isInProgress) {
        metric.inProgressBookings++;
      } else {
        metric.pendingBookings++;
      }

      const cList = Array.isArray(b.containers) ? b.containers : [];
      metric.totalContainers += cList.length;

      if (isConcluded) {
        metric.concludedContainers += cList.length;
      } else if (isInProgress) {
        metric.inProgressContainers += cList.length;
      } else {
        metric.pendingContainers += cList.length;
      }
    });

    return Array.from(map.values());
  }, [clients, filteredBookings]);

  // 5. Totais Consolidados Unispect (Soma dos Clientes)
  const consolidated = useMemo(() => {
    return clientMetrics.reduce(
      (acc, curr) => {
        acc.totalBookings += curr.totalBookings;
        acc.concludedBookings += curr.concludedBookings;
        acc.inProgressBookings += curr.inProgressBookings;
        acc.pendingBookings += curr.pendingBookings;
        acc.totalContainers += curr.totalContainers;
        acc.concludedContainers += curr.concludedContainers;
        acc.inProgressContainers += curr.inProgressContainers;
        acc.pendingContainers += curr.pendingContainers;
        return acc;
      },
      {
        totalBookings: 0,
        concludedBookings: 0,
        inProgressBookings: 0,
        pendingBookings: 0,
        totalContainers: 0,
        concludedContainers: 0,
        inProgressContainers: 0,
        pendingContainers: 0
      }
    );
  }, [clientMetrics]);

  // Taxas de Conclusão (%)
  const bookingCompletionRate = consolidated.totalBookings > 0
    ? Math.round((consolidated.concludedBookings / consolidated.totalBookings) * 100)
    : 0;

  const containerCompletionRate = consolidated.totalContainers > 0
    ? Math.round((consolidated.concludedContainers / consolidated.totalContainers) * 100)
    : 0;

  // Handler para o botão "Acessar operação"
  const handleAccessOperationClick = (clientId) => {
    const finalId = clientId || targetClientId || 'client_interport';
    if (onSelectClient) onSelectClient(finalId);
    if (onAccessOperation) onAccessOperation(finalId);
  };

  return (
    <div className="unispect-general-dashboard" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ── SEÇÃO 1: CABEÇALHO DO DASHBOARD GERAL E ACESSO RÁPIDO ── */}
      <div style={{
        background: 'linear-gradient(135deg, #131b2e 0%, #0d1127 100%)',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid rgba(226, 178, 62, 0.25)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, var(--color-brand), #92400e)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(180, 83, 9, 0.3)'
          }}>
            <BarChart3 size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#ffffff', margin: 0, letterSpacing: '-0.02em' }}>
                Dashboard Geral Unispect
              </h1>
              <span style={{
                background: 'rgba(226, 178, 62, 0.15)',
                color: 'var(--color-brand)',
                fontSize: '11px',
                fontWeight: '800',
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(226, 178, 62, 0.3)'
              }}>
                MULTI-CLIENTE
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0 0' }}>
              Totais consolidados corporativos e controle de acesso direto às operações
            </p>
          </div>
        </div>

        {/* ── BARRA DE SELEÇÃO DE CLIENTE COM SETA E BOTÃO ACESSAR OPERAÇÃO ── */}
        <div id="box-acesso-operacao" style={{
          background: 'rgba(255, 255, 255, 0.05)',
          padding: '10px 16px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#cbd5e1', fontSize: '12px', fontWeight: '700' }}>
            <Building2 size={16} style={{ color: 'var(--color-brand)' }} />
            <span>Operação do Cliente:</span>
          </div>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <select
              id="select-cliente-operacao"
              value={targetClientId}
              onChange={(e) => setTargetClientId(e.target.value)}
              style={{
                appearance: 'none',
                WebkitAppearance: 'none',
                backgroundColor: '#1e293b',
                color: '#ffffff',
                border: '1px solid rgba(226, 178, 62, 0.4)',
                padding: '8px 36px 8px 12px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                outline: 'none',
                minWidth: '220px'
              }}
            >
              {clients.map(c => (
                <option key={c.id} value={c.id} style={{ backgroundColor: '#131b2e', color: '#ffffff' }}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              style={{
                position: 'absolute',
                right: '10px',
                color: 'var(--color-brand)',
                pointerEvents: 'none'
              }}
            />
          </div>

          <button
            type="button"
            id="btn-acessar-operacao"
            onClick={() => handleAccessOperationClick(targetClientId)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--color-brand)',
              color: '#ffffff',
              border: 'none',
              padding: '9px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '800',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(180, 83, 9, 0.35)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.15)'}
            onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1.0)'}
            title="Abrir painel de bookings e vistorias do cliente selecionado"
          >
            <FolderOpen size={16} />
            <span>Acessar operação</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* ── SEÇÃO 2: FILTRO DE PERÍODO ── */}
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        padding: '16px 20px',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '800', color: 'var(--color-brand)', textTransform: 'uppercase' }}>
            <Calendar size={15} />
            <span>Filtro de Período:</span>
          </div>

          {/* Botões de atalho rápido */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'Todo o Histórico' },
              { id: '2026', label: 'Ano 2026' },
              { id: 'this_month', label: 'Este Mês' },
              { id: 'last_month', label: 'Mês Anterior' },
              { id: 'last_30_days', label: 'Últimos 30 dias' },
              { id: 'custom', label: 'Personalizado' }
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodPreset(p.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: periodPreset === p.id ? '800' : '600',
                  border: periodPreset === p.id ? '1px solid var(--color-brand)' : '1px solid var(--border-color)',
                  backgroundColor: periodPreset === p.id ? 'var(--color-brand-light)' : 'var(--bg-tertiary)',
                  color: periodPreset === p.id ? 'var(--color-brand)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Inputs de data personalizada */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700' }}>De:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPeriodPreset('custom');
              }}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                fontSize: '12px',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)'
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700' }}>Até:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPeriodPreset('custom');
              }}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                fontSize: '12px',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          {(periodPreset !== 'all' || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setPeriodPreset('all');
                setDateFrom('');
                setDateTo('');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'transparent',
                color: 'var(--text-muted)',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer'
              }}
              title="Restaurar filtro para todo o histórico"
            >
              <RotateCcw size={12} />
              <span>Limpar</span>
            </button>
          )}
        </div>
      </div>

      {/* ── SEÇÃO 3: TOTAIS CONSOLIDADOS UNISPECT ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Totais Consolidados Unispect
            </h2>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>
              • {activeDateRange.label}
            </span>
          </div>

          <span style={{
            fontSize: '11px',
            color: '#10b981',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(16, 185, 129, 0.1)',
            padding: '4px 10px',
            borderRadius: '20px'
          }}>
            <ShieldCheck size={14} />
            Soma exata dos ambientes (zero duplicidade)
          </span>
        </div>

        {/* Grid de Cards de Totais */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '16px'
        }}>
          {/* Card 1: Total Bookings */}
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '18px 20px',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Total de Bookings
                </span>
                <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', margin: '4px 0 2px 0' }}>
                  {consolidated.totalBookings.toLocaleString('pt-BR')}
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Total auditado no período
                </span>
              </div>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <ClipboardList size={22} />
              </div>
            </div>
          </div>

          {/* Card 2: Concluídos */}
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '18px 20px',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#10b981', textTransform: 'uppercase' }}>
                  Concluídos
                </span>
                <div style={{ fontSize: '28px', fontWeight: '800', color: '#10b981', margin: '4px 0 2px 0' }}>
                  {consolidated.concludedBookings.toLocaleString('pt-BR')}
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {bookingCompletionRate}% taxa de finalização
                </span>
              </div>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <CheckCircle2 size={22} />
              </div>
            </div>
            <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
              <div style={{ width: `${bookingCompletionRate}%`, height: '100%', backgroundColor: '#10b981', borderRadius: '3px' }} />
            </div>
          </div>

          {/* Card 3: Em andamento */}
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '18px 20px',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#3b82f6', textTransform: 'uppercase' }}>
                  Em andamento
                </span>
                <div style={{ fontSize: '28px', fontWeight: '800', color: '#3b82f6', margin: '4px 0 2px 0' }}>
                  {consolidated.inProgressBookings.toLocaleString('pt-BR')}
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Em execução no pátio
                </span>
              </div>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Hourglass size={22} />
              </div>
            </div>
            <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
              <div style={{ width: `${consolidated.totalBookings > 0 ? (consolidated.inProgressBookings / consolidated.totalBookings) * 100 : 0}%`, height: '100%', backgroundColor: '#3b82f6', borderRadius: '3px' }} />
            </div>
          </div>

          {/* Card 4: Pendentes */}
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '18px 20px',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#f59e0b', textTransform: 'uppercase' }}>
                  Pendentes
                </span>
                <div style={{ fontSize: '28px', fontWeight: '800', color: '#f59e0b', margin: '4px 0 2px 0' }}>
                  {consolidated.pendingBookings.toLocaleString('pt-BR')}
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Aguardando estufagem
                </span>
              </div>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                color: '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Clock size={22} />
              </div>
            </div>
            <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
              <div style={{ width: `${consolidated.totalBookings > 0 ? (consolidated.pendingBookings / consolidated.totalBookings) * 100 : 0}%`, height: '100%', backgroundColor: '#f59e0b', borderRadius: '3px' }} />
            </div>
          </div>

          {/* Card 5: Não concluídos (Agrupamento: Em andamento + Pendentes) */}
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '18px 20px',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '800', color: '#ef4444', textTransform: 'uppercase' }}>
                    Não concluídos
                  </span>
                  <span style={{ fontSize: '9px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>
                    Agrupamento
                  </span>
                </div>
                <div style={{ fontSize: '28px', fontWeight: '800', color: '#ef4444', margin: '4px 0 2px 0' }}>
                  {(consolidated.inProgressBookings + consolidated.pendingBookings).toLocaleString('pt-BR')}
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {consolidated.inProgressBookings} andamento + {consolidated.pendingBookings} pendentes
                </span>
              </div>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertCircle size={22} />
              </div>
            </div>
            <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
              <div style={{ width: `${100 - bookingCompletionRate}%`, height: '100%', backgroundColor: '#ef4444', borderRadius: '3px' }} />
            </div>
          </div>

          {/* Card 6: Total Contêineres */}
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '18px 20px',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Total de Contêineres
                </span>
                <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', margin: '4px 0 2px 0' }}>
                  {consolidated.totalContainers.toLocaleString('pt-BR')}
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Concluídos: {consolidated.concludedContainers.toLocaleString('pt-BR')} • Em aberto: {(consolidated.inProgressContainers + consolidated.pendingContainers).toLocaleString('pt-BR')}
                </span>
              </div>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                color: '#a855f7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Package size={22} />
              </div>
            </div>
            <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
              <div style={{ width: `${containerCompletionRate}%`, height: '100%', backgroundColor: '#a855f7', borderRadius: '3px' }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── SEÇÃO 4: INDICADORES SEPARADOS POR CLIENTE ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Indicadores Separados por Cliente
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Distribuição isolada de volumes, conclusões e taxa de finalização por terminal ou operador
            </p>
          </div>
        </div>

        {/* Cards Individuais dos Clientes */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '16px',
          marginBottom: '20px'
        }}>
          {clientMetrics.map(({ client, totalBookings, concludedBookings, inProgressBookings, pendingBookings, totalContainers, concludedContainers, inProgressContainers, pendingContainers }) => {
            const clientRate = totalBookings > 0 ? Math.round((concludedBookings / totalBookings) * 100) : 0;
            const isInterport = client.id === 'client_interport';

            return (
              <div
                key={client.id}
                id={`card-client-${client.id}`}
                style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: '14px',
                  padding: '20px',
                  border: isInterport ? '1px solid rgba(226, 178, 62, 0.4)' : '1px solid var(--border-color)',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  position: 'relative'
                }}
              >
                {/* Header do Card do Cliente */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                          {client.name}
                        </h3>
                        <span style={{
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--color-brand)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '800'
                        }}>
                          {client.code || 'CLI'}
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
                        {client.description || (isInterport ? 'Terminal e Operador Principal' : 'Cliente Operacional Parceiro')}
                      </p>
                    </div>

                    <span style={{
                      fontSize: '11px',
                      fontWeight: '800',
                      padding: '3px 8px',
                      borderRadius: '12px',
                      backgroundColor: isInterport ? 'rgba(226, 178, 62, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                      color: isInterport ? 'var(--color-brand)' : '#3b82f6',
                      border: isInterport ? '1px solid rgba(226, 178, 62, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)'
                    }}>
                      {isInterport ? 'PRINCIPAL' : 'ATIVO'}
                    </span>
                  </div>

                  {/* Barra de Conclusão do Cliente */}
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '700', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Taxa de Conclusão</span>
                      <span style={{ color: clientRate >= 50 ? '#10b981' : '#f59e0b' }}>{clientRate}%</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${clientRate}%`, height: '100%', backgroundColor: clientRate >= 50 ? '#10b981' : '#f59e0b', borderRadius: '3px' }} />
                    </div>
                  </div>
                </div>

                {/* Grid interno de métricas */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                  backgroundColor: 'var(--bg-tertiary)',
                  padding: '12px',
                  borderRadius: '10px'
                }}>
                  <div>
                    <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Bookings ({totalBookings})</span>
                    <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '6px' }}>
                      <span style={{ color: '#10b981', fontWeight: '700' }}>• {concludedBookings} concluídos</span>
                      <span style={{ color: '#3b82f6', fontWeight: '700' }}>• {inProgressBookings} em andamento</span>
                      <span style={{ color: '#f59e0b', fontWeight: '700' }}>• {pendingBookings} pendentes</span>
                      <span style={{ color: '#ef4444', fontWeight: '800', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '2px' }}>• {inProgressBookings + pendingBookings} não concluídos</span>
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Contêineres ({totalContainers})</span>
                    <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '6px' }}>
                      <span style={{ color: '#10b981', fontWeight: '700' }}>• {concludedContainers} concluídos</span>
                      <span style={{ color: '#3b82f6', fontWeight: '700' }}>• {inProgressContainers} em andamento</span>
                      <span style={{ color: '#f59e0b', fontWeight: '700' }}>• {pendingContainers} pendentes</span>
                      <span style={{ color: '#ef4444', fontWeight: '800', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '2px' }}>• {inProgressContainers + pendingContainers} não concluídos</span>
                    </div>
                  </div>
                </div>

                {/* Botão Acessar Operação do Cliente */}
                <button
                  type="button"
                  id={`btn-acessar-${client.id}`}
                  onClick={() => handleAccessOperationClick(client.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-brand)';
                    e.currentTarget.style.color = '#ffffff';
                    e.currentTarget.style.borderColor = 'var(--color-brand)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                  }}
                >
                  <FolderOpen size={15} />
                  <span>Acessar operação de {client.code || client.name}</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Tabela Resumo Consolidada Comparativa */}
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
            <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Matriz Comparativa de Ambientes e Verificação de Soma
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 14px', fontWeight: '800' }}>Cliente / Operação</th>
                  <th style={{ padding: '12px 14px', fontWeight: '800' }}>Código</th>
                  <th style={{ padding: '12px 14px', fontWeight: '800', textAlign: 'right' }}>Total Bookings</th>
                  <th style={{ padding: '12px 14px', fontWeight: '800', textAlign: 'right', color: '#10b981' }}>Concluídos</th>
                  <th style={{ padding: '12px 14px', fontWeight: '800', textAlign: 'right', color: '#3b82f6' }}>Em Andamento</th>
                  <th style={{ padding: '12px 14px', fontWeight: '800', textAlign: 'right', color: '#f59e0b' }}>Pendentes</th>
                  <th style={{ padding: '12px 14px', fontWeight: '800', textAlign: 'right', color: '#ef4444' }}>Não Concluídos</th>
                  <th style={{ padding: '12px 14px', fontWeight: '800', textAlign: 'right' }}>Total Contêineres</th>
                  <th style={{ padding: '12px 14px', fontWeight: '800', textAlign: 'center' }}>% Conclusão</th>
                  <th style={{ padding: '12px 14px', fontWeight: '800', textAlign: 'center' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {clientMetrics.map(({ client, totalBookings, concludedBookings, inProgressBookings, pendingBookings, totalContainers }) => {
                  const rate = totalBookings > 0 ? Math.round((concludedBookings / totalBookings) * 100) : 0;
                  const naoConcluidos = inProgressBookings + pendingBookings;
                  return (
                    <tr
                      key={client.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '12px 14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Building2 size={16} style={{ color: 'var(--color-brand)' }} />
                          <span>{client.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                        <span style={{ backgroundColor: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '800' }}>
                          {client.code}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: '700' }}>
                        {totalBookings.toLocaleString('pt-BR')}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#10b981', fontWeight: '700' }}>
                        {concludedBookings.toLocaleString('pt-BR')}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#3b82f6', fontWeight: '700' }}>
                        {inProgressBookings.toLocaleString('pt-BR')}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#f59e0b', fontWeight: '700' }}>
                        {pendingBookings.toLocaleString('pt-BR')}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#ef4444', fontWeight: '800' }}>
                        {naoConcluidos.toLocaleString('pt-BR')}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: '700' }}>
                        {totalContainers.toLocaleString('pt-BR')}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '800', color: rate >= 50 ? '#10b981' : '#f59e0b' }}>
                        {rate}%
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleAccessOperationClick(client.id)}
                          style={{
                            background: 'none',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            color: 'var(--color-brand)',
                            fontSize: '11px',
                            fontWeight: '800',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <span>Acessar</span>
                          <ArrowRight size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* LINHA DE TOTALIZAÇÃO CONSOLIDADA */}
                <tr style={{ backgroundColor: 'rgba(226, 178, 62, 0.08)', borderTop: '2px solid var(--border-color)', fontWeight: '800' }}>
                  <td style={{ padding: '14px 14px', color: 'var(--text-primary)' }}>
                    TOTAL CONSOLIDADO UNISPECT
                  </td>
                  <td style={{ padding: '14px 14px', color: 'var(--color-brand)' }}>
                    GLOBAL
                  </td>
                  <td style={{ padding: '14px 14px', textAlign: 'right', color: 'var(--text-primary)', fontSize: '14px' }}>
                    {consolidated.totalBookings.toLocaleString('pt-BR')}
                  </td>
                  <td style={{ padding: '14px 14px', textAlign: 'right', color: '#10b981', fontSize: '14px' }}>
                    {consolidated.concludedBookings.toLocaleString('pt-BR')}
                  </td>
                  <td style={{ padding: '14px 14px', textAlign: 'right', color: '#3b82f6', fontSize: '14px' }}>
                    {consolidated.inProgressBookings.toLocaleString('pt-BR')}
                  </td>
                  <td style={{ padding: '14px 14px', textAlign: 'right', color: '#f59e0b', fontSize: '14px' }}>
                    {consolidated.pendingBookings.toLocaleString('pt-BR')}
                  </td>
                  <td style={{ padding: '14px 14px', textAlign: 'right', color: '#ef4444', fontSize: '14px' }}>
                    {(consolidated.inProgressBookings + consolidated.pendingBookings).toLocaleString('pt-BR')}
                  </td>
                  <td style={{ padding: '14px 14px', textAlign: 'right', color: 'var(--text-primary)', fontSize: '14px' }}>
                    {consolidated.totalContainers.toLocaleString('pt-BR')}
                  </td>
                  <td style={{ padding: '14px 14px', textAlign: 'center', color: bookingCompletionRate >= 50 ? '#10b981' : '#f59e0b', fontSize: '14px' }}>
                    {bookingCompletionRate}%
                  </td>
                  <td style={{ padding: '14px 14px', textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '800' }}>
                      ✔ 100% EXATO
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
