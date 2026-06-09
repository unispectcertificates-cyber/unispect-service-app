import { useState, useEffect } from 'react';
import { ChevronLeft, Plus, FileText, X } from 'lucide-react';
import { db, useBookings, useLocais, useExportadores } from '../db';
import ContainerDetail from './ContainerDetail';
import BottomDrawer from './BottomDrawer';

export default function BookingDetail({ bookingId, user, onBack, onOpenReport, onDataChange }) {
  
  const bookings = useBookings();
  const exporters = useExportadores();
  const locations = useLocais();
  const [prevBookingId, setPrevBookingId] = useState(bookingId);
  const [booking, setBooking] = useState(() => bookings.find(b => b.id === bookingId));

  useEffect(() => {
    const bk = bookings.find(b => b.id === bookingId);
    if (bk) setBooking(bk);
  }, [bookings, bookingId]);


  // States para gerenciar os drawers no Mobile
  const [drawerOpen, setDrawerOpen] = useState(null);

  // Modal de adição de container
  const [showAddContainerModal, setShowAddContainerModal] = useState(false);
  const [newContainerData, setNewContainerData] = useState({
    containerNumber: '',
    containerType: "20' Dry",
    status: 'Pendente'
  });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!booking) return <div style={{ padding: '20px' }}>Carregando Booking...</div>;

  const isInspector = user.role === 'Inspector';
  const isAdm = user.role === 'ADM';
  const canEditBookingFields = isAdm || isInspector;
  const canAddContainer = isAdm || isInspector;

  // Salvar alterações de campos do booking
  const updateBookingField = async (field, value) => {
    const updated = { ...booking, [field]: value };
    if (field === 'type' && value === 'Redex Operation Report') {
      updated.stuffingReportNumber = '';
    }
    setBooking(updated);
    await db.saveBooking(updated);
    if (onDataChange) onDataChange();
  };

  // Cadastrar Novo Container via Modal
  const handleAddContainerSubmit = (e) => {
    e.preventDefault();
    if (!newContainerData.containerNumber.trim()) return;

    const cleanNumber = newContainerData.containerNumber.trim().toUpperCase();
    
    const newContainer = {
      id: 'cont_' + Date.now(),
      containerNumber: cleanNumber,
      containerType: newContainerData.containerType,
      status: newContainerData.status,
      provisionalSeals: [],
      definiteSeal: '',
      fumigationDate: '',
      fitoDate: '',
      definiteSealDate: '',
      notes: '',
      photos: [],
      bagsQuantity: 0,
      netWeight: '',
      tara: '',
      grossWeight: '',
      brand: ''
    };

    const updatedContainers = [...(booking.containers || []), newContainer];
    updateBookingField('containers', updatedContainers);
    
    // Reseta form e fecha modal
    setNewContainerData({
      containerNumber: '',
      containerType: "20' Dry",
      status: 'Pendente'
    });
    setShowAddContainerModal(false);
  };

  // Atualizar contêiner
  const handleUpdateContainer = (updatedCont) => {
    const updatedContainers = (booking.containers || []).map(c => 
      c.id === updatedCont.id ? updatedCont : c
    );
    updateBookingField('containers', updatedContainers);
  };

  // Deletar contêiner
  const handleDeleteContainer = (containerId) => {
    if (confirm('Tem certeza que deseja deletar este container?')) {
      const updatedContainers = (booking.containers || []).filter(c => c.id !== containerId);
      updateBookingField('containers', updatedContainers);
    }
  };

  // Opções para seletores e drawers
  const activeExporter = exporters.find(e => e.id === booking.exporterId);
  const activeLocation = locations.find(l => l.id === booking.locationId);

  const statusOptions = [
    { value: 'Pendente', label: '🔴 Pendente' },
    { value: 'Em andamento', label: '🟡 Em andamento' },
    { value: 'Finalizado', label: '🟢 Finalizado' }
  ];

  const typeOptions = [
    { value: 'Redex Operation Report', label: 'Redex Operation Report' },
    { value: 'Container Stuffing Report', label: 'Container Stuffing Report' }
  ];

  const mercadoriaOptions = [
    { value: 'café', label: 'Café' },
    { value: 'Cravo', label: 'Cravo' },
    { value: 'Pimenta Preta', label: 'Pimenta Preta' },
    { value: 'Pimenta Vermelha', label: 'Pimenta Vermelha' },
    { value: 'Pimenta Branca', label: 'Pimenta Branca' }
  ];

  const exporterOptions = exporters.map(e => ({ value: e.id, label: e.name }));
  const locationOptions = locations.map(l => ({ value: l.id, label: l.name }));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Voltar para Lista */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="no-print">
        <button onClick={onBack} className="btn btn-secondary">
          <ChevronLeft size={16} /> Voltar para Lista
        </button>

        <button onClick={() => onOpenReport(booking.id, 'operational')} className="btn btn-primary" style={{ boxShadow: 'var(--shadow-glow)' }}>
          <FileText size={16} /> Relatório Operacional
        </button>
      </div>

      {/* Cabeçalho do Certificado */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid var(--border-color)' }}>
        
        {/* Identificador Principal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
          {/* Logo Unispect */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              border: '2px solid var(--text-primary)',
              padding: '4px 8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: '1',
              fontWeight: 'bold',
              borderRadius: '2px'
            }}>
              <span style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '1px', color: 'var(--text-primary)' }}>UN</span>
              <span style={{ fontSize: '7px', fontWeight: '800', marginTop: '2px', letterSpacing: '0.5px', color: 'var(--text-primary)' }}>UNISPECT</span>
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: '800', fontFamily: 'var(--font-display)', display: 'flex', gap: '4px' }}>
                <span style={{ color: 'var(--text-primary)' }}>Unispect</span>
                <span style={{ color: 'var(--color-brand)' }}>Service & Certificate</span>
              </div>
              <div style={{ fontSize: '9px', color: 'var(--text-secondary)', letterSpacing: '2px', fontWeight: '700', marginTop: '2px' }}>
                VISTORIAS & CERTIFICAÇÕES
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', letterSpacing: '0.05em' }}>NÚMERO DO CERTIFICADO</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-brand)', fontFamily: 'var(--font-display)' }}>{booking.certificateNumber}</div>
            
            {booking.type === 'Container Stuffing Report' && booking.stuffingReportNumber && (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: '600' }}>
                Stuffing Report: <span style={{ color: 'var(--text-primary)' }}>{booking.stuffingReportNumber}</span>
              </div>
            )}
          </div>
        </div>

        {/* Campos do Booking */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px'
        }}>
          {/* Booking Number */}
          <div>
            <label>Nº do Booking</label>
            <input 
              type="text" 
              disabled={!canEditBookingFields}
              value={booking.bookingNumber} 
              onChange={e => updateBookingField('bookingNumber', e.target.value)}
              placeholder="BK-XXXXXX"
            />
          </div>

          {/* Mercadoria (café, Cravo, Pimenta Preta, Pimenta Vermelha, Pimenta Branca) */}
          <div>
            <label>Mercadoria</label>
            {isMobile ? (
              <button 
                type="button"
                disabled={!canEditBookingFields}
                onClick={() => setDrawerOpen('mercadoria')}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-secondary)',
                  textAlign: 'left',
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'block'
                }}
              >
                {booking.mercadoria ? booking.mercadoria : 'Selecionar Mercadoria'}
              </button>
            ) : (
              <select
                disabled={!canEditBookingFields}
                value={booking.mercadoria || ''}
                onChange={e => updateBookingField('mercadoria', e.target.value)}
              >
                <option value="">Selecione...</option>
                {mercadoriaOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </div>

          {/* Porto de Destino */}
          <div>
            <label>Porto de Destino</label>
            <input 
              type="text" 
              disabled={!canEditBookingFields}
              value={booking.portoDestino || ''} 
              onChange={e => updateBookingField('portoDestino', e.target.value)}
              placeholder="Digite o porto de destino..."
            />
          </div>

          {/* Status */}
          <div>
            <label>Status do Booking</label>
            {isMobile ? (
              <button 
                type="button"
                disabled={!canEditBookingFields}
                onClick={() => setDrawerOpen('status')}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-secondary)',
                  textAlign: 'left',
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'block'
                }}
              >
                {statusOptions.find(o => o.value === booking.status)?.label || booking.status}
              </button>
            ) : (
              <select
                disabled={!canEditBookingFields}
                value={booking.status}
                onChange={e => updateBookingField('status', e.target.value)}
              >
                {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </div>

          {/* Tipo de Ação */}
          <div>
            <label>Tipo de Ação</label>
            {isMobile ? (
              <button 
                type="button"
                disabled={!canEditBookingFields}
                onClick={() => setDrawerOpen('type')}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-secondary)',
                  textAlign: 'left',
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'block'
                }}
              >
                {typeOptions.find(o => o.value === booking.type)?.label || booking.type}
              </button>
            ) : (
              <select
                disabled={!canEditBookingFields}
                value={booking.type}
                onChange={e => updateBookingField('type', e.target.value)}
              >
                {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </div>

          {booking.type === 'Container Stuffing Report' && (
            <div>
              <label>Stuffing Report Number</label>
              <input 
                type="text" 
                disabled={!canEditBookingFields}
                value={booking.stuffingReportNumber || ''} 
                onChange={e => updateBookingField('stuffingReportNumber', e.target.value)}
                placeholder="Preenchimento Manual"
              />
            </div>
          )}

          {/* Exportador */}
          <div>
            <label>Exportador</label>
            {isMobile ? (
              <button 
                type="button"
                disabled={!canEditBookingFields}
                onClick={() => setDrawerOpen('exporter')}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-secondary)',
                  textAlign: 'left',
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {activeExporter ? activeExporter.name : 'Selecionar Exportador'}
              </button>
            ) : (
              <select
                disabled={!canEditBookingFields}
                value={booking.exporterId}
                onChange={e => updateBookingField('exporterId', e.target.value)}
              >
                <option value="">Selecione...</option>
                {exporters.map(exp => <option key={exp.id} value={exp.id}>{exp.name}</option>)}
              </select>
            )}
          </div>

          {/* Local */}
          <div>
            <label>Local da Operação</label>
            {isMobile ? (
              <button 
                type="button"
                disabled={!canEditBookingFields}
                onClick={() => setDrawerOpen('location')}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-secondary)',
                  textAlign: 'left',
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'block'
                }}
              >
                {activeLocation ? activeLocation.name : 'Selecionar Local'}
              </button>
            ) : (
              <select
                disabled={!canEditBookingFields}
                value={booking.locationId}
                onChange={e => updateBookingField('locationId', e.target.value)}
              >
                <option value="">Selecione...</option>
                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
            )}
          </div>

          <div>
            <label>Data de Início</label>
            <input 
              type="date" 
              disabled={!canEditBookingFields}
              value={booking.startDate} 
              onChange={e => updateBookingField('startDate', e.target.value)}
            />
          </div>

          <div>
            <label>Data de Lançamento / Entrada</label>
            <input 
              type="date" 
              disabled={!canEditBookingFields}
              value={booking.launchDate || booking.startDate || new Date().toISOString().split('T')[0]} 
              onChange={e => updateBookingField('launchDate', e.target.value)}
            />
          </div>

          <div>
            <label>Navio + Viagem</label>
            <input 
              type="text" 
              disabled={!canEditBookingFields}
              value={booking.vesselVoyage} 
              onChange={e => updateBookingField('vesselVoyage', e.target.value)}
              placeholder="Ex: MSC INGRID - 26A"
            />
          </div>

          <div>
            <label>Quantidade de Sacas (Bags)</label>
            <input 
              type="number" 
              disabled={!canEditBookingFields}
              value={booking.bagsQuantity} 
              onChange={e => updateBookingField('bagsQuantity', parseInt(e.target.value, 10) || 0)}
              placeholder="Qtd Sacas"
            />
          </div>
        </div>

      </div>

      {/* Drawers para celular */}
      {isMobile && (
        <>
          <BottomDrawer 
            isOpen={drawerOpen === 'status'} 
            onClose={() => setDrawerOpen(null)} 
            title="Status do Booking"
            options={statusOptions}
            selectedValue={booking.status}
            onChange={val => updateBookingField('status', val)}
          />
          <BottomDrawer 
            isOpen={drawerOpen === 'type'} 
            onClose={() => setDrawerOpen(null)} 
            title="Tipo de Ação"
            options={typeOptions}
            selectedValue={booking.type}
            onChange={val => updateBookingField('type', val)}
          />
          <BottomDrawer 
            isOpen={drawerOpen === 'mercadoria'} 
            onClose={() => setDrawerOpen(null)} 
            title="Selecionar Mercadoria"
            options={mercadoriaOptions}
            selectedValue={booking.mercadoria}
            onChange={val => updateBookingField('mercadoria', val)}
          />
          <BottomDrawer 
            isOpen={drawerOpen === 'exporter'} 
            onClose={() => setDrawerOpen(null)} 
            title="Selecionar Exportador"
            options={exporterOptions}
            selectedValue={booking.exporterId}
            onChange={val => updateBookingField('exporterId', val)}
          />
          <BottomDrawer 
            isOpen={drawerOpen === 'location'} 
            onClose={() => setDrawerOpen(null)} 
            title="Selecionar Local da Operação"
            options={locationOptions}
            selectedValue={booking.locationId}
            onChange={val => updateBookingField('locationId', val)}
          />
        </>
      )}

      {/* Containers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700' }}>Containers do Booking</h2>
          {canAddContainer && (
            <button onClick={() => setShowAddContainerModal(true)} className="btn btn-primary" style={{ padding: '8px 16px' }}>
              <Plus size={16} /> Adicionar Container
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {(booking.containers || []).map(cont => (
            <ContainerDetail 
              key={cont.id}
              container={cont}
              bookingId={booking.id}
              user={user}
              onUpdateContainer={handleUpdateContainer}
              onDeleteContainer={handleDeleteContainer}
            />
          ))}

          {(!booking.containers || booking.containers.length === 0) && (
            <div className="glass-panel" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              Nenhum container cadastrado neste Booking.
              {canAddContainer && <p style={{ fontSize: '13px', marginTop: '6px' }}>Clique em "Adicionar Container" para cadastrar o primeiro.</p>}
            </div>
          )}
        </div>
      </div>

      {/* MODAL: CADASTRAR NOVO CONTAINER */}
      {showAddContainerModal && (
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
          zIndex: 1500,
          padding: '20px'
        }}>
          <form onSubmit={handleAddContainerSubmit} className="glass-panel" style={{ maxWidth: '400px', width: '100%', padding: '24px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontFamily: 'var(--font-display)' }}>Cadastrar Container no Booking</h3>
              <button type="button" onClick={() => setShowAddContainerModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label>Número do Container *</label>
                <input 
                  type="text" 
                  value={newContainerData.containerNumber}
                  onChange={e => setNewContainerData({ ...newContainerData, containerNumber: e.target.value })}
                  placeholder="Ex: MSCU1234567"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label>Tipo do Container</label>
                <select
                  value={newContainerData.containerType}
                  onChange={e => setNewContainerData({ ...newContainerData, containerType: e.target.value })}
                >
                  <option value="20' Dry">20' Dry</option>
                  <option value="40' Dry">40' Dry</option>
                  <option value="40' HC">40' HC</option>
                  <option value="40' Reefer">40' Reefer</option>
                </select>
              </div>

              <div>
                <label>Status Inicial</label>
                <select
                  value={newContainerData.status}
                  onChange={e => setNewContainerData({ ...newContainerData, status: e.target.value })}
                >
                  <option value="Pendente">🔴 Pendente</option>
                  <option value="Em Carregamento">🟡 Em Andamento</option>
                  <option value="Estufado">🟢 Finalizado</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="button" onClick={() => setShowAddContainerModal(false)} className="btn btn-secondary">Cancelar</button>
              <button type="submit" className="btn btn-primary">Inserir Container</button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
