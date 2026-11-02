import {enqueueBookingPhotos, listBookingPhotoJobs, retryBookingPhotos, cancelBookingPhoto, getLocalPhotoUrl} from '../utils/bookingPhotoQueue.js';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Search, Camera, Image, Trash2, ArrowLeft, X,
  CheckCircle2, Package, ClipboardList, Settings,
  ChevronRight, Loader2, User, LogOut, RefreshCw, Layers
} from 'lucide-react';
import { db, useBookings, useExportadores, useLocais, getSealText, matchesBooking, getMatchedContainers } from '../db';
import FieldCapturePanel from './FieldCapturePanel';
import FieldCaptureNotice from './FieldCaptureNotice';
import YardFieldFlow from './YardFieldFlow';
import { startFieldSynchronization } from '../utils/fieldService';
import { startYardSynchronization } from '../utils/yardService';
import { recognizeContainerPhoto, validateIso6346CheckDigit } from '../utils/containerOcr';
import { normalizeContainerNumber } from '../utils/containerIdentity';
import PhotoDownloadButton from './PhotoDownloadButton';
import PhotoEnlargedModal from './PhotoEnlargedModal';

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
// Bottom Navigation — 4 abas: Booking | Pátio | Container | Ajustes
// ────────────────────────────────────────────────────────────────────────────
function BottomNav({ activeTab, onTabChange, hasContainer }) {
  const tabs = [
    { id: 'booking',   label: 'Booking',   Icon: ClipboardList },
    { id: 'yard',      label: 'Pátio',     Icon: Layers        },
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
function AjustesPanel({ user, onLogout, onRefresh, isRefreshing }) {
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

      {/* Botão de Atualizar e Sincronizar Sistema */}
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        style={{
          padding: '14px 16px',
          borderRadius: '14px',
          border: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          fontWeight: '800',
          fontSize: '14px',
          cursor: isRefreshing ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          boxShadow: 'var(--shadow-sm)',
          transition: 'all 0.2s ease'
        }}
      >
        <RefreshCw size={18} className={isRefreshing ? "spin" : ""} style={{ color: 'var(--color-brand)' }} />
        <span>{isRefreshing ? 'Atualizando Sistema...' : '🔄 Atualizar e Sincronizar Dados'}</span>
      </button>

      {/* Info do app */}
      <div style={S.card}>
        <div style={S.sectionTitle}>📱 Sobre o App</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Versão</span>
            <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>2.2.1</span>
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
export default function MobileAppView({ user, onLogout, hideHeader = false, onRefresh, isRefreshing: parentRefreshing = false }) {
  useEffect(() => {
    const role = String(user?.role || '').trim().toUpperCase();
    if (role === 'ADM' || role === 'INSPECTOR') {
      const stopField = startFieldSynchronization();
      const stopYard = startYardSynchronization();
      return () => {
        if (typeof stopField === 'function') stopField();
        if (typeof stopYard === 'function') stopYard();
      };
    }
  }, [user?.role]);
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
  const debounceTimerRef              = useRef(null);

  // ── Upload de fotos e miniaturas imediatas
  const [photoJobs, setPhotoJobs] = useState([]);
  const saveChainRef = useRef(Promise.resolve());
  const pendingEditsRef = useRef(new Map());
  const flushEditsRef = useRef(null);
  const serializeEdit = useCallback(action => {
    const pending = saveChainRef.current.then(action);
    saveChainRef.current = pending.catch(() => {});
    return pending;
  }, []);

  // Miniaturas imediatas: combina fotos remotas confirmadas com fotos pendentes na fila local
  const displayedPhotos = useMemo(() => {
    if (!selectedContainer) return [];
    const confirmed = selectedContainer.photos || [];
    const confirmedIds = new Set(confirmed.map(p => p.id));
    const isTarget = j =>
      String(j.containerId || '').trim() === String(selectedContainer.id || '').trim() ||
      (selectedContainer.containerNumber && String(j.containerId || '').trim().toUpperCase() === String(selectedContainer.containerNumber).trim().toUpperCase());

    const pending = photoJobs
      .filter(j => isTarget(j) && !confirmedIds.has(j.id))
      .map(j => ({
        id: j.id,
        name: j.file?.name || `foto_${j.id}.jpg`,
        url: j.localUrl || getLocalPhotoUrl(j.id) || null,
        isPending: true,
        containerId: j.containerId,
        bookingId: j.bookingId,
        createdAt: j.createdAt || 0
      }));
    return [...confirmed, ...pending];
  }, [selectedContainer, photoJobs]);

  // Contagem de fotos considerando pendências na fila para os cards de container
  const getContainerPhotoCount = useCallback(c => {
    if (!c) return 0;
    const confirmed = c.photos || [];
    const confirmedIds = new Set(confirmed.map(p => p.id));
    const isTarget = j =>
      String(j.containerId || '').trim() === String(c.id || '').trim() ||
      (c.containerNumber && String(j.containerId || '').trim().toUpperCase() === String(c.containerNumber).trim().toUpperCase());

    const pendingCount = photoJobs.filter(j => isTarget(j) && !confirmedIds.has(j.id)).length;
    return confirmed.length + pendingCount;
  }, [photoJobs]);

  useEffect(() => {
    const refresh = () => listBookingPhotoJobs().then(setPhotoJobs).catch(e => console.error('Fila local:', e));
    const saved = event => {
      const {booking, containerId} = event.detail;
      const remoteCont = (booking?.containers || []).find(x =>
        String(x.id || '').trim() === String(containerId).trim() ||
        String(x.containerNumber || '').trim().toUpperCase() === String(containerId).trim().toUpperCase()
      );
      if (remoteCont) {
        setSelectedBooking(prev => prev?.id === booking.id ? {
          ...prev,
          _revision: booking._revision,
          containers: (prev.containers || []).map(c =>
            (String(c.id || '').trim() === String(containerId).trim() ||
             String(c.containerNumber || '').trim().toUpperCase() === String(containerId).trim().toUpperCase())
              ? { ...c, photos: remoteCont.photos || [] }
              : c
          )
        } : prev);
        setSelectedContainer(prev => {
          if (!prev) return prev;
          const match = String(prev.id || '').trim() === String(containerId).trim() ||
                        String(prev.containerNumber || '').trim().toUpperCase() === String(containerId).trim().toUpperCase();
          return match ? { ...prev, photos: remoteCont.photos || [] } : prev;
        });
      }
    };
    window.addEventListener('unispect-booking-photo-queue', refresh);
    window.addEventListener('unispect-booking-photo-saved', saved);
    refresh();
    return () => {
      window.removeEventListener('unispect-booking-photo-queue', refresh);
      window.removeEventListener('unispect-booking-photo-saved', saved);
    };
  }, [user?.id, user?.login]);

  // ── Atualização Manual / Refresh
  const [localRefreshing, setLocalRefreshing] = useState(false);
  const isRefreshing = parentRefreshing || localRefreshing;

  // ── Toast de notificação tipado (vermelho exclusivamente para falhas reais)
  const [toast, setToast] = useState(null); // { message: string, type: 'error' | 'success' | 'info' | 'warning' }
  const toastTimerRef = useRef(null);
  const showToast = useCallback((msg, type = 'error') => {
    if (!msg) {
      setToast(null);
      return;
    }
    const message = typeof msg === 'string' ? msg : (msg?.message || String(msg));
    const finalType = (typeof msg === 'object' && msg?.type) ? msg.type : type;
    setToast({ message, type: finalType });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), finalType === 'error' ? 6000 : 3500);
  }, []);

  const handleManualRefresh = useCallback(async () => {
    setLocalRefreshing(true);
    try {
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of registrations) {
            await reg.update();
          }
        } catch (e) {
          console.warn('SW update warning:', e);
        }
      }
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          for (const k of keys) await caches.delete(k);
        } catch (ce) {
          console.warn('Caches delete:', ce);
        }
      }
      await db.init().catch(e => console.warn('DB init refresh:', e));
      if (onRefresh) {
        await onRefresh();
      }
      showToast('Dados e sistema sincronizados com sucesso!', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 400);
    } catch (err) {
      console.error('Refresh error:', err);
      showToast('Erro ao atualizar: ' + (err.message || 'Tente novamente.'), 'error');
      setTimeout(() => {
        window.location.reload();
      }, 600);
    } finally {
      if (isMountedRef.current) setLocalRefreshing(false);
    }
  }, [onRefresh, showToast]);

  // ── Preview de foto
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState(null);
  const [previewContainer, setPreviewContainer] = useState(null);

  // ── Input de lacre provisório
  const [newSealInput, setNewSealInput] = useState('');

  const cameraInputRef  = useRef(null);
  const galleryInputRef = useRef(null);

  // ── Identificação de Container via Câmera + OCR
  const searchCameraInputRef = useRef(null);
  const [capturedPhotoFile, setCapturedPhotoFile] = useState(null);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState(null);
  const [isOcrScanning, setIsOcrScanning] = useState(false);
  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const [recognizedNumber, setRecognizedNumber] = useState('');
  const [recognizedTara, setRecognizedTara] = useState('');
  const [, setOcrConfidence] = useState(0);

  // ── Desempate quando container existe em múltiplos bookings
  const [multipleBookingsList, setMultipleBookingsList] = useState([]);
  const [matchingContainerNum, setMatchingContainerNum] = useState('');
  const [multipleBookingsModalOpen, setMultipleBookingsModalOpen] = useState(false);

  // ── Destaque de container identificado
  const [highlightedContainerId, setHighlightedContainerId] = useState(null);

  // ── Inicialização do FieldCapturePanel quando Booking não for encontrado
  const [fieldCaptureInitial, setFieldCaptureInitial] = useState(null);

  // Guard contra setState em componente desmontado (evita crash/fechamento)
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Entrega as edições já digitadas antes de limpar o debounce.
      flushEditsRef.current?.();
      // Limpar todos os timers ao desmontar
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Ref para evitar stale closure no auto-save
  const selectedBookingRef = useRef(selectedBooking);
  useEffect(() => { selectedBookingRef.current = selectedBooking; }, [selectedBooking]);

  // Sincronização multiusuário contínua: atualiza outros containers e fotos em tempo real sem sobrescrever campos em digitação
  useEffect(() => {
    if (!selectedBooking?.id) return;
    return db.subscribeBooking(selectedBooking.id, remote => {
      if (!remote) return;
      const remoteContainers = new Map((remote.containers || []).map(c => [c.id, c]));

      setSelectedBooking(prev => {
        if (!prev || prev.id !== remote.id) return prev;
        const updatedContainers = (prev.containers || []).map(c => {
          if (!remoteContainers.has(c.id)) return c;
          const remoteC = remoteContainers.get(c.id);
          // Se for o container atualmente aberto, preserva os campos com edição pendente
          if (c.id === selectedContainer?.id) {
            const merged = { ...remoteC };
            for (const edit of pendingEditsRef.current.values()) {
              if (edit.containerId === c.id) {
                merged[edit.field] = edit.value;
              }
            }
            return merged;
          }
          // Outros containers são atualizados diretamente
          return remoteC;
        });
        return {
          ...remote,
          containers: updatedContainers
        };
      });

      setSelectedContainer(prev => {
        if (!prev || !remoteContainers.has(prev.id)) return prev;
        const remoteC = remoteContainers.get(prev.id);
        const merged = { ...remoteC };
        for (const edit of pendingEditsRef.current.values()) {
          if (edit.containerId === prev.id) {
            merged[edit.field] = edit.value;
          }
        }
        return merged;
      });
    }, error => console.error('Atualização remota do booking:', error));
  }, [selectedBooking?.id, selectedContainer?.id]);

  // CSS keyframe para spinner (injetado uma vez)
  useEffect(() => {
    if (document.getElementById('mobile-spin-style')) return;
    const style = document.createElement('style');
    style.id = 'mobile-spin-style';
    style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }, []);

  // Apenas os campos editados entram na transação. Edições em containers distintos não se substituem.
  const scheduleEdit = useCallback((bookingId, containerId, field, value, previous) => {
    const key = JSON.stringify([bookingId,containerId,field]);
    const old = pendingEditsRef.current.get(key);
    pendingEditsRef.current.set(key,{bookingId,containerId,field,value,previous:old ? old.previous : previous});
    if(debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setSaveStatus('saving');
    flushEditsRef.current = () => {
      if(debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      const edits = [...pendingEditsRef.current.values()];
      pendingEditsRef.current.clear();
      void serializeEdit(async () => {
        let hadError = false;
        for(const edit of edits) {
          const changes = {[edit.field]:edit.value};
          const expected = {[edit.field]:edit.previous};
          try {
            const saved = edit.containerId
              ? await db.patchBookingContainer(edit.bookingId,edit.containerId,changes,expected)
              : await db.patchBookingFields(edit.bookingId,changes,expected);
            if(isMountedRef.current) setSelectedBooking(prev => prev?.id===saved.id ? saved : prev);
          } catch(error) {
            if(isMountedRef.current) {setSaveStatus('idle');showToast(error.message+' Esta alteração não foi confirmada.');}
            hadError = true;
            console.error('Campo não confirmado:',error);
          }
        }
        if(isMountedRef.current) setSaveStatus(hadError ? 'idle' : 'saved');
      }).catch(error => console.error('Salvamento por campo:',error));
    };
    debounceTimerRef.current = setTimeout(()=>flushEditsRef.current?.(),800);
  },[serializeEdit,showToast]);

  const updateContField = useCallback((field,value) => {
    if(!selectedContainer || !selectedBookingRef.current)return;
    scheduleEdit(selectedBookingRef.current.id,selectedContainer.id,field,value,selectedContainer[field]);
    setSelectedContainer(prev=>({...prev,[field]:value}));
  },[selectedContainer,scheduleEdit]);

  const updateBookingField = useCallback((field,value) => {
    const previous=selectedBookingRef.current;
    if(!previous)return;
    scheduleEdit(previous.id,null,field,value,previous[field]);
    const updated={...previous,[field]:value};
    selectedBookingRef.current=updated;
    setSelectedBooking(updated);
  },[scheduleEdit]);

  // ── Filtro de bookings com busca universal e inteligente
  const filteredBookings = bookings.filter(b => 
    matchesBooking(b, searchQuery, { exportadores, locais })
  );

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
      const photos = await db.getPhotosForContainer(c.id, c.fieldPhotoSourceIds || []);
      if (!isMountedRef.current) return;

      // Merge: URLs do Storage são priorizadas; mantém ordem das refs no booking
      const photoMap = {};
      photos.forEach(p => { photoMap[p.id] = p; });



      if (isMountedRef.current) {
        setSelectedContainer(prev => prev?.id !== c.id ? prev : ({...prev, photos:(prev.photos || []).map(ref => ({
          ...ref, url:photoMap[ref.id]?.url || ref.url || null,
          storagePath:photoMap[ref.id]?.storagePath || ref.storagePath || null
        }))}));
      }
    } catch (err) {
      console.warn('Não foi possível carregar fotos do container:', err);
    }
  }, []);

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
      } else if (screen === 'ajustes' || screen === 'yard') {
        setScreen(selectedBooking ? 'booking' : 'list');
        setActiveTab('booking');
      } else {
        setActiveTab('booking');
      }
    } else if (tab === 'yard') {
      setScreen('yard');
      setActiveTab('yard');
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

  // Guarda no IndexedDB e libera a interface imediatamente. A rede envia em segundo plano.
  const handlePhotoUpload = async e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const bookingId = selectedBookingRef.current?.id;
    const containerId = selectedContainer?.id;
    if (!files.length || !bookingId || !containerId) return;

    try {
      await enqueueBookingPhotos(bookingId, containerId, files);
      // Sem avisos intrusivos por captura: as miniaturas surgem imediatamente via photoJobs + displayedPhotos
    } catch (error) {
      if (isMountedRef.current) showToast('Não foi possível gravar a foto no aparelho: ' + (error.message || 'Verifique o espaço disponível.'), 'error');
    }
  };

  const handleDeletePhoto = async id => {
    const bookingId = selectedBookingRef.current?.id;
    const containerId = selectedContainer?.id;
    const photo = displayedPhotos.find(p => p.id === id);
    if (!bookingId || !containerId) return;

    // 1. Cancela da fila local (cancela se pendente ou em upload e revoga URL local)
    await cancelBookingPhoto(id);

    // 2. Atualização otimista imediata na interface do aparelho (container e booking)
    if (isMountedRef.current) {
      setSelectedContainer(prev => prev?.id === containerId
        ? { ...prev, photos: (prev.photos || []).filter(p => p.id !== id) }
        : prev
      );
      setSelectedBooking(prev => prev?.id === bookingId
        ? {
            ...prev,
            containers: (prev.containers || []).map(c =>
              c.id === containerId
                ? { ...c, photos: (c.photos || []).filter(p => p.id !== id) }
                : c
            )
          }
        : prev
      );
    }

    // 3. Exclusão definitiva e atômica no Firestore e Firebase Storage
    try {
      await serializeEdit(() => db.removeBookingPhoto(bookingId, containerId, id));
      await db.deletePhoto(id, photo?.storagePath || null);
    } catch (error) {
      console.warn('Exclusão remota da foto:', error);
      // Notifica se a foto já havia sido confirmada remotamente e a rede falhou
      if (!photo?.isPending && isMountedRef.current) {
        showToast('Não foi possível concluir a exclusão: ' + error.message, 'error');
      }
    }
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

  const handleSearchPhotoCaptured = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (capturedPhotoUrl) {
      URL.revokeObjectURL(capturedPhotoUrl);
    }
    const url = URL.createObjectURL(file);
    setCapturedPhotoFile(file);
    setCapturedPhotoUrl(url);
    setIsOcrScanning(true);
    setRecognizedNumber('');
    setRecognizedTara('');
    setOcrConfidence(0);
    setOcrModalOpen(true);

    try {
      const res = await recognizeContainerPhoto(file);
      if (res.containerNumber) {
        setRecognizedNumber(res.containerNumber);
      }
      if (res.tara) {
        setRecognizedTara(res.tara);
      }
      setOcrConfidence(res.confidence || 0);
    } catch (err) {
      console.warn('Erro no reconhecimento OCR:', err);
    } finally {
      if (isMountedRef.current) {
        setIsOcrScanning(false);
      }
    }
  };

  const associatePhotoAndOpenBooking = async (targetBooking, targetContainer, photoFile) => {
    try {
      await enqueueBookingPhotos(targetBooking.id, targetContainer.id, [photoFile]);
      setSelectedBooking(targetBooking);
      selectedBookingRef.current = targetBooking;
      setHighlightedContainerId(targetContainer.id);
      setScreen('booking');
      setActiveTab('booking');
    } catch (error) {
      if (isMountedRef.current) showToast('Não foi possível guardar a foto: ' + (error.message || 'Erro local.'), 'error');
    }
  };

  const handleConfirmAndSearchBooking = async () => {
    const cleanNum = normalizeContainerNumber(recognizedNumber);
    if (!/^[A-Z]{4}\d{7}$/.test(cleanNum)) {
      showToast('Digite um número de container válido com 4 letras e 7 dígitos (ex: MSDU8821297).', 'warning');
      return;
    }

    setOcrModalOpen(false);

    // 1. Procura em todos os Bookings pelo container normalizado
    const matches = [];
    for (const b of bookings) {
      const cont = (b.containers || []).find(c => 
        normalizeContainerNumber(c.containerNumber || c.id) === cleanNum
      );
      if (cont) {
        matches.push({ booking: b, container: cont });
      }
    }

    // Ordenação por prioridade: Em andamento > Pendente > Finalizado, depois datas mais recentes
    matches.sort((a, b) => {
      const statusScore = s => {
        const lower = String(s || '').toLowerCase();
        if (lower.includes('andamento')) return 3;
        if (lower.includes('pendente')) return 2;
        if (lower.includes('finalizado') || lower.includes('concluido')) return 1;
        return 0;
      };
      const scoreA = statusScore(a.booking.status);
      const scoreB = statusScore(b.booking.status);
      if (scoreA !== scoreB) return scoreB - scoreA;
      const dateA = new Date(a.booking.launchDate || a.booking.startDate || 0).getTime();
      const dateB = new Date(b.booking.launchDate || b.booking.startDate || 0).getTime();
      return dateB - dateA;
    });

    if (matches.length > 1) {
      // Múltiplos Bookings encontrados: abre modal para o usuário escolher
      setMatchingContainerNum(cleanNum);
      setMultipleBookingsList(matches);
      setMultipleBookingsModalOpen(true);
      return;
    }

    if (matches.length === 1) {
      // 1 Booking encontrado: associa foto e abre diretamente
      await associatePhotoAndOpenBooking(matches[0].booking, matches[0].container, capturedPhotoFile);
      return;
    }

    // 0 Bookings encontrados: abre cadastro de container sem Booking
    setFieldCaptureInitial({
      number: cleanNum,
      tara: recognizedTara,
      photoFile: capturedPhotoFile,
      photoUrl: capturedPhotoUrl
    });
    showToast(`Container ${cleanNum} não vinculado a nenhum Booking. Abrindo cadastro sem Booking.`, 'info');
  };

  const handleSelectMultipleBooking = async (match) => {
    setMultipleBookingsModalOpen(false);
    await associatePhotoAndOpenBooking(match.booking, match.container, capturedPhotoFile);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // TELA: Lista de Bookings
  // ─────────────────────────────────────────────────────────────────────────
  const renderList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <FieldCapturePanel
        user={user}
        bookings={bookings}
        initialCapture={fieldCaptureInitial}
        onClearInitialCapture={() => setFieldCaptureInitial(null)}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '900', color: 'var(--text-primary)', margin: 0 }}>
          📋 Bookings
        </h2>
        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '8px 14px',
            color: 'var(--text-primary)',
            fontSize: '12px',
            fontWeight: '700',
            cursor: isRefreshing ? 'wait' : 'pointer',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <RefreshCw size={14} className={isRefreshing ? "spin" : ""} style={{ color: 'var(--color-brand)' }} />
          <span>{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
        </button>
      </div>

      {/* Campo de busca com Câmera */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 14px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '14px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <Search size={18} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Buscar container (MSDU-882129-7, MSDU8821297), booking, exportador..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ background: 'none', border: 'none', color: 'var(--text-primary)', width: '100%', outline: 'none', fontSize: '13px' }}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}>
            <X size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={() => searchCameraInputRef.current?.click()}
          title="Fotografar identificação do container"
          style={{
            background: 'var(--color-brand-light)',
            border: '1px solid var(--color-brand)',
            borderRadius: '10px',
            color: 'var(--color-brand)',
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '12px',
            fontWeight: '800',
            cursor: 'pointer',
            flexShrink: 0
          }}
        >
          <Camera size={17} />
          <span>Foto</span>
        </button>
        <input
          ref={searchCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={handleSearchPhotoCaptured}
        />
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
        const matchedConts = searchQuery.trim() ? getMatchedContainers(b, searchQuery) : [];
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
              {matchedConts.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {matchedConts.map(mc => (
                    <span key={mc.id || mc.containerNumber} style={{
                      fontSize: '10px',
                      fontWeight: '800',
                      color: 'var(--color-brand)',
                      backgroundColor: 'rgba(197, 168, 128, 0.15)',
                      border: '1px solid rgba(197, 168, 128, 0.3)',
                      padding: '2px 6px',
                      borderRadius: '4px'
                    }}>
                      📦 {mc.containerNumber}
                    </span>
                  ))}
                </div>
              )}
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
              const photoCount = getContainerPhotoCount(c);
              const hasPhotos  = photoCount > 0;
              const sealText   = getSealText(c.definiteSeal);
              const hasDefSeal = !!sealText;
              const isHighlighted = highlightedContainerId && (
                c.id === highlightedContainerId ||
                normalizeContainerNumber(c.containerNumber) === normalizeContainerNumber(recognizedNumber)
              );

              return (
                <div
                  key={c.id}
                  onClick={() => openContainer(c)}
                  ref={el => {
                    if (isHighlighted && el) {
                      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                    }
                  }}
                  style={{
                    ...S.card,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    borderLeft: isHighlighted ? '4px solid var(--color-brand)' : `3px solid ${hasDefSeal ? '#10b981' : 'var(--border-color)'}`,
                    border: isHighlighted ? '2px solid var(--color-brand)' : '1px solid var(--border-color)',
                    boxShadow: isHighlighted ? '0 0 16px rgba(245, 158, 11, 0.45)' : undefined,
                    backgroundColor: isHighlighted ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-secondary)',
                    transition: 'transform 0.1s'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isHighlighted && (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '10px',
                        fontWeight: '800',
                        color: 'var(--color-brand)',
                        backgroundColor: 'rgba(245, 158, 11, 0.15)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        marginBottom: '6px'
                      }}>
                        ⭐ Container fotografado
                      </div>
                    )}
                    <div style={{ fontWeight: '900', fontSize: '16px', letterSpacing: '0.5px' }}>{c.containerNumber}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{c.containerType}</div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                      {hasPhotos && (
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#3b82f6' }}>📸 {photoCount} foto{photoCount !== 1 ? 's' : ''}</span>
                      )}
                      {hasDefSeal ? (
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#10b981' }}>🔒 {sealText}</span>
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

          <button
            type="button"
            onClick={() => {
              setFieldCaptureInitial({
                number: '',
                tara: ''
              });
              setScreen('list');
            }}
            style={{
              marginTop: '14px',
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px dashed var(--color-brand)',
              backgroundColor: 'rgba(230, 185, 65, 0.08)',
              color: 'var(--color-brand)',
              fontWeight: '800',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer',
              width: '100%'
            }}
          >
            <Package size={17} />
            <span>+ Inserir novo container</span>
          </button>
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
        <FieldCaptureNotice container={c} />
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

          {/* Botões câmera / galeria: gravação imediata sem travar a interface */}
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
                cursor: 'pointer',
                transition: 'all 0.2s'
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
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Image size={16} style={{ color: 'var(--color-brand)' }} /> Galeria
            </button>
            <input type="file" ref={cameraInputRef}  onChange={handlePhotoUpload} accept="image/*" capture="environment" style={{ display: 'none' }} />
            <input type="file" ref={galleryInputRef} onChange={handlePhotoUpload} accept="image/*" multiple style={{ display: 'none' }} />
          </div>

          {/* Grid de fotos com miniaturas imediatas e status discreto */}
          {displayedPhotos.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {displayedPhotos.map((photo, idx) => {
                // URL direta do Firebase Storage ou ObjectURL local imediato da fila
                const photoSrc = photo.url || photo.dataUrl || null;
                return (
                  <div key={photo.id || idx} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', aspectRatio: '1', backgroundColor: 'var(--bg-tertiary)' }}>
                    {photoSrc ? (
                      <img
                        src={photoSrc}
                        alt=""
                        onClick={() => { setPreviewPhotoIndex(idx); setPreviewContainer({ ...c, photos: displayedPhotos }); }}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in', display: 'block' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Loader2 size={20} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
                      </div>
                    )}
                    {photo.isPending && (
                      <div style={{
                        position: 'absolute',
                        bottom: '4px',
                        right: '4px',
                        backgroundColor: 'rgba(0,0,0,0.65)',
                        borderRadius: '10px',
                        padding: '2px 6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        fontSize: '9px',
                        color: '#fff',
                        fontWeight: '700',
                        pointerEvents: 'none'
                      }}>
                        <Loader2 size={9} style={{ animation: 'spin 1s linear infinite' }} />
                        <span>Fila</span>
                      </div>
                    )}
                    <PhotoDownloadButton
                      photo={photo}
                      containerNumber={c.containerNumber || c.number}
                      index={idx}
                      date={c.date || selectedBooking?.date}
                      variant="thumbnail"
                      style={{ top: '4px', left: '4px' }}
                    />
                    <button
                      onClick={() => handleDeletePhoto(photo.id)}
                      style={{
                        position: 'absolute', top: '4px', right: '4px',
                        background: 'rgba(239,68,68,0.85)', border: 'none',
                        borderRadius: '50%', width: '22px', height: '22px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: '#fff', zIndex: 6
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
              value={getSealText(c.definiteSeal)}
              onChange={e => updateContField('definiteSeal', e.target.value)}
              placeholder="Nº do Lacre Definitivo"
              style={S.input}
            />
          </div>

          {/* Data Lacre Definitivo */}
          <div style={{ marginBottom: '16px' }}>
            <label style={S.label}>Data Lacre Definitivo</label>
            <input
              type="date"
              value={c.definiteSealDate || ''}
              onChange={e => updateContField('definiteSealDate', e.target.value)}
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
              {(c.provisionalSeals || []).map((seal, idx) => {
                const sealText = getSealText(seal);
                return (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '5px 10px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '20px',
                    fontSize: '12px', fontWeight: '700'
                  }}>
                    <span>{idx + 1}. {sealText}</span>
                    <button onClick={() => handleRemoveSeal(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
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
      {!hideHeader && (
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Indicador discreto no cabeçalho: contador de fotos na fila */}
            {photoJobs.length > 0 && (() => {
              const critical = photoJobs.filter(j => j.attempts >= 5 || (j.error && /espaço|autoriz|permiss|não está mais/i.test(j.error)));
              if (critical.length > 0) {
                return (
                  <button
                    onClick={() => {
                      showToast(`Falha no envio de fotos: ${critical[0].error || 'Falha persistente de rede ou permissão'}`, 'error');
                      retryBookingPhotos().catch(() => {});
                    }}
                    title={`${critical.length} foto(s) com erro persistente. Toque para tentar novamente.`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#ef4444',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ fontSize: '12px' }}>⚠️</span>
                    <span>{photoJobs.length}</span>
                  </button>
                );
              }
              return (
                <div
                  title={`${photoJobs.length} foto(s) enviando em segundo plano`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(14, 165, 233, 0.12)',
                    border: '1px solid rgba(14, 165, 233, 0.25)',
                    color: 'var(--color-brand)',
                    fontSize: '11px',
                    fontWeight: '700'
                  }}
                >
                  <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>{photoJobs.length}</span>
                </div>
              );
            })()}
            {/* Indicador de save no header quando em container */}
            {screen === 'container' && <SaveIndicator status={saveStatus} />}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '6px 10px',
                color: 'var(--text-primary)',
                fontSize: '11px',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: isRefreshing ? 'wait' : 'pointer'
              }}
            >
              <RefreshCw size={12} className={isRefreshing ? "spin" : ""} style={{ color: 'var(--color-brand)' }} />
              <span>{isRefreshing ? '...' : 'Atualizar'}</span>
            </button>
            {onLogout && (
              <button
                onClick={() => {
                  if (window.confirm('Deseja realmente sair da sua conta?')) {
                    onLogout();
                  }
                }}
                title="Sair do Sistema"
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  color: '#ef4444',
                  fontSize: '11px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
              >
                <LogOut size={13} />
                <span>Sair</span>
              </button>
            )}
          </div>
        </header>
      )}

      {/* Conteúdo principal com padding para nav inferior */}
      <main style={{
        padding: '16px 16px',
        flex: 1,
        paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))'
      }}>
        {screen === 'list'      && renderList()}
        {screen === 'booking'   && renderBooking()}
        {screen === 'yard'      && <YardFieldFlow user={user} onBack={() => { setActiveTab('booking'); setScreen(selectedBooking ? 'booking' : 'list'); }} />}
        {screen === 'container' && renderContainer()}
        {screen === 'ajustes'   && <AjustesPanel user={user} onLogout={onLogout} onRefresh={handleManualRefresh} isRefreshing={isRefreshing} />}
      </main>

      {/* Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        hasContainer={!!selectedContainer}
      />
      {/* Toast de notificação tipado — vermelho exclusivamente para falhas reais */}
      {toast && (
        <div
          role="alert"
          onClick={() => setToast(null)}
          style={{
            position: 'fixed',
            top: '70px',
            left: '16px',
            right: '16px',
            zIndex: 20000,
            backgroundColor: toast.type === 'error'
              ? '#dc2626'
              : toast.type === 'success'
                ? '#059669'
                : toast.type === 'warning'
                  ? '#d97706'
                  : '#0284c7',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: '600',
            boxShadow: toast.type === 'error'
              ? '0 4px 20px rgba(220, 38, 38, 0.45)'
              : '0 4px 20px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            cursor: 'pointer',
            animation: 'slideDown 0.3s ease'
          }}
        >
          <span style={{ fontSize: '16px', flexShrink: 0 }}>
            {toast.type === 'error' ? '⚠️' : toast.type === 'success' ? '✓' : toast.type === 'warning' ? '⚠️' : 'ℹ️'}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', marginBottom: '2px', opacity: 0.9 }}>
              {toast.type === 'error' ? 'Erro' : toast.type === 'success' ? 'Sucesso' : toast.type === 'warning' ? 'Atenção' : 'Aviso'}
            </div>
            <div>{toast.message}</div>
          </div>
          <span style={{ flexShrink: 0, opacity: 0.7, fontSize: '16px' }}>✕</span>
        </div>
      )}

      {/* Preview de foto em tela cheia (Google Fotos) */}
      {previewPhotoIndex !== null && previewContainer?.photos?.[previewPhotoIndex] && (
        <PhotoEnlargedModal
          photo={previewContainer.photos[previewPhotoIndex]}
          photos={previewContainer.photos}
          currentIndex={previewPhotoIndex}
          containerNumber={previewContainer.containerNumber || previewContainer.number || previewContainer.id}
          date={previewContainer.date || selectedBooking?.date}
          onClose={() => { setPreviewPhotoIndex(null); setPreviewContainer(null); }}
          onNavigate={(newIdx) => setPreviewPhotoIndex(newIdx)}
        />
      )}

      {/* Modal de Conferência de Identificação do Container via Foto */}
      {ocrModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Conferência de Identificação do Container"
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            zIndex: 15000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px', overflowY: 'auto'
          }}
        >
          <div style={{
            maxWidth: '480px', width: '100%',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '20px',
            display: 'flex', flexDirection: 'column', gap: '14px',
            boxShadow: 'var(--shadow-xl)',
            maxHeight: '92vh', overflowY: 'auto'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  backgroundColor: 'var(--color-brand-light)', color: 'var(--color-brand)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Camera size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '800', margin: 0, color: 'var(--text-primary)' }}>
                    Identificação do Container
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Reconhecimento de número e dados da placa
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOcrModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                title="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Foto capturada */}
            {capturedPhotoUrl && (
              <div style={{
                position: 'relative', width: '100%', height: '170px',
                borderRadius: '10px', overflow: 'hidden',
                border: '1px solid var(--border-color)', backgroundColor: '#000'
              }}>
                <img
                  src={capturedPhotoUrl}
                  alt="Identificação fotografada"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
                {isOcrScanning && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: '8px', color: '#fff'
                  }}>
                    <Loader2 size={30} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-brand)' }} />
                    <span style={{ fontSize: '13px', fontWeight: '700' }}>Reconhecendo identificação...</span>
                  </div>
                )}
              </div>
            )}

            {/* Aviso offline */}
            {!navigator.onLine && (
              <div style={{
                padding: '8px 12px', borderRadius: '8px',
                backgroundColor: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)',
                color: '#f59e0b', fontSize: '12px', fontWeight: '600'
              }}>
                📡 Modo Offline: A busca será realizada nos Bookings salvos no aparelho.
              </div>
            )}

            {/* Campos de Conferência */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={S.label}>Número do Container *</label>
                <input
                  type="text"
                  placeholder="Ex: MSDU8821297"
                  value={recognizedNumber}
                  onChange={e => setRecognizedNumber(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                  style={{ ...S.input, fontWeight: '800', letterSpacing: '0.5px' }}
                />
                <div style={{ marginTop: '4px', fontSize: '11px' }}>
                  {validateIso6346CheckDigit(recognizedNumber) ? (
                    <span style={{ color: '#10b981', fontWeight: '700' }}>✓ Código ISO 6346 válido (alta precisão)</span>
                  ) : recognizedNumber.length === 11 ? (
                    <span style={{ color: '#f59e0b', fontWeight: '600' }}>⚠️ Dígito verificador não confere. Confira a placa.</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>Informe 4 letras e 7 dígitos (ex: ABCD1234567)</span>
                  )}
                </div>
              </div>

              <div>
                <label style={S.label}>Tara Reconhecida (kg)</label>
                <input
                  type="text"
                  placeholder="Ex: 3820"
                  value={recognizedTara}
                  onChange={e => setRecognizedTara(e.target.value)}
                  inputMode="numeric"
                  style={S.input}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Extraída da placa ou preenchida manualmente.
                </span>
              </div>
            </div>

            {/* Rodapé com Ações */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => searchCameraInputRef.current?.click()}
                className="btn btn-secondary"
                style={{ flex: 1, padding: '12px 8px', fontSize: '13px', justifyContent: 'center' }}
                disabled={isOcrScanning}
              >
                Tirar outra foto
              </button>
              <button
                type="button"
                onClick={handleConfirmAndSearchBooking}
                className="btn btn-primary"
                style={{ flex: 1.5, padding: '12px 14px', fontSize: '13px', fontWeight: '800', justifyContent: 'center', backgroundColor: '#059669' }}
                disabled={isOcrScanning || !recognizedNumber.trim()}
              >
                Continuar e Buscar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Múltiplos Bookings Encontrados */}
      {multipleBookingsModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Seleção de Booking Correspondente"
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            zIndex: 15500,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px', overflowY: 'auto'
          }}
        >
          <div style={{
            maxWidth: '500px', width: '100%',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '20px',
            display: 'flex', flexDirection: 'column', gap: '14px',
            boxShadow: 'var(--shadow-xl)',
            maxHeight: '92vh', overflowY: 'auto'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--color-brand)', textTransform: 'uppercase' }}>
                  Desempate de Reserva
                </span>
                <h3 style={{ fontSize: '17px', fontWeight: '900', margin: '2px 0 0', color: 'var(--text-primary)' }}>
                  Container {matchingContainerNum}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Encontrado em {multipleBookingsList.length} Bookings. Selecione qual deseja abrir:
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMultipleBookingsModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Lista ordenada de Bookings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {multipleBookingsList.map(item => {
                const b = item.booking;
                const sc = statusColor(b.status);
                const exp = exportadores.find(e => e.id === b.exporterId)?.name || 'N/A';
                const dateStr = b.launchDate || b.startDate || 'Sem data';

                return (
                  <div
                    key={b.id}
                    onClick={() => handleSelectMultipleBooking(item)}
                    style={{
                      ...S.card,
                      cursor: 'pointer',
                      borderLeft: `4px solid ${sc}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      transition: 'transform 0.15s, background-color 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>
                        {b.bookingNumber}
                      </strong>
                      <span style={{
                        fontSize: '10px', fontWeight: '800', padding: '3px 8px',
                        borderRadius: '6px', backgroundColor: `${sc}1A`, color: sc
                      }}>
                        {b.status || 'Pendente'}
                      </span>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <div>Exportador: <strong>{exp}</strong></div>
                      <div>Navio/Viagem: <strong>{b.vesselVoyage || '—'}</strong></div>
                      <div>Data: <strong>{dateStr}</strong></div>
                    </div>

                    <div style={{
                      marginTop: '4px',
                      display: 'flex',
                      justifyContent: 'flex-end',
                      color: 'var(--color-brand)',
                      fontSize: '12px',
                      fontWeight: '800'
                    }}>
                      Salvar foto e abrir este Booking →
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setMultipleBookingsModalOpen(false)}
              style={{ padding: '10px', justifyContent: 'center' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
