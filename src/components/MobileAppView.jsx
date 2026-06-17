import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Camera, Image, Trash2, ArrowLeft, ArrowRight, RefreshCw, X } from 'lucide-react';
import { db, useBookings, useExportadores, useLocais } from '../db';

export default function MobileAppView({ onLogout, hideHeader = false }) {
  const [searchQuery, setSearchQuery] = useState('');
  const bookings = useBookings();
  const exportadores = useExportadores();
  const locais = useLocais();
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedContainer, setSelectedContainer] = useState(null);
  const [newSealInput, setNewSealInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(''); // 'success' | 'error' | ''
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const handleRefreshData = useCallback(() => {}, []);

  useEffect(() => {}, []);

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncStatus('');
    try {
      await db.syncPull();
      await db.syncPush();
      handleRefreshData();
      setSyncStatus('success');
      setTimeout(() => setSyncStatus(''), 2000);
    } catch {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus(''), 2000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Filtragem unificada por Booking, Container e Exportador
  const filteredBookings = bookings.filter(b => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return true;

    // 1. Pesquisa por Booking/Certificado
    const matchBooking = b.bookingNumber.toLowerCase().includes(term) ||
                         b.certificateNumber.toLowerCase().includes(term);

    // 2. Pesquisa por Container
    const matchContainer = b.containers?.some(c =>
      c.containerNumber.toLowerCase().includes(term)
    );

    // 3. Pesquisa por Exportador
    const exp = exportadores.find(e => e.id === b.exporterId);
    const matchExporter = exp && exp.name.toLowerCase().includes(term);

    return matchBooking || matchContainer || matchExporter;
  });

  // Operações de Contêiner
  const handleUpdateContainerField = async (field, value) => {
    if (!selectedBooking || !selectedContainer) return;

    const updatedCont = { ...selectedContainer, [field]: value };
    setSelectedContainer(updatedCont);

    const updatedContainers = selectedBooking.containers.map(c =>
      c.id === selectedContainer.id ? updatedCont : c
    );

    const updatedBooking = { ...selectedBooking, containers: updatedContainers };
    setSelectedBooking(updatedBooking);

    await db.saveBooking(updatedBooking);
    
  };

  // Lacres Provisórios
  const handleAddProvisionalSeal = () => {
    if (!newSealInput.trim() || !selectedContainer) return;
    const current = selectedContainer.provisionalSeals || [];
    const updated = [...current, newSealInput.trim().toUpperCase()];
    handleUpdateContainerField('provisionalSeals', updated);
    setNewSealInput('');
  };

  const handleRemoveProvisionalSeal = (index) => {
    if (!selectedContainer) return;
    const current = selectedContainer.provisionalSeals || [];
    const updated = current.filter((_, idx) => idx !== index);
    handleUpdateContainerField('provisionalSeals', updated);
  };

  // Upload de Fotos do Container
  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !selectedContainer) return;

    try {
      const uploadPromises = files.map(file => db.uploadPhoto(file));
      const urls = await Promise.all(uploadPromises);

      const newPhotos = urls.map(url => ({
        id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        url: url,
        name: ''
      }));

      const updatedPhotos = [...(selectedContainer.photos || []), ...newPhotos];
      await handleUpdateContainerField('photos', updatedPhotos);
    } catch (err) {
      console.error("Error uploading photos:", err);
      alert(err.message || "Ocorreu um erro ao enviar/salvar as fotos no sistema.");
    }
  };

  const movePhoto = (index, direction) => {
    if (!selectedContainer) return;
    const photos = [...(selectedContainer.photos || [])];
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;

    const temp = photos[index];
    photos[index] = photos[target];
    photos[target] = temp;

    handleUpdateContainerField('photos', photos);
  };

  const handleDeletePhoto = (photoId) => {
    if (!selectedContainer) return;
    const photos = (selectedContainer.photos || []).filter(p => p.id !== photoId);
    handleUpdateContainerField('photos', photos);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: hideHeader ? 'auto' : '100vh',
      backgroundColor: hideHeader ? 'transparent' : 'var(--bg-primary)',
      color: 'var(--text-primary)',
      fontFamily: "'Outfit', sans-serif",
      paddingBottom: hideHeader ? '0' : '30px'
    }}>
      {/* Header Premium */}
      {!hideHeader && (
        <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
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
            fontSize: '16px',
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            US
          </div>
          <div>
            <h1 style={{ fontSize: '15px', fontWeight: '800', margin: 0, letterSpacing: '0.5px' }}>Unispect Service</h1>
            <span style={{ fontSize: '10px', color: 'var(--color-brand)', fontWeight: '700', textTransform: 'uppercase' }}>Mobile Portal</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Botão Sincronizar */}
          <button 
            onClick={handleSync}
            disabled={isSyncing}
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '6px 10px',
              color: syncStatus === 'success' ? '#10b981' : syncStatus === 'error' ? '#ef4444' : 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: '700'
            }}
          >
            <RefreshCw size={12} className={isSyncing ? 'rotating' : ''} />
            <span>{isSyncing ? 'Sincronizando...' : syncStatus === 'success' ? 'Sincronizado!' : 'Sincronizar'}</span>
          </button>

          {/* Sair */}
          {onLogout && (
            <button 
              onClick={onLogout}
              style={{
                padding: '6px 12px',
                fontSize: '11px',
                backgroundColor: 'var(--color-danger-light)',
                border: '1px solid var(--color-danger)',
                borderRadius: '6px',
                color: 'var(--color-danger)',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              Sair
            </button>
          )}
        </div>
      </header>
      )}

      {/* Área Principal */}
      <main style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
        
        {/* Dashboard de Pesquisa */}
        {!selectedBooking && (
          <>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '6px' }}>Dashboard de Pesquisa</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Consulte informações operacionais de forma rápida.</p>
            </div>

            {/* Input de Busca */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 18px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-md)'
            }}>
              <Search size={18} style={{ color: 'var(--color-brand)' }} />
              <input 
                type="text"
                placeholder="Pesquisar por Booking, Container ou Exportador..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-primary)',
                  width: '100%',
                  outline: 'none',
                  fontSize: '14px'
                }}
              />
            </div>

            {/* Resultados da Pesquisa */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Resultados ({filteredBookings.length})
              </span>

              {filteredBookings.map(b => {
                const expName = exportadores.find(e => e.id === b.exporterId)?.name || 'N/A';
                const statusColor = b.status === 'Finalizado' ? '#10b981' : b.status === 'Em andamento' ? '#f59e0b' : '#ef4444';

                return (
                  <div 
                    key={b.id}
                    onClick={() => setSelectedBooking(b)}
                    style={{
                      padding: '18px',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      transition: 'transform 0.2s ease',
                      boxShadow: 'var(--shadow-sm)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--color-brand)', fontWeight: '800', fontSize: '15px' }}>{b.certificateNumber}</span>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {b.pendingItem && (
                          <span style={{
                            fontSize: '9px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            fontWeight: '800',
                            border: '1px solid #ef4444',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap'
                          }}>{b.pendingItem}</span>
                        )}
                        <span style={{
                          fontSize: '9px',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          backgroundColor: `${statusColor}18`,
                          color: statusColor,
                          fontWeight: '800',
                          textTransform: 'uppercase'
                        }}>{b.status}</span>
                      </div>
                    </div>

                    <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                      Booking: <strong>{b.bookingNumber}</strong>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Exportador: <span>{expName}</span>
                    </div>

                    <div style={{
                      display: 'flex',
                      gap: '12px',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      borderTop: '1px solid var(--border-color)',
                      paddingTop: '8px',
                      marginTop: '4px'
                    }}>
                      <span>Navio: {b.vesselVoyage}</span>
                      <span>Containers: {b.containers?.length || 0}</span>
                    </div>
                  </div>
                );
              })}

              {filteredBookings.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Nenhum registro encontrado para a pesquisa.
                </div>
              )}
            </div>
          </>
        )}

        {/* Detalhes do Booking & Seletor de Contêiner */}
        {selectedBooking && !selectedContainer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <button 
              onClick={() => setSelectedBooking(null)}
              style={{
                alignSelf: 'flex-start',
                background: 'none',
                border: 'none',
                color: 'var(--color-brand)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                fontWeight: '700',
                padding: 0
              }}
            >
              <ArrowLeft size={16} /> Voltar para Pesquisa
            </button>

            <div style={{
              padding: '20px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <span style={{ fontSize: '11px', color: 'var(--color-brand)', fontWeight: '800' }}>DETALHES DO BOOKING</span>
              <h2 style={{ fontSize: '20px', fontWeight: '800', margin: '4px 0 10px 0' }}>{selectedBooking.certificateNumber}</h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text-primary)' }}>
                <div>Nº Reserva: <strong>{selectedBooking.bookingNumber}</strong></div>
                <div>Exportador: <span>{exportadores.find(e => e.id === selectedBooking.exporterId)?.name}</span></div>
                <div>Local: <span>{locais.find(l => l.id === selectedBooking.locationId)?.name}</span></div>
                <div>Navio/Viagem: <span>{selectedBooking.vesselVoyage}</span></div>
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '10px', color: 'var(--color-brand)' }}>
                Selecione o Container para Operar
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {selectedBooking.containers?.map(c => (
                  <div 
                    key={c.id}
                    onClick={() => setSelectedContainer(c)}
                    style={{
                      padding: '16px',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      boxShadow: 'var(--shadow-sm)'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '15px' }}>{c.containerNumber}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{c.containerType}</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <ArrowRight size={16} style={{ color: 'var(--color-brand)' }} />
                    </div>
                  </div>
                ))}

                {(!selectedBooking.containers || selectedBooking.containers.length === 0) && (
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    Nenhum container inserido nesta reserva.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Gerenciamento do Contêiner (Status, Fotos, Inventário) */}
        {selectedBooking && selectedContainer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <button 
              onClick={() => {
                setSelectedContainer(null);
                handleRefreshData();
              }}
              style={{
                alignSelf: 'flex-start',
                background: 'none',
                border: 'none',
                color: 'var(--color-brand)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                fontWeight: '700',
                padding: 0
              }}
            >
              <ArrowLeft size={16} /> Voltar para Booking
            </button>

            {/* Ficha Resumo do Container */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--bg-secondary)',
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: '800' }}>CONTAINER</span>
                <h3 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>{selectedContainer.containerNumber}</h3>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{selectedContainer.containerType}</span>
              </div>
            </div>

            {/* SEÇÃO 4: INSERIR FOTOS */}
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--color-brand)', margin: 0 }}>
                  4. Inserir Fotos dos Containers
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Total: {selectedContainer.photos?.length || 0}
                </span>
              </div>

              {/* Botões de Câmera e Galeria */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button 
                  onClick={() => cameraInputRef.current.click()}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  <Camera size={16} style={{ color: 'var(--color-brand)' }} />
                  <span>Tirar Foto</span>
                </button>
                <input 
                  type="file" 
                  ref={cameraInputRef}
                  onChange={handlePhotoUpload}
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                />

                <button 
                  onClick={() => galleryInputRef.current.click()}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  <Image size={16} style={{ color: 'var(--color-brand)' }} />
                  <span>Galeria</span>
                </button>
                <input 
                  type="file" 
                  ref={galleryInputRef}
                  onChange={handlePhotoUpload}
                  multiple
                  accept="image/*"
                  style={{ display: 'none' }}
                />
              </div>

              {/* Grid Scrollable de Fotos */}
              <div style={{
                display: 'flex',
                gap: '12px',
                overflowX: 'auto',
                paddingBottom: '6px'
              }}>
                {selectedContainer.photos?.map((photo, index) => (
                  <div key={photo.id} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    flexShrink: 0,
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '4px',
                    backgroundColor: 'var(--bg-tertiary)'
                  }}>
                    <div 
                      onClick={() => setPreviewPhotoUrl(photo.url)}
                      style={{
                        width: '90px',
                        height: '120px',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        backgroundColor: '#000',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                      title="Clique para ampliar"
                    >
                      <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2px' }}>
                      <button 
                        disabled={index === 0}
                        onClick={() => movePhoto(index, -1)}
                        style={{ padding: '3px', flex: 1, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '2px' }}
                      >
                        <ArrowLeft size={10} />
                      </button>
                      <button 
                        onClick={() => handleDeletePhoto(photo.id)}
                        style={{ padding: '3px', flex: 1, backgroundColor: 'var(--color-danger-light)', border: 'none', color: 'var(--color-danger)', borderRadius: '2px' }}
                      >
                        <Trash2 size={10} />
                      </button>
                      <button 
                        disabled={index === (selectedContainer.photos.length - 1)}
                        onClick={() => movePhoto(index, 1)}
                        style={{ padding: '3px', flex: 1, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '2px' }}
                      >
                        <ArrowRight size={10} />
                      </button>
                    </div>
                  </div>
                ))}

                {(!selectedContainer.photos || selectedContainer.photos.length === 0) && (
                  <div style={{
                    flex: 1,
                    border: '1px dashed var(--border-color)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                    minHeight: '120px'
                  }}>
                    Nenhuma foto anexada.
                  </div>
                )}
              </div>
            </div>

            {/* SEÇÃO 6: FAZER INVENTÁRIO */}
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--color-brand)', margin: 0 }}>
                6. Fazer Inventário dos Containers
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }} className="mobile-form-inputs">
                {/* Quantidade de Bags */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>
                    Quantidade de Sacas (Bags)
                  </label>
                  <input 
                    type="number"
                    value={selectedContainer.bagsQuantity || ''}
                    onChange={e => handleUpdateContainerField('bagsQuantity', parseInt(e.target.value, 10) || 0)}
                    placeholder="Ex: 320"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Grid Pesos */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>
                      Net Weight (Peso Carga)
                    </label>
                    <input 
                      type="text"
                      value={selectedContainer.netWeight || ''}
                      onChange={e => handleUpdateContainerField('netWeight', e.target.value)}
                      placeholder="Ex: 19.200"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>
                      Tara
                    </label>
                    <input 
                      type="text"
                      value={selectedContainer.tara || ''}
                      onChange={e => handleUpdateContainerField('tara', e.target.value)}
                      placeholder="Ex: 3.800"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>
                      Gross Weight (Bruto)
                    </label>
                    <input 
                      type="text"
                      value={selectedContainer.grossWeight || ''}
                      onChange={e => handleUpdateContainerField('grossWeight', e.target.value)}
                      placeholder="Ex: 23.000"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>
                      Marca / Cod. Lote
                    </label>
                    <input 
                      type="text"
                      value={selectedContainer.brand || ''}
                      onChange={e => handleUpdateContainerField('brand', e.target.value)}
                      placeholder="Ex: 002/1500"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                {/* Lacres Provisórios Múltiplos */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>
                    Lacres Provisórios (Múltiplos)
                  </label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input 
                      type="text"
                      placeholder="Adicionar lacre..."
                      value={newSealInput}
                      onChange={e => setNewSealInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddProvisionalSeal()}
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    />
                    <button 
                      onClick={handleAddProvisionalSeal}
                      style={{
                        padding: '10px 16px',
                        backgroundColor: 'var(--color-brand)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Add
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {selectedContainer.provisionalSeals?.map((seal, idx) => (
                      <div 
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          backgroundColor: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          fontSize: '12px'
                        }}
                      >
                        <span>{seal}</span>
                        <button 
                          onClick={() => handleRemoveProvisionalSeal(idx)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}

                    {(!selectedContainer.provisionalSeals || selectedContainer.provisionalSeals.length === 0) && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Nenhum lacre provisório inserido.
                      </span>
                    )}
                  </div>
                </div>

                {/* Lacre Definitivo */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>
                    Lacre Definitivo
                  </label>
                  <input 
                    type="text"
                    value={selectedContainer.definiteSeal || ''}
                    onChange={e => handleUpdateContainerField('definiteSeal', e.target.value)}
                    placeholder="Nº Lacre Definitivo"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Datas Operacionais */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>
                      Data de Fumigação
                    </label>
                    <input 
                      type="date"
                      value={selectedContainer.fumigationDate || ''}
                      onChange={e => handleUpdateContainerField('fumigationDate', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>
                      Data Fito
                    </label>
                    <input 
                      type="date"
                      value={selectedContainer.fitoDate || ''}
                      onChange={e => handleUpdateContainerField('fitoDate', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                {/* Obs */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>
                    Observações Técnicas
                  </label>
                  <textarea 
                    value={selectedContainer.notes || ''}
                    onChange={e => handleUpdateContainerField('notes', e.target.value)}
                    placeholder="Observações adicionais..."
                    rows={2}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Ações Finais */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
              <button 
                onClick={() => {
                  setSelectedContainer(null);
                  handleRefreshData();
                }}
                style={{
                  flex: 1,
                  padding: '14px 20px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontWeight: '700',
                  cursor: 'pointer',
                  fontSize: '14px',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                Voltar para Booking
              </button>
            </div>
          </div>
        )}
      </main>

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

    </div>
  );
}
