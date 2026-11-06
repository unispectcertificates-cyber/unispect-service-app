import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Coffee,
  Plus,
  Search,
  X,
  FileText,
  Building2,
  Package,
  Layers,
  Clock,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Edit3,
  History,
  UserCheck,
  Calendar,
  ExternalLink,
  Save,
  Eye,
  Check,
  PenTool,
  Download,
  AlertTriangle,
  RotateCcw,
  Ban
} from 'lucide-react';
import { db, useCoffeeAnalysesWithState, useCoffeeAnalysisAuditEvents, useInspectors, useExportadores, useBookings } from '../db';
import { generateUUID } from '../utils/uuid';
import {
  COFFEE_ANALYSIS_INITIAL_STATUS,
  COFFEE_CLASSIFICATION_BASIS,
  COFFEE_EMPTY_LIST_MESSAGE,
  COFFEE_OFFICIAL_SCREENS,
  COFFEE_OFFICIAL_DEFECT_ROWS,
  OFFICIAL_COFFEE_AUDIT_SOURCE,
  canAccessCoffeeAnalysisModule,
  canCreateOrEditCoffeeAnalysis,
  filterExportersForUser,
  filterBookingsForExporterAndUser,
  extractBookingLotsAndContainers,
  reconcileExporterChange,
  queryCoffeeAnalyses,
  formatDateTimeSp,
  resolveTimestampMs,
  calculateDefectsAnalysisSummary,
  calculateScreenAnalysisSummary,
  parseFlexibleDecimal
} from '../utils/coffeeAnalysisService';
import { normalizeText } from '../utils/searchUtils';
import CoffeeCertificateReport from './CoffeeCertificateReport';

export default function CoffeeAnalysisView({
  user,
  exportadores: propExportadores = [],
  bookings: propBookings = []
}) {
  const hookExportadores = useExportadores();
  const hookBookings = useBookings();
  const exportadores = (propExportadores && propExportadores.length > 0) ? propExportadores : hookExportadores;
  const bookings = (propBookings && propBookings.length > 0) ? propBookings : hookBookings;

  const { data: rawAnalyses, loading, error: loadError } = useCoffeeAnalysesWithState();
  const inspectors = useInspectors();

  // Estados de pesquisa, filtros e paginação da tela principal
  const [searchQuery, setSearchQuery] = useState('');
  const [exporterFilter, setExporterFilter] = useState('Todos');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Feedback e erros de operação
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [actionError, setActionError] = useState('');

  // Modal "+ Novo laudo de café"
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [exporterSearch, setExporterSearch] = useState('');
  const [bookingSearch, setBookingSearch] = useState('');
  const [draftForm, setDraftForm] = useState({
    exporterId: '',
    bookingId: '',
    selectedLots: [],
    selectedContainerIds: []
  });
  const [createRequestKey, setCreateRequestKey] = useState('');
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const createLockRef = useRef(false);

  // Modal de abertura / formulário técnico de classificação
  const [openedLaudoId, setOpenedLaudoId] = useState(null);
  const [activeTab, setActiveTab] = useState('form'); // 'form' | 'preview' | 'audit'
  const [isEditingLinks, setIsEditingLinks] = useState(false);
  const [editExporterSearch, setEditExporterSearch] = useState('');
  const [editBookingSearch, setEditBookingSearch] = useState('');
  const [editForm, setEditForm] = useState({
    exporterId: '',
    bookingId: '',
    selectedLots: [],
    selectedContainerIds: []
  });
  const [isSavingLinks, setIsSavingLinks] = useState(false);
  const openSessionRef = useRef(null);

  // Estados do formulário de classificação
  const [classForm, setClassForm] = useState({
    // SAMPLE IDENTIFICATION
    lotNumber: '',
    contractReference: '',
    cropYear: '2025/2026',
    quantityBags: '',
    destination: '',
    inspectionLocation: 'Interport Logística - Vila Velha / ES',
    inspectionDate: new Date().toISOString().slice(0, 10),
    sampleId: '',
    oicNumber: '',
    coffeeType: 'Coffea Arabica',

    // CLASSIFICATION SUMMARY
    classificationType: '',
    moisturePercent: '',

    // SCREEN ANALYSIS
    screens: {},

    // DEFECT ANALYSIS
    defects: {},
    defectMethod: 'Informado pelo classificador nesta versão',

    // INSECT DAMAGE / BROCA
    insectDamageEquivalentDefects: '',
    insectDamagePercentage: '',

    // IMPURITIES (%)
    impuritiesPercent: '',

    // COMMENTS
    comments: '',

    // RESPONSÁVEIS
    classifierId: '',
    classifierName: '',
    signatoryId: '',
    signatoryName: ''
  });

  const [isSavingForm, setIsSavingForm] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signatorySelection, setSignatorySelection] = useState('');

  // Cancelamento e Revisão
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');

  const hasAccess = canAccessCoffeeAnalysisModule(user);
  const canWrite = canCreateOrEditCoffeeAnalysis(user);

  // Exportadores visíveis para o usuário autenticado
  const availableExporters = useMemo(
    () => filterExportersForUser(exportadores, user),
    [exportadores, user]
  );

  // Lista total acessível (sem filtros)
  const allAccessibleAnalyses = useMemo(
    () =>
      queryCoffeeAnalyses(rawAnalyses, {
        user,
        exportadores,
        bookings
      }),
    [rawAnalyses, user, exportadores, bookings]
  );

  // Lista filtrada
  const filteredAnalyses = useMemo(
    () =>
      queryCoffeeAnalyses(rawAnalyses, {
        user,
        exportadores,
        bookings,
        searchQuery,
        exporterFilter,
        statusFilter,
        dateFrom,
        dateTo
      }),
    [rawAnalyses, user, exportadores, bookings, searchQuery, exporterFilter, statusFilter, dateFrom, dateTo]
  );

  // Paginação
  const totalItems = filteredAnalyses.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const displayedAnalyses = filteredAnalyses.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  // Laudo aberto atualmente
  const openedLaudo = useMemo(() => {
    if (!openedLaudoId) return null;
    return allAccessibleAnalyses.find(item => String(item.id) === String(openedLaudoId)) || null;
  }, [openedLaudoId, allAccessibleAnalyses]);

  // Auditoria oficial
  const officialAuditEvents = useCoffeeAnalysisAuditEvents(openedLaudoId);

  // Inicializar dados do formulário quando um laudo é aberto
  useEffect(() => {
    if (openedLaudo) {
      const sample = openedLaudo.sampleIdentification || {};
      const sum = openedLaudo.classificationSummary || {};
      const scr = openedLaudo.screenAnalysis?.screens || {};
      const def = openedLaudo.defectAnalysis?.defects || {};
      const ins = openedLaudo.insectDamage || {};
      const cls = openedLaudo.classifier || {};
      const sig = openedLaudo.signatory || {};

      setClassForm({
        lotNumber: sample.lotNumber || (openedLaudo.selectedLotLabels?.[0]) || '',
        contractReference: sample.contractReference || '',
        cropYear: sample.cropYear || '2025/2026',
        quantityBags: sample.quantityBags !== undefined && sample.quantityBags !== null ? String(sample.quantityBags) : '',
        destination: sample.destination || '',
        inspectionLocation: sample.inspectionLocation || 'Interport Logística - Vila Velha / ES',
        inspectionDate: sample.inspectionDate || new Date().toISOString().slice(0, 10),
        sampleId: sample.sampleId || '',
        oicNumber: sample.oicNumber || '',
        coffeeType: sample.coffeeType || 'Coffea Arabica',

        classificationType: sum.classificationType || sum.type || openedLaudo.type || '',
        moisturePercent: sum.moisturePercent !== undefined && sum.moisturePercent !== null ? String(sum.moisturePercent) : '',

        screens: { ...scr },
        defects: { ...def },
        defectMethod: openedLaudo.defectAnalysis?.recordedMethod || 'Informado pelo classificador nesta versão',

        insectDamageEquivalentDefects: ins.equivalentDefects !== undefined && ins.equivalentDefects !== null ? String(ins.equivalentDefects) : '',
        insectDamagePercentage: ins.percentage !== undefined && ins.percentage !== null ? String(ins.percentage) : '',

        impuritiesPercent: openedLaudo.impuritiesPercent !== undefined && openedLaudo.impuritiesPercent !== null ? String(openedLaudo.impuritiesPercent) : '',
        comments: openedLaudo.comments || '',

        classifierId: cls.id || (user?.role === 'Inspector' ? user.id : ''),
        classifierName: cls.name || (user?.role === 'Inspector' ? user.name : ''),
        signatoryId: sig.id || '',
        signatoryName: sig.name || ''
      });
      setSignatorySelection(sig.id || '');
    }
  }, [openedLaudoId, openedLaudo?._revision]);

  // Cálculos dinâmicos em tempo real
  const currentDefectsCalc = useMemo(
    () => calculateDefectsAnalysisSummary(classForm.defects),
    [classForm.defects]
  );

  const currentScreensCalc = useMemo(
    () => calculateScreenAnalysisSummary(classForm.screens),
    [classForm.screens]
  );

  // Exportador e Booking associados ao laudo aberto
  const openedExporterObj = useMemo(() => {
    if (!openedLaudo?.exporterId) return null;
    return exportadores.find(e => String(e.id) === String(openedLaudo.exporterId)) || null;
  }, [exportadores, openedLaudo?.exporterId]);

  const openedBookingObj = useMemo(() => {
    if (!openedLaudo?.bookingId) return null;
    return bookings.find(b => String(b.id) === String(openedLaudo.bookingId)) || null;
  }, [bookings, openedLaudo?.bookingId]);

  // Manipuladores de input de peneira e defeito
  const handleScreenChange = (key, val) => {
    setClassForm(prev => ({
      ...prev,
      screens: {
        ...prev.screens,
        [key]: val
      }
    }));
  };

  const handleDefectChange = (key, field, val) => {
    setClassForm(prev => {
      const current = prev.defects[key] || {};
      const updated = { ...current, [field]: val };
      return {
        ...prev,
        defects: {
          ...prev.defects,
          [key]: updated
        }
      };
    });
  };

  const handleDefectNotAnalysed = (key) => {
    setClassForm(prev => {
      const current = prev.defects[key] || {};
      const isNot = !current.notAnalysed;
      return {
        ...prev,
        defects: {
          ...prev.defects,
          [key]: isNot ? { notAnalysed: true, totalDefects: null, count: null, equivalency: null } : { notAnalysed: false }
        }
      };
    });
  };

  // Salvar rascunho da classificação
  const handleSaveClassificationDraft = async () => {
    if (!openedLaudo) return;
    setIsSavingForm(true);
    setActionError('');
    try {
      await db.coffeeAnalysis.saveClassificationDraft({
        laudoId: openedLaudo.id,
        formData: {
          ...classForm,
          exporterName: openedExporterObj?.name || openedLaudo.resolvedExporterName,
          bookingNumber: openedBookingObj?.bookingNumber || openedLaudo.bookingNumber
        },
        user,
        expectedRevision: openedLaudo._revision
      });
      setFeedbackMsg('Rascunho de classificação salvo com sucesso!');
      setTimeout(() => setFeedbackMsg(''), 4000);
    } catch (err) {
      setActionError(err.message || 'Erro ao salvar rascunho de classificação.');
    } finally {
      setIsSavingForm(false);
    }
  };

  // Finalizar Análise
  const handleFinalize = async () => {
    if (!openedLaudo) return;
    setIsFinalizing(true);
    setActionError('');
    try {
      // Salva antes se estiver sujo
      await db.coffeeAnalysis.saveClassificationDraft({
        laudoId: openedLaudo.id,
        formData: {
          ...classForm,
          exporterName: openedExporterObj?.name || openedLaudo.resolvedExporterName,
          bookingNumber: openedBookingObj?.bookingNumber || openedLaudo.bookingNumber
        },
        user,
        expectedRevision: openedLaudo._revision
      });

      await db.coffeeAnalysis.finalizeCoffeeAnalysis({
        laudoId: openedLaudo.id,
        user,
        signatoryId: signatorySelection || classForm.signatoryId,
        inspectors
      });

      setFeedbackMsg('Análise finalizada com sucesso! Documento aguardando assinatura.');
      setTimeout(() => setFeedbackMsg(''), 4000);
    } catch (err) {
      setActionError(err.message || 'Erro ao finalizar análise.');
    } finally {
      setIsFinalizing(false);
    }
  };

  // Assinar Certificado Oficial
  const handleSignCertificate = async () => {
    if (!openedLaudo) return;
    setIsSigning(true);
    setActionError('');
    try {
      await db.coffeeAnalysis.signAndIssueCertificate({
        laudoId: openedLaudo.id,
        user,
        inspectors
      });

      setShowSignModal(false);
      setFeedbackMsg('Certificado emitido e assinado com sucesso!');
      setActiveTab('preview');
      setTimeout(() => setFeedbackMsg(''), 4000);
    } catch (err) {
      setActionError(err.message || 'Erro ao assinar certificado.');
    } finally {
      setIsSigning(false);
    }
  };

  // Gerar PDF do Certificado Oficial usando html2pdf (cliente)
  const handleDownloadPdf = async () => {
    const element = document.getElementById('coffee-certificate-print-root');
    if (!element) {
      alert('Elemento de impressão do certificado não encontrado.');
      return;
    }

    if (window.html2pdf) {
      const opt = {
        margin: 0,
        filename: `UNISPECT_REPORT_${(openedLaudo?.laudoNumber || 'CERT').replace('/', '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'cm', format: 'a4', orientation: 'portrait' }
      };
      await window.html2pdf().from(element).set(opt).save();
    } else {
      window.print();
    }
  };

  // Abrir laudo da listagem
  const handleOpenLaudo = async (laudo) => {
    setOpenedLaudoId(laudo.id);
    setActiveTab(laudo.status === 'Emitido' ? 'preview' : 'form');
    setIsEditingLinks(false);
    setActionError('');
    try {
      await db.coffeeAnalysis.openDraftForConsultation({
        laudoId: laudo.id,
        user,
        sessionKey: Date.now()
      });
    } catch (err) {
      console.warn('Registro de consulta de laudo:', err.message);
    }
  };

  // Criar novo rascunho inicial
  const handleStartCreateDraft = () => {
    setDraftForm({
      exporterId: '',
      bookingId: '',
      selectedLots: [],
      selectedContainerIds: []
    });
    setCreateRequestKey('req_' + generateUUID());
    setIsCreateModalOpen(true);
    setActionError('');
  };

  const handleConfirmCreateDraft = async (e) => {
    e.preventDefault();
    if (!draftForm.exporterId) {
      setActionError('Selecione um exportador para criar o laudo.');
      return;
    }
    if (createLockRef.current) return;
    createLockRef.current = true;
    setIsCreatingDraft(true);
    setActionError('');
    try {
      const created = await db.coffeeAnalysis.createDraft({
        exporterId: draftForm.exporterId,
        bookingId: draftForm.bookingId || null,
        selectedLots: draftForm.selectedLots,
        selectedContainerIds: draftForm.selectedContainerIds,
        exportadores,
        bookings,
        user,
        requestKey: createRequestKey
      });
      setIsCreateModalOpen(false);
      setFeedbackMsg(`Rascunho ${created.laudoNumber} criado com sucesso!`);
      handleOpenLaudo(created);
    } catch (err) {
      setActionError(err.message || 'Erro ao criar laudo.');
    } finally {
      setIsCreatingDraft(false);
      createLockRef.current = false;
    }
  };

  // Dados para modal de criação
  const selectedCreateExporter = useMemo(
    () => availableExporters.find(e => String(e.id) === String(draftForm.exporterId)) || null,
    [availableExporters, draftForm.exporterId]
  );

  const availableCreateBookings = useMemo(() => {
    if (!draftForm.exporterId) return [];
    return filterBookingsForExporterAndUser(bookings, draftForm.exporterId, user, selectedCreateExporter);
  }, [bookings, draftForm.exporterId, user, selectedCreateExporter]);

  const createBookingResources = useMemo(() => {
    if (!draftForm.bookingId) return { lots: [], containers: [] };
    const bk = bookings.find(b => String(b.id) === String(draftForm.bookingId));
    return extractBookingLotsAndContainers(bk);
  }, [bookings, draftForm.bookingId]);

  const navyBannerStyle = {
    backgroundColor: '#0a1c3f',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.6px',
    padding: '8px 14px',
    textTransform: 'uppercase',
    borderRadius: '6px 6px 0 0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  };

  const sectionBodyStyle = {
    padding: '16px',
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderTop: 'none',
    borderRadius: '0 0 6px 6px'
  };

  const labelStyle = {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    marginBottom: '4px',
    minHeight: '22px',
    display: 'flex',
    alignItems: 'flex-end',
    textTransform: 'uppercase',
    letterSpacing: '0.3px'
  };

  const inputBaseStyle = {
    width: '100%',
    height: '38px',
    padding: '8px 12px',
    boxSizing: 'border-box',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: '13px'
  };

  const inputDisabledStyle = {
    ...inputBaseStyle,
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    cursor: 'not-allowed',
    fontWeight: '600'
  };

  if (!hasAccess) {
    return (
      <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <AlertCircle size={48} style={{ color: '#ef4444', marginBottom: '12px' }} />
        <h3>Acesso Restrito</h3>
        <p>Você não possui permissão para acessar o módulo Analysis of coffee.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── HEADER PRINCIPAL DO MÓDULO ─────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Coffee size={24} style={{ color: 'var(--color-brand)' }} />
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)' }}>
              Analysis of coffee
            </h2>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Classificação técnica e emissão oficial de certificados de café Unispect (Padrão A4 Retrato Azul)
          </div>
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={handleStartCreateDraft}
            className="btn-novo-romaneio"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontWeight: '800' }}
          >
            <Plus size={16} />
            <span>+ Novo laudo de café</span>
          </button>
        )}
      </div>

      {feedbackMsg && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#10b981', fontWeight: '700', fontSize: '13px' }}>
          {feedbackMsg}
        </div>
      )}

      {/* ── FILTROS DA LISTAGEM ────────────────────────────────────────── */}
      <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Buscar por laudo ou booking..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              style={{ paddingLeft: '34px' }}
            />
          </div>

          <select
            value={exporterFilter}
            onChange={e => { setExporterFilter(e.target.value); setCurrentPage(1); }}
          >
            <option value="Todos">Exportador: Todos</option>
            {availableExporters.map(exp => (
              <option key={exp.id} value={exp.id}>{exp.code ? `${exp.code} — ${exp.name}` : exp.name}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
          >
            <option value="Todos">Status: Todos</option>
            <option value="Rascunho">Rascunho</option>
            <option value="Aguardando assinatura">Aguardando assinatura</option>
            <option value="Emitido">Emitido</option>
            <option value="Cancelado">Cancelado</option>
          </select>

          <input
            type="date"
            title="Data inicial"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setCurrentPage(1); }}
          />
          <input
            type="date"
            title="Data final"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setCurrentPage(1); }}
          />
        </div>
      </div>

      {/* ── TABELA DE LAUDOS ───────────────────────────────────────────── */}
      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        {displayedAnalyses.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Coffee size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <p style={{ fontWeight: '600' }}>{COFFEE_EMPTY_LIST_MESSAGE}</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '12px 14px' }}>Laudo</th>
                  <th style={{ padding: '12px 14px' }}>Exportador</th>
                  <th style={{ padding: '12px 14px' }}>Booking</th>
                  <th style={{ padding: '12px 14px' }}>Tipo / Espécie</th>
                  <th style={{ padding: '12px 14px' }}>Status</th>
                  <th style={{ padding: '12px 14px' }}>Criado por</th>
                  <th style={{ padding: '12px 14px' }}>Criação</th>
                  <th style={{ padding: '12px 14px' }}>Última atualização</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {displayedAnalyses.map(laudo => (
                  <tr key={laudo.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px 14px', fontWeight: '800', color: 'var(--color-brand)' }}>
                      {laudo.laudoNumber}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {laudo.resolvedExporterName}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {laudo.resolvedBookingNumber || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Não vinculado</span>}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <strong>{laudo.classificationType || laudo.type || '—'}</strong>
                      {laudo.sampleIdentification?.coffeeType && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{laudo.sampleIdentification.coffeeType}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        className="status-pill"
                        style={{
                          backgroundColor:
                            laudo.status === 'Emitido' ? 'rgba(16, 185, 129, 0.16)' :
                            laudo.status === 'Aguardando assinatura' ? 'rgba(14, 165, 233, 0.16)' :
                            laudo.status === 'Cancelado' ? 'rgba(239, 68, 68, 0.16)' : 'rgba(245, 158, 11, 0.16)',
                          color:
                            laudo.status === 'Emitido' ? '#10b981' :
                            laudo.status === 'Aguardando assinatura' ? '#0ea5e9' :
                            laudo.status === 'Cancelado' ? '#ef4444' : '#d97706',
                          fontWeight: '800'
                        }}
                      >
                        {laudo.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>{laudo.createdBy?.name || '—'}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{formatDateTimeSp(laudo.createdAt)}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{formatDateTimeSp(laudo.updatedAt)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenLaudo(laudo)}
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '700' }}
                      >
                        Abrir laudo
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL 1: CRIAR NOVO LAUDO DE CAFÉ (Vínculo Inicial)
         ══════════════════════════════════════════════════════════════════════ */}
      {isCreateModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', backgroundColor: 'var(--bg-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>+ Novo laudo de café</h3>
              <button type="button" onClick={() => setIsCreateModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {actionError && (
              <div style={{ padding: '10px 14px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#ef4444', fontSize: '12px', fontWeight: '700', marginBottom: '10px' }}>
                {actionError}
              </div>
            )}

            <form onSubmit={handleConfirmCreateDraft} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700' }}>Exportador *</label>
                <select
                  required
                  value={draftForm.exporterId}
                  onChange={e => {
                    const reconciled = reconcileExporterChange(draftForm, e.target.value, bookings);
                    setDraftForm(reconciled);
                  }}
                >
                  <option value="">Selecione o exportador...</option>
                  {availableExporters.map(exp => (
                    <option key={exp.id} value={exp.id}>{exp.code ? `${exp.code} — ${exp.name}` : exp.name}</option>
                  ))}
                </select>
              </div>

              {selectedCreateExporter && (
                <div style={{ padding: '10px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px', fontSize: '12px' }}>
                  <strong>{selectedCreateExporter.name}</strong>
                  {selectedCreateExporter.cnpj && <div>CNPJ: {selectedCreateExporter.cnpj}</div>}
                </div>
              )}

              {draftForm.exporterId && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700' }}>Booking (Opcional)</label>
                  <select
                    value={draftForm.bookingId}
                    onChange={e => setDraftForm(prev => ({ ...prev, bookingId: e.target.value, selectedLots: [], selectedContainerIds: [] }))}
                  >
                    <option value="">Sem vínculo com booking (Apenas exportador)</option>
                    {availableCreateBookings.map(b => (
                      <option key={b.id} value={b.id}>{b.bookingNumber} ({b.containers?.length || 0} containers)</option>
                    ))}
                  </select>
                </div>
              )}

              {draftForm.bookingId && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ padding: '10px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                    <strong style={{ fontSize: '12px', display: 'block', marginBottom: '6px' }}>Lotes ({createBookingResources.lots.length})</strong>
                    {createBookingResources.lots.map(l => (
                      <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                        <input
                          type="checkbox"
                          checked={draftForm.selectedLots.includes(l.id)}
                          onChange={() => {
                            setDraftForm(prev => ({
                              ...prev,
                              selectedLots: prev.selectedLots.includes(l.id) ? prev.selectedLots.filter(x => x !== l.id) : [...prev.selectedLots, l.id]
                            }));
                          }}
                        />
                        <span>{l.label}</span>
                      </label>
                    ))}
                  </div>

                  <div style={{ padding: '10px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                    <strong style={{ fontSize: '12px', display: 'block', marginBottom: '6px' }}>Containers ({createBookingResources.containers.length})</strong>
                    {createBookingResources.containers.map(c => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                        <input
                          type="checkbox"
                          checked={draftForm.selectedContainerIds.includes(c.id)}
                          onChange={() => {
                            setDraftForm(prev => ({
                              ...prev,
                              selectedContainerIds: prev.selectedContainerIds.includes(c.id) ? prev.selectedContainerIds.filter(x => x !== c.id) : [...prev.selectedContainerIds, c.id]
                            }));
                          }}
                        />
                        <span>{c.containerNumber}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" disabled={isCreatingDraft || !draftForm.exporterId} className="btn btn-primary" style={{ fontWeight: '800' }}>
                  {isCreatingDraft ? 'Criando rascunho...' : 'Criar rascunho'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL 2: ABERTURA DO LAUDO, FORMULÁRIO TÉCNICO E PRÉVIA A4 AZUL
         ══════════════════════════════════════════════════════════════════════ */}
      {openedLaudo && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3500, padding: '14px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '1080px', maxHeight: '95vh', overflowY: 'auto', padding: '24px', backgroundColor: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Cabeçalho do Laudo Aberto com Tabs */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '22px', fontWeight: '900', color: 'var(--color-brand)' }}>{openedLaudo.laudoNumber}</span>
                  <span className="status-pill" style={{ fontWeight: '800' }}>{openedLaudo.status}</span>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                    Revisão: {openedLaudo.currentRevision || 1}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {openedExporterObj?.name || openedLaudo.resolvedExporterName} • Booking: {openedBookingObj?.bookingNumber || openedLaudo.bookingNumber || 'Não vinculado'}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('form')}
                  className={`btn ${activeTab === 'form' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '700' }}
                >
                  <Edit3 size={14} style={{ marginRight: '6px' }} />
                  Formulário Técnico
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`btn ${activeTab === 'preview' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '700' }}
                >
                  <Eye size={14} style={{ marginRight: '6px' }} />
                  Visualizar Certificado
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('audit')}
                  className={`btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '700' }}
                >
                  <History size={14} style={{ marginRight: '6px' }} />
                  Auditoria ({officialAuditEvents.length})
                </button>
                <button type="button" onClick={() => setOpenedLaudoId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '6px' }}>
                  <X size={20} />
                </button>
              </div>
            </div>

            {actionError && (
              <div style={{ padding: '10px 14px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#ef4444', fontSize: '12px', fontWeight: '700' }}>
                {actionError}
              </div>
            )}

            {/* TAB 1: FORMULÁRIO TÉCNICO DE CLASSIFICAÇÃO */}
            {activeTab === 'form' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* SEÇÃO 1: SAMPLE IDENTIFICATION */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={navyBannerStyle}>
                    <span>SAMPLE IDENTIFICATION (Identificação da Amostra)</span>
                  </div>
                  <div style={sectionBodyStyle}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '20px', rowGap: '12px' }}>
                      {/* Row 1: Exporter | Booking */}
                      <div>
                        <label style={labelStyle}>Exporter (Exportador)</label>
                        <input
                          type="text"
                          disabled
                          value={openedExporterObj?.name || openedLaudo.resolvedExporterName || '—'}
                          style={inputDisabledStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Booking</label>
                        <input
                          type="text"
                          disabled
                          value={openedBookingObj?.bookingNumber || openedLaudo.bookingNumber || 'Não vinculado'}
                          style={inputDisabledStyle}
                        />
                      </div>

                      {/* Row 2: Lot number | Contract reference */}
                      <div>
                        <label style={labelStyle}>Lot number (Número do Lote)</label>
                        <input
                          type="text"
                          value={classForm.lotNumber}
                          onChange={e => setClassForm(p => ({ ...p, lotNumber: e.target.value }))}
                          placeholder="Ex: LOTE 01"
                          style={inputBaseStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Contract reference (Ref. Contrato)</label>
                        <input
                          type="text"
                          value={classForm.contractReference}
                          onChange={e => setClassForm(p => ({ ...p, contractReference: e.target.value }))}
                          placeholder="Ex: CTR-9988"
                          style={inputBaseStyle}
                        />
                      </div>

                      {/* Row 3: Crop year | Quantity of bags */}
                      <div>
                        <label style={labelStyle}>Crop year (Safra)</label>
                        <input
                          type="text"
                          value={classForm.cropYear}
                          onChange={e => setClassForm(p => ({ ...p, cropYear: e.target.value }))}
                          placeholder="Ex: 2025/2026"
                          style={inputBaseStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Quantity of bags (Qtd. de Sacas)</label>
                        <input
                          type="text"
                          value={classForm.quantityBags}
                          onChange={e => setClassForm(p => ({ ...p, quantityBags: e.target.value }))}
                          placeholder="Ex: 320"
                          style={inputBaseStyle}
                        />
                      </div>

                      {/* Row 4: Destination | Local inspection */}
                      <div>
                        <label style={labelStyle}>Destination (Destino)</label>
                        <input
                          type="text"
                          value={classForm.destination}
                          onChange={e => setClassForm(p => ({ ...p, destination: e.target.value }))}
                          placeholder="Ex: Hamburgo, Alemanha"
                          style={inputBaseStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Local inspection (Local da Inspeção)</label>
                        <input
                          type="text"
                          value={classForm.inspectionLocation}
                          onChange={e => setClassForm(p => ({ ...p, inspectionLocation: e.target.value }))}
                          placeholder="Ex: Interport Logística - Vila Velha / ES"
                          style={inputBaseStyle}
                        />
                      </div>

                      {/* Row 5: Dated | Sample ID */}
                      <div>
                        <label style={labelStyle}>Dated (Data da Inspeção)</label>
                        <input
                          type="date"
                          value={classForm.inspectionDate}
                          onChange={e => setClassForm(p => ({ ...p, inspectionDate: e.target.value }))}
                          style={inputBaseStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Sample ID (ID da Amostra) *</label>
                        <input
                          type="text"
                          value={classForm.sampleId}
                          onChange={e => setClassForm(p => ({ ...p, sampleId: e.target.value }))}
                          placeholder="Ex: SMP-2026-001"
                          style={inputBaseStyle}
                        />
                      </div>

                      {/* Row 6: OIC | Coffee type */}
                      <div>
                        <label style={labelStyle}>OIC (Código OIC)</label>
                        <input
                          type="text"
                          value={classForm.oicNumber}
                          onChange={e => setClassForm(p => ({ ...p, oicNumber: e.target.value }))}
                          placeholder="Ex: 002/0150/0001"
                          style={inputBaseStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Coffee type (Espécie do Café)</label>
                        <select
                          value={classForm.coffeeType}
                          onChange={e => setClassForm(p => ({ ...p, coffeeType: e.target.value }))}
                          style={inputBaseStyle}
                        >
                          <option value="Coffea Arabica">Coffea Arabica (Arábica)</option>
                          <option value="Coffea Canephora (Conilon / Robusta)">Coffea Canephora (Conilon / Robusta)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SEÇÃO 2: CLASSIFICATION SUMMARY */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={navyBannerStyle}>
                    <span>CLASSIFICATION SUMMARY (Resumo da Classificação)</span>
                  </div>
                  <div style={sectionBodyStyle}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                      <div>
                        <label style={labelStyle}>Sample weight (Peso)</label>
                        <input type="text" disabled value="300 g" style={inputDisabledStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Type (Tipo Comercial)</label>
                        <input
                          type="text"
                          value={classForm.classificationType}
                          onChange={e => setClassForm(p => ({ ...p, classificationType: e.target.value }))}
                          placeholder="Ex: Tipo 2, Tipo 4/5..."
                          style={inputBaseStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Moisture (%) (Umidade)</label>
                        <input
                          type="text"
                          value={classForm.moisturePercent}
                          onChange={e => setClassForm(p => ({ ...p, moisturePercent: e.target.value }))}
                          placeholder="Ex: 11,5"
                          style={inputBaseStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Total equivalent defects</label>
                        <input
                          type="text"
                          disabled
                          value={currentDefectsCalc.totalEquivalentDefects !== null ? String(currentDefectsCalc.totalEquivalentDefects) : (currentDefectsCalc.isComplete ? '0' : 'Incompleto / Pendente')}
                          style={{
                            ...inputDisabledStyle,
                            fontWeight: '800',
                            color: currentDefectsCalc.isComplete ? '#10b981' : '#f59e0b',
                            border: `1px solid ${currentDefectsCalc.isComplete ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* SEÇÃO 3: SCREEN ANALYSIS (%) */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={navyBannerStyle}>
                    <span>SCREEN ANALYSIS (%) (Análise de Peneiras)</span>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: currentScreensCalc.isExact100 ? '#10b981' : '#f59e0b' }}>
                      Total Informado: {currentScreensCalc.total.toFixed(2)}%
                    </span>
                  </div>
                  <div style={sectionBodyStyle}>
                    {currentScreensCalc.warning && (
                      <div style={{ padding: '8px 12px', marginBottom: '12px', backgroundColor: 'rgba(245, 158, 11, 0.15)', borderRadius: '6px', color: '#d97706', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertTriangle size={14} />
                        <span>{currentScreensCalc.warning}</span>
                      </div>
                    )}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f0f4f8', color: '#0a1c3f' }}>
                            {COFFEE_OFFICIAL_SCREENS.map(sc => (
                              <th key={sc.key} style={{ padding: '6px 4px', fontSize: '11px', fontWeight: '800', border: '1px solid var(--border-color)' }}>
                                {sc.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {COFFEE_OFFICIAL_SCREENS.map(sc => (
                              <td key={sc.key} style={{ padding: '6px 4px', border: '1px solid var(--border-color)' }}>
                                <input
                                  type="text"
                                  value={classForm.screens[sc.key] || ''}
                                  onChange={e => handleScreenChange(sc.key, e.target.value)}
                                  placeholder="0,0"
                                  style={{
                                    width: '100%',
                                    height: '32px',
                                    textAlign: 'center',
                                    padding: '4px',
                                    boxSizing: 'border-box',
                                    borderRadius: '4px',
                                    border: '1px solid var(--border-color)',
                                    backgroundColor: 'var(--bg-primary)',
                                    fontSize: '12px',
                                    fontWeight: '600'
                                  }}
                                />
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* SEÇÃO 4: DEFECT ANALYSIS — Per 300 g Sample */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={navyBannerStyle}>
                    <span>DEFECT ANALYSIS (Per 300 g Sample) (Análise de Defeitos)</span>
                    <span style={{ fontSize: '10px', color: '#cbd5e1', textTransform: 'none', fontWeight: 'normal' }}>
                      Linha TOTAL calculada exclusivamente pela soma dos resultados
                    </span>
                  </div>
                  <div style={sectionBodyStyle}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', border: '1px solid var(--border-color)' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f0f4f8', color: '#0a1c3f' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid var(--border-color)' }}>Defect type</th>
                            <th style={{ padding: '8px', textAlign: 'center', width: '130px', border: '1px solid var(--border-color)' }}>Count</th>
                            <th style={{ padding: '8px', textAlign: 'center', width: '130px', border: '1px solid var(--border-color)' }}>Equivalency*</th>
                            <th style={{ padding: '8px', textAlign: 'center', width: '140px', border: '1px solid var(--border-color)' }}>Total defects</th>
                            <th style={{ padding: '8px', textAlign: 'center', width: '120px', border: '1px solid var(--border-color)' }}>Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {COFFEE_OFFICIAL_DEFECT_ROWS.map((row, idx) => {
                            const item = classForm.defects[row.key] || {};
                            const isEven = idx % 2 === 0;
                            return (
                              <tr key={row.key} style={{ backgroundColor: isEven ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                                <td style={{ padding: '6px 12px', fontWeight: '600', border: '1px solid var(--border-color)' }}>
                                  {row.label}
                                </td>
                                <td style={{ padding: '6px 8px', border: '1px solid var(--border-color)' }}>
                                  <input
                                    type="text"
                                    disabled={item.notAnalysed}
                                    value={item.count || ''}
                                    onChange={e => handleDefectChange(row.key, 'count', e.target.value)}
                                    placeholder={item.notAnalysed ? '—' : '0'}
                                    style={{ width: '100%', height: '30px', textAlign: 'center', padding: '2px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: item.notAnalysed ? 'var(--bg-secondary)' : 'var(--bg-primary)' }}
                                  />
                                </td>
                                <td style={{ padding: '6px 8px', border: '1px solid var(--border-color)' }}>
                                  <input
                                    type="text"
                                    disabled={item.notAnalysed}
                                    value={item.equivalency || ''}
                                    onChange={e => handleDefectChange(row.key, 'equivalency', e.target.value)}
                                    placeholder={item.notAnalysed ? '—' : '1'}
                                    style={{ width: '100%', height: '30px', textAlign: 'center', padding: '2px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: item.notAnalysed ? 'var(--bg-secondary)' : 'var(--bg-primary)' }}
                                  />
                                </td>
                                <td style={{ padding: '6px 8px', border: '1px solid var(--border-color)' }}>
                                  <input
                                    type="text"
                                    disabled={item.notAnalysed}
                                    value={item.totalDefects || ''}
                                    onChange={e => handleDefectChange(row.key, 'totalDefects', e.target.value)}
                                    placeholder={item.notAnalysed ? 'Not analysed' : '0'}
                                    style={{ width: '100%', height: '30px', textAlign: 'center', padding: '2px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid var(--border-color)', fontWeight: 'bold', backgroundColor: item.notAnalysed ? 'var(--bg-secondary)' : 'var(--bg-primary)' }}
                                  />
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleDefectNotAnalysed(row.key)}
                                    className="btn btn-secondary"
                                    style={{ padding: '3px 8px', fontSize: '10px' }}
                                  >
                                    {item.notAnalysed ? 'Desmarcar' : 'Não analisado'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          <tr style={{ backgroundColor: '#f0f4f8', fontWeight: '800', color: '#0a1c3f' }}>
                            <td style={{ padding: '10px 12px', textTransform: 'uppercase', border: '1px solid var(--border-color)' }} colSpan="3">
                              TOTAL
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '13px', fontWeight: '900', border: '1px solid var(--border-color)' }}>
                              {currentDefectsCalc.totalEquivalentDefects !== null ? currentDefectsCalc.totalEquivalentDefects : (currentDefectsCalc.filledCount > 0 ? `Parcial: ${currentDefectsCalc.partialSum}` : '—')}
                            </td>
                            <td style={{ border: '1px solid var(--border-color)' }}></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '6px' }}>
                      *Equivalências conforme método de classificação a definir.
                    </div>
                  </div>
                </div>

                {/* SEÇÃO 5: INSECT DAMAGE / BROCA & IMPURITIES */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={navyBannerStyle}>
                      <span>INSECT DAMAGE / BROCA</span>
                    </div>
                    <div style={sectionBodyStyle}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={labelStyle}>Equivalent Defects</label>
                          <input
                            type="text"
                            value={classForm.insectDamageEquivalentDefects}
                            onChange={e => setClassForm(p => ({ ...p, insectDamageEquivalentDefects: e.target.value }))}
                            placeholder="Ex: 5"
                            style={inputBaseStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Percentage (%)</label>
                          <input
                            type="text"
                            value={classForm.insectDamagePercentage}
                            onChange={e => setClassForm(p => ({ ...p, insectDamagePercentage: e.target.value }))}
                            placeholder="Ex: 1,67%"
                            style={inputBaseStyle}
                          />
                        </div>
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '6px' }}>
                        Base de cálculo do percentual a definir.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={navyBannerStyle}>
                      <span>IMPURITIES (%)</span>
                    </div>
                    <div style={sectionBodyStyle}>
                      <div>
                        <label style={labelStyle}>Impurities (%)</label>
                        <input
                          type="text"
                          value={classForm.impuritiesPercent}
                          onChange={e => setClassForm(p => ({ ...p, impuritiesPercent: e.target.value }))}
                          placeholder="Ex: 0,5%"
                          style={inputBaseStyle}
                        />
                      </div>
                      <div style={{ fontSize: '10px', color: 'transparent', userSelect: 'none', marginTop: '6px' }}>
                        &nbsp;
                      </div>
                    </div>
                  </div>
                </div>

                {/* SEÇÃO 6: COMMENTS */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={navyBannerStyle}>
                    <span>COMMENTS (Observações Técnicas)</span>
                  </div>
                  <div style={sectionBodyStyle}>
                    <textarea
                      rows={3}
                      value={classForm.comments}
                      onChange={e => setClassForm(p => ({ ...p, comments: e.target.value }))}
                      placeholder="Insira comentários, condições da amostra ou observações relevantes..."
                      style={{
                        width: '100%',
                        minHeight: '76px',
                        padding: '8px 12px',
                        boxSizing: 'border-box',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                </div>

                {/* SEÇÃO 7: CLASSIFIER / AUTHORIZED SIGNATORY */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={navyBannerStyle}>
                    <span>CLASSIFIER / AUTHORIZED SIGNATORY (Classificador & Signatário Autorizado)</span>
                  </div>
                  <div style={sectionBodyStyle}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label style={labelStyle}>Classifier (Classificador Responsável) *</label>
                        <input
                          type="text"
                          value={classForm.classifierName}
                          onChange={e => setClassForm(p => ({ ...p, classifierName: e.target.value }))}
                          placeholder="Nome do classificador..."
                          style={inputBaseStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Authorized Signatory (Signatário Autorizado) *</label>
                        <select
                          value={signatorySelection}
                          onChange={e => {
                            setSignatorySelection(e.target.value);
                            const ins = inspectors.find(i => String(i.id) === e.target.value);
                            setClassForm(p => ({
                              ...p,
                              signatoryId: e.target.value,
                              signatoryName: ins?.name || e.target.value
                            }));
                          }}
                          style={inputBaseStyle}
                        >
                          <option value="">Selecione o signatário que assinará...</option>
                          {inspectors.map(ins => (
                            <option key={ins.id} value={ins.id}>{ins.name} ({ins.role || 'Inspector'})</option>
                          ))}
                        </select>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                          Apenas o próprio signatário poderá assinar o certificado com sua assinatura pessoal cadastrada.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* BOTÕES DE AÇÃO DO FORMULÁRIO */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {openedLaudo.status === 'Emitido' && (
                      <button
                        type="button"
                        onClick={() => setShowRevisionModal(true)}
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <RotateCcw size={14} />
                        <span>Nova Revisão</span>
                      </button>
                    )}
                    {openedLaudo.status !== 'Cancelado' && (
                      <button
                        type="button"
                        onClick={() => setShowCancelModal(true)}
                        className="btn btn-danger"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Ban size={14} />
                        <span>Cancelar Laudo</span>
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      disabled={isSavingForm}
                      onClick={handleSaveClassificationDraft}
                      className="btn btn-secondary"
                      style={{ padding: '8px 16px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Save size={16} />
                      <span>{isSavingForm ? 'Salvando...' : 'Salvar rascunho'}</span>
                    </button>

                    {openedLaudo.status === 'Rascunho' && (
                      <button
                        type="button"
                        disabled={isFinalizing}
                        onClick={handleFinalize}
                        className="btn-novo-romaneio"
                        style={{ padding: '8px 18px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Check size={16} />
                        <span>{isFinalizing ? 'Finalizando...' : 'Finalizar análise'}</span>
                      </button>
                    )}

                    {openedLaudo.status === 'Aguardando assinatura' && (
                      <button
                        type="button"
                        onClick={() => setShowSignModal(true)}
                        className="btn-novo-romaneio"
                        style={{ padding: '8px 18px', fontWeight: '800', backgroundColor: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <PenTool size={16} />
                        <span>Assinar Certificado</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: PRÉVIA REAL A4 AZUL & EXPORTAÇÃO */}
            {activeTab === 'preview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-tertiary)', padding: '10px 16px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700' }}>
                    Certificado Oficial de Qualidade (Layout A4 Retrato Azul Unispect)
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      className="btn btn-primary"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontWeight: '700' }}
                    >
                      <Download size={14} />
                      <span>Baixar PDF Real</span>
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto', width: '100%', display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
                  <CoffeeCertificateReport
                    laudo={{
                      ...openedLaudo,
                      sampleIdentification: {
                        ...openedLaudo.sampleIdentification,
                        ...classForm,
                        exporterName: openedExporterObj?.name || openedLaudo.resolvedExporterName,
                        bookingNumber: openedBookingObj?.bookingNumber || openedLaudo.bookingNumber
                      },
                      classificationSummary: {
                        sampleWeightGrams: 300,
                        classificationType: classForm.classificationType,
                        type: classForm.classificationType,
                        moisturePercent: parseFlexibleDecimal(classForm.moisturePercent),
                        totalEquivalentDefects: currentDefectsCalc.totalEquivalentDefects,
                        defectsComplete: currentDefectsCalc.isComplete
                      },
                      screenAnalysis: {
                        screens: classForm.screens,
                        total: currentScreensCalc.total
                      },
                      defectAnalysis: {
                        defects: classForm.defects,
                        totalEquivalentDefects: currentDefectsCalc.totalEquivalentDefects,
                        partialSum: currentDefectsCalc.partialSum,
                        isComplete: currentDefectsCalc.isComplete
                      },
                      insectDamage: {
                        equivalentDefects: parseFlexibleDecimal(classForm.insectDamageEquivalentDefects),
                        percentage: parseFlexibleDecimal(classForm.insectDamagePercentage)
                      },
                      impuritiesPercent: parseFlexibleDecimal(classForm.impuritiesPercent),
                      comments: classForm.comments,
                      classifier: { name: classForm.classifierName },
                      signatory: { name: classForm.signatoryName || openedLaudo.signatory?.name }
                    }}
                    isDraftPreview={openedLaudo.status !== 'Emitido'}
                  />
                </div>
              </div>
            )}

            {/* TAB 3: LINHA DO TEMPO OFICIAL DE AUDITORIA */}
            {activeTab === 'audit' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Trilha imutável registrada na coleção <code>{OFFICIAL_COFFEE_AUDIT_SOURCE}</code> com carimbo do servidor e fuso America/Sao_Paulo.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '450px', overflowY: 'auto' }}>
                  {[...officialAuditEvents]
                    .sort((a, b) => resolveTimestampMs(b.serverTimestamp || b.timestampMs) - resolveTimestampMs(a.serverTimestamp || a.timestampMs))
                    .map(ev => (
                      <div key={ev.id} style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-tertiary)', borderLeft: '3px solid var(--color-brand)', fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700' }}>
                          <span>{ev.actionLabel}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatDateTimeSp(ev.serverTimestamp || ev.timestampMs)}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Autor: <strong>{ev.actor?.name}</strong> ({ev.actor?.role})
                        </div>
                        {ev.newValues && (
                          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                            Valores: {JSON.stringify(ev.newValues)}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE ASSINATURA INDIVIDUAL */}
      {showSignModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '24px', backgroundColor: 'var(--bg-secondary)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '800' }}>Confirmar Assinatura Digital</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              Você está prestes a assinar e emitir oficialmente o relatório <strong>{openedLaudo?.laudoNumber}</strong> como <strong>{user?.name}</strong>.
            </p>
            <div style={{ padding: '10px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              A assinatura aplicada será exclusivamente a sua própria assinatura pessoal cadastrada. Ter permissão não autoriza assinar em nome de terceiros.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setShowSignModal(false)} className="btn btn-secondary">Cancelar</button>
              <button
                type="button"
                disabled={isSigning}
                onClick={handleSignCertificate}
                className="btn btn-primary"
                style={{ backgroundColor: '#10b981', fontWeight: '800' }}
              >
                {isSigning ? 'Assinando...' : 'Confirmar e Emitir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE JUSTIFICATIVA DE CANCELAMENTO */}
      {showCancelModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '24px', backgroundColor: 'var(--bg-secondary)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '800', color: '#ef4444' }}>Cancelar Laudo</h3>
            <label style={{ fontSize: '12px', fontWeight: '700' }}>Justificativa Obrigatória *</label>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Descreva o motivo do cancelamento deste laudo..."
              style={{ width: '100%', marginTop: '6px', marginBottom: '14px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setShowCancelModal(false)} className="btn btn-secondary">Voltar</button>
              <button
                type="button"
                disabled={!cancelReason.trim()}
                onClick={async () => {
                  try {
                    await db.coffeeAnalysis.cancelCoffeeAnalysis({
                      laudoId: openedLaudo.id,
                      reason: cancelReason,
                      user
                    });
                    setShowCancelModal(false);
                    setFeedbackMsg('Laudo cancelado com sucesso.');
                  } catch (err) {
                    setActionError(err.message);
                  }
                }}
                className="btn btn-danger"
                style={{ fontWeight: '800' }}
              >
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE JUSTIFICATIVA DE REVISÃO */}
      {showRevisionModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '24px', backgroundColor: 'var(--bg-secondary)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '800' }}>Criar Nova Revisão</h3>
            <label style={{ fontSize: '12px', fontWeight: '700' }}>Motivo da Revisão *</label>
            <textarea
              rows={3}
              value={revisionReason}
              onChange={e => setRevisionReason(e.target.value)}
              placeholder="Descreva as correções que motivaram a nova revisão..."
              style={{ width: '100%', marginTop: '6px', marginBottom: '14px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setShowRevisionModal(false)} className="btn btn-secondary">Voltar</button>
              <button
                type="button"
                disabled={!revisionReason.trim()}
                onClick={async () => {
                  try {
                    await db.coffeeAnalysis.createNewRevision({
                      laudoId: openedLaudo.id,
                      reason: revisionReason,
                      user
                    });
                    setShowRevisionModal(false);
                    setFeedbackMsg('Nova revisão criada com sucesso!');
                    setActiveTab('form');
                  } catch (err) {
                    setActionError(err.message);
                  }
                }}
                className="btn btn-primary"
                style={{ fontWeight: '800' }}
              >
                Gerar Revisão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
