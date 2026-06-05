import { useState, useRef } from 'react';
import { Trash2, ArrowLeft, ArrowRight, CheckCircle2, RefreshCw, Plus, Camera, Image } from 'lucide-react';
import { db } from '../db';

export default function ContainerDetail({ container, user, onUpdateContainer, onDeleteContainer }) {
  const [localContainer, setLocalContainer] = useState(container);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [newSealInput, setNewSealInput] = useState('');
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const isInspector = user.role === 'Inspector';
  const isAdm = user.role === 'ADM';
  const canEdit = isAdm || isInspector;

  // Atualização otimista de status
  const handleStatusChange = (newStatus) => {
    const updatedContainer = { ...localContainer, status: newStatus };
    setLocalContainer(updatedContainer);
    onUpdateContainer(updatedContainer);

    setIsSaving(true);
    setSaveSuccess(false);

    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }, 800);
  };

  // Alterar campos genéricos
  const handleChange = (field, value) => {
    const updated = { ...localContainer, [field]: value };
    setLocalContainer(updated);
    onUpdateContainer(updated);
  };

  // Adicionar Lacre Provisório Múltiplo
  const handleAddProvisionalSeal = () => {
    if (!newSealInput.trim()) return;
    const currentSeals = localContainer.provisionalSeals || [];
    const updatedSeals = [...currentSeals, newSealInput.trim()];
    
    const updated = { ...localContainer, provisionalSeals: updatedSeals };
    setLocalContainer(updated);
    onUpdateContainer(updated);
    setNewSealInput('');
  };

  // Remover Lacre Provisório Múltiplo
  const handleRemoveProvisionalSeal = (index) => {
    const currentSeals = localContainer.provisionalSeals || [];
    const updatedSeals = currentSeals.filter((_, idx) => idx !== index);
    
    const updated = { ...localContainer, provisionalSeals: updatedSeals };
    setLocalContainer(updated);
    onUpdateContainer(updated);
  };

  // Upload de Fotos (Processamento de arquivo)
  const handlePhotoFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    try {
      const uploadPromises = files.map(file => db.uploadPhoto(file));
      const urls = await Promise.all(uploadPromises);

      const newPhotos = urls.map(url => ({
        id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        url: url,
        name: ''
      }));

      const updatedPhotos = [...(localContainer.photos || []), ...newPhotos];
      const updated = { ...localContainer, photos: updatedPhotos };
      setLocalContainer(updated);
      await onUpdateContainer(updated);
    } catch (error) {
      console.error("Error uploading photos in ContainerDetail:", error);
      alert(error.message || "Ocorreu um erro ao enviar/salvar as fotos no sistema.");
    }
  };

  // Remover Foto
  const handleDeletePhoto = (photoId) => {
    const updatedPhotos = (localContainer.photos || []).filter(p => p.id !== photoId);
    const updated = { ...localContainer, photos: updatedPhotos };
    setLocalContainer(updated);
    onUpdateContainer(updated);
  };

  // Reordenação de fotos
  const movePhoto = (index, direction) => {
    const photos = [...(localContainer.photos || [])];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= photos.length) return;

    const temp = photos[index];
    photos[index] = photos[targetIndex];
    photos[targetIndex] = temp;

    const updated = { ...localContainer, photos };
    setLocalContainer(updated);
    onUpdateContainer(updated);
  };

  // Drag & drop handlers
  const [draggedIdx, setDraggedIdx] = useState(null);
  const handleDragStart = (index) => {
    if (!canEdit) return;
    setDraggedIdx(index);
  };
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e, targetIndex) => {
    if (draggedIdx === null || !canEdit) return;
    const photos = [...(localContainer.photos || [])];
    const draggedItem = photos[draggedIdx];
    photos.splice(draggedIdx, 1);
    photos.splice(targetIndex, 0, draggedItem);
    setDraggedIdx(null);
    const updated = { ...localContainer, photos };
    setLocalContainer(updated);
    onUpdateContainer(updated);
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--border-color)' }}>
      
      {/* Cabeçalho do Container */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ fontSize: '16px', color: 'var(--color-brand)' }}>
            Container: {localContainer.containerNumber} {localContainer.containerType ? `(${localContainer.containerType})` : ''}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            {isSaving && <RefreshCw size={12} className="rotating" style={{ color: 'var(--color-brand)', animation: 'spin 1s linear infinite' }} />}
            {saveSuccess && <span style={{ fontSize: '11px', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={12} /> Salvo!</span>}
          </div>
        </div>

        {/* Controles e Exclusão */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isAdm && (
            <button 
              onClick={() => onDeleteContainer(localContainer.id)} 
              className="btn btn-danger" 
              style={{ padding: '6px', borderRadius: 'var(--radius-sm)' }}
              title="Deletar Container"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Formulário do Container */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px'
      }}>
        {/* Tipo de Container */}
        <div>
          <label>Tipo do Container</label>
          <select
            disabled={!canEdit}
            value={localContainer.containerType || ''}
            onChange={e => handleChange('containerType', e.target.value)}
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
          >
            <option value="">Selecione...</option>
            <option value="20' Dry">20' Dry</option>
            <option value="40' Dry">40' Dry</option>
            <option value="40' HC">40' HC</option>
            <option value="40' Reefer">40' Reefer</option>
          </select>
        </div>

        {/* Lacre Definitivo */}
        <div>
          <label>Lacre Definitivo</label>
          <input 
            type="text" 
            disabled={!canEdit}
            value={localContainer.definiteSeal || ''} 
            onChange={e => handleChange('definiteSeal', e.target.value)}
            placeholder="Nº Lacre Definitivo"
          />
        </div>

        {/* Quantidade de Bags */}
        <div>
          <label>Quant. (Bags)</label>
          <input 
            type="number" 
            disabled={!canEdit}
            value={localContainer.bagsQuantity || ''} 
            onChange={e => handleChange('bagsQuantity', e.target.value)}
            placeholder="Ex: 20"
          />
        </div>

        {/* Net Weight */}
        <div>
          <label>Peso Carga (Net Weight)</label>
          <input 
            type="text" 
            disabled={!canEdit}
            value={localContainer.netWeight || ''} 
            onChange={e => handleChange('netWeight', e.target.value)}
            placeholder="Ex: 20.000,000"
          />
        </div>

        {/* Tara */}
        <div>
          <label>Tara</label>
          <input 
            type="text" 
            disabled={!canEdit}
            value={localContainer.tara || ''} 
            onChange={e => handleChange('tara', e.target.value)}
            placeholder="Ex: 3.700"
          />
        </div>

        {/* Gross Weight */}
        <div>
          <label>Peso Bruto (Gross Weight)</label>
          <input 
            type="text" 
            disabled={!canEdit}
            value={localContainer.grossWeight || ''} 
            onChange={e => handleChange('grossWeight', e.target.value)}
            placeholder="Ex: 23.700,00"
          />
        </div>

        {/* Brand / Lote */}
        <div>
          <label>Marca (Cod. Lote/Marca)</label>
          <input 
            type="text" 
            disabled={!canEdit}
            value={localContainer.brand || ''} 
            onChange={e => handleChange('brand', e.target.value)}
            placeholder="Ex: 002/1500/0689"
          />
        </div>

        {/* Datas Operacionais */}
        <div>
          <label>Data de Fumigação</label>
          <input 
            type="date" 
            disabled={!canEdit}
            value={localContainer.fumigationDate || ''} 
            onChange={e => handleChange('fumigationDate', e.target.value)}
          />
        </div>

        <div>
          <label>Data Fito</label>
          <input 
            type="date" 
            disabled={!canEdit}
            value={localContainer.fitoDate || ''} 
            onChange={e => handleChange('fitoDate', e.target.value)}
          />
        </div>

        <div>
          <label>Data Lacre Definitivo</label>
          <input 
            type="date" 
            disabled={!canEdit}
            value={localContainer.definiteSealDate || ''} 
            onChange={e => handleChange('definiteSealDate', e.target.value)}
          />
        </div>
      </div>

      {/* Seção de Lacres Provisórios Múltiplos */}
      <div>
        <label>Lacres Provisórios (Múltiplos)</label>
        
        {canEdit && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input 
              type="text" 
              placeholder="Adicionar novo lacre provisório..." 
              value={newSealInput}
              onChange={e => setNewSealInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddProvisionalSeal()}
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            />
            <button 
              type="button" 
              onClick={handleAddProvisionalSeal}
              className="btn btn-primary"
              style={{ padding: '10px 14px' }}
            >
              <Plus size={16} /> Adicionar
            </button>
          </div>
        )}

        {/* Lista de Lacres Adicionados */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {(localContainer.provisionalSeals || []).map((seal, index) => (
            <div 
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                fontWeight: '600'
              }}
            >
              <span>{seal}</span>
              {canEdit && (
                <button 
                  type="button" 
                  onClick={() => handleRemoveProvisionalSeal(index)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-danger)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
          {(!localContainer.provisionalSeals || localContainer.provisionalSeals.length === 0) && (
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhum lacre provisório inserido.</span>
          )}
        </div>
      </div>

      {/* Observações */}
      <div>
        <label>Observações</label>
        <textarea 
          disabled={!canEdit}
          value={localContainer.notes || ''} 
          onChange={e => handleChange('notes', e.target.value)}
          rows="2"
          placeholder="Inserir observações sobre o container..."
          style={{ resize: 'vertical', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
      </div>

      {/* Galeria de Fotos & Captura Mobile */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <label style={{ margin: 0 }}>Fotos da Carga</label>
          
          {canEdit && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {/* Botão Câmera (Mobile capture) */}
              <button 
                type="button" 
                onClick={() => cameraInputRef.current.click()}
                className="btn btn-secondary" 
                style={{ padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--text-muted)' }}
              >
                <Camera size={14} style={{ color: 'var(--color-brand)' }} /> Tirar Foto
              </button>
              <input 
                type="file" 
                ref={cameraInputRef} 
                onChange={handlePhotoFileChange} 
                accept="image/*" 
                capture="environment" 
                style={{ display: 'none' }}
              />

              {/* Botão Galeria */}
              <button 
                type="button" 
                onClick={() => galleryInputRef.current.click()}
                className="btn btn-secondary" 
                style={{ padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--text-muted)' }}
              >
                <Image size={14} style={{ color: 'var(--color-brand)' }} /> Galeria
              </button>
              <input 
                type="file" 
                ref={galleryInputRef} 
                onChange={handlePhotoFileChange} 
                multiple 
                accept="image/*" 
                style={{ display: 'none' }}
              />
            </div>
          )}
        </div>

        {/* Fotos Grid */}
        <div style={{
          display: 'flex',
          gap: '16px',
          overflowX: 'auto',
          padding: '8px 0',
          minHeight: '120px'
        }}>
          {localContainer.photos?.map((photo, index) => (
            <div 
              key={photo.id}
              draggable={canEdit}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                position: 'relative',
                cursor: canEdit ? 'grab' : 'default',
                opacity: draggedIdx === index ? 0.4 : 1,
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px',
                backgroundColor: 'var(--bg-tertiary)',
                flexShrink: 0
              }}
            >
              {/* Moldura 3:4 */}
              <div style={{
                width: '120px',
                height: '160px',
                backgroundColor: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderRadius: '4px'
              }}>
                <img 
                  src={photo.url} 
                  alt={photo.name} 
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain'
                  }}
                />
              </div>

              {/* Photo captions removed as per user request */}

              {canEdit && (
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
                    disabled={index === (localContainer.photos.length - 1)} 
                    onClick={() => movePhoto(index, 1)}
                    className="btn btn-secondary" 
                    style={{ padding: '4px', flex: 1, border: '1px solid var(--border-color)' }}
                  >
                    <ArrowRight size={10} />
                  </button>
                </div>
              )}
            </div>
          ))}

          {(!localContainer.photos || localContainer.photos.length === 0) && (
            <div style={{
              flex: 1,
              border: '2px dashed var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: '13px',
              minHeight: '120px'
            }}>
              Nenhuma foto cadastrada neste container.
            </div>
          )}
        </div>
      </div>
      
    </div>
  );
}
