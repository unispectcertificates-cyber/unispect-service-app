import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Search, Camera, Image, Trash2, ArrowLeft, X,
  CheckCircle2, Package, ClipboardList, Settings,
  ChevronRight, Loader2, User, LogOut
} from 'lucide-react';
import { db, useBookings, useExportadores, useLocais } from '../db';

// ────────────────────────────────────────────────────────────────────────────
// Estilos utilitários inline
// ────────────────────────────────────────────────────────────────────────────
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

// Status badge color helper
const statusColor = s => {
  if (!s) return '#6b7280';
  const l = s.toLowerCase();
  if (l === 'finalizado' || l === 'estufado' || l === 'finished') return '#10b981';
  if (l === 'em andamento') return '#f59e0b';
  return '#ef4444';
};

const FINISHED = ['finalizado', 'estufado', 'finished', 'concluido', 'concluído'];
const isFinished = b => FINISHED.includes((b.status || '').toLowerCase().trim());

// ────────────────────────────────────────────────────────────────────────────
// Componente de indicador de auto-save
// ────────────────────────────────────────────────────────────────────────────
function SaveIndicator({ status }) {
  if (status === 'idle') return null;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
      fontSize: '11px',
      fontWeight: '700',
      color: status === 'saved' ? '#10b981' : 'var(--text-muted)',
      transition: 'color 0.3s'
    }}>
      {status === 'saving' ? (
        <>
          <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
          Salvando...
        </>
      ) : (
        <>
          <CheckCircle2 size={12} />
          Salvo
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Bottom Navigation — 3 abas: Booking | Container | Ajustes
// ────────────────────────────────────────────────────────────────────────────
function BottomNav({ activeTab, onTabChange, hasContainer }) {
  const tabs = [
    { id: 'booking',   label: 'Booking',   Icon: ClipboardList },
    { id: 'container', label: 'Container',  Icon: Package       },
    { id: 'ajustes',   label: 'Ajustes',   Icon: Settings      },
  ];

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: 'calc(64px + env(safe-area-inset-bottom, 0px))',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      backgroundColor: 'var(--bg-secondary)',
      borderTop: '1px solid var(--border-color)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      zIndex: 1000,
      backdropFilter: 'blur(12px)'
    }}>
      {tabs.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;
        const isDisabled = id === 'container' && !hasContainer;
        return (
          <button
            key={id}
            onClick={() => !isDisabled && onTabChange(id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '3px',
              background: 'none',
              border: 'none',
              color: isActive
                ? 'var(--color-brand)'
                : isDisabled
                  ? 'var(--border-color)'
                  : 'var(--text-muted)',
              fontSize: '10px',
              fontWeight: isActive ? '800' : '500',
              cursor: isDisabled ? 'default' : 'pointer',
              padding: '8px 20px',
              borderRadius: '12px',
              transition: 'all 0.2s',
              position: 'relative'
            }}
          >
            {/* Indicador ativo */}
            {isActive && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: '28px',
                height: '3px',
                borderRadius: '0 0 3px 3px',
                backgroundColor: 'var(--color-brand)'
              }} />
            )}
            <Icon size={22} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Painel de Ajustes
// ────────────────────────────────────────────────────────────────────────────
function AjustesPanel({ user, onLogout }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: '900', color: 'var(--text-primary)' }}>
        ⚙️ Ajustes
      </h2>

      {/* Card de perfil */}
      <div style={{
        ...S.card,
        display: 'flex',
        alignItems: 'center',
        gap: '14px'
      }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '14px',
          background: 'var(--color-brand-gradient)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0
        }}>
          <User size={24} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '900', fontSize: '16px', color: 'var(--text-primary)' }}>
            {user?.name || 'Usuário'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-brand)', fontWeight: '700', textTransform: 'uppercase' }}>
            {user?.role || 'Inspector'}
          </div>
          {user?.login && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Login: {user.login}
            </div>
          )}
        </div>
      </div>

      {/* Info do app */}
      <div style={S.card}>
        <div style={S.sectionTitle}>📱 Sobre o App</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Versão</span>
            <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>2.0.0</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Modo</span>
            <span style={{ fontWeight: '700', color: 'var(--color-brand)' }}>Campo</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Sincronização</span>
            <span style={{ fontWeight: '700', color: '#10b981' }}>✓ Firebase Realtime</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Auto-Save</span>
            <span style={{ fontWeight: '700', color: '#10b981' }}>✓ Ativado</span>
          </div>
        </div>
      </div>

      {/* Botão Sair */}
      {onLogout && (
        <button
          onClick={onLogout}
          style={{
            padding: '15px',
            borderRadius: '14px',
            border: '1px solid var(--color-danger)',
            backgroundColor: 'var(--color-danger-light)',
            color: 'var(--color-danger)',
            fontWeight: '800',
            fontSize: '15px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
          }}
        >
          <LogOut size={18} />
          Sair do App
        </button>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Componente Principal
// ────────────────────────────────────────────────────────────────────────────
export default function MobileAppView({ user, onLogout, hideHeader = false }) {
  const bookings     = useBookings();
  const exportadores = useExportadores();
  const locais       = useLocais();

  // ── Navegação
  const [screen, setScreen]               = useState('list');       // 'list' | 'booking' | 'container' | 'ajustes'
  const [activeTab, setActiveTab]         = useState('booking');
  const [selectedBooking, setSelectedBooking]     = useState(null);
  const [selectedContainer, setSelectedContainer] = useState(null);

  // ── Busca
  const [searchQuery, setSearchQuery] = useState('');

  // ── Auto-save
  const [saveStatus, setSaveStatus]   = useState('idle');  // 'idle' | 'saving' | 'saved'
  const saveTimerRef                  = useRef(null);
  const debounceTimerRef              = useRef(null);

  // ── Upload de fotos
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // ── Toast de erro (não-bloqueante, substitui alert())
  const [toastError, setToastError] = useState('');
  const toastTimerRef = useRef(null);
  const showToast = useCallback((msg) => {
    setToastError(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastError(''), 5000);
  }, []);

  // ── Preview de foto
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState(null);

  // ── Input de lacre provisório
  const [newSealInput, setNewSealInput] = useState('');

  const cameraInputRef  = useRef(null);
  const galleryInputRef = useRef(null);

  // Guard contra setState em componente desmontado (evita crash/fechamento)
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Limpar todos os timers ao desmontar
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Ref para evitar stale closure no auto-save
  const selectedBookingRef = useRef(selectedBooking);
  useEffect(() => { selectedBookingRef.current = selectedBooking; }, [selectedBooking]);

  // CSS keyframe para spinner (injetado uma vez)
  useEffect(() => {
    if (document.getElementById('mobile-spin-style')) return;
    const style = document.createElement('style');
    style.id = 'mobile-spin-style';
    style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }, []);

  // ── Função de auto-save
  const autoSave = useCallback(async (booking, container) => {
    if (!booking || !container) return;
    if (!isMountedRef.current) return; // Guard: não atualiza se desmontado
    setSaveStatus('saving');
    try {
      const updatedContainers = (booking.containers || []).map(c =>
        c.id === container.id ? container : c
      );
      const updatedBooking = { ...booking, containers: updatedContainers };
      await db.saveBooking(updatedBooking);

      // Guard pós-await: verifica novamente pois o usuário pode ter navegado
      if (!isMountedRef.current) return;

      setSelectedBooking(updatedBooking);
      setSaveStatus('saved');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) setSaveStatus('idle');
      }, 1800);
    } catch (err) {
      if (!isMountedRef.current) return;
      setSaveStatus('idle');
      console.error('Auto-save error:', err);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save com debounce (para campos de texto)
  const debouncedSave = useCallback((booking, container) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      autoSave(booking, container);
    }, 800);
  }, [autoSave]);

  // ── Atualizar campo do container + auto-save com debounce
  const updateContField = useCallback((field, value) => {
    setSelectedContainer(prev => {
      const updated = { ...prev, [field]: value };
      debouncedSave(selectedBookingRef.current, updated);
      return updated;
    });
  }, [debouncedSave]);

  // ── Atualizar status/pendência do booking + auto-save
  const updateBookingField = useCallback((field, value) => {
    setSelectedBooking(prev => {
      const updated = { ...prev, [field]: value };
      selectedBookingRef.current = updated;
      // Salva o booking inteiro (com o container atual já sincronizado)
      debouncedSave(updated, selectedContainer);
      return updated;
    });
  }, [debouncedSave, selectedContainer]);

  // ── Filtro de bookings
  const filteredBookings = bookings.filter(b => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return true; // mostra todos
    const expName = (exportadores.find(e => e.id === b.exporterId)?.name || '').toLowerCase();
    return (
      (b.bookingNumber || '').toLowerCase().includes(term) ||
      (b.certificateNumber || '').toLowerCase().includes(term) ||
      (b.stuffingReportNumber || '').toLowerCase().includes(term) ||
      expName.includes(term) ||
      (b.containers || []).some(c => (c.containerNumber || '').toLowerCase().includes(term))
    );
  });

  // ── Navegação: abrir Booking
  const openBooking = useCallback(b => {
    setSelectedBooking(b);
    setSelectedContainer(null);
    setScreen('booking');
    setActiveTab('booking');
  }, []);

  // ── Navegação: abrir Container (carrega fotos do Firestore + Storage)
  const openContainer = useCallback(async c => {
    setSelectedContainer({ ...c });
    setScreen('container');
    setActiveTab('container');
    setSaveStatus('idle');
    setNewSealInput('');

    // Carrega fotos da coleção containerPhotos e popula diretamente no container
    try {
      const photos = await db.getPhotosForContainer(c.id);
      if (!isMountedRef.current) return;

      // Merge: URLs do Storage são priorizadas; mantém ordem das refs no booking
      const photoMap = {};
      photos.forEach(p => { photoMap[p.id] = p; });

      const mergedPhotos = (c.photos || []).map(ref => ({
        ...ref,
        url: photoMap[ref.id]?.url || ref.url || null,
        storagePath: photoMap[ref.id]?.storagePath || ref.storagePath || null
      }));

      if (isMountedRef.current) {
        setSelectedContainer(prev => ({ ...prev, photos: mergedPhotos }));
      }
    } catch (err) {
      console.warn('Não foi possível carregar fotos do container:', err);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navegação: voltar para lista de Bookings
  const goToList = useCallback(() => {
    setScreen('list');
    setSelectedBooking(null);
    setSelectedContainer(null);
    setActiveTab('booking');
  }, []);

  // ── Navegação: voltar para o Booking (da tela de container)
  const goToBooking = useCallback(() => {
    setSelectedContainer(null);
    setScreen('booking');
    setActiveTab('booking');
    setSaveStatus('idle');
  }, []);

  // ── Troca de tab na bottom nav
  const handleTabChange = useCallback(tab => {
    if (tab === 'booking') {
      if (screen === 'container') {
        goToBooking();
      } else if (screen === 'ajustes') {
        setScreen(selectedBooking ? 'booking' : 'list');
        setActiveTab('booking');
      } else {
        setActiveTab('booking');
      }
    } else if (tab === 'container') {
      if (selectedContainer) {
        setScreen('container');
        setActiveTab('container');
      }
    } else if (tab === 'ajustes') {
      setScreen('ajustes');
      setActiveTab('ajustes');
    }
  }, [screen, selectedBooking, selectedContainer, goToBooking]);

  // ── Upload de fotos — salva no Firebase Storage via db.uploadPhoto
  const handlePhotoUpload = async e => {
    const files = Array.from(e.target.files || []);
    // Reset input antes de processar (permite re-seleção do mesmo arquivo)
    e.target.value = '';

    if (!files.length || !selectedContainer) return;

    setUploadingPhotos(true);
    setSaveStatus('saving');

    try {
      const containerId = selectedContainer.id;

      // Faz upload de cada arquivo sequencialmente (evita sobrecarga de memória)
      const newPhotoRefs = [];
      for (const f of files) {
        // db.uploadPhoto comprime + envia para Firebase Storage
        // Retorna { id, name, url } — url é a URL pública do Storage
        const result = await db.uploadPhoto(f, containerId);
        if (!isMountedRef.current) return;
        // Inclui url e storagePath para exibição imediata e exclusão futura
        newPhotoRefs.push({ id: result.id, name: result.name, url: result.url });
      }

      // Captura referências estáveis (evita closure stale)
      const currentContainer = selectedContainer;
      const currentBooking   = selectedBookingRef.current;

      // Salva as referências (id, name, url) no booking
      const updatedContainer = {
        ...currentContainer,
        photos: [...(currentContainer.photos || []), ...newPhotoRefs]
      };

      setSelectedContainer(updatedContainer);
      await autoSave(currentBooking, updatedContainer);
    } catch (err) {
      if (!isMountedRef.current) return;
      setSaveStatus('idle');
      const msg = err?.message || 'Erro ao enviar foto.';
      showToast(msg);
      console.error('Photo upload error:', err);
    } finally {
      if (isMountedRef.current) setUploadingPhotos(false);
    }
  };

  const handleDeletePhoto = async id => {
    if (!isMountedRef.current) return;
    // Pega o storagePath da foto atual para passar ao deletePhoto
    const photo = (selectedContainer?.photos || []).find(p => p.id === id);
    // Remove do Firestore e do Firebase Storage
    db.deletePhoto(id, photo?.storagePath || null).catch(err => console.warn('deletePhoto error:', err));
    // Remove da lista de referências no container e salva
    setSelectedContainer(prev => {
      const updated = { ...prev, photos: (prev.photos || []).filter(p => p.id !== id) };
      autoSave(selectedBookingRef.current, updated);
      return updated;
    });
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

  // ─────────────────────────────────────────────────────────────────────────
  // TELA: Lista de Bookings
  // ─────────────────────────────────────────────────────────────────────────
  const renderList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: '900', color: 'var(--text-primary)', margin: 0 }}>
        📋 Bookings
      </h2>

      {/* Campo de busca */}
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

      {/* Contador */}
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {searchQuery
          ? `Resultados (${filteredBookings.length})`
          : `📋 Todos os Bookings (${filteredBookings.length})`}
      </div>

      {/* Lista de cards */}
      {filteredBookings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '13px' }}>
          Nenhum booking encontrado.
        </div>
      ) : filteredBookings.map(b => {
        const exp = exportadores.find(e => e.id === b.exporterId)?.name || 'N/A';
        const loc = locais.find(l => l.id === b.locationId)?.name || '';
        const sc  = statusColor(b.status);
        const contCount = (b.containers || []).length;
        const finished  = isFinished(b);
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
              borderLeft: `4px solid ${sc}`,
              opacity: finished ? 0.65 : 1
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
                {exp}{loc ? ` · ${loc}` : ''}
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

  // ─────────────────────────────────────────────────────────────────────────
  // TELA: Detalhe do Booking + lista de containers
  // ─────────────────────────────────────────────────────────────────────────
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
          <ArrowLeft size={16} /> Todos os Bookings
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

        {/* Lista de Containers */}
        <div>
          <div style={S.sectionTitle}>📦 Containers ({containers.length}) — Selecione para inspecionar</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {containers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
                Nenhum container nesta reserva.
              </div>
            ) : containers.map(c => {
              const hasPhotos  = (c.photos || []).length > 0;
              const hasDefSeal = !!c.definiteSeal;
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
                    borderLeft: `3px solid ${hasDefSeal ? '#10b981' : 'var(--border-color)'}`,
                    transition: 'transform 0.1s'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '900', fontSize: '16px', letterSpacing: '0.5px' }}>{c.containerNumber}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{c.containerType}</div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                      {hasPhotos && (
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#3b82f6' }}>📸 {c.photos.length} foto{c.photos.length !== 1 ? 's' : ''}</span>
                      )}
                      {hasDefSeal ? (
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#10b981' }}>🔒 {c.definiteSeal}</span>
                      ) : (
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

  // ─────────────────────────────────────────────────────────────────────────
  // TELA: Edição de Container (com auto-save, sem botão Salvar)
  // ─────────────────────────────────────────────────────────────────────────
  const renderContainer = () => {
    const c = selectedContainer;
    if (!c) return null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Header com Voltar + Save Indicator */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={goToBooking} style={S.backBtn}>
            <ArrowLeft size={16} /> Containers do Booking
          </button>
          <SaveIndicator status={saveStatus} />
        </div>

        {/* Card do Container */}
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
              onClick={() => !uploadingPhotos && cameraInputRef.current?.click()}
              disabled={uploadingPhotos}
              style={{
                padding: '12px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: uploadingPhotos ? 'var(--border-color)' : 'var(--color-brand)',
                color: '#fff',
                fontWeight: '800',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: uploadingPhotos ? 'not-allowed' : 'pointer',
                opacity: uploadingPhotos ? 0.7 : 1,
                transition: 'all 0.2s'
              }}
            >
              {uploadingPhotos
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Enviando...</>
                : <><Camera size={16} /> Câmera</>
              }
            </button>
            <button
              onClick={() => !uploadingPhotos && galleryInputRef.current?.click()}
              disabled={uploadingPhotos}
              style={{
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-tertiary)',
                color: uploadingPhotos ? 'var(--text-muted)' : 'var(--text-primary)',
                fontWeight: '700',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: uploadingPhotos ? 'not-allowed' : 'pointer',
                opacity: uploadingPhotos ? 0.6 : 1,
                transition: 'all 0.2s'
              }}
            >
              <Image size={16} style={{ color: uploadingPhotos ? 'var(--text-muted)' : 'var(--color-brand)' }} /> Galeria
            </button>
            <input type="file" ref={cameraInputRef}  onChange={handlePhotoUpload} accept="image/*" capture="environment" style={{ display: 'none' }} />
            <input type="file" ref={galleryInputRef} onChange={handlePhotoUpload} accept="image/*" multiple style={{ display: 'none' }} />
          </div>

          {/* Grid de fotos */}
          {(c.photos || []).length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {(c.photos || []).map(photo => {
                // URL direta do Firebase Storage (ou fallback para base64 legado)
                const photoSrc = photo.url || null;
                return (
                  <div key={photo.id} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', aspectRatio: '1', backgroundColor: 'var(--bg-tertiary)' }}>
                    {photoSrc ? (
                      <img
                        src={photoSrc}
                        alt=""
                        onClick={() => setPreviewPhotoUrl(photoSrc)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in', display: 'block' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Loader2 size={20} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
                      </div>
                    )}
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
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px', border: '1px dashed var(--border-color)', borderRadius: '10px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Nenhuma foto. Use os botões acima para fotografar ou importar da galeria.
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
              <input
                type="number"
                value={c.bagsQuantity || ''}
                onChange={e => updateContField('bagsQuantity', parseInt(e.target.value, 10) || 0)}
                placeholder="Ex: 320"
                style={S.input}
              />
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
                onChange={e => updateBookingField('status', e.target.value)}
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
                onChange={e => updateBookingField('pendingItem', e.target.value)}
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

        {/* Espaço extra para a bottom nav não sobrepor o último card */}
        <div style={{ height: '16px' }} />
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      fontFamily: "'Outfit', sans-serif"
    }}>
      {/* Header fixo */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 20px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            background: 'var(--color-brand-gradient)',
            color: '#fff',
            fontWeight: '800',
            fontSize: '13px',
            width: '30px',
            height: '30px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>US</div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '800' }}>Unispect Service</div>
            <div style={{ fontSize: '9px', color: 'var(--color-brand)', fontWeight: '700', textTransform: 'uppercase' }}>Modo Campo</div>
          </div>
        </div>
        {/* Indicador de save no header quando em container */}
        {screen === 'container' && <SaveIndicator status={saveStatus} />}
      </header>

      {/* Conteúdo principal com padding para nav inferior */}
      <main style={{
        padding: '16px 16px',
        flex: 1,
        paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))'
      }}>
        {screen === 'list'      && renderList()}
        {screen === 'booking'   && renderBooking()}
        {screen === 'container' && renderContainer()}
        {screen === 'ajustes'   && <AjustesPanel user={user} onLogout={onLogout} />}
      </main>

      {/* Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        hasContainer={!!selectedContainer}
      />

      {/* Toast de erro — não-bloqueante, substitui alert() */}
      {toastError && (
        <div
          onClick={() => setToastError('')}
          style={{
            position: 'fixed',
            top: '70px',
            left: '16px',
            right: '16px',
            zIndex: 20000,
            backgroundColor: '#ef4444',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: '700',
            boxShadow: '0 4px 20px rgba(239,68,68,0.4)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            cursor: 'pointer',
            animation: 'slideDown 0.3s ease'
          }}
        >
          <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', marginBottom: '2px', opacity: 0.85 }}>Erro</div>
            <div>{toastError}</div>
          </div>
          <span style={{ flexShrink: 0, opacity: 0.7, fontSize: '16px' }}>✕</span>
        </div>
      )}

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
