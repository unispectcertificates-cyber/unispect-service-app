import { findBooking, planImport, previewToken, normalizeContainerNumber, importFieldLabels } from './utils/bookingImport';
import { parseRomaneioPdf } from './utils/pdfParser';
import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, ShieldAlert, Hourglass, CheckCircle2, X, Trash2, UploadCloud, Users, Settings, Camera, RefreshCw, Plus, LogOut } from 'lucide-react';
import { db, useBookings, useLocais, useExportadores, getSealText, matchesBooking, getMatchedContainers } from './db';
import { subscribePendingFieldContainers } from './utils/fieldService';
import BookingManagementModal from './components/BookingManagementModal';
import ExportadoresList from './components/ExportadoresList';
import LocaisList from './components/LocaisList';
import InspectorsList from './components/InspectorsList';
import ReportView from './components/ReportView';
import MobileAppView from './components/MobileAppView';
import Login from './components/Login';
import UsersList from './components/UsersList';
import FieldContainersView from './components/FieldContainersView';
import Sidebar from './components/Sidebar';
import DesktopDashboardView from './components/DesktopDashboardView';

export default function App() {
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(() => window.innerWidth <= 1024);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileOrTablet(window.innerWidth <= 1024);
    };
    window.addEventListener('resize', handleResize);

    // DEBUG: Global error handler to catch silent UI freezes
    const origError = window.onerror;
    window.onerror = function (msg, url, line, col, error) {
      alert("ERRO NO SISTEMA: " + msg + "\nLinha: " + line);
      if (origError) return origError(msg, url, line, col, error);
      return false;
    };
    const origUnhandled = window.onunhandledrejection;
    window.onunhandledrejection = function (event) {
      alert("ERRO ASSÍNCRONO: " + (event.reason ? event.reason.message || event.reason : 'Unknown'));
      if (origUnhandled) return origUnhandled(event);
    };

    return () => {
      window.removeEventListener('resize', handleResize);
      window.onerror = origError;
      window.onunhandledrejection = origUnhandled;
    };
  }, []);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [currentTab, setCurrentTab] = useState(() => {
    const isMob = window.innerWidth <= 768;
    const usr = db.getUser();
    if (isMob && usr && usr.role !== 'Exportador') {
      return 'field-portal';
    }
    return 'bookings';
  });
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [activeReport, setActiveReport] = useState(null); // { id, type }
  const [user, setUser] = useState(db.getUser());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [serverIp, setServerIp] = useState(localStorage.getItem('containtrack_server_ip') || '');
  const bookings = useBookings();
  const exportadores = useExportadores();
  const locais = useLocais();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [pendingFieldCount, setPendingFieldCount] = useState(0);

  useEffect(() => {
    const unsub = subscribePendingFieldContainers(
      records => setPendingFieldCount(records.length),
      () => setPendingFieldCount(0)
    );
    return () => unsub();
  }, []);

  // Modais e Menu Dropdown
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Estados do Redesign Desktop e Atualização de Romaneio
  const [showUpdateRomaneioPicker, setShowUpdateRomaneioPicker] = useState(false);
  const [updatePickerSearch, setUpdatePickerSearch] = useState('');
  const [isParsingPickerPdf, setIsParsingPickerPdf] = useState(false);
  const [pickerPdfError, setPickerPdfError] = useState('');
  const [initialOpenUpdateRomaneio, setInitialOpenUpdateRomaneio] = useState(false);
  const [initialUpdateRomaneioFile, setInitialUpdateRomaneioFile] = useState(null);

  const handlePickerPdfUpload = async (file) => {
    if (!file) return;
    setIsParsingPickerPdf(true);
    setPickerPdfError('');
    try {
      const parsed = await parseRomaneioPdf(file, { exportadores, locais });
      if (!parsed.bookingNumber) {
        setPickerPdfError('Não foi possível identificar o número do Booking no arquivo PDF.');
        return;
      }
      const match = findBooking(bookings, parsed.bookingNumber);
      if (match) {
        setShowUpdateRomaneioPicker(false);
        setInitialOpenUpdateRomaneio(true);
        setInitialUpdateRomaneioFile(file);
        setSelectedBookingId(match.id);
      } else {
        setPickerPdfError(`O Booking "${parsed.bookingNumber}" identificado no PDF não existe no sistema. Utilize "+ Novo romaneio" para cadastrá-lo.`);
      }
    } catch (err) {
      setPickerPdfError(err.message || 'Erro ao processar PDF.');
    } finally {
      setIsParsingPickerPdf(false);
    }
  };

  // Form de Novo Booking/Certificado
  const [newBookingData, setNewBookingData] = useState({
    bookingNumber: '',
    exporterId: '',
    startDate: new Date().toISOString().split('T')[0],
    launchDate: new Date().toISOString().split('T')[0],
    fumigationDate: new Date().toISOString().split('T')[0],
    fitoDate: new Date().toISOString().split('T')[0],
    definiteSealDate: '',
    vesselVoyage: '',
    vesselName: '',
    vesselVoyageNum: '',
    bagsQuantity: '',
    locationId: '',
    status: 'Pendente',
    type: 'Redex Operation Report',
    stuffingReportNumber: '',
    mercadoria: 'café',
    portoDestino: '',
    importador: '',
    armador: '',
    embalagem: 'sacaria',
    containers: []
  });

  const [isSavingImport, setIsSavingImport] = useState(false);
  const importSavingRef = useRef(false);
  const [importSourceName, setImportSourceName] = useState('');
  const [importReferences, setImportReferences] = useState([]);
  let existingImportBooking = null;
  let importError = '';
  try { existingImportBooking = findBooking(bookings, newBookingData.bookingNumber); }
  catch (error) { importError = error.message; }
  const importPlan = planImport(existingImportBooking, newBookingData.containers || []);
  const importPreviewToken = previewToken(existingImportBooking, importPlan);

  // PDF parsing state
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [pdfParseStatus, setPdfParseStatus] = useState(null); // 'success' | 'error' | null
  const [pdfParseMessage, setPdfParseMessage] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    // Detecção automática de conexão online/offline
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState('');

  const handleRefreshData = () => { };

  const handleSystemRefresh = async () => {
    setIsRefreshing(true);
    try {
      // 1. Atualiza Service Workers registrados
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of registrations) {
            await reg.update();
          }
        } catch (swErr) {
          console.warn('SW update warning:', swErr);
        }
      }

      // 2. Limpa cache de requisições antigas para carregar o bundle mais recente
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          for (const k of keys) await caches.delete(k);
        } catch (cErr) {
          console.warn('Cache clear warning:', cErr);
        }
      }

      // 3. Re-inicializa coleções se necessário
      await db.init().catch(e => console.warn('DB init refresh:', e));

      // 4. Feedback visual e reload para aplicar versão nova imediatamente
      handleRefreshData();
      setRefreshFeedback('Sistema e dados atualizados com sucesso!');
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      console.error('Erro ao atualizar sistema:', err);
      window.location.reload();
    }
  };

  // Estatísticas operacionais dos Bookings
  const countPendentes = bookings.filter(b => b.status === 'Pendente').length;
  const countAndamento = bookings.filter(b => b.status === 'Em andamento').length;
  const countFinalizados = bookings.filter(b => b.status === 'Finalizado').length;

  // Filtragem dos Bookings com busca inteligente universal
  const filteredBookings = bookings.filter(b => {
    const matchesSearch = matchesBooking(b, searchQuery, { exportadores, locais });
    const matchesStatus = statusFilter === 'Todos' || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeBookings = filteredBookings.filter(b => b.status !== 'Finalizado');
  const finalizedBookings = filteredBookings.filter(b => b.status === 'Finalizado');

  // Criar booking (Salvar)
  const handleCreateBooking = async (e) => {
    e.preventDefault();
    if (importSavingRef.current || isParsingPdf) return;
    if (existingImportBooking) {
      alert(`Este Booking (${existingImportBooking.bookingNumber}) já foi inserido no sistema. Para atualizar este romaneio, abra a reserva na tela principal e clique no botão "Inserir atualização de romaneio".`);
      return;
    }
    if (importError || importPlan.invalid.length) {
      alert(importError || 'Corrija os containers inválidos antes de confirmar.');
      return;
    }
    if (!newBookingData.bookingNumber || !newBookingData.exporterId || !newBookingData.locationId) {
      alert('Preencha os campos obrigatórios (Número do Booking, Exportador e Local da Operação).');
      return;
    }
    importSavingRef.current = true;
    setIsSavingImport(true);
    try {
      const result = await db.importBooking({
        ...newBookingData,
        vesselVoyage: `${newBookingData.vesselName} V.${newBookingData.vesselVoyageNum}`,
        bagsQuantity: parseInt(newBookingData.bagsQuantity, 10) || 0,
        containers: newBookingData.containers || []
      }, {
        expectedPreview: importPreviewToken,
        sourceName: importSourceName || 'Cadastro manual',
        actor: user,
        relatedRecords: importReferences.filter(record =>
          record.data.id === newBookingData.exporterId || record.data.id === newBookingData.locationId)
      });
      handleClearForm();
      setShowCreateModal(false);
      handleRefreshData();
      setSelectedBookingId(result.booking.id);
      setRefreshFeedback(`${result.addedCount} container(s) novo(s) inserido(s). ${result.preservedCount} já existente(s) preservado(s). ${result.fieldLinkedCount || 0} registro(s) de campo vinculado(s).`);
      setTimeout(() => setRefreshFeedback(''), 6000);
    } catch (err) {
      alert(err.message || 'Erro ao importar o romaneio. Nenhuma alteração foi confirmada.');
    } finally {
      importSavingRef.current = false;
      setIsSavingImport(false);
    }
  };

  const handleClearForm = () => {
    setImportSourceName('');
    setImportReferences([]);
    setNewBookingData({
      bookingNumber: '',
      exporterId: '',
      startDate: new Date().toISOString().split('T')[0],
      launchDate: new Date().toISOString().split('T')[0],
      fumigationDate: new Date().toISOString().split('T')[0],
      fitoDate: new Date().toISOString().split('T')[0],
      definiteSealDate: '',
      vesselVoyage: '',
      vesselName: '',
      vesselVoyageNum: '',
      bagsQuantity: '',
      locationId: '',
      status: 'Pendente',
      type: 'Redex Operation Report',
      stuffingReportNumber: '',
      mercadoria: 'café',
      portoDestino: '',
      importador: '',
      armador: '',
      embalagem: 'sacaria',
      containers: []
    });
    setIsParsingPdf(false);
    setPdfParseStatus(null);
    setPdfParseMessage('');
    setIsDragOver(false);
  };

  const handleDiscardBookingCreation = () => {
    if (importSavingRef.current || isParsingPdf) return;
    handleClearForm();
    setShowCreateModal(false);
  };

  const handleServerIpChange = (val) => {
    setServerIp(val);
    if (val.trim()) {
      localStorage.setItem('containtrack_server_ip', val.trim());
    } else {
      localStorage.removeItem('containtrack_server_ip');
    }
  };

  const handlePdfUpload = async (file) => {
    if (!file || isParsingPdf || importSavingRef.current) return;
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      setPdfParseStatus('error');
      setPdfParseMessage('Por favor, envie apenas arquivos PDF.');
      return;
    }

    setImportSourceName('');
    setNewBookingData(prev => ({ ...prev, containers: [] }));
    setImportReferences([]);
    setIsParsingPdf(true);
    setPdfParseStatus(null);
    setPdfParseMessage('Lendo arquivo PDF...');

    try {
      const parsed = await parseRomaneioPdf(file, { exportadores, locais });

      setImportSourceName(file.name);
      setImportReferences(parsed.pendingReferences || []);
      // Pre-fill fields
      setNewBookingData(prev => ({
        ...prev,
        bookingNumber: parsed.bookingNumber,
        vesselName: parsed.vesselName || prev.vesselName,
        vesselVoyageNum: parsed.vesselVoyageNum || prev.vesselVoyageNum,
        vesselVoyage: parsed.vesselVoyage || prev.vesselVoyage,
        exporterId: parsed.exporterId || prev.exporterId,
        locationId: parsed.locationId || prev.locationId,
        mercadoria: parsed.mercadoria || prev.mercadoria,
        bagsQuantity: parsed.bagsQuantity || prev.bagsQuantity,
        portoDestino: parsed.portoDestino || prev.portoDestino,
        importador: parsed.importador || prev.importador,
        armador: parsed.armador || prev.armador,
        embalagem: parsed.embalagem || prev.embalagem,
        containers: parsed.containers || []
      }));

      setPdfParseStatus('success');

      let fieldsFound = [];
      if (parsed.bookingNumber) fieldsFound.push('Booking');
      if (parsed.vesselName) fieldsFound.push('Navio');
      if (parsed.vesselVoyageNum) fieldsFound.push('Viagem');
      if (parsed.exporterId) fieldsFound.push('Exportador');
      if (parsed.importador) fieldsFound.push('Importador');
      if (parsed.bagsQuantity) fieldsFound.push('Qtd Sacas');
      if (parsed.portoDestino) fieldsFound.push('Destino');
      if (parsed.armador) fieldsFound.push('Armador');
      if (parsed.locationId) fieldsFound.push('Recinto');
      if (parsed.mercadoria) fieldsFound.push('Mercadoria');

      if (fieldsFound.length > 0) {
        let msg = `Sucesso! Preenchido: ${fieldsFound.join(', ')}.`;
        if (parsed.containers?.length > 0) {
          msg += ` Encontrado(s) ${parsed.containers.length} container(s).`;
        }
        setPdfParseMessage(msg);
      } else {
        setPdfParseMessage('PDF lido, mas nenhum campo padrão pôde ser extraído. Preencha manualmente.');
        setPdfParseStatus('error');
      }

    } catch (err) {
      console.error('Error parsing PDF:', err);
      setPdfParseStatus('error');
      setImportSourceName('');
      setNewBookingData(prev => ({ ...prev, containers: [] }));
      setPdfParseMessage('Erro ao processar o PDF. Verifique se o arquivo está corrompido.');
    } finally {
      setIsParsingPdf(false);
    }
  };

  // Ações da Tabela
  const handleFinalizeBooking = async (id, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const bk = bookings.find(b => b.id === id);
    if (bk) {
      const nowIso = new Date().toISOString();
      const userName = user?.name || user?.login || 'Usuário';
      const historyEntry = {
        action: 'finalized',
        timestamp: nowIso,
        user: { id: user?.id || '', name: userName }
      };
      const updatedHistory = [...(bk.finalizationHistory || []), historyEntry];
      bk.status = 'Finalizado';
      bk.finalizedAt = nowIso;
      bk.finalizedBy = userName;
      bk.finalizationHistory = updatedHistory;
      await db.saveBooking(bk);
      handleRefreshData();
    }
  };

  const handleDeleteBooking = async (id, e) => {
    e.stopPropagation();
    if (confirm('Deseja excluir este booking e todos os seus containers?')) {
      await db.deleteBooking(id);
      handleRefreshData();
    }
  };

  // Logout
  const handleLogout = () => {
    setUser(null);
    db.setUser(null);
    setCurrentTab('bookings');
  };

  // Mobile redirect removed to support responsive layouts

  const pageTransition = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.2 }
  };

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return (
    <div className={isMobileOrTablet ? "app-container" : "desktop-layout-root"}>
      {!isMobileOrTablet ? (
        <>
          <Sidebar
            currentTab={currentTab}
            setCurrentTab={(tab) => {
              setSelectedBookingId(null);
              setActiveReport(null);
              setCurrentTab(tab);
            }}
            user={user}
            onLogout={handleLogout}
            onOpenReport={() => {
              setSelectedBookingId(null);
              setActiveReport({ id: null, type: 'administrative' });
            }}
          />
          <DesktopDashboardView
            currentTab={currentTab}
            setCurrentTab={(tab) => {
              setSelectedBookingId(null);
              setActiveReport(null);
              setCurrentTab(tab);
            }}
            user={user}
            bookings={bookings}
            exportadores={exportadores}
            locais={locais}
            isOnline={isOnline}
            setIsOnline={setIsOnline}
            isRefreshing={isRefreshing}
            handleSystemRefresh={handleSystemRefresh}
            activeReport={activeReport}
            setActiveReport={setActiveReport}
            setSelectedBookingId={setSelectedBookingId}
            setInitialOpenUpdateRomaneio={setInitialOpenUpdateRomaneio}
            setShowCreateModal={setShowCreateModal}
            setShowUpdateRomaneioPicker={setShowUpdateRomaneioPicker}
            handleRefreshData={handleRefreshData}
            handleFinalizeBooking={handleFinalizeBooking}
            handleDeleteBooking={handleDeleteBooking}
            handleLogout={handleLogout}
            serverIp={serverIp}
            handleServerIpChange={handleServerIpChange}
            pendingFieldCount={pendingFieldCount}
          />
        </>
      ) : (
        <>
          {/* Mobile Top Bar */}
          <header className="mobile-top-bar no-print">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                background: 'linear-gradient(135deg, var(--color-brand), #b88f28)',
                color: '#0d1127',
                fontWeight: '800',
                fontSize: '14px',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                US
              </div>
              <div>
                <h1 style={{ fontSize: '13px', fontWeight: '800', margin: 0 }}>Unispect Service</h1>
                <span style={{ fontSize: '9px', color: 'var(--color-brand)', fontWeight: '700', textTransform: 'uppercase' }}>Mobile Portal</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                title={isOnline ? 'Online' : 'Offline'}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: isOnline ? '#10b981' : '#ef4444',
                  flexShrink: 0
                }}
              />
              <button
                onClick={handleSystemRefresh}
                disabled={isRefreshing}
                title="Sincronizar e atualizar"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: isRefreshing ? 'wait' : 'pointer'
                }}
              >
                <RefreshCw size={13} className={isRefreshing ? "spin" : ""} style={{ color: 'var(--color-brand)' }} />
              </button>

              <button
                onClick={() => {
                  if (window.confirm('Deseja realmente sair da sua conta?')) {
                    handleLogout();
                  }
                }}
                title="Sair do Sistema"
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '6px',
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
            </div>
          </header>
        </>
      )}

      {/* CONTEÚDO PRINCIPAL (Mobile) */}
      {isMobileOrTablet && (
        <main className="main-content app-main-content">

        {activeReport ? (
          <ReportView
            bookingId={activeReport.id}
            reportType={activeReport.type}
            onBack={() => {
              setActiveReport(null);
              if (activeReport.id) setSelectedBookingId(activeReport.id);
            }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Boas-vindas e Estatísticas no topo do conteúdo */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: '800' }}>Controle de Certificados Unispect</h1>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Bem-vindo, {user.username}</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={handleSystemRefresh}
                  disabled={isRefreshing}
                  className="btn btn-secondary"
                  title="Atualizar dados e sincronizar o sistema"
                  style={{
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    fontWeight: '700',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    cursor: isRefreshing ? 'wait' : 'pointer'
                  }}
                >
                  <RefreshCw size={15} className={isRefreshing ? "spin" : ""} style={{ color: 'var(--color-brand)' }} />
                  <span>{isRefreshing ? 'Atualizando...' : 'Atualizar Sistema'}</span>
                </button>

                {currentTab !== 'bookings' && currentTab !== 'field-portal' && currentTab !== 'settings' && (
                  <button
                    onClick={() => {
                      const isMobile = window.innerWidth <= 1024;
                      if (isMobile && (currentTab === 'locais' || currentTab === 'inspectors')) {
                        setCurrentTab('settings');
                      } else {
                        setCurrentTab('bookings');
                      }
                    }}
                    className="btn btn-secondary"
                    style={{ padding: '8px 14px' }}
                  >
                    ← Voltar
                  </button>
                )}
              </div>
            </div>

            {/* CARDS DE STATUS */}
            {currentTab === 'bookings' && (
              <div className="stats-grid">
                <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldAlert size={24} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '32px', fontWeight: '800', lineHeight: '1' }}>{countPendentes}</h3>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pendentes</span>
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(230, 185, 65, 0.1)', color: 'var(--color-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Hourglass size={24} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '32px', fontWeight: '800', lineHeight: '1' }}>{countAndamento}</h3>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Em andamento</span>
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '32px', fontWeight: '800', lineHeight: '1' }}>{countFinalizados}</h3>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Finalizados</span>
                  </div>
                </div>
              </div>
            )}

            {/* Renderizador das guias baseadas na escolha do Dropdown */}
            <AnimatePresence mode="wait">
              {currentTab === 'bookings' && (!isMobile || user.role === 'Exportador') && (
                <motion.div key="tab-bookings" {...pageTransition}>
                  <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                    <div className="filters-grid">
                      <div>
                        <label>Pesquisa Universal (Container, Booking, Exportador, Navio...)</label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
                          <input
                            type="text"
                            placeholder="Buscar container (MSDU-882129-7, MSDU8821297), booking, exportador..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{ paddingLeft: '36px', paddingRight: searchQuery ? '36px' : '12px' }}
                          />
                          {searchQuery && (
                            <button
                              type="button"
                              onClick={() => setSearchQuery('')}
                              style={{
                                position: 'absolute',
                                right: '10px',
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                padding: '4px'
                              }}
                              title="Limpar busca"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label>Filtro de Status</label>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                          <option value="Todos">Todos os Status</option>
                          <option value="Pendente">Pendentes</option>
                          <option value="Em andamento">Em andamento</option>
                          <option value="Finalizado">Finalizados</option>
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={() => setActiveReport({ id: null, type: 'administrative' })}
                      className="btn btn-secondary"
                      style={{ alignSelf: 'center', padding: '10px 24px', fontSize: '13px' }}
                    >
                      📄 Gerar Relatório Geral
                    </button>
                  </div>

                  {/* --- BOOKINGS ATIVOS (DESKTOP) --- */}
                  <h2 style={{ fontSize: '16px', color: 'var(--color-brand)', marginBottom: '16px', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📋 Bookings em Aberto (Pendentes / Em Andamento) <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '10px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: 'var(--color-brand)', fontWeight: '755' }}>{activeBookings.length}</span>
                  </h2>

                  <div className="glass-panel bookings-table-desktop" style={{ overflowX: 'auto', border: '1px solid var(--border-color)', marginBottom: '32px' }}>
                    <table style={{ minWidth: '800px' }}>
                      <thead>
                        <tr>
                          <th>Certificado</th>
                          <th>Booking</th>
                          <th>Exportador</th>
                          <th>Vessel / Navio</th>
                          <th>Local</th>
                          <th>Status</th>
                          <th>Pendente</th>
                          <th style={{ textAlign: 'right' }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeBookings.map(b => {
                          const exp = exportadores.find(e => e.id === b.exporterId)?.name || 'N/A';
                          const loc = locais.find(l => l.id === b.locationId)?.name || 'N/A';

                          const statusColors = {
                            'Pendente': 'badge-pending',
                            'Em andamento': 'badge-progress'
                          };

                          return (
                            <tr key={b.id}>
                              <td style={{ fontWeight: '700', color: 'var(--color-brand)' }}>{b.certificateNumber}</td>
                              <td style={{ fontWeight: '600' }}>
                                <div>{b.bookingNumber}</div>
                                {searchQuery.trim() && (
                                  getMatchedContainers(b, searchQuery).map(mc => (
                                    <div key={mc.id || mc.containerNumber} style={{
                                      fontSize: '11px',
                                      color: 'var(--color-brand)',
                                      fontWeight: '700',
                                      marginTop: '3px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      backgroundColor: 'rgba(197, 168, 128, 0.15)',
                                      padding: '2px 6px',
                                      borderRadius: '4px'
                                    }}>
                                      📦 {mc.containerNumber}
                                    </div>
                                  ))
                                )}
                              </td>
                              <td>{exp}</td>
                              <td>{b.vesselVoyage}</td>
                              <td>{loc}</td>
                              <td>
                                <span className={`badge ${statusColors[b.status] || 'badge-pending'}`}>
                                  {(b.status || 'Pendente').toUpperCase()}
                                </span>
                              </td>
                              <td>
                                {b.pendingItem ? (
                                  <span style={{ 
                                    padding: '4px 8px', 
                                    borderRadius: '4px', 
                                    backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                                    color: '#ef4444', 
                                    fontSize: '12px', 
                                    fontWeight: '700',
                                    border: '1px solid #ef4444',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    ⚠️ {b.pendingItem}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>-</span>
                                )}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: '6px' }}>
                                  <button onClick={() => {
                                    setSelectedBookingId(b.id);
                                  }} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px', border: '1px solid var(--text-muted)' }}>
                                    Gerenciar
                                  </button>

                                  {b.status !== 'Finalizado' && user.role !== 'Exportador' && (
                                    <button onClick={(e) => handleFinalizeBooking(b.id, e)} className="btn btn-success" style={{ padding: '6px 12px', fontSize: '11px' }}>
                                      Finalizar
                                    </button>
                                  )}

                                  {user.role === 'ADM' && (
                                    <button onClick={(e) => handleDeleteBooking(b.id, e)} className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '11px' }}>
                                      Excluir
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {activeBookings.length === 0 && (
                          <tr>
                            <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                              Nenhum booking ativo encontrado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* --- BOOKINGS FINALIZADOS (DESKTOP) --- */}
                  <h2 style={{ fontSize: '16px', color: '#10b981', marginBottom: '16px', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ✅ Bookings Concluídos (Finalizados) <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '10px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: '755' }}>{finalizedBookings.length}</span>
                  </h2>

                  <div className="glass-panel bookings-table-desktop" style={{ overflowX: 'auto', border: '1px solid var(--border-color)', marginBottom: '32px' }}>
                    <table style={{ minWidth: '800px' }}>
                      <thead>
                        <tr>
                          <th>Certificado</th>
                          <th>Booking</th>
                          <th>Exportador</th>
                          <th>Vessel / Navio</th>
                          <th>Local</th>
                          <th>Status</th>
                          <th>Pendente</th>
                          <th style={{ textAlign: 'right' }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {finalizedBookings.map(b => {
                          const exp = exportadores.find(e => e.id === b.exporterId)?.name || 'N/A';
                          const loc = locais.find(l => l.id === b.locationId)?.name || 'N/A';

                          return (
                            <tr key={b.id}>
                              <td style={{ fontWeight: '700', color: 'var(--color-brand)' }}>{b.certificateNumber}</td>
                              <td style={{ fontWeight: '600' }}>
                                <div>{b.bookingNumber}</div>
                                {searchQuery.trim() && (
                                  getMatchedContainers(b, searchQuery).map(mc => (
                                    <div key={mc.id || mc.containerNumber} style={{
                                      fontSize: '11px',
                                      color: 'var(--color-brand)',
                                      fontWeight: '700',
                                      marginTop: '3px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      backgroundColor: 'rgba(197, 168, 128, 0.15)',
                                      padding: '2px 6px',
                                      borderRadius: '4px'
                                    }}>
                                      📦 {mc.containerNumber}
                                    </div>
                                  ))
                                )}
                              </td>
                              <td>{exp}</td>
                              <td>{b.vesselVoyage}</td>
                              <td>{loc}</td>
                              <td>
                                <span className="badge badge-success">
                                  FINALIZADO
                                </span>
                              </td>
                              <td>
                                {b.pendingItem ? (
                                  <span style={{ 
                                    padding: '4px 8px', 
                                    borderRadius: '4px', 
                                    backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                                    color: '#ef4444', 
                                    fontSize: '12px', 
                                    fontWeight: '700',
                                    border: '1px solid #ef4444',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    ⚠️ {b.pendingItem}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>-</span>
                                )}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: '6px' }}>
                                  <button onClick={() => {
                                    setSelectedBookingId(b.id);
                                  }} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px', border: '1px solid var(--text-muted)' }}>
                                    Gerenciar
                                  </button>

                                  {user.role === 'ADM' && (
                                    <button onClick={(e) => handleDeleteBooking(b.id, e)} className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '11px' }}>
                                      Excluir
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {finalizedBookings.length === 0 && (
                          <tr>
                            <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                              Nenhum booking finalizado encontrado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Lista de Cards de Bookings (Apenas no mobile) */}
                  <div className="bookings-cards-mobile">
                    {/* Ativos Mobile */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--color-brand)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        📋 Bookings em Aberto ({activeBookings.length})
                      </span>
                      {activeBookings.map(b => {
                        const exp = exportadores.find(e => e.id === b.exporterId)?.name || 'N/A';
                        const loc = locais.find(l => l.id === b.locationId)?.name || 'N/A';
                        const statusColors = {
                          'Pendente': 'badge-pending',
                          'Em andamento': 'badge-progress'
                        };

                        return (
                          <div key={b.id} className="booking-card glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: '700', color: 'var(--color-brand)', fontSize: '15px' }}>{b.certificateNumber}</span>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                {b.pendingItem && (
                                  <span style={{ 
                                    padding: '2px 6px', 
                                    borderRadius: '4px', 
                                    backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                                    color: '#ef4444', 
                                    fontSize: '10px', 
                                    fontWeight: '700',
                                    border: '1px solid #ef4444',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {b.pendingItem}
                                  </span>
                                )}
                                <span className={`badge ${statusColors[b.status] || 'badge-pending'}`} style={{ fontSize: '10px' }}>
                                  {(b.status || 'Pendente').toUpperCase()}
                                </span>
                              </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                              <div><span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Booking:</span> <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{b.bookingNumber}</span></div>
                              <div><span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Exportador:</span> <span style={{ color: 'var(--text-primary)' }}>{exp}</span></div>
                              <div><span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Local:</span> <span style={{ color: 'var(--text-primary)' }}>{loc}</span></div>
                              <div><span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Navio/Viagem:</span> <span style={{ color: 'var(--text-primary)' }}>{b.vesselVoyage}</span></div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '4px' }}>
                              <button onClick={() => setSelectedBookingId(b.id)} className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '12px', flex: 1, border: '1px solid var(--text-muted)' }}>
                                Gerenciar
                              </button>

                              {user.role !== 'Exportador' && (
                                <button onClick={(e) => handleFinalizeBooking(b.id, e)} className="btn btn-success" style={{ padding: '8px 12px', fontSize: '12px', flex: 1 }}>
                                  Finalizar
                                </button>
                              )}

                              {user.role === 'ADM' && (
                                <button onClick={(e) => handleDeleteBooking(b.id, e)} className="btn btn-danger" style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {activeBookings.length === 0 && (
                        <div className="glass-panel" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                          Nenhum booking em aberto encontrado.
                        </div>
                      )}
                    </div>

                    {/* Finalizados Mobile */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        ✅ Bookings Concluídos ({finalizedBookings.length})
                      </span>
                      {finalizedBookings.map(b => {
                        const exp = exportadores.find(e => e.id === b.exporterId)?.name || 'N/A';
                        const loc = locais.find(l => l.id === b.locationId)?.name || 'N/A';

                        return (
                          <div key={b.id} className="booking-card glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: '700', color: 'var(--color-brand)', fontSize: '15px' }}>{b.certificateNumber}</span>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                {b.pendingItem && (
                                  <span style={{ 
                                    padding: '2px 6px', 
                                    borderRadius: '4px', 
                                    backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                                    color: '#ef4444', 
                                    fontSize: '10px', 
                                    fontWeight: '700',
                                    border: '1px solid #ef4444',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {b.pendingItem}
                                  </span>
                                )}
                                <span className="badge badge-success" style={{ fontSize: '10px' }}>
                                  FINALIZADO
                                </span>
                              </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                              <div><span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Booking:</span> <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{b.bookingNumber}</span></div>
                              <div><span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Exportador:</span> <span style={{ color: 'var(--text-primary)' }}>{exp}</span></div>
                              <div><span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Local:</span> <span style={{ color: 'var(--text-primary)' }}>{loc}</span></div>
                              <div><span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Navio/Viagem:</span> <span style={{ color: 'var(--text-primary)' }}>{b.vesselVoyage}</span></div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '4px' }}>
                              <button onClick={() => setSelectedBookingId(b.id)} className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '12px', flex: 1, border: '1px solid var(--text-muted)' }}>
                                Gerenciar
                              </button>

                              {user.role === 'ADM' && (
                                <button onClick={(e) => handleDeleteBooking(b.id, e)} className="btn btn-danger" style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {finalizedBookings.length === 0 && (
                        <div className="glass-panel" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                          Nenhum booking finalizado encontrado.
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {currentTab === 'inspectors' && (
                <motion.div key="tab-inspectors" {...pageTransition}>
                  <InspectorsList onDataChange={handleRefreshData} />
                </motion.div>
              )}

              {currentTab === 'containers-sem-booking' && (
                <motion.div key="tab-containers-sem-booking" {...pageTransition}>
                  <FieldContainersView user={user} />
                </motion.div>
              )}

              {currentTab === 'exportadores' && (
                <motion.div key="tab-exportadores" {...pageTransition}>
                  <ExportadoresList onDataChange={handleRefreshData} />
                </motion.div>
              )}

              {currentTab === 'locais' && (
                <motion.div key="tab-locais" {...pageTransition}>
                  <LocaisList onDataChange={handleRefreshData} />
                </motion.div>
              )}

              {currentTab === 'usuarios' && user.role === 'ADM' && (
                <motion.div key="tab-usuarios" {...pageTransition}>
                  <UsersList onDataChange={handleRefreshData} />
                </motion.div>
              )}

              {(currentTab === 'field-portal' || (isMobile && user.role !== 'Exportador')) && (
                <motion.div key="tab-field-portal" {...pageTransition}>
                  <MobileAppView user={user} onLogout={handleLogout} hideHeader={true} onRefresh={handleSystemRefresh} isRefreshing={isRefreshing} />
                </motion.div>
              )}

              {currentTab === 'settings' && (
                <motion.div key="tab-settings" {...pageTransition} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h3 style={{ fontSize: '16px', color: 'var(--color-brand)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', margin: 0 }}>
                      Configurações do Dispositivo
                    </h3>

                    <div>
                      <label>Servidor de Sincronização</label>
                      <input
                        type="text"
                        placeholder="IP do Servidor (ex: 192.168.1.15)"
                        value={serverIp}
                        onChange={e => handleServerIpChange(e.target.value)}
                        style={{ padding: '10px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      />
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '4px', display: 'block' }}>
                        Deixe em branco para usar o IP atual ({window.location.hostname}).
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600' }}>Modo de Conexão</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isOnline ? '#10b981' : '#ef4444' }} />
                        <span style={{ fontSize: '12px', fontWeight: '700', color: isOnline ? '#10b981' : 'var(--text-muted)', marginRight: '8px' }}>
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

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600' }}>Versão do Aplicativo</span>
                      <button
                        onClick={async () => {
                          if (window.confirm("Deseja limpar o cache e atualizar o aplicativo para a versão mais recente?")) {
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
                        style={{ width: '100%', justifyContent: 'center', backgroundColor: 'var(--color-brand-light)', borderColor: 'var(--color-brand)', color: 'var(--color-brand)', fontWeight: '700' }}
                      >
                        🔄 Limpar Cache & Atualizar App
                      </button>
                    </div>
                  </div>

                  {user.role === 'ADM' && (
                    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <h4 style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', margin: 0 }}>
                        Administração
                      </h4>
                      <button
                        onClick={() => setCurrentTab('locais')}
                        className="btn btn-secondary"
                        style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', width: '100%' }}
                      >
                        <span>📍 Locais de Operação</span>
                        <span>→</span>
                      </button>
                      <button
                        onClick={() => setCurrentTab('inspectors')}
                        className="btn btn-secondary"
                        style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', width: '100%' }}
                      >
                        <span>👤 Cadastro de Inspetores</span>
                        <span>→</span>
                      </button>
                      <button
                        onClick={() => setCurrentTab('usuarios')}
                        className="btn btn-secondary"
                        style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', width: '100%' }}
                      >
                        <span>👥 Gerenciar Usuários</span>
                        <span>→</span>
                      </button>
                    </div>
                  )}

                  <button
                    onClick={handleLogout}
                    className="btn btn-danger"
                    style={{ padding: '14px', fontWeight: '800' }}
                  >
                    Sair do Sistema
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        )}

      </main>
      )}

      {/* JANELA MODAL DE GERENCIAMENTO (Screenshot 2 overlay) */}
      {selectedBookingId && (
        <BookingManagementModal
          bookingId={selectedBookingId}
          initialOpenUpdateRomaneio={initialOpenUpdateRomaneio}
          initialUpdateRomaneioFile={initialUpdateRomaneioFile}
          onClose={() => {
            setSelectedBookingId(null);
            setInitialOpenUpdateRomaneio(false);
            setInitialUpdateRomaneioFile(null);
            handleRefreshData();
          }}
          user={user}
          onDataChange={handleRefreshData}
          onOpenReport={(id, type) => {
            setActiveReport({ id, type });
            setSelectedBookingId(null);
          }}
        />
      )}

      {/* MODAL ADM: CADASTRAR NOVO CERTIFICADO */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(5, 7, 15, 0.75)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px'
        }}>
          <form onSubmit={handleCreateBooking} className="glass-panel create-modal-form" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <h2 style={{ fontSize: '18px', fontFamily: 'var(--font-display)', color: 'var(--color-brand)' }}>Importar Romaneio / Cadastrar Booking</h2>
              <button type="button" disabled={isSavingImport || isParsingPdf} onClick={handleDiscardBookingCreation} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <fieldset disabled={isSavingImport || isParsingPdf} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            {/* Campo Drag & Drop PDF */}
            <div
              className={`pdf-drag-drop-zone ${isDragOver ? 'dragover' : ''} ${pdfParseStatus || ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handlePdfUpload(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => document.getElementById('booking-pdf-input').click()}
            >
              <input
                id="booking-pdf-input"
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handlePdfUpload(e.target.files[0]);
                  }
                }}
              />
              <div className="icon-container">
                {isParsingPdf ? (
                  <div className="pdf-loading-spinner"></div>
                ) : pdfParseStatus === 'success' ? (
                  <CheckCircle2 size={28} />
                ) : pdfParseStatus === 'error' ? (
                  <ShieldAlert size={28} />
                ) : (
                  <UploadCloud size={28} />
                )}
              </div>
              <div>
                <span className="pdf-drag-drop-zone-text">
                  {isParsingPdf ? 'Processando PDF...' : 'Arraste o PDF do Booking aqui para preenchimento automático'}
                </span>
                <p className="pdf-drag-drop-zone-subtext" style={{ margin: '4px 0 0 0' }}>
                  {pdfParseMessage || 'Ou clique para selecionar um arquivo PDF do seu dispositivo'}
                </p>
              </div>
            </div>

            <div className="form-grid">
              <div>
                <label>Número do Booking *</label>
                <input
                  type="text"
                  value={newBookingData.bookingNumber}
                  onChange={e => setNewBookingData({ ...newBookingData, bookingNumber: e.target.value })}
                  placeholder="BK-XXXXXX"
                  required
                  style={existingImportBooking ? { borderColor: '#ef4444' } : {}}
                />
                {existingImportBooking && (
                  <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', border: '1px solid #ef4444', borderRadius: '6px', padding: '10px 12px', marginTop: '6px', color: '#ef4444', fontSize: '12px' }}>
                    ⚠️ <strong>Este Booking / Romaneio já foi inserido no sistema</strong> ({existingImportBooking.bookingNumber} — Certificado: {existingImportBooking.certificateNumber}).
                    <div style={{ marginTop: '4px', color: 'var(--text-secondary)' }}>
                      O cadastro de reservas duplicadas está bloqueado. Para atualizar ou adicionar containers a este Booking, abra a reserva na tela principal e clique no botão <strong>"Inserir atualização de romaneio"</strong>.
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label>Data de Lançamento / Entrada *</label>
                <input
                  type="date"
                  value={newBookingData.launchDate}
                  onChange={e => setNewBookingData({ ...newBookingData, launchDate: e.target.value })}
                  required={!existingImportBooking}
                />
              </div>

              <div>
                <label>Data de Fumigação</label>
                <input
                  type="date"
                  value={newBookingData.fumigationDate}
                  onChange={e => setNewBookingData({ ...newBookingData, fumigationDate: e.target.value })}
                />
              </div>

              <div>
                <label>Data Fito</label>
                <input
                  type="date"
                  value={newBookingData.fitoDate}
                  onChange={e => setNewBookingData({ ...newBookingData, fitoDate: e.target.value })}
                />
              </div>

              <div>
                <label>Data Lacre Definitivo</label>
                <input
                  type="date"
                  value={newBookingData.definiteSealDate}
                  onChange={e => setNewBookingData({ ...newBookingData, definiteSealDate: e.target.value })}
                />
              </div>

              <div>
                <label>Tipo de Operação *</label>
                <select
                  value={newBookingData.type}
                  onChange={e => {
                    const newType = e.target.value;
                    setNewBookingData({
                      ...newBookingData,
                      type: newType,
                      stuffingReportNumber: newType === 'Redex Operation Report' ? '' : newBookingData.stuffingReportNumber
                    });
                  }}
                  required={!existingImportBooking}
                >
                  <option value="Redex Operation Report">Redex Operation Report</option>
                  <option value="Container Stuffing Report">Container Stuffing Report</option>
                </select>
              </div>

              {newBookingData.type === 'Container Stuffing Report' && (
                <div>
                  <label>Stuffing Report Number *</label>
                  <input
                    type="text"
                    value={newBookingData.stuffingReportNumber}
                    onChange={e => setNewBookingData({ ...newBookingData, stuffingReportNumber: e.target.value })}
                    placeholder="Ex: SR-XXXXXX"
                    required={!existingImportBooking}
                  />
                </div>
              )}

              <div>
                <label>Nº Certificado (Auto)</label>
                <input
                  type="text"
                  value="Gerado Automaticamente"
                  disabled
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--color-brand)',
                    fontWeight: 'bold',
                    border: '1px solid var(--border-color)',
                    cursor: 'not-allowed'
                  }}
                />
              </div>

              <div>
                <label>Mercadoria *</label>
                <select
                  value={newBookingData.mercadoria}
                  onChange={e => setNewBookingData({ ...newBookingData, mercadoria: e.target.value })}
                  required={!existingImportBooking}
                >
                  <option value="café">Café</option>
                  <option value="Cravo">Cravo</option>
                  <option value="Pimenta Preta">Pimenta Preta</option>
                  <option value="Pimenta Vermelha">Pimenta Vermelha</option>
                  <option value="Pimenta Branca">Pimenta Branca</option>
                </select>
              </div>

              <div>
                <label>Porto de Destino *</label>
                <input
                  type="text"
                  value={newBookingData.portoDestino}
                  onChange={e => setNewBookingData({ ...newBookingData, portoDestino: e.target.value })}
                  placeholder="Ex: Porto de Roterdã"
                  required={!existingImportBooking}
                />
              </div>

              <div>
                <label>Importador</label>
                <input
                  type="text"
                  value={newBookingData.importador || ''}
                  onChange={e => setNewBookingData({ ...newBookingData, importador: e.target.value })}
                  placeholder="Ex: NESTLE MÉXICO"
                />
              </div>

              <div>
                <label>Navio *</label>
                <input
                  type="text"
                  value={newBookingData.vesselName}
                  onChange={e => setNewBookingData({ ...newBookingData, vesselName: e.target.value })}
                  placeholder="Ex: MSC INGRID"
                  required={!existingImportBooking}
                />
              </div>

              <div>
                <label>Viagem *</label>
                <input
                  type="text"
                  value={newBookingData.vesselVoyageNum}
                  onChange={e => setNewBookingData({ ...newBookingData, vesselVoyageNum: e.target.value })}
                  placeholder="Ex: 26A"
                  required={!existingImportBooking}
                />
              </div>

              <div>
                <label>Armador / Linha</label>
                <input
                  type="text"
                  value={newBookingData.armador}
                  onChange={e => setNewBookingData({ ...newBookingData, armador: e.target.value })}
                  placeholder="Ex: Maersk"
                />
              </div>

              <div>
                <label>Embalagem *</label>
                <select
                  value={newBookingData.embalagem}
                  onChange={e => setNewBookingData({ ...newBookingData, embalagem: e.target.value })}
                  required={!existingImportBooking}
                >
                  <option value="sacaria">sacaria</option>
                  <option value="Big bags">Big bags</option>
                  <option value="Bulk Line">Bulk Line</option>
                  <option value="Caixa">Caixa</option>
                </select>
              </div>

              <div>
                <label>Exportador *</label>
                <select
                  value={newBookingData.exporterId}
                  onChange={e => setNewBookingData({ ...newBookingData, exporterId: e.target.value })}
                  required={!existingImportBooking}
                >
                  <option value="">Selecione...</option>
                  {[...exportadores, ...importReferences.filter(r => r.collection === 'exportadores').map(r => r.data)].map(exp => <option key={exp.id} value={exp.id}>{exp.name}</option>)}
                </select>
              </div>

              <div>
                <label>Local da Operação *</label>
                <select
                  value={newBookingData.locationId}
                  onChange={e => setNewBookingData({ ...newBookingData, locationId: e.target.value })}
                  required={!existingImportBooking}
                >
                  <option value="">Selecione...</option>
                  {[...locais, ...importReferences.filter(r => r.collection === 'locais').map(r => r.data)].map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
              </div>

              <div>
                <label>Quantidade de Sacas *</label>
                <input
                  type="number"
                  value={newBookingData.bagsQuantity}
                  onChange={e => setNewBookingData({ ...newBookingData, bagsQuantity: e.target.value })}
                  placeholder="Qtd Sacas"
                  required={!existingImportBooking}
                />
              </div>

              <div>
                <label>Quantidade de Containers</label>
                <input
                  type="number"
                  placeholder="Quantidade de Containers na reserva"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                  value={newBookingData.containers && newBookingData.containers.length > 0 ? newBookingData.containers.length : ''}
                  readOnly
                />
              </div>
            </div>

            {newBookingData.containers && newBookingData.containers.length > 0 && (
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <h4 style={{ fontSize: '13px', color: 'var(--color-brand)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                  Containers Importados do Romaneio ({newBookingData.containers.length})
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', maxHeight: '150px', overflowY: 'auto', paddingRight: '4px' }}>
                  {newBookingData.containers.map((c, index) => (
                    <div key={index} style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>{c.containerNumber} — {importPlan.preserved.some(old => normalizeContainerNumber(old.containerNumber) === normalizeContainerNumber(c.containerNumber)) ? 'Já cadastrado' : 'Novo'}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{c.containerType}</span>
                      </div>
                      {getSealText(c.definiteSeal) && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          Lacre: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{getSealText(c.definiteSeal)}</span>
                        </div>
                      )}
                      {c.netWeight && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          Peso Carga: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{c.netWeight} kg</span>
                        </div>
                      )}
                      {c.tara && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          Tara: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{c.tara} kg</span>
                        </div>
                      )}
                      {c.grossWeight && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          Peso Bruto: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{c.grossWeight} kg</span>
                        </div>
                      )}
                      {c.brand && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          Marca/OIC: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{c.brand}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <section aria-live="polite" style={{ marginTop: '16px', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <strong>Prévia da importação — {newBookingData.bookingNumber || 'informe o Booking'}</strong>
              <p>{importPlan.added.length} novo(s), {importPlan.preserved.length} já cadastrado(s), {importPlan.repeated.length} repetição(ões). Total após confirmar: {importPlan.total}.</p>
              {existingImportBooking && <p>{existingImportBooking.containers?.length || 0} container(s) do cadastro atual serão mantidos, inclusive os ausentes neste arquivo.</p>}
              {existingImportBooking && <p>Fotos, inspeções e dados do Booking serão preservados. Nenhum container será excluído. Os outros campos deste formulário não substituem os dados existentes.</p>}
              {importError && <p role="alert">{importError}</p>}
              {importPlan.invalid.map(item => <p key={item.row} role="alert">Linha {item.row}: container inválido — {item.number}</p>)}
              {importPlan.conflicts.map(item => <p key={item.number}>Divergência em {item.number}: {item.fields.map(field => importFieldLabels[field]).join(', ')}. Os dados já cadastrados serão mantidos.</p>)}
              {importReferences.length > 0 && !existingImportBooking && <p>Novos cadastros de exportador/recinto selecionados serão gravados junto com o Booking.</p>}
              {importSourceName && !newBookingData.containers?.length && <p>Não foram identificados containers. Confira o PDF antes de confirmar.</p>}
            </section>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '6px' }}>
              <button type="button" disabled={isSavingImport || isParsingPdf} onClick={handleDiscardBookingCreation} className="btn btn-secondary">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingImport || isParsingPdf || Boolean(importError) || importPlan.invalid.length > 0 || Boolean(existingImportBooking)}
                className="btn btn-primary"
                style={{
                  backgroundColor: existingImportBooking ? '#6b7280' : '#10b981',
                  color: '#fff',
                  cursor: existingImportBooking ? 'not-allowed' : 'pointer',
                  opacity: existingImportBooking ? 0.6 : 1
                }}
              >
                {isSavingImport ? 'Salvando...' : existingImportBooking ? 'Booking já cadastrado (bloqueado)' : 'Confirmar cadastro'}
              </button>
            </div>
            </fieldset>
          </form>
        </div>
      )}

      {/* MODAL: ATUALIZAR ROMANEIO NO DESKTOP */}
      {showUpdateRomaneioPicker && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(5, 7, 15, 0.75)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2500,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{ maxWidth: '620px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <UploadCloud size={20} style={{ color: '#10b981' }} />
                  Atualizar Romaneio Existente
                </h2>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Selecione o Booking ou envie o PDF com o romaneio atualizado
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowUpdateRomaneioPicker(false);
                  setPickerPdfError('');
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Drag & Drop PDF */}
            <div
              className="pdf-drag-drop-zone"
              style={{ margin: 0, padding: '20px' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handlePickerPdfUpload(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => document.getElementById('picker-pdf-input')?.click()}
            >
              <input
                id="picker-pdf-input"
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handlePickerPdfUpload(e.target.files[0]);
                  }
                }}
              />
              <div className="icon-container">
                {isParsingPickerPdf ? (
                  <div className="pdf-loading-spinner"></div>
                ) : (
                  <UploadCloud size={28} />
                )}
              </div>
              <span className="pdf-drag-drop-zone-text">
                {isParsingPickerPdf ? 'Identificando Booking no PDF...' : 'Arraste o PDF do romaneio atualizado aqui'}
              </span>
              <span className="pdf-drag-drop-zone-subtext">
                O sistema reconhecerá o número do Booking e abrirá a atualização incremental
              </span>
            </div>

            {pickerPdfError && (
              <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '6px', padding: '10px 14px', color: '#ef4444', fontSize: '12px' }}>
                ⚠️ {pickerPdfError}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 0' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }}></div>
              <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>OU ESCOLHA NA LISTA DE RESERVAS</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }}></div>
            </div>

            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Filtrar por número do Booking, certificado ou exportador..."
                value={updatePickerSearch}
                onChange={e => setUpdatePickerSearch(e.target.value)}
                style={{ paddingLeft: '34px', fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
              {bookings
                .filter(b => {
                  if (!updatePickerSearch.trim()) return true;
                  const term = updatePickerSearch.toLowerCase();
                  const expName = (exportadores.find(e => e.id === b.exporterId)?.name || '').toLowerCase();
                  return (b.bookingNumber && b.bookingNumber.toLowerCase().includes(term)) ||
                         (b.certificateNumber && b.certificateNumber.toLowerCase().includes(term)) ||
                         expName.includes(term);
                })
                .slice(0, 30)
                .map(b => {
                  const exp = exportadores.find(e => e.id === b.exporterId)?.name || 'Exportador';
                  return (
                    <div
                      key={b.id}
                      onClick={() => {
                        setShowUpdateRomaneioPicker(false);
                        setInitialOpenUpdateRomaneio(true);
                        setSelectedBookingId(b.id);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--bg-tertiary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-brand)'; e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'; }}
                    >
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>
                          {b.bookingNumber} <span style={{ color: '#b45309', fontWeight: '800', marginLeft: '6px' }}>({b.certificateNumber})</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {exp} • {b.vesselVoyage || 'Navio'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '700', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', padding: '2px 8px', borderRadius: '9999px' }}>
                          {b.containers?.length || 0} cont.
                        </span>
                        <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '700' }}>Atualizar &rarr;</span>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
              <button
                type="button"
                onClick={() => setShowUpdateRomaneioPicker(false)}
                className="btn btn-secondary"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      {isMobileOrTablet && (
        <nav className="mobile-bottom-nav no-print no-select">
          {(user.role === 'Inspector' || user.role === 'ADM') && (
            <button
              onClick={() => setCurrentTab('field-portal')}
              className={`mobile-nav-item ${currentTab === 'field-portal' ? 'active' : ''}`}
            >
              <Camera size={20} />
              <span>Modo Campo</span>
            </button>
          )}

          <button
            onClick={() => setCurrentTab('bookings')}
            className={`mobile-nav-item ${currentTab === 'bookings' ? 'active' : ''}`}
          >
            <Search size={20} />
            <span>Bookings</span>
          </button>

          {user.role === 'ADM' && (
            <button
              onClick={() => setCurrentTab('exportadores')}
              className={`mobile-nav-item ${currentTab === 'exportadores' ? 'active' : ''}`}
            >
              <Users size={20} />
              <span>Exportadores</span>
            </button>
          )}

          <button
            onClick={() => setCurrentTab('settings')}
            className={`mobile-nav-item ${currentTab === 'settings' ? 'active' : ''}`}
          >
            <Settings size={20} />
            <span>Ajustes</span>
          </button>
        </nav>
      )}

      {/* Floating Action Button on Mobile */}
      {isMobileOrTablet && currentTab === 'bookings' && user.role === 'ADM' && (
        <button
          onClick={() => setShowCreateModal(true)}
          className="mobile-fab"
        >
          <Plus size={24} />
        </button>
      )}

      {/* Toast Feedback */}
      {refreshFeedback && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--color-brand)',
          color: 'var(--text-primary)',
          padding: '12px 20px',
          borderRadius: '12px',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 9999,
          fontSize: '13px',
          fontWeight: '700'
        }}>
          <CheckCircle2 size={18} style={{ color: '#10b981' }} />
          <span>{refreshFeedback}</span>
        </div>
      )}
    </div>
  );
}
