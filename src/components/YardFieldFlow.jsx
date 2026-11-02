import { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Search,
  CheckCircle2,
  Clock,
  MapPin,
  RefreshCw,
  Plus,
  AlertTriangle,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  Layers,
  Sparkles,
  Check,
  X,
  Eye,
  Radio,
  FileCheck
} from 'lucide-react';
import { useLocais } from '../db';
import {
  normalizeContainerCode,
  startYardAuditSession,
  getAuditSessionSummary
} from '../utils/yardInventory';
import {
  submitYardReading,
  syncYardQueueNow,
  getYardSyncStatus,
  updateDeviceHeartbeat,
  subscribeYardAudits,
  subscribeSingleAudit,
  getDeviceId
} from '../utils/yardService';
import { recognizeContainerPhoto, validateIso6346CheckDigit, formatContainerNumber } from '../utils/containerOcr';

export default function YardFieldFlow({ user, onBack }) {
  const locais = useLocais();
  const [selectedYardId, setSelectedYardId] = useState(() => {
    return localStorage.getItem('unispect_field_yard_id') || (locais[0]?.id || '');
  });
  const [audits, setAudits] = useState([]);
  const [activeAudit, setActiveAudit] = useState(null);
  const [inputNumber, setInputNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'warn' | 'error', message, details }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncStatus, setSyncStatus] = useState(getYardSyncStatus());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isScanningPhoto, setIsScanningPhoto] = useState(false);
  const [recentReadings, setRecentReadings] = useState([]);
  const [showRecentModal, setShowRecentModal] = useState(false);

  const fileInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const inputRef = useRef(null);

  // Salva pátio preferido
  const handleSelectYard = (id) => {
    setSelectedYardId(id);
    localStorage.setItem('unispect_field_yard_id', id);
    setActiveAudit(null);
  };

  const selectedYardName = locais.find(l => l.id === selectedYardId)?.name || 'Pátio Selecionado';

  // Escuta conferências do pátio em tempo real
  useEffect(() => {
    if (!selectedYardId) return;
    const unsub = subscribeYardAudits(
      selectedYardId,
      (list) => {
        setAudits(list);
        // Seleciona automaticamente conferência em andamento ou em closing
        const inProgress = list.find(a => a.status === 'in_progress' || a.status === 'closing');
        if (inProgress && (!activeAudit || activeAudit.id === inProgress.id)) {
          setActiveAudit(inProgress);
        }
      },
      () => setAudits([])
    );
    return () => unsub();
  }, [selectedYardId]);

  // Escuta status de sincronização local
  useEffect(() => {
    const handleSyncChange = () => setSyncStatus(getYardSyncStatus());
    window.addEventListener('unispect-yard-sync-change', handleSyncChange);
    window.addEventListener('online', handleSyncChange);
    window.addEventListener('offline', handleSyncChange);

    // Heartbeat periódico a cada 20 segundos se houver conferência ativa
    const hbInterval = setInterval(() => {
      if (activeAudit?.id) {
        updateDeviceHeartbeat({
          auditId: activeAudit.id,
          inspectorName: user?.name || user?.username || 'Inspetor'
        });
      }
    }, 20000);

    return () => {
      window.removeEventListener('unispect-yard-sync-change', handleSyncChange);
      window.removeEventListener('online', handleSyncChange);
      window.removeEventListener('offline', handleSyncChange);
      clearInterval(hbInterval);
    };
  }, [activeAudit?.id, user]);

  // Forçar sincronização da fila
  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const res = await syncYardQueueNow();
      setSyncStatus(getYardSyncStatus());
      if (activeAudit?.id) {
        await updateDeviceHeartbeat({
          auditId: activeAudit.id,
          inspectorName: user?.name || user?.username || 'Inspetor'
        });
      }
      setFeedback({
        type: 'success',
        message: `Sincronização concluída: ${res.synced} itens enviados para a nuvem.`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Erro ao sincronizar: ${err.message}`
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Iniciar nova conferência diária no pátio
  const handleStartAudit = async () => {
    if (!selectedYardId) return;
    setIsSubmitting(true);
    try {
      const newAudit = startYardAuditSession({
        yardId: selectedYardId,
        yardName: selectedYardName,
        actor: { id: user?.id || 'usr_1', name: user?.name || user?.username || 'Inspetor', role: user?.role || 'Inspector' }
      });
      // Salva no Firestore
      const { setDoc, doc } = await import('firebase/firestore');
      const { dbFirestore } = await import('../firebase');
      await setDoc(doc(dbFirestore, 'yardAudits', newAudit.id), newAudit);
      setActiveAudit(newAudit);
      setFeedback({
        type: 'success',
        message: `Conferência iniciada com sucesso: ${newAudit.id}`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Erro ao iniciar conferência: ${err.message}`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Processa OCR de foto tirada no campo (câmera ou galeria)
  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanningPhoto(true);
    setFeedback({ type: 'info', message: 'Reconhecendo número do container na foto...' });

    try {
      const ocrResult = await recognizeContainerPhoto(file);
      if (ocrResult?.number) {
        setInputNumber(ocrResult.number);
        setFeedback({
          type: 'success',
          message: `Identificado: ${ocrResult.number} (Confiança: ${Math.round(ocrResult.confidence || 90)}%)`
        });
        if (inputRef.current) inputRef.current.focus();
      } else {
        setFeedback({
          type: 'warn',
          message: 'Foto não identificada com clareza. Digite o número diretamente abaixo.'
        });
        if (inputRef.current) inputRef.current.focus();
      }
    } catch (err) {
      setFeedback({
        type: 'warn',
        message: 'Reconhecimento indisponível no momento. A digitação manual está pronta abaixo.'
      });
      if (inputRef.current) inputRef.current.focus();
    } finally {
      setIsScanningPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  // Submissão rápida de presença
  const handleSubmitPresence = async (e) => {
    if (e) e.preventDefault();
    const clean = normalizeContainerCode(inputNumber);
    if (!clean || clean.length < 4) {
      setFeedback({ type: 'error', message: 'Número de container inválido.' });
      return;
    }

    if (!activeAudit?.id) {
      setFeedback({ type: 'error', message: 'Nenhuma conferência ativa selecionada.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await submitYardReading({
        auditId: activeAudit.id,
        yardId: selectedYardId,
        containerNumber: inputNumber.trim().toUpperCase(),
        actor: { id: user?.id || 'usr', name: user?.name || user?.username || 'Inspetor', role: user?.role || 'Inspector' },
        notes: notes.trim()
      });

      // Feedback tátil
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }

      const isSynced = res.status === 'synced';
      setFeedback({
        type: 'success',
        message: `Presença confirmada: ${inputNumber.trim().toUpperCase()}`,
        details: isSynced ? 'Gravado em nuvem' : 'Salvo localmente neste aparelho'
      });

      // Adiciona aos recentes da sessão
      setRecentReadings(prev => [
        {
          number: inputNumber.trim().toUpperCase(),
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          synced: isSynced
        },
        ...prev.slice(0, 29)
      ]);

      // Limpa input e foca para o próximo
      setInputNumber('');
      setNotes('');
      if (inputRef.current) inputRef.current.focus();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erro ao registrar leitura de container.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const normalized = normalizeContainerCode(inputNumber);
  const isValidIso = normalized.length === 11 ? validateIso6346CheckDigit(normalized) : null;
  const isExpected = activeAudit?.expectedContainers?.some(c => c.normalizedNumber === normalized);
  const alreadyRead = activeAudit?.readings?.[normalized];
  const auditSummary = activeAudit ? getAuditSessionSummary(activeAudit) : null;
  const isClosing = activeAudit?.status === 'closing';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '90px' }}>
      {/* Barra de Status de Sincronização e Aparelho */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: syncStatus.isOnline ? '#10b981' : '#ef4444'
          }} />
          <span style={{ fontSize: '11px', fontWeight: '800', color: syncStatus.isOnline ? '#10b981' : '#ef4444' }}>
            {syncStatus.isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
          <span style={{ color: 'var(--border-color)' }}>•</span>
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#10b981' }}>
            {syncStatus.syncedCount} sincronizados
          </span>
          {syncStatus.pendingCount > 0 && (
            <span style={{
              fontSize: '11px',
              fontWeight: '800',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              color: '#f59e0b',
              padding: '2px 6px',
              borderRadius: '6px'
            }}>
              {syncStatus.pendingCount} pendentes
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleSyncNow}
          disabled={isSyncing || !syncStatus.isOnline}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            background: 'none',
            border: 'none',
            color: 'var(--color-brand)',
            fontSize: '11px',
            fontWeight: '800',
            cursor: 'pointer',
            padding: '4px 6px',
            borderRadius: '6px'
          }}
          title="Forçar envio de leituras pendentes"
        >
          <RefreshCw size={13} className={isSyncing ? 'spin' : ''} />
          <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
        </button>
      </div>

      {/* Alerta de Etapa de Fechamento */}
      {isClosing && (
        <div style={{
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid #f59e0b',
          borderRadius: '12px',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          fontSize: '12px',
          color: '#f59e0b'
        }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontWeight: '800', marginBottom: '2px' }}>
              CONFERÊNCIA EM ETAPA DE FECHAMENTO
            </div>
            <div>
              O supervisor iniciou o fechamento deste pátio. Todos os aparelhos devem descarregar as leituras pendentes para concluir a reconciliação.
            </div>
          </div>
        </div>
      )}

      {/* Grid Responsivo (Coluna Única em Celular, 2 Colunas Lado a Lado em Tablet) */}
      <div className="yard-field-adaptive-container yard-field-tablet-grid">
        {/* COLUNA 1: IDENTIFICAÇÃO E AÇÃO RÁPIDA DE CAMPO */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* 1. Escolha do Pátio */}
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '14px',
            padding: '14px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px'
            }}>
              <label style={{
                fontSize: '11px',
                fontWeight: '800',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                <MapPin size={13} style={{ color: 'var(--color-brand)' }} />
                1. Pátio da Operação
              </label>
            </div>

            <select
              value={selectedYardId}
              onChange={e => handleSelectYard(e.target.value)}
              className="yard-touch-target"
              style={{
                width: '100%',
                padding: '12px 14px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                color: 'var(--text-primary)',
                fontSize: '14px',
                fontWeight: '700',
                outline: 'none'
              }}
            >
              {locais.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Identificação e Confirmação de Presença */}
          {activeAudit && (
            <form onSubmit={handleSubmitPresence} style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '14px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{
                  fontSize: '11px',
                  fontWeight: '800',
                  color: 'var(--color-brand)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <CheckCircle2 size={13} />
                  2. Identificar Container
                </label>

                {isValidIso !== null && (
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '800',
                    color: isValidIso ? '#10b981' : '#ef4444'
                  }}>
                    {isValidIso ? '✓ ISO 6346 Válido' : '⚠️ Dígito Inválido'}
                  </span>
                )}
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ex: MSCU 123456-7"
                  value={inputNumber}
                  onChange={e => setInputNumber(formatContainerNumber(e.target.value))}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck="false"
                  className="yard-touch-target"
                  style={{
                    width: '100%',
                    padding: '16px 98px 16px 16px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: isValidIso === false ? '2px solid #ef4444' : '2px solid var(--border-color)',
                    borderRadius: '12px',
                    fontSize: '18px',
                    fontWeight: '800',
                    letterSpacing: '0.05em',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                    outline: 'none',
                    fontFamily: 'monospace'
                  }}
                />

                {/* Ações de Captura Padrão Android (Galeria + Câmera) */}
                <div style={{
                  position: 'absolute',
                  right: '6px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  {/* Botão de Galeria de Fotos */}
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={isScanningPhoto}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      width: '40px',
                      height: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                    title="Selecionar foto de container da galeria para OCR"
                  >
                    <ImageIcon size={19} />
                  </button>

                  {/* Botão de Câmera com Intent AOSP */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isScanningPhoto}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      width: '40px',
                      height: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-brand)',
                      cursor: 'pointer'
                    }}
                    title="Tirar foto do container com a câmera padrão"
                  >
                    {isScanningPhoto ? (
                      <RefreshCw size={18} className="spin" />
                    ) : (
                      <Camera size={20} />
                    )}
                  </button>
                </div>

                {/* Inputs de arquivo padrão AOSP */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={handlePhotoCapture}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handlePhotoCapture}
                />
              </div>

              {/* Dica de Acessibilidade e Fallback Manual */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: 'var(--text-muted)',
                padding: '0 2px'
              }}>
                <span>📷 Câmera | 🖼️ Galeria (OCR)</span>
                <span style={{ fontWeight: '700', color: 'var(--text-secondary)' }}>
                  ⌨️ Digitação manual direta
                </span>
              </div>

              {/* Status Contextual do Container Digitado */}
              {normalized && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}>
                  {isExpected ? (
                    <span style={{ color: '#10b981', fontWeight: '800' }}>
                      ✓ Esperado no pátio
                    </span>
                  ) : (
                    <span style={{ color: '#f59e0b', fontWeight: '800' }}>
                      ⚡ Novo container identificado
                    </span>
                  )}

                  {alreadyRead && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      Já lido nesta conferência ({alreadyRead.readCount}x)
                    </span>
                  )}
                </div>
              )}

              {/* Observações Opcionais */}
              <input
                type="text"
                placeholder="Observações (opcional: avaria, posição, etc.)"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="yard-touch-target"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box'
                }}
              />

              {/* Botão de Confirmação Primário */}
              <button
                type="submit"
                disabled={!inputNumber.trim() || isSubmitting}
                className="btn btn-primary yard-touch-target"
                style={{
                  width: '100%',
                  padding: '16px',
                  fontSize: '16px',
                  fontWeight: '900',
                  justifyContent: 'center',
                  backgroundColor: '#10b981',
                  borderColor: '#10b981',
                  borderRadius: '12px',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                  cursor: 'pointer'
                }}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={18} className="spin" />
                    <span>Confirmando Presença...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={20} />
                    <span>Confirmar Presença e Próximo</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Feedback Toast / Aviso */}
          {feedback && (
            <div style={{
              padding: '12px 16px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' :
                               feedback.type === 'warn' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: feedback.type === 'success' ? '#10b981' :
                     feedback.type === 'warn' ? '#f59e0b' : '#ef4444',
              border: `1px solid ${feedback.type === 'success' ? '#10b981' : feedback.type === 'warn' ? '#f59e0b' : '#ef4444'}`
            }}>
              <div>
                <div>{feedback.message}</div>
                {feedback.details && (
                  <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '2px' }}>
                    {feedback.details}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        {/* COLUNA 2: CONFERÊNCIA DIÁRIA & RECENTES DA SESSÃO */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* 2. Seleção ou Criação de Conferência Diária */}
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '14px',
            padding: '14px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px'
            }}>
              <label style={{
                fontSize: '11px',
                fontWeight: '800',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                <Radio size={13} style={{ color: 'var(--color-brand)' }} />
                Conferência de Hoje
              </label>
              {activeAudit && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: '800',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: isClosing ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  color: isClosing ? '#f59e0b' : '#10b981'
                }}>
                  {isClosing ? 'Em Reconciliação' : 'Em Andamento'}
                </span>
              )}
            </div>

            {activeAudit ? (
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  marginBottom: '10px'
                }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-primary)' }}>
                      {activeAudit.yardName} • {activeAudit.date}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Aberta por: {activeAudit.openedBy?.name || 'Inspetor'}
                    </div>
                  </div>

                  {auditSummary && (
                    <div style={{ display: 'flex', gap: '8px', textAlign: 'right' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '800', color: '#10b981' }}>
                          {auditSummary.totalFound}
                        </div>
                        <div style={{ fontSize: '9px', fontWeight: '700', color: 'var(--text-muted)' }}>LIDOS</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--color-brand)' }}>
                          {auditSummary.totalExpected}
                        </div>
                        <div style={{ fontSize: '9px', fontWeight: '700', color: 'var(--text-muted)' }}>ESPERADOS</div>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowRecentModal(true)}
                    className="yard-touch-target"
                    style={{
                      flex: 1,
                      padding: '8px',
                      backgroundColor: 'transparent',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: '700',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    Ver Lidos na Sessão ({recentReadings.length})
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Nenhuma conferência em andamento para este pátio hoje.
                </p>
                <button
                  type="button"
                  onClick={handleStartAudit}
                  disabled={isSubmitting}
                  className="btn btn-primary yard-touch-target"
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    padding: '12px',
                    fontSize: '13px',
                    fontWeight: '800'
                  }}
                >
                  <Plus size={16} />
                  Iniciar Conferência Diária no Pátio
                </button>
              </div>
            )}
          </div>

          {/* Painel de Leituras Recentes Neste Aparelho */}
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '14px',
            padding: '14px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px'
            }}>
              <label style={{
                fontSize: '11px',
                fontWeight: '800',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                <Clock size={13} style={{ color: 'var(--color-brand)' }} />
                Lidos Neste Aparelho ({recentReadings.length})
              </label>
              {recentReadings.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowRecentModal(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: '700',
                    color: 'var(--color-brand)',
                    cursor: 'pointer'
                  }}
                >
                  Ver Todos ({recentReadings.length})
                </button>
              )}
            </div>

            {recentReadings.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '12px 0', textAlign: 'center' }}>
                Nenhum container lido ainda nesta sessão.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {recentReadings.slice(0, 5).map((r, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    border: '1px solid var(--border-color)'
                  }}>
                    <span style={{ fontWeight: '800', fontFamily: 'monospace' }}>{r.number}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{r.time}</span>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: '800',
                        color: r.synced ? '#10b981' : '#f59e0b',
                        backgroundColor: r.synced ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                        padding: '1px 6px',
                        borderRadius: '4px'
                      }}>
                        {r.synced ? 'Nuvem' : 'Pendente'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Leituras Recentes */}
      {showRecentModal && (
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
            maxWidth: '440px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ fontWeight: '800', fontSize: '15px' }}>
                Conferidos Neste Aparelho ({recentReadings.length})
              </div>
              <button
                type="button"
                onClick={() => setShowRecentModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '12px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentReadings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Nenhum container conferido ainda nesta sessão.
                </div>
              ) : (
                recentReadings.map((r, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)'
                  }}>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '14px', fontFamily: 'monospace' }}>
                        {r.number}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Horário: {r.time}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: '800',
                      color: r.synced ? '#10b981' : '#f59e0b',
                      backgroundColor: r.synced ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                      padding: '2px 8px',
                      borderRadius: '6px'
                    }}>
                      {r.synced ? 'Nuvem' : 'Pendente'}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setShowRecentModal(false)}
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
