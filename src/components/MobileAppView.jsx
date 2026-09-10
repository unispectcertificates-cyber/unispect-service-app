import { useState, useRef, useCallback } from 'react';
import { Search, Camera, Image, Trash2, ArrowLeft, X, CheckCircle2, Lock, ChevronRight, ChevronDown } from 'lucide-react';
import { db, useBookings, useExportadores, useLocais, isBookingNumberDuplicate } from '../db';

// ────────────────────────────────────────────────────────────────────────────────
// Estilos utilitários inline
// ────────────────────────────────────────────────────────────────────────────────
const S = {
  label: {
    display: 'block',
    fontSize: '11px',
    color: 'var(--text-muted)',
    fontWeight: '800',
    marginBottom: '5px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    color: 'var(--text-primary)',
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box'
  },
  card: {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '14px',
    padding: '16px',
    boxShadow: 'var(--shadow-sm)'
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: '800',
    color: 'var(--color-brand)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '10px'
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-brand)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    fontWeight: '800',
    padding: '6px 0',
    marginBottom: '12px'
  }
};

export default function MobileAppView({ onLogout, hideHeader = false }) {
  const bookings     = useBookings();
  const exportadores = useExportadores();
  const locais       = useLocais();

  // ── Navegação: null | 'booking' | 'container'
  const [screen, setScreen]                   = useState('list');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedContainer, setSelectedContainer] = useState(null);

  // ── Estado de busca
  const [searchQuery, setSearchQuery] = useState('');

  // ── Estado de upload / preview
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState(null);
  const [isSaving, setIsSaving]               = useState(false);
  const [saveOk, setSaveOk]                   = useState(false);

  // ── Lacre temp
  const [newSealInput, setNewSealInput]       = useState('');

  const cameraInputRef  = useRef(null);
  const galleryInputRef = useRef(null);

  // Status considerados "finalizados"
  const FINISHED = ['finalizado', 'estufado', 'finished', 'concluido', 'concluído'];
  const isFinished = b => FINISHED.includes((b.status || '').toLowerCase().trim());

  // ── Filtragem de bookings
  const filteredBookings = bookings.filter(b => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return !isFinished(b);
    const expName = (exportadores.find(e => e.id === b.exporterId)?.name || '').toLowerCase();
    return (
      (b.bookingNumber || '').toLowerCase().includes(term) ||
      (b.certificateNumber || '').toLowerCase().includes(term) ||
      (b.stuffingReportNumber || '').toLowerCase().includes(term) ||
      expName.includes(term) ||
      (b.containers || []).some(c => (c.containerNumber || '').toLowerCase().includes(term))
    );
  });

  // ── Navegar para Booking
  const openBooking = useCallback(b => {
    setSelectedBooking(b);
    setScreen('booking');
    setSelectedContainer(null);
  }, []);

  // ── Navegar para Container
  const openContainer = useCallback(c => {
    setSelectedContainer({ ...c });
    setScreen('container');
    setSaveOk(false);
  }, []);

  // ── Voltar para lista
  const goToList = useCallback(() => {
    setScreen('list');
    setSelectedBooking(null);
    setSelectedContainer(null);
  }, []);

  // ── Voltar para booking (da tela de container)
  const goToBooking = useCallback(() => {
    setSelectedContainer(null);
    setScreen('booking');
    setSaveOk(false);
  }, []);

  // ── Salvar container e voltar
  const handleSaveContainer = useCallback(async () => {
    if (!selectedBooking || !selectedContainer) return;
    setIsSaving(true);
    try {
      const updatedContainers = selectedBooking.containers.map(c =>
        c.id === selectedContainer.id ? selectedContainer : c
      );
      const updatedBooking = { ...selectedBooking, containers: updatedContainers };
      await db.saveBooking(updatedBooking);
      setSelectedBooking(updatedBooking);
      setSaveOk(true);
      setTimeout(() => {
        goToBooking();
      }, 700);
    } catch (err) {
      alert(err.message || 'Erro ao salvar. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  }, [selectedBooking, selectedContainer, goToBooking]);

  // ── Atualizar campo do container localmente (sem salvar ainda)
  const updateContField = useCallback((field, value) => {
    setSelectedContainer(prev => ({ ...prev, [field]: value }));
  }, []);

  // ── Upload de fotos
  const handlePhotoUpload = async e => {
    const files = Array.from(e.target.files);
    if (!files.length || !selectedContainer) return;
    try {
      const urls = await Promise.all(files.map(f => db.uploadPhoto(f)));
      const newPhotos = urls.map(url => ({
        id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        url,
        name: ''
      }));
      updateContField('photos', [...(selectedContainer.photos || []), ...newPhotos]);
    } catch (err) {
      alert(err.message || 'Erro ao enviar foto.');
    }
  };

  const handleDeletePhoto = id => {
    updateContField('photos', (selectedContainer.photos || []).filter(p => p.id !== id));
  };

  const handleAddSeal = () => {
    if (!newSealInput.trim()) return;
    const updated = [...(selectedContainer.provisionalSeals || []), newSealInput.trim().toUpperCase()];
    updateContField('provisionalSeals', updated);
    setNewSealInput('');
  };

  const handleRemoveSeal = idx => {
    const updated = (selectedContainer.provisionalSeals || []).filter((_, i) => i !== idx);
    updateContField('provisionalSeals', updated);
  };

  // Status badge color
  const statusColor = s => {
    if (!s) return '#6b7280';
    const l = s.toLowerCase();
    if (l === 'finalizado' || l === 'estufado') return '#10b981';
    if (l === 'em andamento') return '#f59e0b';
    return '#ef4444';
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // TELA 1 — Lista de Bookings
  // ─────────────────────────────────────────────────────────────────────────────
  const renderList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Busca */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 16px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '14px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <Search size={18} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Buscar booking, container, exportador..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ background: 'none', border: 'none', color: 'var(--text-primary)', width: '100%', outline: 'none', fontSize: '14px' }}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* Label */}
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {searchQuery ? `Resultados (${filteredBookings.length})` : `📋 Em Aberto (${filteredBookings.length})`}
      </div>

      {/* Cards */}
      {filteredBookings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '13px' }}>
          Nenhum booking encontrado.
        </div>
      ) : filteredBookings.map(b => {
        const exp = exportadores.find(e => e.id === b.exporterId)?.name || 'N/A';
        const loc = locais.find(l => l.id === b.locationId)?.name || '';
        const sc  = statusColor(b.status);
        const contCount = (b.containers || []).length;
        return (
          <div
            key={b.id}
            onClick={() => openBooking(b)}
            style={{
              ...S.card,
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              transition: 'transform 0.15s',
              borderLeft: `4px solid ${sc}`
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontWeight: '900', fontSize: '15px', color: 'var(--color-brand)' }}>
                  {b.certificateNumber}
                </span>
                <span style={{
                  fontSize: '9px', fontWeight: '800', padding: '2px 7px',
                  borderRadius: '4px', backgroundColor: `${sc}1A`, color: sc
                }}>
                  {b.status || 'Pendente'}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                BK: <strong style={{ color: 'var(--text-primary)' }}>{b.bookingNumber}</strong>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {exp} {loc ? `· ${loc}` : ''}
              </div>
              <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                🗃 {contCount} container{contCount !== 1 ? 's' : ''}
              </div>
            </div>
            <ChevronRight size={20} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
          </div>
        );
      })}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // TELA 1B — Booking expandido + lista de containers
  // ─────────────────────────────────────────────────────────────────────────────
  const renderBooking = () => {
    const b   = selectedBooking;
    const exp = exportadores.find(e => e.id === b.exporterId)?.name || 'N/A';
    const loc = locais.find(l => l.id === b.locationId)?.name || 'N/A';
    const sc  = statusColor(b.status);
    const containers = b.containers || [];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Voltar */}
        <button onClick={goToList} style={S.backBtn}>
          <ArrowLeft size={16} /> Voltar para Lista
        </button>

        {/* Card Booking */}
        <div style={{ ...S.card, borderLeft: `4px solid ${sc}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Certificado</div>
              <div style={{ fontSize: '22px', fontWeight: '900', color: 'var(--color-brand)', lineHeight: 1.1 }}>{b.certificateNumber}</div>
            </div>
            <span style={{
              fontSize: '10px', fontWeight: '800', padding: '4px 10px',
              borderRadius: '6px', backgroundColor: `${sc}1A`, color: sc
            }}>
              {b.status || 'Pendente'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Nº Booking</div>
              <div style={{ fontWeight: '800', color: 'var(--text-primary)' }}>{b.bookingNumber}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Navio/Viagem</div>
              <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{b.vesselVoyage || '—'}</div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Exportador</div>
              <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{exp}</div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Local</div>
              <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{loc}</div>
            </div>
          </div>
        </div>

        {/* Lista de containers */}
        <div>
          <div style={S.sectionTitle}>📦 Containers ({containers.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {containers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
                Nenhum container nesta reserva.
              </div>
            ) : containers.map(c => {
              const hasPhotos  = (c.photos || []).length > 0;
              const hasDefSeal = !!c.definiteSeal;
              const cs = statusColor(c.status);
              return (
                <div
                  key={c.id}
                  onClick={() => openContainer(c)}
                  style={{
                    ...S.card,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    borderLeft: `3px solid ${hasDefSeal ? '#10b981' : 'var(--border-color)'}`
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '900', fontSize: '16px', letterSpacing: '0.5px' }}>{c.containerNumber}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{c.containerType}</div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                      {hasPhotos && (
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#3b82f6' }}>📸 {c.photos.length} foto{c.photos.length !== 1 ? 's' : ''}</span>
                      )}
                      {hasDefSeal && (
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#10b981' }}>🔒 {c.definiteSeal}</span>
                      )}
                      {!hasDefSeal && (
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#f59e0b' }}>⚠️ Sem lacre definitivo</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={20} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // TELA 2 — Edição de Container
  // ─────────────────────────────────────────────────────────────────────────────
  const renderContainer = () => {
    const c = selectedContainer;
    if (!c) return null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Voltar */}
        <button onClick={goToBooking} style={S.backBtn}>
          <ArrowLeft size={16} /> Containers do Booking
        </button>

        {/* Header Container */}
        <div style={{
          ...S.card,
          background: 'linear-gradient(135deg, var(--color-brand) 0%, #0ea5e9 100%)',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Container</div>
            <div style={{ fontSize: '22px', fontWeight: '900', color: '#fff', letterSpacing: '1px' }}>{c.containerNumber}</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginTop: '2px' }}>{c.containerType}</div>
          </div>
        </div>

        {/* ── Seção: Fotos ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}>📸 Fotos do Container</div>

          {/* Botões câmera / galeria */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <button
              onClick={() => cameraInputRef.current?.click()}
              style={{
                padding: '12px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: 'var(--color-brand)',
                color: '#fff',
                fontWeight: '800',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <Camera size={16} /> Câmera
            </button>
            <button
              onClick={() => galleryInputRef.current?.click()}
              style={{
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontWeight: '700',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <Image size={16} style={{ color: 'var(--color-brand)' }} /> Galeria
            </button>
            <input type="file" ref={cameraInputRef} onChange={handlePhotoUpload} accept="image/*" capture="environment" style={{ display: 'none' }} />
            <input type="file" ref={galleryInputRef} onChange={handlePhotoUpload} accept="image/*" multiple style={{ display: 'none' }} />
          </div>

          {/* Grid de fotos */}
          {(c.photos || []).length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {(c.photos || []).map((photo, idx) => (
                <div key={photo.id} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', aspectRatio: '1' }}>
                  <img
                    src={photo.url}
                    alt=""
                    onClick={() => setPreviewPhotoUrl(photo.url)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in', display: 'block' }}
                  />
                  <button
                    onClick={() => handleDeletePhoto(photo.id)}
                    style={{
                      position: 'absolute', top: '4px', right: '4px',
                      background: 'rgba(239,68,68,0.85)', border: 'none',
                      borderRadius: '50%', width: '22px', height: '22px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: '#fff'
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px', border: '1px dashed var(--border-color)', borderRadius: '10px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Nenhuma foto. Use os botões acima.
            </div>
          )}
        </div>

        {/* ── Seção: Lacres ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}>🔒 Lacres</div>

          {/* Lacre Definitivo */}
          <div style={{ marginBottom: '16px' }}>
            <label style={S.label}>Lacre Definitivo</label>
            <input
              type="text"
              value={c.definiteSeal || ''}
              onChange={e => updateContField('definiteSeal', e.target.value)}
              placeholder="Nº do Lacre Definitivo"
              style={S.input}
            />
          </div>

          {/* Lacres Provisórios */}
          <div>
            <label style={S.label}>Lacres Provisórios</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input
                type="text"
                value={newSealInput}
                onChange={e => setNewSealInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddSeal()}
                placeholder="Adicionar lacre..."
                style={{ ...S.input, marginBottom: 0 }}
              />
              <button
                onClick={handleAddSeal}
                style={{
                  padding: '12px 18px',
                  backgroundColor: 'var(--color-brand)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  flexShrink: 0,
                  fontSize: '13px'
                }}
              >
                Add
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {(c.provisionalSeals || []).map((seal, idx) => (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '5px 10px',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '20px',
                  fontSize: '12px', fontWeight: '700'
                }}>
                  <span>{idx + 1}. {seal}</span>
                  <button onClick={() => handleRemoveSeal(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
              {!(c.provisionalSeals?.length) && (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhum lacre provisório.</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Seção: Pesos ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}>⚖️ Pesos & Carga</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={S.label}>Qtd. Sacas (Bags)</label>
              <input type="number" value={c.bagsQuantity || ''} onChange={e => updateContField('bagsQuantity', parseInt(e.target.value, 10) || 0)} placeholder="Ex: 320" style={S.input} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={S.label}>Net Weight</label>
                <input type="text" value={c.netWeight || ''} onChange={e => updateContField('netWeight', e.target.value)} placeholder="Ex: 19.200" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Tara</label>
                <input type="text" value={c.tara || ''} onChange={e => updateContField('tara', e.target.value)} placeholder="Ex: 3.800" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Gross Weight</label>
                <input type="text" value={c.grossWeight || ''} onChange={e => updateContField('grossWeight', e.target.value)} placeholder="Ex: 23.000" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Marca / Lote</label>
                <input type="text" value={c.brand || ''} onChange={e => updateContField('brand', e.target.value)} placeholder="Ex: 002/1500" style={S.input} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Seção: Observações & Status ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}>📝 Observações & Status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={S.label}>Observações Técnicas</label>
              <textarea
                value={c.notes || ''}
                onChange={e => updateContField('notes', e.target.value)}
                placeholder="Observações da vistoria..."
                rows={3}
                style={{ ...S.input, resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={S.label}>Status do Booking</label>
              <select
                value={selectedBooking?.status || 'Pendente'}
                onChange={e => setSelectedBooking(prev => ({ ...prev, status: e.target.value }))}
                style={{ ...S.input, cursor: 'pointer', fontWeight: '700' }}
              >
                <option value="Pendente">🔴 Pendente</option>
                <option value="Em andamento">🟡 Em Andamento</option>
                <option value="Finalizado">🟢 Finalizado</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Pendência</label>
              <select
                value={selectedBooking?.pendingItem || ''}
                onChange={e => setSelectedBooking(prev => ({ ...prev, pendingItem: e.target.value }))}
                style={{ ...S.input, cursor: 'pointer', fontWeight: '700' }}
              >
                <option value="">🟢 Nenhum (Completo)</option>
                <option value="Fumigação">Fumigação</option>
                <option value="Fito">Fito</option>
                <option value="Lacre Definitivo">Lacre Definitivo</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Botão Salvar ── */}
        <button
          onClick={handleSaveContainer}
          disabled={isSaving || saveOk}
          style={{
            padding: '16px',
            borderRadius: '14px',
            border: 'none',
            backgroundColor: saveOk ? '#10b981' : 'var(--color-brand)',
            color: '#fff',
            fontWeight: '900',
            fontSize: '16px',
            cursor: isSaving || saveOk ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            boxShadow: '0 4px 18px rgba(16,185,129,0.25)',
            transition: 'background 0.3s',
            letterSpacing: '0.3px'
          }}
        >
          {saveOk ? (
            <><CheckCircle2 size={20} /> Salvo! Voltando...</>
          ) : isSaving ? (
            'Salvando...'
          ) : (
            <><CheckCircle2 size={20} /> Salvar e Voltar</>
          )}
        </button>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: hideHeader ? 'auto' : '100vh',
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      fontFamily: "'Outfit', sans-serif"
    }}>
      {/* Header — só na versão standalone */}
      {!hideHeader && (
        <header style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 20px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          position: 'sticky', top: 0, zIndex: 100
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              background: 'var(--color-brand-gradient)', color: '#fff',
              fontWeight: '800', fontSize: '14px',
              width: '32px', height: '32px', borderRadius: '8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>US</div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '800' }}>Unispect Service</div>
              <div style={{ fontSize: '9px', color: 'var(--color-brand)', fontWeight: '700', textTransform: 'uppercase' }}>Modo Campo</div>
            </div>
          </div>
          {onLogout && (
            <button onClick={onLogout} style={{
              padding: '6px 12px', fontSize: '11px',
              backgroundColor: 'var(--color-danger-light)',
              border: '1px solid var(--color-danger)',
              borderRadius: '6px', color: 'var(--color-danger)',
              fontWeight: '700', cursor: 'pointer'
            }}>Sair</button>
          )}
        </header>
      )}

      {/* Conteúdo principal */}
      <main style={{ padding: '18px 16px', flex: 1 }}>
        {/* Breadcrumb / título da tela */}
        {screen === 'list' && (
          <h2 style={{ fontSize: '18px', fontWeight: '900', marginBottom: '16px', color: 'var(--text-primary)' }}>
            📋 Bookings em Aberto
          </h2>
        )}
        {screen === 'booking' && (
          <h2 style={{ fontSize: '16px', fontWeight: '900', marginBottom: '0', color: 'var(--text-primary)' }}>
            Detalhes do Booking
          </h2>
        )}
        {screen === 'container' && (
          <h2 style={{ fontSize: '16px', fontWeight: '900', marginBottom: '0', color: 'var(--text-primary)' }}>
            Operar Container
          </h2>
        )}

        <div style={{ marginTop: screen === 'list' ? 0 : '6px' }}>
          {screen === 'list'      && renderList()}
          {screen === 'booking'   && renderBooking()}
          {screen === 'container' && renderContainer()}
        </div>
      </main>

      {/* Preview de foto em tela cheia */}
      {previewPhotoUrl && (
        <div
          onClick={() => setPreviewPhotoUrl(null)}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.96)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000, cursor: 'zoom-out', padding: '16px'
          }}
        >
          <div style={{ position: 'relative', maxWidth: '95vw', maxHeight: '95vh' }} onClick={e => e.stopPropagation()}>
            <img
              src={previewPhotoUrl}
              alt="Visualização"
              style={{ maxWidth: '100vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '10px' }}
            />
            <button
              onClick={() => setPreviewPhotoUrl(null)}
              style={{
                position: 'absolute', top: '-36px', right: '0',
                background: 'rgba(255,255,255,0.15)', border: 'none',
                borderRadius: '50%', width: '32px', height: '32px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#fff', fontSize: '16px', fontWeight: 'bold'
              }}
            >✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
