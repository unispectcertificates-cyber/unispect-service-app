import { useState, useEffect } from 'react';
import { X, Trash2, Camera, Image, ArrowLeft, ArrowRight, Search, UploadCloud, CheckCircle2 } from 'lucide-react';
import { db, useBookings, useInspectors, useLocais, useExportadores, isBookingNumberDuplicate, matchesContainerQuery } from '../db';
import { planImport, previewToken, normalizeContainerNumber, normalizeBookingNumber, importFieldLabels, detectBookingFieldChanges } from '../utils/bookingImport';
import { parseRomaneioPdf } from '../utils/pdfParser';
import ContainerDetail from './ContainerDetail';
import BookingImportHistory from './BookingImportHistory';

export default function BookingManagementModal({ bookingId, onClose, user, onDataChange, onOpenReport }) {
  
  const bookings = useBookings();
  const inspectors = useInspectors();
  const exportadores = useExportadores();
  const locais = useLocais();
  const [prevBookingId, setPrevBookingId] = useState(bookingId);
  const [booking, setBooking] = useState(() => bookings.find(b => b.id === bookingId));
  const [containerSearch, setContainerSearch] = useState('');
  const [selectedInspectorId, setSelectedInspectorId] = useState(() => {
    const bk = bookings.find(b => b.id === bookingId);
    return bk?.inspectorId || '';
  });
  const [bookingStatus, setBookingStatus] = useState(() => {
    const bk = bookings.find(b => b.id === bookingId);
    return bk?.status || 'Pendente';
  });
  const [pendingItem, setPendingItem] = useState(() => {
    const bk = bookings.find(b => b.id === bookingId);
    return bk?.pendingItem || '';
  });

  useEffect(() => {
    const bk = bookings.find(b => b.id === bookingId);
    if (bk) {
      setBooking(bk);
      setSelectedInspectorId(bk.inspectorId || '');
      setBookingStatus(bk.status || 'Pendente');
      setPendingItem(bk.pendingItem || '');
    }
  }, [bookings, bookingId]);

  
  // Modais de segundo nível
  const [showAddContainer, setShowAddContainer] = useState(false);
  const [showPhotoManager, setShowPhotoManager] = useState(null); // Container object
  const [loadingPhotosId, setLoadingPhotosId] = useState(null);  // ID do container carregando fotos
  const [selectedContainerToManage, setSelectedContainerToManage] = useState(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState(null);

  // Modal de Atualização Incremental via Romaneio PDF
  const [showIncrementalImportModal, setShowIncrementalImportModal] = useState(false);
  const [importPdfFile, setImportPdfFile] = useState(null);
  const [isParsingRomaneio, setIsParsingRomaneio] = useState(false);
  const [romaneioParseError, setRomaneioParseError] = useState('');
  const [parsedRomaneio, setParsedRomaneio] = useState(null);
  const [romaneioPlan, setRomaneioPlan] = useState(null);
  const [isSavingIncremental, setIsSavingIncremental] = useState(false);
  const [modalFeedback, setModalFeedback] = useState('');
  
  // Form de Novo Container
  const [newContainer, setNewContainer] = useState({
    containerNumber: '',
    containerType: "40' Reefer (Refrigerado)",
    status: 'Pendente',
    provisional1: '',
    provisional2: '',
    provisional3: '',
    definiteSeal: '',
    notes: '',
    fumigationDate: new Date().toISOString().split('T')[0],
    fitoDate: new Date().toISOString().split('T')[0],
    definiteSealDate: ''
  });

  if (!booking) return null;

  const isInspector = user.role === 'Inspector';
  const isAdm = user.role === 'ADM';
  const canEdit = isAdm || isInspector;

  const handleInspectorChange = (e) => {
    setSelectedInspectorId(e.target.value);
  };

  const handleSaveBooking = async () => {
    try {
      if (isBookingNumberDuplicate(bookings, booking.bookingNumber, booking.id)) {
        alert(`Este romaneio / booking já foi inserido no sistema. (Booking: ${booking.bookingNumber.trim()})`);
        return;
      }

      const updated = {
        ...booking,
        inspectorId: selectedInspectorId,
        status: bookingStatus,
        pendingItem: pendingItem
      };
      setBooking(updated);
      await db.saveBooking(updated);
      if (onDataChange) onDataChange();
      onClose();
    } catch (error) {
      console.error("Error saving booking:", error);
      alert(error.message || "Erro ao salvar as alterações.");
    }
  };

  const handleRomaneioFileSelect = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setRomaneioParseError('Por favor, selecione um arquivo no formato PDF.');
      return;
    }
    setImportPdfFile(file);
    setIsParsingRomaneio(true);
    setRomaneioParseError('');
    setParsedRomaneio(null);
    setRomaneioPlan(null);

    try {
      const parsed = await parseRomaneioPdf(file, { exportadores, locais });
      const plan = planImport(booking, parsed.containers || []);
      setParsedRomaneio(parsed);
      setRomaneioPlan(plan);
    } catch (err) {
      console.error('Erro ao ler romaneio:', err);
      setRomaneioParseError(err.message || 'Falha ao processar o arquivo PDF do romaneio.');
    } finally {
      setIsParsingRomaneio(false);
    }
  };

  const pdfBookingNum = (parsedRomaneio?.bookingNumber || '').trim();
  const currentBookingNum = (booking?.bookingNumber || '').trim();
  const isBookingIdentified = Boolean(pdfBookingNum);
  const isBookingMatch = isBookingIdentified && normalizeBookingNumber(pdfBookingNum) === normalizeBookingNumber(currentBookingNum);

  let bookingBlockReason = '';
  if (parsedRomaneio) {
    if (!isBookingIdentified) {
      bookingBlockReason = 'O número do Booking não pôde ser identificado no arquivo PDF selecionado. Por segurança, a confirmação foi bloqueada para evitar importar containers para o Booking incorreto.';
    } else if (!isBookingMatch) {
      bookingBlockReason = `O arquivo PDF selecionado pertence ao Booking "${pdfBookingNum}", diferente do Booking atualmente aberto ("${currentBookingNum}"). A confirmação foi bloqueada para evitar vincular containers à reserva incorreta.`;
    }
  }

  const detectedChanges = parsedRomaneio ? detectBookingFieldChanges(booking, parsedRomaneio) : [];

  const canConfirmIncremental = Boolean(
    parsedRomaneio &&
    romaneioPlan &&
    isBookingMatch &&
    !isSavingIncremental &&
    romaneioPlan.invalid.length === 0 &&
    (romaneioPlan.added.length > 0 || detectedChanges.length > 0)
  );

  const handleConfirmIncrementalUpdate = async () => {
    if (!parsedRomaneio || !romaneioPlan || !isBookingMatch) {
      if (!isBookingMatch && bookingBlockReason) {
        alert(bookingBlockReason);
      }
      return;
    }
    if (romaneioPlan.invalid.length > 0) {
      alert('Corrija os containers inválidos antes de continuar.');
      return;
    }

    setIsSavingIncremental(true);
    try {
      const token = previewToken(booking, romaneioPlan);
      // Lê todo o romaneio e sincroniza os campos atualizados (sacas, navio, viagem, embalagem, armador, destino etc.)
      // enquanto preserva 100% dos containers existentes, seus IDs, fotos e laudos.
      const incomingData = {
        ...booking,
        bookingNumber: booking.bookingNumber,
        bagsQuantity: (parsedRomaneio.bagsQuantity !== undefined && parsedRomaneio.bagsQuantity !== '')
          ? (parseInt(parsedRomaneio.bagsQuantity, 10) || parsedRomaneio.bagsQuantity)
          : booking.bagsQuantity,
        embalagem: parsedRomaneio.embalagem || booking.embalagem,
        vesselVoyage: parsedRomaneio.vesselVoyage || booking.vesselVoyage,
        vesselName: parsedRomaneio.vesselName || booking.vesselName,
        vesselVoyageNum: parsedRomaneio.vesselVoyageNum || booking.vesselVoyageNum,
        portoDestino: parsedRomaneio.portoDestino || booking.portoDestino,
        armador: parsedRomaneio.armador || booking.armador,
        mercadoria: parsedRomaneio.mercadoria || booking.mercadoria,
        importador: parsedRomaneio.importador || booking.importador,
        exporterId: parsedRomaneio.exporterId || booking.exporterId,
        locationId: parsedRomaneio.locationId || booking.locationId,
        containers: parsedRomaneio.containers || []
      };

      const result = await db.importBooking(incomingData, {
        expectedPreview: token,
        sourceName: importPdfFile?.name || 'Romaneio Atualizado',
        actor: user
      });

      setBooking(result.booking);
      if (onDataChange) onDataChange();
      setShowIncrementalImportModal(false);
      let feedback = `✅ Romaneio atualizado com sucesso!`;
      if (result.addedCount > 0) feedback += ` ${result.addedCount} novos containers inseridos (Total: ${result.booking.containers?.length || 0}).`;
      if (detectedChanges.length > 0) feedback += ` Dados atualizados: ${detectedChanges.map(c => c.label).join(', ')}.`;
      setModalFeedback(feedback);
      setTimeout(() => setModalFeedback(''), 8000);
    } catch (err) {
      console.error('Erro na atualização incremental:', err);
      alert(err.message || 'Erro ao atualizar o Booking.');
    } finally {
      setIsSavingIncremental(false);
    }
  };

  const handleSaveContainer = async (e) => {
    e.preventDefault();
    if (!newContainer.containerNumber.trim()) return;

    // Constrói array de lacres provisórios
    const provSeals = [];
    if (newContainer.provisional1.trim()) provSeals.push(newContainer.provisional1.trim());
    if (newContainer.provisional2.trim()) provSeals.push(newContainer.provisional2.trim());
    if (newContainer.provisional3.trim()) provSeals.push(newContainer.provisional3.trim());

    const containerObj = {
      id: 'cont_' + Date.now(),
      containerNumber: newContainer.containerNumber.trim().toUpperCase(),
      containerType: newContainer.containerType,
      status: newContainer.status,
      provisionalSeals: provSeals,
      definiteSeal: newContainer.definiteSeal.trim(),
      notes: newContainer.notes.trim(),
      photos: [],
      fumigationDate: newContainer.fumigationDate,
      fitoDate: newContainer.fitoDate,
      definiteSealDate: newContainer.definiteSealDate,
      bagsQuantity: 0,
      netWeight: '',
      tara: '',
      grossWeight: '',
      brand: ''
    };

    const updatedContainers = [...(booking.containers || []), containerObj];
    const updatedBooking = { ...booking, containers: updatedContainers };
    
    try {
      const saved = await db.saveBooking(updatedBooking);
      setBooking(saved);
      if (onDataChange) onDataChange();
    } catch (error) {
      alert(error.message || 'Erro ao inserir o container.');
      return;
    }

    // Reset Form
    setNewContainer({
      containerNumber: '',
      containerType: "40' Reefer (Refrigerado)",
      status: 'Pendente',
      provisional1: '',
      provisional2: '',
      provisional3: '',
      definiteSeal: '',
      notes: '',
      fumigationDate: new Date().toISOString().split('T')[0],
      fitoDate: new Date().toISOString().split('T')[0],
      definiteSealDate: ''
    });
    setShowAddContainer(false);
  };

  const handleDeleteContainer = async (contId) => {
    if (confirm('Tem certeza que deseja excluir este container?')) {
      const updatedContainers = (booking.containers || []).filter(c => c.id !== contId);
      const updatedBooking = { ...booking, containers: updatedContainers };
      setBooking(updatedBooking);
      await db.saveBooking(updatedBooking);
      if (onDataChange) onDataChange();
    }
  };

  const handleUpdateContainerPhotos = async (updatedCont) => {
    const updatedContainers = (booking.containers || []).map(c => 
      c.id === updatedCont.id ? updatedCont : c
    );
    const updatedBooking = { ...booking, containers: updatedContainers };
    setBooking(updatedBooking);
    await db.saveBooking(updatedBooking);
    if (onDataChange) onDataChange();
  };

  // Abre o modal de fotos carregando as URLs do Firestore/Storage antes de exibir
  const openPhotoManager = async (cont) => {
    setLoadingPhotosId(cont.id);
    try {
      const storedPhotos = await db.getPhotosForContainer(cont.id);
      const photoMap = {};
      storedPhotos.forEach(p => { photoMap[p.id] = p; });

      // Merge: prioriza URL do Storage; mantém ordem das referências no booking
      const mergedPhotos = (cont.photos || []).map(ref => ({
        ...ref,
        url: photoMap[ref.id]?.url || ref.url || null,
        storagePath: photoMap[ref.id]?.storagePath || ref.storagePath || null
      }));

      setShowPhotoManager({ ...cont, photos: mergedPhotos });
    } catch (err) {
      console.warn('openPhotoManager: erro ao carregar fotos', err);
      setShowPhotoManager(cont); // fallback: abre sem URLs
    } finally {
      setLoadingPhotosId(null);
    }
  };

  // Upload de fotos do container selecionado
  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !showPhotoManager) return;
    e.target.value = '';

    try {
      const containerId = showPhotoManager.id;
      const newPhotoRefs = [];

      for (const file of files) {
        // db.uploadPhoto comprime + envia para Firebase Storage
        // Retorna { id, name, url } onde url é a URL pública do Storage
        const result = await db.uploadPhoto(file, containerId);
        newPhotoRefs.push({ id: result.id, name: result.name, url: result.url });
      }

      const updatedPhotos = [...(showPhotoManager.photos || []), ...newPhotoRefs];
      const updatedCont = { ...showPhotoManager, photos: updatedPhotos };
      
      setShowPhotoManager(updatedCont);
      await handleUpdateContainerPhotos(updatedCont);
    } catch (error) {
      console.error("Error uploading photo", error);
      alert(error.message || "Ocorreu um erro ao enviar/salvar as fotos no sistema.");
    }
  };

  const movePhoto = (index, direction) => {
    const photos = [...(showPhotoManager.photos || [])];
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;

    const temp = photos[index];
    photos[index] = photos[target];
    photos[target] = temp;

    const updatedCont = { ...showPhotoManager, photos };
    setShowPhotoManager(updatedCont);
    handleUpdateContainerPhotos(updatedCont);
  };

  const handleDeletePhoto = (photoId) => {
    const photo = (showPhotoManager.photos || []).find(p => p.id === photoId);
    const photos = (showPhotoManager.photos || []).filter(p => p.id !== photoId);
    const updatedCont = { ...showPhotoManager, photos };
    setShowPhotoManager(updatedCont);
    handleUpdateContainerPhotos(updatedCont);
    // Apaga do Firestore e do Storage em background
    db.deletePhoto(photoId, photo?.storagePath || null).catch(err => console.warn('deletePhoto error:', err));
  };

  const expName = exportadores.find(e => e.id === booking.exporterId)?.name || '-';
  const locName = locais.find(l => l.id === booking.locationId)?.name || '-';

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(5, 7, 15, 0.8)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      padding: '24px'
    }} className="modal-overlay no-print">
      
      {/* Container Principal do Modal (Design Escuro Unispect) */}
      <div className="glass-panel booking-modal-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100%', overflow: 'hidden' }}>
        
        {/* Topo do Modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '18px', color: 'var(--color-brand)', fontFamily: 'var(--font-display)', margin: 0 }}>
                Gerenciar Booking / Certificado: {booking.certificateNumber}
              </h2>
              <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: '800' }}>
                {booking.containers?.length || 0} Containers
              </span>
              <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: '800' }}>
                {booking.bagsQuantity || 0} Bags ({booking.embalagem || 'Sacaria'})
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 'bold', marginTop: '4px' }}>
              Perfil atual: {user.role === 'ADM' ? '✅ Administrador (Edição Liberada)' : '✅ Inspetor (Edição Liberada)'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isAdm && (
              <button
                type="button"
                id="btn-inserir-atualizacao-romaneio-top"
                onClick={() => {
                  setImportPdfFile(null);
                  setParsedRomaneio(null);
                  setRomaneioPlan(null);
                  setRomaneioParseError('');
                  setShowIncrementalImportModal(true);
                }}
                className="btn btn-primary"
                style={{
                  backgroundColor: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)'
                }}
              >
                <UploadCloud size={15} />
                Inserir atualização de romaneio
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Banner de Feedback de Atualização */}
        {modalFeedback && (
          <div style={{
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid #10b981',
            borderRadius: '6px',
            padding: '10px 14px',
            color: '#10b981',
            fontSize: '13px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            margin: '10px 0 0 0'
          }}>
            <span>{modalFeedback}</span>
            <button onClick={() => setModalFeedback('')} style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* Corpo do Modal - Rolável */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingRight: '4px', paddingBottom: '8px' }} className="modal-scrollable-body">

        {/* Grade de Informações Gerais em Boxes (Igual ao Screenshot 2) */}
        <div className="info-grid">
          {/* Box Exportador */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Exportador</div>
            {canEdit ? (
              <select
                value={booking.exporterId || ''}
                onChange={e => setBooking({ ...booking, exporterId: e.target.value })}
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  marginTop: '4px',
                  padding: '4px 8px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  width: '100%',
                  cursor: 'pointer',
                  height: '32px'
                }}
              >
                <option value="">Selecione...</option>
                {exportadores.map(exp => (
                  <option key={exp.id} value={exp.id}>{exp.name}</option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>{expName}</div>
            )}
          </div>

          {/* Box Local de Operação */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Local da Operação</div>
            {canEdit ? (
              <select
                value={booking.locationId || ''}
                onChange={e => setBooking({ ...booking, locationId: e.target.value })}
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  marginTop: '4px',
                  padding: '4px 8px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  width: '100%',
                  cursor: 'pointer',
                  height: '32px'
                }}
              >
                <option value="">Selecione...</option>
                {locais.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>{locName}</div>
            )}
          </div>

          {/* Box Navio / Viagem */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Navio / Viagem</div>
            {canEdit ? (
              <input
                type="text"
                value={booking.vesselVoyage || ''}
                onChange={e => setBooking({ ...booking, vesselVoyage: e.target.value })}
                placeholder="Ex: MSC INGRID - 26A"
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  marginTop: '4px',
                  padding: '4px 8px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  width: '100%',
                  height: '32px',
                  boxSizing: 'border-box'
                }}
              />
            ) : (
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>{booking.vesselVoyage || '-'}</div>
            )}
          </div>

          {/* Box Armador */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Armador / Linha</div>
            {canEdit ? (
              <input
                type="text"
                value={booking.armador || ''}
                onChange={e => setBooking({ ...booking, armador: e.target.value })}
                placeholder="Ex: MSC"
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  marginTop: '4px',
                  padding: '4px 8px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  width: '100%',
                  height: '32px',
                  boxSizing: 'border-box'
                }}
              />
            ) : (
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>{booking.armador || '-'}</div>
            )}
          </div>

          {/* Box Mercadoria */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Mercadoria</div>
            {canEdit ? (
              <select
                value={booking.mercadoria || ''}
                onChange={e => setBooking({ ...booking, mercadoria: e.target.value })}
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  marginTop: '4px',
                  padding: '4px 8px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  width: '100%',
                  cursor: 'pointer',
                  height: '32px'
                }}
              >
                <option value="">Selecione...</option>
                <option value="café">Café</option>
                <option value="Cravo">Cravo</option>
                <option value="Pimenta Preta">Pimenta Preta</option>
                <option value="Pimenta Vermelha">Pimenta Vermelha</option>
                <option value="Pimenta Branca">Pimenta Branca</option>
              </select>
            ) : (
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>{booking.mercadoria || '-'}</div>
            )}
          </div>

          {/* Box Bags */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Embalagem / Bags</div>
            {canEdit ? (
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                <input
                  type="number"
                  value={booking.bagsQuantity || 0}
                  onChange={e => setBooking({ ...booking, bagsQuantity: parseInt(e.target.value, 10) || 0 })}
                  placeholder="Qtd"
                  style={{
                    fontSize: '13px',
                    fontWeight: '700',
                    color: 'var(--text-primary)',
                    padding: '4px 8px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    width: '70px',
                    height: '32px',
                    boxSizing: 'border-box'
                  }}
                />
                <input
                  type="text"
                  value={booking.embalagem || 'Sacaria'}
                  onChange={e => setBooking({ ...booking, embalagem: e.target.value })}
                  placeholder="Embalagem"
                  style={{
                    fontSize: '13px',
                    fontWeight: '700',
                    color: 'var(--text-primary)',
                    padding: '4px 8px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    flex: 1,
                    height: '32px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            ) : (
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>
                {booking.bagsQuantity ? `${booking.bagsQuantity} Bags (${booking.embalagem || 'Sacaria'})` : '-'}
              </div>
            )}
          </div>

          {/* Box Tipo de Operação */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Tipo de Operação</div>
            {canEdit ? (
              <select
                value={booking.type || 'Redex Operation Report'}
                onChange={e => {
                  const val = e.target.value;
                  const updatedBooking = { ...booking, type: val };
                  if (val === 'Redex Operation Report') {
                    updatedBooking.stuffingReportNumber = '';
                  }
                  setBooking(updatedBooking);
                }}
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  marginTop: '4px',
                  padding: '4px 8px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  width: '100%',
                  cursor: 'pointer',
                  height: '32px'
                }}
              >
                <option value="Redex Operation Report">Redex Operation Report</option>
                <option value="Container Stuffing Report">Container Stuffing Report</option>
              </select>
            ) : (
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>
                {booking.type || 'Redex Operation Report'}
              </div>
            )}
          </div>

          {/* Box Stuffing Report Number */}
          {booking.type === 'Container Stuffing Report' && (
            <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Stuffing Report Number</div>
              {canEdit ? (
                <input
                  type="text"
                  value={booking.stuffingReportNumber || ''}
                  onChange={e => setBooking({ ...booking, stuffingReportNumber: e.target.value })}
                  placeholder="Preenchimento Manual"
                  style={{
                    fontSize: '13px',
                    fontWeight: '700',
                    color: 'var(--text-primary)',
                    marginTop: '4px',
                    padding: '4px 8px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    width: '100%',
                    height: '32px',
                    boxSizing: 'border-box'
                  }}
                />
              ) : (
                <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>
                  {booking.stuffingReportNumber || '-'}
                </div>
              )}
            </div>
          )}

          {/* Box Nº do Booking */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Nº do Booking</div>
            {canEdit ? (
              <>
                <input
                  type="text"
                  value={booking.bookingNumber || ''}
                  onChange={e => setBooking({ ...booking, bookingNumber: e.target.value })}
                  placeholder="BK-XXXXXX"
                  style={{
                    fontSize: '13px',
                    fontWeight: '700',
                    color: 'var(--text-primary)',
                    marginTop: '4px',
                    padding: '4px 8px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: isBookingNumberDuplicate(bookings, booking.bookingNumber, booking.id) ? '1px solid #ef4444' : '1px solid var(--border-color)',
                    borderRadius: '4px',
                    width: '100%',
                    height: '32px',
                    boxSizing: 'border-box'
                  }}
                />
                {isBookingNumberDuplicate(bookings, booking.bookingNumber, booking.id) && (
                  <span style={{ color: '#ef4444', fontSize: '10px', marginTop: '2px', fontWeight: '600' }}>
                    ⚠️ Este romaneio já foi inserido!
                  </span>
                )}
              </>
            ) : (
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>{booking.bookingNumber || '-'}</div>
            )}
          </div>

          {/* Box Porto de Destino */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Porto de Destino</div>
            {canEdit ? (
              <input
                type="text"
                value={booking.portoDestino || ''}
                onChange={e => setBooking({ ...booking, portoDestino: e.target.value })}
                placeholder="Ex: Santos"
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  marginTop: '4px',
                  padding: '4px 8px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  width: '100%',
                  height: '32px',
                  boxSizing: 'border-box'
                }}
              />
            ) : (
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>{booking.portoDestino || '-'}</div>
            )}
          </div>

          {/* Box Importador */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Importador</div>
            {canEdit ? (
              <input
                type="text"
                value={booking.importador || ''}
                onChange={e => setBooking({ ...booking, importador: e.target.value })}
                placeholder="Ex: NESTLE MÉXICO"
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  marginTop: '4px',
                  padding: '4px 8px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  width: '100%',
                  height: '32px',
                  boxSizing: 'border-box'
                }}
              />
            ) : (
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>{booking.importador || '-'}</div>
            )}
          </div>

          {/* Box Data de Início */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Data de Início</div>
            {canEdit ? (
              <input
                type="date"
                value={booking.startDate || ''}
                onChange={e => setBooking({ ...booking, startDate: e.target.value })}
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  marginTop: '4px',
                  padding: '4px 8px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  width: '100%',
                  height: '32px',
                  boxSizing: 'border-box'
                }}
              />
            ) : (
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>{booking.startDate || '-'}</div>
            )}
          </div>

          {/* Box Data de Lançamento */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Data de Lançamento</div>
            {canEdit ? (
              <input
                type="date"
                value={booking.launchDate || ''}
                onChange={e => setBooking({ ...booking, launchDate: e.target.value })}
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  marginTop: '4px',
                  padding: '4px 8px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  width: '100%',
                  height: '32px',
                  boxSizing: 'border-box'
                }}
              />
            ) : (
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>{booking.launchDate || '-'}</div>
            )}
          </div>

          {/* Box Data de Fumigação */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Data de Fumigação</div>
            {canEdit ? (
              <input
                type="date"
                value={booking.fumigationDate || ''}
                onChange={e => setBooking({ ...booking, fumigationDate: e.target.value })}
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  marginTop: '4px',
                  padding: '4px 8px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  width: '100%',
                  height: '32px',
                  boxSizing: 'border-box'
                }}
              />
            ) : (
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>{booking.fumigationDate || '-'}</div>
            )}
          </div>

          {/* Box Data Fito */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Data Fito</div>
            {canEdit ? (
              <input
                type="date"
                value={booking.fitoDate || ''}
                onChange={e => setBooking({ ...booking, fitoDate: e.target.value })}
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  marginTop: '4px',
                  padding: '4px 8px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  width: '100%',
                  height: '32px',
                  boxSizing: 'border-box'
                }}
              />
            ) : (
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>{booking.fitoDate || '-'}</div>
            )}
          </div>

          {/* Box Data Lacre Definitivo */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Data Lacre Definitivo</div>
            {canEdit ? (
              <input
                type="date"
                value={booking.definiteSealDate || ''}
                onChange={e => setBooking({ ...booking, definiteSealDate: e.target.value })}
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  marginTop: '4px',
                  padding: '4px 8px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  width: '100%',
                  height: '32px',
                  boxSizing: 'border-box'
                }}
              />
            ) : (
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>{booking.definiteSealDate || '-'}</div>
            )}
          </div>

          {/* Box Status do Booking */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Status do Booking</div>
            <select
              disabled={!canEdit}
              value={bookingStatus}
              onChange={e => setBookingStatus(e.target.value)}
              style={{
                fontSize: '13px',
                fontWeight: '700',
                color: 'var(--text-primary)',
                marginTop: '4px',
                padding: '4px 8px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                width: '100%',
                cursor: 'pointer',
                height: '32px'
              }}
            >
              <option value="Pendente">🔴 Pendente</option>
              <option value="Em andamento">🟡 Em Andamento</option>
              <option value="Finalizado">🟢 Finalizado</option>
            </select>
          </div>

          {/* Box O que está faltando */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>O que está faltando</div>
            <select
              disabled={!canEdit}
              value={pendingItem}
              onChange={e => setPendingItem(e.target.value)}
              style={{
                fontSize: '13px',
                fontWeight: '700',
                color: 'var(--text-primary)',
                marginTop: '4px',
                padding: '4px 8px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                width: '100%',
                cursor: 'pointer',
                height: '32px'
              }}
            >
              <option value="">🟢 Nenhum (Completo)</option>
              <option value="Fumigação">Fumigação</option>
              <option value="Fito">Fito</option>
              <option value="Lacre Definitivo">Lacre Definitivo</option>
            </select>
          </div>

          {/* Box Total de Containers */}
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Total de Containers</div>
            <div style={{ fontSize: '14px', fontWeight: '800', color: '#10b981', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{booking.containers?.length || 0} container{(booking.containers?.length || 0) === 1 ? '' : 's'}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>cadastrado{(booking.containers?.length || 0) === 1 ? '' : 's'}</span>
            </div>
          </div>
        </div>

        {/* Banner Assinatura Inspetor (Screenshot 2) */}
        <div style={{
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px dashed var(--border-color)',
          borderRadius: '4px',
          padding: '14px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '800', letterSpacing: '0.5px' }}>
              INSPETOR E ASSINATURA DIGITAL DO CERTIFICADO
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {selectedInspectorId 
                ? `Assinado por: ${inspectors.find(i => i.id === selectedInspectorId)?.name}` 
                : 'Nenhum inspetor selecionado para assinar este relatório. (Será usado o padrão)'}
            </div>
          </div>
          <select 
            disabled={!canEdit}
            value={selectedInspectorId} 
            onChange={handleInspectorChange}
            style={{ width: 'auto', padding: '8px 12px', fontSize: '13px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', fontWeight: '600', color: 'var(--text-primary)' }}
          >
            <option value="">-- Escolha o Inspetor --</option>
            {inspectors.map(ins => (
              <option key={ins.id} value={ins.id}>{ins.name}</option>
            ))}
          </select>
        </div>

        {/* Quatro botões de Ações Principais (Screenshot 2) */}
        <div className="actions-grid">
          {isAdm && (
            <button 
              id="btn-inserir-atualizacao-romaneio-actions"
              onClick={() => {
                setImportPdfFile(null);
                setParsedRomaneio(null);
                setRomaneioPlan(null);
                setRomaneioParseError('');
                setShowIncrementalImportModal(true);
              }}
              className="btn btn-primary"
              style={{ backgroundColor: '#10b981', color: '#fff', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <UploadCloud size={16} />
              Inserir atualização de romaneio
            </button>
          )}

          <button 
            disabled={!canEdit}
            onClick={() => setShowAddContainer(true)}
            className="btn btn-primary"
            style={{ backgroundColor: '#c5a880', color: '#000', fontSize: '13px', fontWeight: '700' }}
          >
            📥 Inserir dados do container (Desktop)
          </button>
          
          <button 
            onClick={() => onOpenReport(booking.id, 'operational')}
            className="btn btn-success"
            style={{ backgroundColor: '#0284c7', color: '#fff', fontSize: '13px', fontWeight: '700' }}
          >
            📄 Exportar PDF Consolidado
          </button>

          <button 
            onClick={() => alert('Exportação em Word gerada nas descrições do arquivo.')}
            className="btn btn-secondary"
            style={{ backgroundColor: '#1f293d', border: 'none', color: '#fff', fontSize: '13px', fontWeight: '700' }}
          >
            📝 Exportar Word Consolidado
          </button>
        </div>

        {/* Seção de Lista de Containers (Reserva) */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h3 style={{ fontSize: '16px', color: 'var(--color-brand)', margin: 0, fontFamily: 'var(--font-display)' }}>
                Containers da Reserva ({booking.containers?.length || 0})
              </h3>
              {isAdm && (
                <button
                  type="button"
                  id="btn-inserir-atualizacao-romaneio-containers"
                  onClick={() => {
                    setImportPdfFile(null);
                    setParsedRomaneio(null);
                    setRomaneioPlan(null);
                    setRomaneioParseError('');
                    setShowIncrementalImportModal(true);
                  }}
                  className="btn btn-primary"
                  style={{
                    backgroundColor: '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  <UploadCloud size={14} />
                  Inserir atualização de romaneio
                </button>
              )}
            </div>

            {(booking.containers || []).length > 2 && (
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: '240px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Filtrar (MSDU-882129-7, MSDU8821297)..."
                  value={containerSearch}
                  onChange={e => setContainerSearch(e.target.value)}
                  style={{
                    paddingLeft: '30px',
                    paddingRight: containerSearch ? '28px' : '10px',
                    paddingTop: '6px',
                    paddingBottom: '6px',
                    fontSize: '12px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    width: '100%'
                  }}
                />
                {containerSearch && (
                  <button
                    type="button"
                    onClick={() => setContainerSearch('')}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(booking.containers || [])
              .filter(c => matchesContainerQuery(c, containerSearch))
              .map(cont => {
              const statusColors = {
                'Pendente': 'badge-pending',
                'Em Carregamento': 'badge-progress',
                'Em andamento': 'badge-progress',
                'Estufado': 'badge-success',
                'Concluido': 'badge-success',
                'Finalizado': 'badge-success'
              };

              return (
                <div key={cont.id} className="container-row-item">
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>{cont.containerNumber}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{cont.containerType || 'Tipo não definido'}</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <button 
                      onClick={() => setSelectedContainerToManage(cont)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      ⚙️ Gerenciar
                    </button>

                    <button 
                      onClick={() => openPhotoManager(cont)}
                      disabled={loadingPhotosId === cont.id}
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '6px', opacity: loadingPhotosId === cont.id ? 0.6 : 1 }}
                    >
                      {loadingPhotosId === cont.id ? '⏳ Carregando...' : `📷 Fotos & Anexos (${cont.photos?.length || 0})`}
                    </button>

                    {isAdm && (
                      <button 
                        onClick={() => handleDeleteContainer(cont.id)}
                        className="btn btn-danger"
                        style={{ padding: '6px', borderRadius: '4px' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {(!booking.containers || booking.containers.length === 0) && (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
                Nenhum container inserido nesta reserva. Clique em "Inserir dados do container" acima.
              </div>
            )}
          </div>
        </div>

        <BookingImportHistory key={booking.id} bookingId={booking.id} />
        {/* Fim do Corpo do Modal - Rolável */}
        </div>

        {/* Rodapé do Modal */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '14px', flexShrink: 0 }}>
          <button type="button" onClick={onClose} className="btn btn-secondary" style={{ padding: '8px 18px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            Fechar Janela
          </button>
          <button type="button" onClick={handleSaveBooking} className="btn btn-success" style={{ padding: '8px 24px', fontWeight: '700' }}>
            Salvar
          </button>
        </div>

      </div>

      {/* 3.1 SUB-MODAL: INSERIR DADOS DO CONTAINER (DESKTOP) */}
      {showAddContainer && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(5, 7, 15, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2100,
          padding: '20px'
        }}>
          <form onSubmit={handleSaveContainer} className="glass-panel addContainer-modal-form">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <h3 style={{ fontSize: '16px', color: 'var(--color-brand)' }}>Inserir Dados do Container</h3>
              <button type="button" onClick={() => setShowAddContainer(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div>
              <label>Número do Container *</label>
              <input 
                type="text" 
                value={newContainer.containerNumber}
                onChange={e => setNewContainer({ ...newContainer, containerNumber: e.target.value })}
                placeholder="Ex: MSKU8473821"
                required
                autoFocus
              />
            </div>

            <div>
              <label>Tipo do Container</label>
              <select 
                value={newContainer.containerType}
                onChange={e => setNewContainer({ ...newContainer, containerType: e.target.value })}
              >
                <option value="20' Dry Van (Carga Seca)">20' Dry Van (Carga Seca)</option>
                <option value="40' Dry Van (Carga Seca)">40' Dry Van (Carga Seca)</option>
                <option value="40' HC (High Cube)">40' HC (High Cube)</option>
                <option value="40' Reefer (Refrigerado)">40' Reefer (Refrigerado)</option>
              </select>
            </div>

            {/* Lacres Provisórios: 3 caixas de texto (Conforme pedido) */}
            <div>
              <label>Lacre Provisório (3 caixas de texto)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <input 
                  type="text" 
                  placeholder="Lacre Provisório 1" 
                  value={newContainer.provisional1}
                  onChange={e => setNewContainer({ ...newContainer, provisional1: e.target.value })}
                  style={{ backgroundColor: '#060913' }}
                />
                <input 
                  type="text" 
                  placeholder="Lacre Provisório 2 (Opcional)" 
                  value={newContainer.provisional2}
                  onChange={e => setNewContainer({ ...newContainer, provisional2: e.target.value })}
                  style={{ backgroundColor: '#060913' }}
                />
                <input 
                  type="text" 
                  placeholder="Lacre Provisório 3 (Opcional)" 
                  value={newContainer.provisional3}
                  onChange={e => setNewContainer({ ...newContainer, provisional3: e.target.value })}
                  style={{ backgroundColor: '#060913' }}
                />
              </div>
            </div>

            {/* Lacre Definitivo: 1 caixa de texto */}
            <div>
              <label>Lacre Definitivo (1 caixa de texto)</label>
              <input 
                type="text" 
                placeholder="Nº Lacre Definitivo" 
                value={newContainer.definiteSeal}
                onChange={e => setNewContainer({ ...newContainer, definiteSeal: e.target.value })}
              />
            </div>

            <div>
              <label>Observações Técnicas</label>
              <textarea 
                rows="2"
                placeholder="Observações de estufagem ou lacres..."
                value={newContainer.notes}
                onChange={e => setNewContainer({ ...newContainer, notes: e.target.value })}
                style={{ backgroundColor: '#060913', resize: 'vertical' }}
              />
            </div>

            {/* Botão de Salvar logo abaixo da Observação (Conforme solicitado) */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button type="button" onClick={() => setShowAddContainer(false)} className="btn btn-secondary">Cancelar</button>
              <button type="submit" className="btn btn-primary" style={{ backgroundColor: '#10b981', color: '#fff' }}>
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3.2 SUB-MODAL: FOTOS & ANEXOS MANAGER (Libera após salvar container) */}
      {showPhotoManager && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(5, 7, 15, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2100,
          padding: '24px'
        }}>
          <div className="glass-panel photoManager-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <h3 style={{ fontSize: '16px', color: 'var(--color-brand)' }}>
                Fotos & Anexos: {showPhotoManager.containerNumber}
              </h3>
              <button onClick={() => setShowPhotoManager(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {/* Opções de Upload */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                A ordem de fotografia é estritamente sequencial.
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {/* Tirar Foto */}
                <label className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', border: '1px solid var(--text-muted)' }}>
                  <Camera size={14} style={{ color: 'var(--color-brand)' }} /> Tirar Foto
                  <input 
                    type="file" 
                    onChange={handlePhotoUpload} 
                    accept="image/*" 
                    capture="environment" 
                    style={{ display: 'none' }}
                  />
                </label>
                {/* Escolher Galeria */}
                <label className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', border: '1px solid var(--text-muted)' }}>
                  <Image size={14} style={{ color: 'var(--color-brand)' }} /> Galeria
                  <input 
                    type="file" 
                    onChange={handlePhotoUpload} 
                    multiple 
                    accept="image/*" 
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>

            {/* Lista das fotos adicionadas */}
            <div style={{
              display: 'flex',
              gap: '16px',
              overflowX: 'auto',
              padding: '10px 0',
              minHeight: '200px',
              border: '1px dashed var(--border-color)',
              borderRadius: '4px',
              paddingLeft: '10px'
            }}>
              {(showPhotoManager.photos || []).map((photo, index) => (
                <div key={photo.id} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '6px',
                  backgroundColor: 'var(--bg-tertiary)',
                  flexShrink: 0
                }}>
                  {/* Moldura 3:4 */}
                  <div 
                    onClick={() => setPreviewPhotoUrl(photo.url)}
                    style={{
                      width: '120px',
                      height: '160px',
                      backgroundColor: '#000',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      cursor: 'pointer'
                    }}
                    title="Clique para ampliar"
                  >
                    <img src={photo.url} alt={photo.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </div>

                  {/* Photo captions removed as per user request */}

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px' }}>
                    <button 
                      disabled={index === 0} 
                      onClick={() => movePhoto(index, -1)}
                      className="btn btn-secondary" 
                      style={{ padding: '4px', flex: 1, border: '1px solid var(--border-color)' }}
                    >
                      <ArrowLeft size={10} />
                    </button>
                    <button 
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="btn btn-danger" 
                      style={{ padding: '4px', flex: 1 }}
                    >
                      <Trash2 size={10} />
                    </button>
                    <button 
                      disabled={index === (showPhotoManager.photos.length - 1)} 
                      onClick={() => movePhoto(index, 1)}
                      className="btn btn-secondary" 
                      style={{ padding: '4px', flex: 1, border: '1px solid var(--border-color)' }}
                    >
                      <ArrowRight size={10} />
                    </button>
                  </div>
                </div>
              ))}

              {(!showPhotoManager.photos || showPhotoManager.photos.length === 0) && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Nenhuma foto carregada ainda.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
              <button onClick={() => setShowPhotoManager(null)} className="btn btn-primary" style={{ padding: '8px 18px' }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3.3 SUB-MODAL: GERENCIAR DETALHES DO CONTAINER */}
      {selectedContainerToManage && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(5, 7, 15, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2100,
          padding: '24px'
        }}>
          <div className="glass-panel containerManage-modal" style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', flexShrink: 0 }}>
              <h3 style={{ fontSize: '16px', color: 'var(--color-brand)' }}>
                Gerenciar Container: {selectedContainerToManage.containerNumber}
              </h3>
              <button onClick={() => setSelectedContainerToManage(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '4px', paddingBottom: '8px' }} className="modal-scrollable-body">
              <ContainerDetail 
                container={selectedContainerToManage}
                bookingId={booking.id}
                user={user}
                onUpdateContainer={(updatedCont) => {
                  setSelectedContainerToManage(updatedCont);
                  handleUpdateContainerPhotos(updatedCont);
                }}
                onDeleteContainer={(contId) => {
                  handleDeleteContainer(contId);
                  setSelectedContainerToManage(null);
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '12px', flexShrink: 0 }}>
              <button onClick={() => setSelectedContainerToManage(null)} className="btn btn-primary" style={{ padding: '8px 18px' }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visualizador de Foto em Tamanho Maior */}
      {previewPhotoUrl && (
        <div 
          onClick={() => setPreviewPhotoUrl(null)} 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            cursor: 'zoom-out',
            padding: '16px'
          }}
          className="no-print"
        >
          <div style={{ position: 'relative', maxWidth: '95vw', maxHeight: '95vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
            <img src={previewPhotoUrl} alt="Visualização" style={{ maxWidth: '100vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} />
            <button 
              onClick={() => setPreviewPhotoUrl(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0px',
                backgroundColor: 'rgba(255,255,255,0.1)',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* SUB-MODAL: ATUALIZAÇÃO INCREMENTAL DE ROMANEIO (PDF) */}
      {showIncrementalImportModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(5, 7, 15, 0.88)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2200,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{
            maxWidth: '750px',
            width: '100%',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-secondary)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden'
          }}>
            {/* Cabeçalho */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', color: 'var(--color-brand)', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <UploadCloud size={20} color="#10b981" />
                  Inserir atualização de romaneio
                </h3>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Destino: Booking <strong style={{ color: 'var(--text-primary)' }}>{booking.bookingNumber}</strong> | Certificado: <strong style={{ color: 'var(--color-brand)' }}>{booking.certificateNumber}</strong> (preservado)
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIncrementalImportModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Corpo do Modal */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }} className="modal-scrollable-body">
              
              {/* Área de Seleção do PDF (Drag & Drop) */}
              <div
                onClick={() => document.getElementById('incrementalRomaneioPdfInput').click()}
                style={{
                  border: '2px dashed var(--border-color)',
                  borderRadius: '8px',
                  padding: '24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: 'var(--bg-tertiary)',
                  transition: 'border-color 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleRomaneioFileSelect(e.dataTransfer.files[0]);
                  }
                }}
              >
                <input
                  id="incrementalRomaneioPdfInput"
                  type="file"
                  accept=".pdf"
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      handleRomaneioFileSelect(e.target.files[0]);
                    }
                  }}
                />
                <UploadCloud size={32} color="#10b981" />
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {importPdfFile ? importPdfFile.name : 'Clique para selecionar ou arraste o Romaneio atualizado (PDF)'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  O sistema lerá o PDF por completo, comparará os containers e adicionará apenas os faltantes à reserva atual.
                </div>
              </div>

              {isParsingRomaneio && (
                <div style={{ textAlign: 'center', padding: '16px', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <div className="spinner" style={{ width: '16px', height: '16px', border: '2px solid #10b981', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  <span>Processando e lendo arquivo PDF do romaneio...</span>
                </div>
              )}

              {romaneioParseError && (
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '6px', padding: '12px', color: '#ef4444', fontSize: '13px' }}>
                  ⚠️ {romaneioParseError}
                </div>
              )}

              {parsedRomaneio && romaneioPlan && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  {/* Validação de Correspondência do Booking */}
                  {!isBookingMatch ? (
                    <div style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid #ef4444',
                      borderRadius: '6px',
                      padding: '12px 16px',
                      color: '#ef4444',
                      fontSize: '13px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      <div style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <X size={16} />
                        Confirmação Bloqueada: Divergência de Booking
                      </div>
                      <div>{bookingBlockReason}</div>
                    </div>
                  ) : (
                    <div style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid #10b981',
                      borderRadius: '6px',
                      padding: '10px 14px',
                      color: '#10b981',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <CheckCircle2 size={16} />
                      <span>Romaneio confirmado para o Booking <strong>{booking.bookingNumber}</strong> (Certificado: <strong>{booking.certificateNumber}</strong>).</span>
                    </div>
                  )}

                  {/* Cards de Resumo da Prévia (Categorias e Totais) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                    
                    <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', borderLeft: '4px solid #10b981' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700' }}>NOVOS</div>
                      <div style={{ fontSize: '22px', fontWeight: '800', color: '#10b981', marginTop: '2px' }}>
                        +{romaneioPlan.added.length}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>serão inseridos</div>
                    </div>

                    <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', borderLeft: '4px solid #3b82f6' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700' }}>JÁ EXISTENTES</div>
                      <div style={{ fontSize: '22px', fontWeight: '800', color: '#3b82f6', marginTop: '2px' }}>
                        {romaneioPlan.preserved.length}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>fotos e dados mantidos</div>
                    </div>

                    <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', borderLeft: '4px solid #8b5cf6' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700' }}>TOTAL FINAL</div>
                      <div style={{ fontSize: '22px', fontWeight: '800', color: '#8b5cf6', marginTop: '2px' }}>
                        {(booking.containers?.length || 0) + romaneioPlan.added.length}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>containers no Booking</div>
                    </div>

                    <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', borderLeft: '4px solid #06b6d4' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700' }}>TOTAL BAGS</div>
                      <div style={{ fontSize: '22px', fontWeight: '800', color: '#06b6d4', marginTop: '2px' }}>
                        {parsedRomaneio.bagsQuantity || booking.bagsQuantity || 0}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {booking.bagsQuantity !== (parsedRomaneio.bagsQuantity || 0) ? `(era ${booking.bagsQuantity || 0})` : 'inalterado'}
                      </div>
                    </div>

                    <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', borderLeft: `4px solid ${romaneioPlan.invalid.length ? '#ef4444' : 'var(--border-color)'}` }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700' }}>INVÁLIDOS</div>
                      <div style={{ fontSize: '22px', fontWeight: '800', color: romaneioPlan.invalid.length ? '#ef4444' : 'var(--text-muted)', marginTop: '2px' }}>
                        {romaneioPlan.invalid.length}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{romaneioPlan.invalid.length ? 'bloqueia gravação' : 'nenhum erro'}</div>
                    </div>

                  </div>

                  {/* Detecção de Informações Cadastrais Alteradas do Romaneio */}
                  {detectedChanges.length > 0 && (
                    <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)', borderRadius: '6px', padding: '12px 14px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#10b981', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle2 size={16} />
                        Informações do Booking atualizadas no novo Romaneio ({detectedChanges.length}):
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                        {detectedChanges.map((ch, idx) => (
                          <div key={idx} style={{ backgroundColor: 'var(--bg-secondary)', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: '700' }}>{ch.label}</div>
                            <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>{String(ch.oldValue || '(vazio)')}</span>
                              <span style={{ color: 'var(--text-secondary)' }}>➔</span>
                              <span style={{ fontWeight: '800', color: '#10b981' }}>{String(ch.newValue)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Alerta de Preservação Segura */}
                  <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)', borderRadius: '6px', padding: '10px 14px', border: '1px solid rgba(59, 130, 246, 0.25)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    🛡️ <strong>Preservação Integral:</strong> Todos os IDs, fotos, laudos e status dos containers existentes são 100% preservados. Containers ausentes do PDF não são excluídos. As informações gerais (Navio, Viagem, Quantidade de Sacas, Embalagem, Destino etc.) são atualizadas com os dados do novo romaneio.
                  </div>

                  {/* Containers Repetidos no PDF */}
                  {romaneioPlan.repeated.length > 0 && (
                    <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', borderRadius: '6px', padding: '10px 14px', color: '#f59e0b', fontSize: '12px' }}>
                      ⚠️ <strong>Containers repetidos no arquivo PDF ({romaneioPlan.repeated.length}):</strong>{' '}
                      {romaneioPlan.repeated.map(r => r.number).join(', ')}. O sistema insere cada container uma única vez.
                    </div>
                  )}

                  {/* Containers Inválidos */}
                  {romaneioPlan.invalid.length > 0 && (
                    <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '6px', padding: '10px 14px', color: '#ef4444', fontSize: '12px' }}>
                      ❌ <strong>Containers com formato inválido ({romaneioPlan.invalid.length}):</strong>
                      <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                        {romaneioPlan.invalid.map((inv, idx) => (
                          <li key={idx}>Linha {inv.row}: container "{inv.number}"</li>
                        ))}
                      </ul>
                      <div style={{ marginTop: '4px', fontWeight: '600' }}>Corrija o arquivo antes de confirmar.</div>
                    </div>
                  )}

                  {/* Lista detalhada dos Novos Containers */}
                  {romaneioPlan.added.length > 0 && (
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#10b981', marginBottom: '8px' }}>
                        Containers Faltantes que serão Adicionados ({romaneioPlan.added.length}):
                      </div>
                      <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ backgroundColor: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)' }}>
                              <th style={{ padding: '6px 10px' }}>Container</th>
                              <th style={{ padding: '6px 10px' }}>Tipo</th>
                              <th style={{ padding: '6px 10px' }}>Lacre Def.</th>
                              <th style={{ padding: '6px 10px' }}>Lacre Provisório</th>
                              <th style={{ padding: '6px 10px' }}>Sacas</th>
                              <th style={{ padding: '6px 10px' }}>Tara</th>
                              <th style={{ padding: '6px 10px' }}>Bruto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {romaneioPlan.added.map((cont, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '6px 10px', fontWeight: '700', color: 'var(--text-primary)' }}>{cont.containerNumber}</td>
                                <td style={{ padding: '6px 10px' }}>{cont.containerType}</td>
                                <td style={{ padding: '6px 10px' }}>{cont.definiteSeal || '-'}</td>
                                <td style={{ padding: '6px 10px' }}>{cont.provisionalSeals?.map(s => s.sealNumber).join(', ') || '-'}</td>
                                <td style={{ padding: '6px 10px' }}>{cont.bagsQuantity || '-'}</td>
                                <td style={{ padding: '6px 10px' }}>{cont.tara || '-'}</td>
                                <td style={{ padding: '6px 10px' }}>{cont.grossWeight || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Containers Preservados */}
                  {romaneioPlan.preserved.length > 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '10px 14px', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                      🛡️ <strong>Containers já existentes preservados ({romaneioPlan.preserved.length}):</strong>{' '}
                      {romaneioPlan.preserved.map(c => `${c.containerNumber} (${c.photos?.length || 0} fotos)`).join(', ')}.
                    </div>
                  )}

                  {romaneioPlan.added.length === 0 && detectedChanges.length === 0 && (
                    <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f6', borderRadius: '6px', padding: '12px', color: '#3b82f6', fontSize: '13px' }}>
                      ℹ️ Todos os {parsedRomaneio.containers?.length || 0} containers e dados deste romaneio já coincidem com a reserva cadastrada. Nenhuma alteração pendente.
                    </div>
                  )}

                </div>
              )}

            </div>

            {/* Rodapé do Sub-Modal */}
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              flexShrink: 0
            }}>
              <button
                type="button"
                onClick={() => setShowIncrementalImportModal(false)}
                className="btn btn-secondary"
                style={{ padding: '8px 16px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
              >
                Cancelar
              </button>

              <button
                type="button"
                id="btn-confirmar-atualizacao-romaneio"
                disabled={!canConfirmIncremental}
                onClick={handleConfirmIncrementalUpdate}
                className="btn btn-success"
                style={{
                  padding: '8px 22px',
                  fontWeight: '700',
                  backgroundColor: canConfirmIncremental ? '#10b981' : '#6b7280',
                  color: '#fff',
                  cursor: canConfirmIncremental ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: canConfirmIncremental ? 1 : 0.6
                }}
              >
                {isSavingIncremental ? (
                  <>
                    <div className="spinner" style={{ width: '14px', height: '14px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    Salvando...
                  </>
                ) : (
                  `Confirmar atualização`
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
