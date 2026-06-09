import { useState } from 'react';
import { X, Trash2, Camera, Image, ArrowLeft, ArrowRight } from 'lucide-react';
import { db, useBookings, useInspectors, useLocais, useExportadores } from '../db';
import { useEffect } from 'react';
import ContainerDetail from './ContainerDetail';

export default function BookingManagementModal({ bookingId, onClose, user, onDataChange, onOpenReport }) {
  
  const bookings = useBookings();
  const inspectors = useInspectors();
  const exportadores = useExportadores();
  const locais = useLocais();
  const [prevBookingId, setPrevBookingId] = useState(bookingId);
  const [booking, setBooking] = useState(() => bookings.find(b => b.id === bookingId));
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
  const [selectedContainerToManage, setSelectedContainerToManage] = useState(null);
  
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
    definiteSealDate: new Date().toISOString().split('T')[0]
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
      alert("Erro ao salvar as alterações.");
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
    
    setBooking(updatedBooking);
    db.saveBooking(updatedBooking).catch(err => console.error(err));
    if (onDataChange) onDataChange();

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
      definiteSealDate: new Date().toISOString().split('T')[0]
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

  // Upload de fotos do container selecionado
  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !showPhotoManager) return;

    try {
      const uploadPromises = files.map(file => db.uploadPhoto(file));
      const urls = await Promise.all(uploadPromises);
      
      const newPhotos = urls.map(url => ({
        id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        url: url,
        name: ''
      }));

      const updatedPhotos = [...(showPhotoManager.photos || []), ...newPhotos];
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
    const photos = (showPhotoManager.photos || []).filter(p => p.id !== photoId);
    const updatedCont = { ...showPhotoManager, photos };
    setShowPhotoManager(updatedCont);
    handleUpdateContainerPhotos(updatedCont);
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
      zIndex: 1000,
      padding: '24px'
    }} className="modal-overlay no-print">
      
      {/* Container Principal do Modal (Design Escuro Unispect) */}
      <div className="glass-panel booking-modal-container">
        
        {/* Topo do Modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
          <div>
            <h2 style={{ fontSize: '18px', color: 'var(--color-brand)', fontFamily: 'var(--font-display)' }}>
              Gerenciar Booking / Certificado: {booking.certificateNumber}
            </h2>
            <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 'bold', marginTop: '4px' }}>
              Perfil atual: {user.role === 'ADM' ? '✅ Administrador (Edição Liberada)' : '✅ Inspetor (Edição Liberada)'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={22} />
          </button>
        </div>

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
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  width: '100%',
                  height: '32px',
                  boxSizing: 'border-box'
                }}
              />
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

        {/* Três botões de Ações Principais (Screenshot 2) */}
        <div className="actions-grid">
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
            style={{ backgroundColor: '#10b981', color: '#fff', fontSize: '13px', fontWeight: '700' }}
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
          <h3 style={{ fontSize: '16px', color: 'var(--color-brand)', marginBottom: '14px', fontFamily: 'var(--font-display)' }}>
            Containers da Reserva ({booking.containers?.length || 0})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(booking.containers || []).map(cont => {
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
                      onClick={() => setShowPhotoManager(cont)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      📷 Fotos & Anexos ({cont.photos?.length || 0})
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

        {/* Rodapé do Modal */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
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
          zIndex: 1100,
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
          zIndex: 1100,
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
                  <div style={{
                    width: '120px',
                    height: '160px',
                    backgroundColor: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden'
                  }}>
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
          zIndex: 1100,
          padding: '24px'
        }}>
          <div className="glass-panel containerManage-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <h3 style={{ fontSize: '16px', color: 'var(--color-brand)' }}>
                Gerenciar Container: {selectedContainerToManage.containerNumber}
              </h3>
              <button onClick={() => setSelectedContainerToManage(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

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

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
              <button onClick={() => setSelectedContainerToManage(null)} className="btn btn-primary" style={{ padding: '8px 18px' }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
