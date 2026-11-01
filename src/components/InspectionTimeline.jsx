import { useState } from 'react';
import {
  ShieldCheck,
  Clock,
  UserCheck,
  ArrowRightLeft,
  Eye,
  Camera,
  Edit3,
  Trash2,
  Cpu,
  FileCheck,
  Download,
  Lock,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  LEGACY_AUTHORSHIP_LABEL,
  getResponsibleInspectorInfo,
  isAuthorizedAdminRole,
  canViewAuditTimeline,
  formatTimelineEventPtBr,
  formatAuditTimestampSp
} from '../utils/inspectionAudit';

function getEventIcon(action, isSystem) {
  if (isSystem || action === 'seal_recognized_auto') return <Cpu size={14} style={{ color: '#38bdf8' }} />;
  switch (action) {
    case 'access_view':
      return <Eye size={14} style={{ color: '#94a3b8' }} />;
    case 'inspection_started':
      return <UserCheck size={14} style={{ color: '#10b981' }} />;
    case 'photo_added':
      return <Camera size={14} style={{ color: '#3b82f6' }} />;
    case 'photo_deleted':
      return <Trash2 size={14} style={{ color: '#ef4444' }} />;
    case 'seal_added':
    case 'field_updated':
      return <Edit3 size={14} style={{ color: '#f59e0b' }} />;
    case 'seal_removed':
      return <Trash2 size={14} style={{ color: '#f97316' }} />;
    case 'responsibility_transferred':
      return <ArrowRightLeft size={14} style={{ color: '#a855f7' }} />;
    case 'inspection_finalized':
      return <ShieldCheck size={14} style={{ color: '#10b981' }} />;
    case 'inspection_reopened':
      return <AlertCircle size={14} style={{ color: '#eab308' }} />;
    case 'certificate_signed':
    case 'report_generated':
      return <FileCheck size={14} style={{ color: '#06b6d4' }} />;
    case 'report_downloaded':
      return <Download size={14} style={{ color: '#6366f1' }} />;
    default:
      return <Clock size={14} style={{ color: '#94a3b8' }} />;
  }
}

export default function InspectionTimeline({
  container,
  booking = {},
  user,
  collaborators = [],
  onTransferResponsibility = null,
  defaultExpanded = true,
  compact = false
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [selectedNewInspectorId, setSelectedNewInspectorId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferError, setTransferError] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);

  if (!container) return null;

  const hasAuditAccess = canViewAuditTimeline(user, {
    clientId: container.clientId || booking?.clientId || 'client_interport'
  });

  if (!hasAuditAccess) {
    return null;
  }

  const respInfo = getResponsibleInspectorInfo(container, booking);
  const canTransfer = isAuthorizedAdminRole(user) && typeof onTransferResponsibility === 'function';
  const timeline = Array.isArray(container.auditTimeline) ? container.auditTimeline : [];
  const certSig = container.certificateSignature || booking?.certificateSignature || null;

  // Lista de colaboradores válidos para transferência (exclui nomes fixos proibidos sem id)
  const validCollaborators = (collaborators || []).filter(c => c && (c.id || c.uid) && c.name);

  const handleConfirmTransfer = async e => {
    if (e && e.preventDefault) e.preventDefault();
    setTransferError('');
    const targetCollab = validCollaborators.find(c => String(c.id || c.uid) === String(selectedNewInspectorId));
    if (!targetCollab) {
      setTransferError('Selecione o novo inspetor responsável.');
      return;
    }
    if (!transferReason || transferReason.trim().length < 3) {
      setTransferError('Informe uma justificativa obrigatória para a transferência.');
      return;
    }

    try {
      setTransferBusy(true);
      await onTransferResponsibility({
        newResponsibleUser: targetCollab,
        reason: transferReason.trim()
      });
      setTransferReason('');
      setSelectedNewInspectorId('');
      setShowTransferForm(false);
    } catch (err) {
      setTransferError(err?.message || 'Não foi possível transferir a responsabilidade.');
    } finally {
      setTransferBusy(false);
    }
  };

  return (
    <div
      style={{
        marginTop: compact ? '12px' : '18px',
        padding: compact ? '12px' : '16px',
        borderRadius: '12px',
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        border: '1px solid rgba(148, 163, 184, 0.22)',
        color: '#f8fafc'
      }}
    >
      {/* Cabeçalho: Inspetor Responsável e Assinatura */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          paddingBottom: '12px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.15)'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <UserCheck size={16} style={{ color: respInfo.isIdentified ? '#10b981' : '#f59e0b' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Inspetor Responsável:
            </span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 800,
                padding: '3px 9px',
                borderRadius: '6px',
                backgroundColor: respInfo.isIdentified ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                color: respInfo.isIdentified ? '#34d399' : '#fbbf24',
                border: respInfo.isIdentified ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(245, 158, 11, 0.35)'
              }}
            >
              {respInfo.isIdentified ? respInfo.name : LEGACY_AUTHORSHIP_LABEL}
            </span>

            {certSig?.isSigned && certSig?.signedBy?.name && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(6, 182, 212, 0.15)',
                  color: '#22d3ee',
                  border: '1px solid rgba(6, 182, 212, 0.35)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Lock size={12} />
                Certificado assinado por {certSig.signedBy.name}
              </span>
            )}
          </div>

          {respInfo.isIdentified && respInfo.assignedAt && (
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Atribuído em {formatAuditTimestampSp(respInfo.assignedAt)} (fuso America/Sao_Paulo)
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {canTransfer && (
            <button
              type="button"
              onClick={() => setShowTransferForm(prev => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: 'rgba(168, 85, 247, 0.15)',
                color: '#c084fc',
                border: '1px solid rgba(168, 85, 247, 0.35)',
                cursor: 'pointer'
              }}
            >
              <ArrowRightLeft size={13} />
              Transferir Responsabilidade
            </button>
          )}

          <button
            type="button"
            onClick={() => setExpanded(prev => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              backgroundColor: 'rgba(148, 163, 184, 0.12)',
              color: '#e2e8f0',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              cursor: 'pointer'
            }}
          >
            <Clock size={13} />
            Linha do Tempo ({timeline.length})
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Formulário de Transferência Autorizada (somente ADM/MASTER) */}
      {canTransfer && showTransferForm && (
        <form
          onSubmit={handleConfirmTransfer}
          style={{
            marginTop: '12px',
            padding: '12px',
            borderRadius: '10px',
            backgroundColor: 'rgba(30, 41, 59, 0.9)',
            border: '1px solid rgba(168, 85, 247, 0.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#e9d5ff' }}>
            Transferência de Responsabilidade da Inspeção (Requer Justificativa Obrigatória)
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>
                Novo Inspetor Responsável
              </label>
              <select
                value={selectedNewInspectorId}
                onChange={e => setSelectedNewInspectorId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  fontSize: '12px'
                }}
              >
                <option value="">Selecione um colaborador...</option>
                {validCollaborators.map(col => (
                  <option key={col.id || col.uid} value={col.id || col.uid}>
                    {col.name} ({col.role || 'Inspetor'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>
                Motivo / Justificativa Obrigatória
              </label>
              <input
                type="text"
                value={transferReason}
                onChange={e => setTransferReason(e.target.value)}
                placeholder="Ex.: Troca de turno operacional no terminal"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  fontSize: '12px'
                }}
              />
            </div>
          </div>

          {transferError && (
            <div style={{ fontSize: '12px', color: '#f87171', fontWeight: 600 }}>
              {transferError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                setShowTransferForm(false);
                setTransferError('');
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                backgroundColor: 'transparent',
                color: '#94a3b8',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={transferBusy}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: '#9333ea',
                color: '#ffffff',
                border: 'none',
                cursor: transferBusy ? 'wait' : 'pointer'
              }}
            >
              {transferBusy ? 'Registrando...' : 'Confirmar Transferência'}
            </button>
          </div>
        </form>
      )}

      {/* Lista de Eventos da Linha do Tempo */}
      {expanded && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
          {timeline.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', padding: '6px 0' }}>
              Nenhum evento registrado nesta linha do tempo até o momento.
            </div>
          ) : (
            timeline.map((ev, idx) => {
              const isSystem = Boolean(ev.actor?.isSystem || ev.actorType === 'system');
              const formatted = ev.formattedText || formatTimelineEventPtBr(ev);
              const showOfflineDiff =
                ev.deviceTimestamp &&
                ev.serverTimestamp &&
                (ev.metadata?.capturedOffline || Math.abs(new Date(ev.serverTimestamp).getTime() - new Date(ev.deviceTimestamp).getTime()) > 60000);

              return (
                <div
                  key={ev.id || `${ev.action}_${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: isSystem ? 'rgba(56, 189, 248, 0.08)' : 'rgba(30, 41, 59, 0.65)',
                    border: isSystem ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid rgba(148, 163, 184, 0.14)',
                    fontSize: '12px',
                    lineHeight: 1.45
                  }}
                >
                  <div style={{ marginTop: '2px', flexShrink: 0 }}>
                    {getEventIcon(ev.action, isSystem)}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ color: '#f1f5f9', fontWeight: 600 }}>
                      {formatted}
                    </div>
                    {showOfflineDiff && (
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        Horário no dispositivo (offline): {formatAuditTimestampSp(ev.deviceTimestamp)} • Recebido pelo servidor: {formatAuditTimestampSp(ev.serverTimestamp)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

