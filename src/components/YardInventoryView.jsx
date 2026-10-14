import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  History,
  Layers,
  Filter,
  RefreshCw,
  Plus,
  ShieldCheck,
  ChevronRight,
  Clock,
  User,
  Calendar,
  X,
  Radio,
  FileText,
  AlertCircle,
  Eye,
  Check,
  ArrowRight
} from 'lucide-react';
import { useLocais } from '../db';
import {
  subscribeYardAudits,
  subscribeYardPassages,
  yardRepo
} from '../utils/yardService';
import {
  startYardAuditSession,
  getAuditSessionSummary
} from '../utils/yardInventory';
import { formatContainerNumber } from '../utils/containerOcr';

export default function YardInventoryView({ user }) {
  const locais = useLocais();
  const isAdm = user?.role === 'ADM';

  // Subscrições em tempo real
  const [passages, setPassages] = useState([]);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);

  // Navegação de abas internas
  const [activeTab, setActiveTab] = useState('confirmados'); // 'confirmados' | 'revisao' | 'saidas' | 'historico'

  // Busca e Filtros
  const [search, setSearch] = useState('');
  const [yardFilter, setYardFilter] = useState('todos');

  // Modais
  const [timelinePassage, setTimelinePassage] = useState(null);
  const [exitModalPassage, setExitModalPassage] = useState(null);
  const [exitNotes, setExitNotes] = useState('');
  const [isProcessingExit, setIsProcessingExit] = useState(false);
  const [exitError, setExitError] = useState('');

  // Modal de Criação de Conferência
  const [showCreateAuditModal, setShowCreateAuditModal] = useState(false);
  const [newAuditYardId, setNewAuditYardId] = useState(locais[0]?.id || '');
  const [isCreatingAudit, setIsCreatingAudit] = useState(false);

  // Modal de Detalhe da Conferência / Reconciliação
  const [selectedAuditDetail, setSelectedAuditDetail] = useState(null);
  const [isClosingAudit, setIsClosingAudit] = useState(false);
  const [closingError, setClosingError] = useState('');

  // Feedback Toast
  const [feedback, setFeedback] = useState(null);

  // Carrega passagens e auditorias do Firestore em tempo real
  useEffect(() => {
    setLoading(true);
    const unsubPassages = subscribeYardPassages(
      list => {
        setPassages(list);
        setLoading(false);
      },
      err => {
        console.error('Erro ao escutar passagens:', err);
        setLoading(false);
      }
    );

    const unsubAudits = subscribeYardAudits(
      null,
      list => setAudits(list),
      err => console.error('Erro ao escutar auditorias:', err)
    );

    return () => {
      unsubPassages();
      unsubAudits();
    };
  }, []);

  // Separação por status
  const confirmedPassages = useMemo(() => {
    return passages.filter(p => p.status === 'active');
  }, [passages]);

  const underReviewPassages = useMemo(() => {
    return passages.filter(p => p.status === 'under_review');
  }, [passages]);

  const exitedPassages = useMemo(() => {
    return passages.filter(p => p.status === 'exited');
  }, [passages]);

  // Conflitos pendentes em conferências
  const pendingConflicts = useMemo(() => {
    const list = [];
    audits.forEach(a => {
      if (Array.isArray(a.pendingConflicts)) {
        a.pendingConflicts.forEach(c => {
          if (!c.resolved) list.push({ ...c, auditId: a.id, yardName: a.yardName });
        });
      }
    });
    return list;
  }, [audits]);

  // Filtro genérico aplicado à aba atual
  const filterList = (list) => {
    return list.filter(item => {
      if (yardFilter !== 'todos' && item.yardId !== yardFilter) return false;
      if (!search.trim()) return true;
      const term = search.trim().toUpperCase().replace(/[\s-]/g, '');
      const num = (item.containerNumber || item.normalizedNumber || '').toUpperCase().replace(/[\s-]/g, '');
      const bkg = (item.bookingNumber || '').toUpperCase();
      return num.includes(term) || bkg.includes(term);
    });
  };

  // Contadores gerais
  const activeYardsCount = new Set(confirmedPassages.map(p => p.yardId)).size;

  // Confirmação de Saída pelo Administrador
  const handleConfirmExit = async () => {
    if (!exitModalPassage) return;
    if (!isAdm) {
      setExitError('Apenas administradores podem confirmar a saída de containers.');
      return;
    }

    setIsProcessingExit(true);
    setExitError('');

    try {
      await yardRepo.confirmExitAtomic({
        passageId: exitModalPassage.id,
        actor: { id: user.id || 'adm', name: user.name || user.username || 'Administrador', role: 'ADM' },
        notes: exitNotes.trim()
      });

      setFeedback({
        type: 'success',
        message: `Saída do container ${exitModalPassage.containerNumber} confirmada com sucesso. Lock liberado.`
      });
      setExitModalPassage(null);
      setExitNotes('');
    } catch (err) {
      setExitError(err.message || 'Erro ao confirmar saída.');
    } finally {
      setIsProcessingExit(false);
    }
  };

  // Reafirmar Presença Manual (se encontrado no pátio após revisão)
  const handleReaffirmPresence = async (passage) => {
    try {
      const { doc, runTransaction } = await import('firebase/firestore');
      const { dbFirestore } = await import('../firebase');

      await runTransaction(dbFirestore, async (tx) => {
        const pRef = doc(dbFirestore, 'yardPassages', passage.id);
        const pSnap = await tx.get(pRef);
        if (!pSnap.exists()) throw new Error('Passagem não encontrada.');

        const now = Date.now();
        const event = {
          id: `yev_${passage.id}_${now}_manual`,
          passageId: passage.id,
          containerNumber: passage.containerNumber,
          yardId: passage.yardId,
          type: 'manual_reaffirmation',
          title: 'Presença reafirmada manualmente pelo administrador',
          actor: { id: user.id || 'adm', name: user.name || user.username || 'Administrador', role: user.role || 'ADM' },
          timestamp: now,
          notes: 'Localizado no pátio durante inspeção visual de ausências.'
        };

        tx.set(pRef, {
          ...passage,
          status: 'active',
          lastConfirmedAt: now,
          lastConfirmedBy: { id: user.id || 'adm', name: user.name || user.username || 'Administrador' },
          events: [...(passage.events || []), event],
          updatedAt: now
        });
      });

      setFeedback({
        type: 'success',
        message: `Presença do container ${passage.containerNumber} reafirmada com sucesso.`
      });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao reafirmar presença.' });
    }
  };

  // Criação de nova conferência diária no pátio
  const handleCreateAudit = async () => {
    if (!newAuditYardId) return;
    setIsCreatingAudit(true);
    try {
      const yardObj = locais.find(l => l.id === newAuditYardId);
      const activeInYard = confirmedPassages.filter(p => p.yardId === newAuditYardId);

      const newAudit = startYardAuditSession({
        yardId: newAuditYardId,
        yardName: yardObj?.name || 'Pátio',
        actor: { id: user.id || 'adm', name: user.name || user.username || 'Administrador', role: user.role || 'ADM' },
        activePassagesInYard: activeInYard
      });

      const { setDoc, doc } = await import('firebase/firestore');
      const { dbFirestore } = await import('../firebase');
      await setDoc(doc(dbFirestore, 'yardAudits', newAudit.id), newAudit);

      setFeedback({ type: 'success', message: `Conferência iniciada para ${yardObj?.name || 'Pátio'}.` });
      setShowCreateAuditModal(false);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao criar conferência.' });
    } finally {
      setIsCreatingAudit(false);
    }
  };

  // Resolução de Conflito Administrativo (Leitura atrasada em passagem encerrada)
  const handleResolveConflict = async (conflict, resolution) => {
    if (!isAdm) return;
    try {
      await yardRepo.resolveYardConflictAtomic({
        auditId: conflict.auditId,
        conflictId: conflict.id,
        resolution,
        actor: { id: user.id || 'adm', name: user.name || user.username || 'Administrador', role: 'ADM' },
        notes: `Resolvido via painel administrativo Desktop como "${resolution}".`
      });

      setFeedback({
        type: 'success',
        message: `Conflito do container ${conflict.containerNumber} resolvido.`
      });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao resolver conflito.' });
    }
  };

  // Iniciar Etapa de Fechamento de Conferência
  const handleBeginClosingAudit = async (audit) => {
    setIsClosingAudit(true);
    setClosingError('');
    try {
      await yardRepo.beginYardAuditClosingAtomic({
        auditId: audit.id,
        actor: { id: user.id || 'adm', name: user.name || user.username || 'Supervisor', role: user.role || 'ADM' }
      });
      setFeedback({
        type: 'success',
        message: `Etapa de fechamento iniciada. Aparelhos participantes agora devem reconciliar as sincronizações pendentes.`
      });
    } catch (err) {
      setClosingError(err.message || 'Erro ao iniciar etapa de fechamento.');
    } finally {
      setIsClosingAudit(false);
    }
  };

  // Concluir Fechamento Atômico com Validação Estrita de Sincronização
  const handleFinalizeClosingAudit = async (audit, isPartial = false) => {
    setIsClosingAudit(true);
    setClosingError('');
    try {
      await yardRepo.closeYardAuditAtomic({
        auditId: audit.id,
        actor: { id: user.id || 'adm', name: user.name || user.username || 'Supervisor', role: user.role || 'ADM' },
        isPartial,
        participatingDevices: audit.participatingDevices || {},
        maxStalenessMs: 60000
      });

      setFeedback({
        type: 'success',
        message: `Conferência ${audit.id} fechada com sucesso! Containers ausentes foram encaminhados para revisão.`
      });
      setSelectedAuditDetail(null);
    } catch (err) {
      setClosingError(err.message || 'Erro ao fechar conferência.');
    } finally {
      setIsClosingAudit(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Topo: Título e Botões de Ação ── */}
      <div className="desktop-page-title-row">
        <div className="desktop-page-title-left">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layers size={26} style={{ color: 'var(--color-brand)' }} />
            Inventário do Pátio
          </h1>
          <p>Controle físico de presença, reconciliação de ausências e histórico de passagens de containers</p>
        </div>

        <div className="desktop-page-actions">
          {isAdm && (
            <button
              type="button"
              onClick={() => setShowCreateAuditModal(true)}
              className="btn btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                fontWeight: '800',
                borderRadius: '10px',
                boxShadow: '0 4px 14px rgba(245, 158, 11, 0.25)'
              }}
            >
              <Plus size={16} />
              <span>Nova Conferência Diária</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Feedback Banner ── */}
      {feedback && (
        <div style={{
          padding: '12px 18px',
          borderRadius: '10px',
          fontSize: '13px',
          fontWeight: '700',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          color: feedback.type === 'success' ? '#10b981' : '#ef4444',
          border: `1px solid ${feedback.type === 'success' ? '#10b981' : '#ef4444'}`
        }}>
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Alerta de Conflitos Administrativos Pendentes ── */}
      {pendingConflicts.length > 0 && isAdm && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef4444',
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontWeight: '800' }}>
            <AlertCircle size={18} />
            <span>{pendingConflicts.length} Conflito(s) de Leitura Atrasada Aguardando Decisão Administrativa</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pendingConflicts.map(c => (
              <div key={c.id} style={{
                backgroundColor: 'var(--bg-secondary)',
                padding: '12px 14px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ fontWeight: '800', fontSize: '13px' }}>
                    Container: {c.containerNumber} ({c.yardName || 'Pátio'})
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {c.conflictMessage || 'Leitura recebida após saída confirmada'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleResolveConflict(c, 'keep_exited')}
                    className="btn btn-secondary"
                    style={{ fontSize: '11px', padding: '6px 12px' }}
                  >
                    Confirmar Saída (Manter Encerrado)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolveConflict(c, 'open_new_passage')}
                    className="btn btn-primary"
                    style={{ fontSize: '11px', padding: '6px 12px' }}
                  >
                    Abrir Nova Passagem
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Cards de Estatísticas Globais ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px'
      }}>
        <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Presença Confirmada
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#10b981', marginTop: '4px' }}>
            {confirmedPassages.length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Containers ativos nos pátios
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Ausências sob Revisão
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#f59e0b', marginTop: '4px' }}>
            {underReviewPassages.length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Aguardando verificação humana
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Saídas Identificadas
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#6b7280', marginTop: '4px' }}>
            {exitedPassages.length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Saídas confirmadas por inventário
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Pátios em Monitoramento
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: 'var(--color-brand)', marginTop: '4px' }}>
            {activeYardsCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Locais com presença física
          </div>
        </div>
      </div>

      {/* ── Barra de Navegação de Abas e Filtros ── */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px',
        padding: '12px 16px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '14px'
      }}>
        {/* Abas */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('confirmados')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '800',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: activeTab === 'confirmados' ? 'var(--color-brand)' : 'transparent',
              color: activeTab === 'confirmados' ? '#000' : 'var(--text-secondary)'
            }}
          >
            <CheckCircle2 size={15} />
            <span>Presença Confirmada ({confirmedPassages.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('revisao')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '800',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: activeTab === 'revisao' ? '#f59e0b' : 'transparent',
              color: activeTab === 'revisao' ? '#000' : 'var(--text-secondary)'
            }}
          >
            <AlertTriangle size={15} />
            <span>Ausências em Revisão ({underReviewPassages.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('saidas')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '800',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: activeTab === 'saidas' ? '#3b82f6' : 'transparent',
              color: activeTab === 'saidas' ? '#fff' : 'var(--text-secondary)'
            }}
          >
            <LogOut size={15} />
            <span>Saídas Identificadas ({exitedPassages.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('historico')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '800',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: activeTab === 'historico' ? '#8b5cf6' : 'transparent',
              color: activeTab === 'historico' ? '#fff' : 'var(--text-secondary)'
            }}
          >
            <History size={15} />
            <span>Conferências & Histórico ({audits.length})</span>
          </button>
        </div>

        {/* Filtro de Pátio e Campo de Busca */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            value={yardFilter}
            onChange={e => setYardFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              fontWeight: '700'
            }}
          >
            <option value="todos">Todos os Pátios</option>
            {locais.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>

          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Buscar container ou booking..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                padding: '8px 12px 8px 30px',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                width: '210px'
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Conteúdo da Aba 1: Presença Confirmada ── */}
      {activeTab === 'confirmados' && (
        <div className="glass-panel" style={{ borderRadius: '14px', overflow: 'hidden' }}>
          <table className="desktop-table">
            <thead>
              <tr>
                <th>Container</th>
                <th>Pátio / Local</th>
                <th>Booking Vinculado</th>
                <th>Primeira Presença</th>
                <th>Última Confirmação</th>
                <th>Quem Conferiu</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filterList(confirmedPassages).length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    Nenhum container com presença confirmada encontrado para os filtros aplicados.
                  </td>
                </tr>
              ) : (
                filterList(confirmedPassages).map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: '800', fontFamily: 'monospace', fontSize: '14px', color: 'var(--text-primary)' }}>
                        {formatContainerNumber(p.containerNumber)}
                      </div>
                      <span style={{ fontSize: '10px', color: '#10b981', fontWeight: '800' }}>
                        ● ATIVO NO PÁTIO
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin size={13} style={{ color: 'var(--color-brand)' }} />
                        <span style={{ fontWeight: '700' }}>{p.yardName || 'Pátio'}</span>
                      </div>
                    </td>
                    <td>
                      {p.bookingNumber ? (
                        <span style={{ fontSize: '12px', fontWeight: '800', color: '#3b82f6' }}>
                          {p.bookingNumber}
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Sem Booking vinculado
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                        {new Date(p.firstObservedAt).toLocaleDateString('pt-BR')}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {new Date(p.firstObservedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>
                        {new Date(p.lastConfirmedAt).toLocaleDateString('pt-BR')}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {new Date(p.lastConfirmedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', fontWeight: '600' }}>
                        {p.lastConfirmedBy?.name || 'Inspetor'}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => setTimelinePassage(p)}
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '11px', fontWeight: '700' }}
                      >
                        <Eye size={13} />
                        <span>Histórico</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Conteúdo da Aba 2: Ausências em Revisão ── */}
      {activeTab === 'revisao' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid #f59e0b',
            borderRadius: '12px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <AlertTriangle size={20} style={{ color: '#f59e0b', flexShrink: 0 }} />
            <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
              <strong>Regra de Integridade Operacional:</strong> Containers ausentes na conferência diária não recebem saída automática.
              Eles são colocados sob revisão humana para verificação física no pátio antes que o Administrador confirme a saída definitiva.
            </div>
          </div>

          <div className="glass-panel" style={{ borderRadius: '14px', overflow: 'hidden' }}>
            <table className="desktop-table">
              <thead>
                <tr>
                  <th>Container</th>
                  <th>Pátio</th>
                  <th>Booking</th>
                  <th>Última Presença Confirmada</th>
                  <th>Quem Observou</th>
                  <th>Situação</th>
                  <th style={{ textAlign: 'right' }}>Ações Administrativas</th>
                </tr>
              </thead>
              <tbody>
                {filterList(underReviewPassages).length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      Nenhum container sob revisão no momento. Todos os containers esperados foram confirmados nas conferências.
                    </td>
                  </tr>
                ) : (
                  filterList(underReviewPassages).map(p => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: '800', fontFamily: 'monospace', fontSize: '14px', color: '#f59e0b' }}>
                          {formatContainerNumber(p.containerNumber)}
                        </div>
                        <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: '800' }}>
                          ⚠️ AUSÊNCIA EM REVISÃO
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: '700' }}>{p.yardName}</div>
                      </td>
                      <td>
                        {p.bookingNumber || <span style={{ color: 'var(--text-muted)' }}>Sem Booking</span>}
                      </td>
                      <td>
                        <div style={{ fontSize: '12px', fontWeight: '700' }}>
                          {new Date(p.lastConfirmedAt).toLocaleDateString('pt-BR')} às {new Date(p.lastConfirmedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '12px' }}>{p.lastConfirmedBy?.name || 'Inspetor'}</div>
                      </td>
                      <td>
                        <span style={{
                          backgroundColor: 'rgba(245, 158, 11, 0.15)',
                          color: '#f59e0b',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '800'
                        }}>
                          Falta confirmação de saída
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => handleReaffirmPresence(p)}
                            className="btn btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '11px', color: '#10b981' }}
                            title="Container foi localizado fisicamente no pátio"
                          >
                            <Check size={13} />
                            <span>Reafirmar Presença</span>
                          </button>

                          {isAdm && (
                            <button
                              type="button"
                              onClick={() => {
                                setExitModalPassage(p);
                                setExitNotes('');
                                setExitError('');
                              }}
                              className="btn btn-primary"
                              style={{ padding: '6px 12px', fontSize: '11px', backgroundColor: '#ef4444', borderColor: '#ef4444' }}
                              title="Confirmar saída definitiva do container"
                            >
                              <LogOut size={13} />
                              <span>Confirmar Saída</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Conteúdo da Aba 3: Saídas Identificadas ── */}
      {activeTab === 'saidas' && (
        <div className="glass-panel" style={{ borderRadius: '14px', overflow: 'hidden' }}>
          <table className="desktop-table">
            <thead>
              <tr>
                <th>Container</th>
                <th>Pátio de Origem</th>
                <th>Tipo de Saída</th>
                <th>Data da Confirmação</th>
                <th>Confirmado Por (ADM)</th>
                <th>Última Presença Física</th>
                <th>Horário Real de Saída</th>
                <th style={{ textAlign: 'right' }}>Histórico</th>
              </tr>
            </thead>
            <tbody>
              {filterList(exitedPassages).length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    Nenhuma saída confirmada por inventário registrada até o momento.
                  </td>
                </tr>
              ) : (
                filterList(exitedPassages).map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: '800', fontFamily: 'monospace', fontSize: '14px', color: 'var(--text-primary)' }}>
                        {formatContainerNumber(p.containerNumber)}
                      </div>
                      <span style={{ fontSize: '10px', color: '#6b7280', fontWeight: '800' }}>
                        ● FINALIZADO / SAIU
                      </span>
                    </td>
                    <td>{p.yardName}</td>
                    <td>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '800',
                        backgroundColor: 'rgba(107, 114, 128, 0.15)',
                        color: 'var(--text-secondary)',
                        padding: '3px 8px',
                        borderRadius: '6px'
                      }}>
                        Identificada por Inventário
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', fontWeight: '700' }}>
                        {p.exitInfo?.confirmedAt ? new Date(p.exitInfo.confirmedAt).toLocaleDateString('pt-BR') : '—'}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {p.exitInfo?.confirmedAt ? new Date(p.exitInfo.confirmedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', fontWeight: '700' }}>
                        {p.exitInfo?.confirmedBy?.name || 'Administrador'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px' }}>
                        {p.exitInfo?.lastKnownPresenceAt ? new Date(p.exitInfo.lastKnownPresenceAt).toLocaleDateString('pt-BR') : '—'}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Desconhecido na portaria
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => setTimelinePassage(p)}
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '11px' }}
                      >
                        <Eye size={13} />
                        <span>Ver Passagem</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Conteúdo da Aba 4: Conferências Diárias & Auditoria ── */}
      {activeTab === 'historico' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="glass-panel" style={{ borderRadius: '14px', overflow: 'hidden' }}>
            <table className="desktop-table">
              <thead>
                <tr>
                  <th>Data da Conferência</th>
                  <th>Pátio</th>
                  <th>Status</th>
                  <th>Aberta Por</th>
                  <th>Esperados</th>
                  <th>Presentes Confirmados</th>
                  <th>Novos Identificados</th>
                  <th>Ausências</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {audits.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      Nenhuma conferência diária registrada até o momento.
                    </td>
                  </tr>
                ) : (
                  audits.map(a => {
                    const sum = a.summarySnapshot || getAuditSessionSummary(a);
                    return (
                      <tr key={a.id}>
                        <td>
                          <div style={{ fontWeight: '800', fontSize: '13px' }}>{a.date}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{a.id}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '700' }}>{a.yardName}</div>
                        </td>
                        <td>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: '800',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: a.status === 'closed' ? 'rgba(107, 114, 128, 0.15)' :
                                             a.status === 'closing' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: a.status === 'closed' ? 'var(--text-secondary)' :
                                   a.status === 'closing' ? '#f59e0b' : '#10b981'
                          }}>
                            {a.status === 'closed' ? (a.isPartial ? 'Fechada (Parcial)' : 'Fechada Completa') :
                             a.status === 'closing' ? 'Em Fechamento / Reconciliação' : 'Em Andamento'}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontSize: '12px' }}>{a.openedBy?.name || 'Inspetor'}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '700', fontSize: '13px' }}>{sum.totalExpected}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '800', fontSize: '13px', color: '#10b981' }}>{sum.totalFound}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '800', fontSize: '13px', color: '#f59e0b' }}>{sum.totalNew}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '800', fontSize: '13px', color: sum.totalMissing > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                            {sum.totalMissing}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedAuditDetail(a)}
                            className="btn btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '11px' }}
                          >
                            <Eye size={13} />
                            <span>Gerenciar Fechamento</span>
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

      {/* ── Modal de Timeline da Passagem do Container ── */}
      {timelinePassage && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(6px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '900', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                  {formatContainerNumber(timelinePassage.containerNumber)}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Passagem ID: {timelinePassage.id} • {timelinePassage.yardName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTimelinePassage(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--color-brand)', textTransform: 'uppercase' }}>
                Linha do Tempo de Eventos Físicos
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
                {(timelinePassage.events || []).map((ev, idx) => (
                  <div key={ev.id || idx} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 14px',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)'
                  }}>
                    <span style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      marginTop: '4px',
                      backgroundColor: ev.type === 'first_seen' ? '#10b981' :
                                       ev.type === 'exit_confirmed' ? '#ef4444' :
                                       ev.type === 'under_review' ? '#f59e0b' : 'var(--color-brand)'
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-primary)' }}>
                        {ev.title || ev.type}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {new Date(ev.timestamp).toLocaleString('pt-BR')} • {ev.actor?.name || 'Sistema'} ({ev.actor?.role || 'Inspetor'})
                      </div>
                      {ev.notes && (
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          {ev.notes}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color)', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setTimelinePassage(null)}
                className="btn btn-secondary"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Confirmação de Saída de Container (ADM) ── */}
      {exitModalPassage && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(6px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid #ef4444',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '500px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontWeight: '900', fontSize: '16px' }}>
                <LogOut size={20} />
                <span>Confirmar Saída Identificada por Inventário</span>
              </div>
              <button
                type="button"
                onClick={() => setExitModalPassage(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                Você está confirmando a saída física do container{' '}
                <strong style={{ fontFamily: 'monospace', color: 'var(--color-brand)' }}>
                  {formatContainerNumber(exitModalPassage.containerNumber)}
                </strong>{' '}
                do pátio <strong>{exitModalPassage.yardName}</strong>.
              </div>

              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '12px',
                color: 'var(--text-secondary)'
              }}>
                <strong>Garantias de Integridade:</strong>
                <ul style={{ paddingLeft: '18px', marginTop: '6px' }}>
                  <li>Grava seu nome ({user?.name || user?.username}) e timestamp da confirmação.</li>
                  <li>Registra a última presença conhecida ({new Date(exitModalPassage.lastConfirmedAt).toLocaleDateString('pt-BR')}).</li>
                  <li>O horário real de saída permanece como <em>desconhecido</em> por falta de registro de portaria.</li>
                  <li>Libera o lock atômico, permitindo que este container registre uma nova passagem se retornar no futuro.</li>
                </ul>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Justificativa / Observações da Confirmação
                </label>
                <textarea
                  rows={3}
                  value={exitNotes}
                  onChange={e => setExitNotes(e.target.value)}
                  placeholder="Ex: Confirmado após conferência visual no pátio que o container foi retirado."
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {exitError && (
                <div style={{ color: '#ef4444', fontSize: '12px', fontWeight: '700' }}>
                  ⚠️ {exitError}
                </div>
              )}
            </div>

            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                type="button"
                onClick={() => setExitModalPassage(null)}
                className="btn btn-secondary"
                disabled={isProcessingExit}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmExit}
                disabled={isProcessingExit}
                className="btn btn-primary"
                style={{ backgroundColor: '#ef4444', borderColor: '#ef4444' }}
              >
                {isProcessingExit ? 'Processando Saída...' : 'Confirmar Saída Definitiva'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Criação de Nova Conferência Diária ── */}
      {showCreateAuditModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(6px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '460px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ fontWeight: '900', fontSize: '16px' }}>
                Nova Conferência Diária no Pátio
              </div>
              <button
                type="button"
                onClick={() => setShowCreateAuditModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Escolha o Pátio / Local
                </label>
                <select
                  value={newAuditYardId}
                  onChange={e => setNewAuditYardId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    fontWeight: '700'
                  }}
                >
                  {locais.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Todos os containers atualmente ativos neste pátio serão listados como <strong>esperados</strong>.
                Inspetores com o celular no Modo Campo participarão simultaneamente em tempo real.
              </div>
            </div>

            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                type="button"
                onClick={() => setShowCreateAuditModal(false)}
                className="btn btn-secondary"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateAudit}
                disabled={isCreatingAudit}
                className="btn btn-primary"
              >
                {isCreatingAudit ? 'Iniciando...' : 'Iniciar Conferência'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Gerenciamento de Fechamento & Reconciliação ── */}
      {selectedAuditDetail && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(6px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '620px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: '900', color: 'var(--text-primary)' }}>
                  Gerenciamento de Fechamento • {selectedAuditDetail.yardName}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  ID: {selectedAuditDetail.id} • Data: {selectedAuditDetail.date}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAuditDetail(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Status dos aparelhos participantes */}
              <div style={{
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: '10px',
                padding: '14px',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--color-brand)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Validação de Aparelhos Participantes
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                  O fechamento exige confirmação recente de sincronização de todos os aparelhos participantes. Informação antiga de "online" ou fila zerada não é suficiente.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.keys(selectedAuditDetail.participatingDevices || {}).length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Nenhum aparelho móvel conectado nesta conferência ainda.
                    </div>
                  ) : (
                    Object.entries(selectedAuditDetail.participatingDevices || {}).map(([devId, info]) => {
                      const isSynced = Boolean(info.isConfirmedSynced && (info.pendingUploads || 0) === 0);
                      const isFresh = info.lastSyncConfirmedAt && (Date.now() - info.lastSyncConfirmedAt <= 60000);
                      return (
                        <div key={devId} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          backgroundColor: 'var(--bg-secondary)',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)'
                        }}>
                          <div>
                            <div style={{ fontWeight: '700', fontSize: '13px' }}>
                              {info.inspectorName || 'Inspetor'}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              Dispositivo: {devId}
                            </div>
                          </div>

                          <span style={{
                            fontSize: '11px',
                            fontWeight: '800',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: isSynced && isFresh ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: isSynced && isFresh ? '#10b981' : '#ef4444'
                          }}>
                            {isSynced && isFresh ? '✓ Sincronizado Recente' : `⚠️ Pendente (${info.pendingUploads || 0} pendentes)`}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {closingError && (
                <div style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid #ef4444',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  color: '#ef4444',
                  fontSize: '12px',
                  fontWeight: '700'
                }}>
                  ⚠️ {closingError}
                </div>
              )}
            </div>

            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                {selectedAuditDetail.status === 'in_progress' && (
                  <button
                    type="button"
                    onClick={() => handleBeginClosingAudit(selectedAuditDetail)}
                    disabled={isClosingAudit}
                    className="btn btn-secondary"
                    style={{ color: '#f59e0b' }}
                  >
                    1. Iniciar Etapa de Fechamento
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedAuditDetail(null)}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>

                {selectedAuditDetail.status !== 'closed' && (
                  <button
                    type="button"
                    onClick={() => handleFinalizeClosingAudit(selectedAuditDetail, false)}
                    disabled={isClosingAudit}
                    className="btn btn-primary"
                  >
                    {isClosingAudit ? 'Validando...' : '2. Fechar Conferência Completa'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
