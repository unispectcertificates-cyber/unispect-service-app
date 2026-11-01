import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Trash2, ArrowLeft, ArrowRight, CheckCircle2, RefreshCw, Plus, Camera, Image, AlertTriangle, Check, X } from 'lucide-react';
import { db, getSealText, useUsers, useInspectors } from '../db';
import { mergeContainerProvisionalSeals } from '../utils/bookingConcurrent';
import {
  processContainerProvisionalSeals,
  getPendingDoubtfulSealReviews,
  confirmDoubtfulSealReview,
  dismissDoubtfulSealReview
} from '../utils/provisionalSealQueue';
import {
  resolveAuthenticatedActor,
  isAuthorizedAdminRole,
  assignOrPreserveResponsibleInspector,
  createAuditEvent,
  appendTimelineEvents,
  applyViewAccessToContainer,
  transferContainerResponsibility
} from '../utils/inspectionAudit';
import FieldCaptureNotice from './FieldCaptureNotice';
import PhotoDownloadButton from './PhotoDownloadButton';
import PhotoEnlargedModal from './PhotoEnlargedModal';
import InspectionTimeline from './InspectionTimeline';

export default function ContainerDetail({ container, bookingId = '', clientId = 'client_interport', user, onUpdateContainer, onDeleteContainer }) {
  const [localContainer, setLocalContainer] = useState(container);
  const [isSaving] = useState(false);
  const [saveSuccess] = useState(false);
  const [newSealInput, setNewSealInput] = useState('');
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState(null);
  const [isRecognizingSeals, setIsRecognizingSeals] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState({});
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const localContainerRef = useRef(localContainer);
  const usersList = useUsers();
  const inspectorsList = useInspectors();

  const collaboratorOptions = useMemo(() => {
    const map = new Map();
    for (const u of usersList || []) {
      if (u && (u.id || u.uid) && u.name) map.set(String(u.id || u.uid), u);
    }
    for (const ins of inspectorsList || []) {
      if (ins && ins.id && ins.name && !map.has(String(ins.id))) {
        map.set(String(ins.id), { ...ins, role: 'Inspector' });
      }
    }
    return [...map.values()];
  }, [usersList, inspectorsList]);

  useEffect(() => {
    localContainerRef.current = localContainer;
  }, [localContainer]);

  // Sincroniza alterações vindas do componente pai / tempo real preservando URLs das fotos já carregadas
  useEffect(() => {
    setLocalContainer(prev => {
      const prevUrlMap = new Map((prev?.photos || []).map(p => [p.id, p]));
      const mergedPhotos = (container.photos || []).map(ref => ({
        ...prevUrlMap.get(ref.id),
        ...ref,
        url: ref.url || prevUrlMap.get(ref.id)?.url || null,
        storagePath: ref.storagePath || prevUrlMap.get(ref.id)?.storagePath || null
      }));
      return {
        ...container,
        photos: mergedPhotos
      };
    });
  }, [
    container.id,
    container.provisionalSeals,
    container.removedProvisionalSeals,
    container.sealProvenance,
    container.sealRecognitionState,
    container.dismissedSealReviews,
    container.definiteSeal,
    container.netWeight,
    container.grossWeight,
    container.tara,
    container.bagsQuantity,
    container.brand,
    container.notes,
    container.responsibleInspector,
    container.auditTimeline,
    container.certificateSignature
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const isInspector = user?.role === 'Inspector';
  const isAdm = isAuthorizedAdminRole(user);
  const canEdit = isAdm || isInspector;

  // Registra acesso de visualização (Regra 2 e Regra 4): deduplicado por abertura efetiva e NUNCA atribui responsável
  useEffect(() => {
    if (!container?.id || !user) return;
    try {
      const viewRes = applyViewAccessToContainer({
        container: localContainerRef.current,
        authenticatedUser: user,
        clientId: clientId || container.clientId || 'client_interport',
        bookingId: bookingId || container.bookingId || ''
      });
      if (viewRes.recorded) {
        setLocalContainer(viewRes.container);
        localContainerRef.current = viewRes.container;
        if (bookingId && db.recordContainerAccess) {
          void db.recordContainerAccess(bookingId, container.id, { authenticatedUser: user }).catch(() => {});
        } else if (onUpdateContainer) {
          onUpdateContainer(viewRes.container);
        }
      }
    } catch {
      // ignora se usuário de teste não tiver contexto
    }
  }, [container.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dispara o reconhecimento automático em segundo plano sem bloquear a interface
  const triggerBackgroundSealRecognition = useCallback((targetContainer, options = {}) => {
    const cont = targetContainer || localContainerRef.current;
    if (!cont || !(cont.photos || []).length) return;

    setIsRecognizingSeals(true);
    void processContainerProvisionalSeals({
      container: cont,
      bookingId: bookingId || cont.bookingId || '',
      clientId: clientId || cont.clientId || 'client_interport',
      photos: options.photos || cont.photos,
      retryFailed: Boolean(options.retryFailed),
      explicitReview: Boolean(options.explicitReview),
      onContainerUpdated: (updatedCont) => {
        setLocalContainer(prev => {
          const merged = {
            ...prev,
            ...updatedCont,
            photos: prev.photos?.length ? prev.photos : updatedCont.photos
          };
          localContainerRef.current = merged;
          return merged;
        });
        if (onUpdateContainer) {
          onUpdateContainer({
            ...cont,
            ...updatedCont,
            photos: cont.photos?.length ? cont.photos : updatedCont.photos
          });
        }
      }
    }).finally(() => {
      setIsRecognizingSeals(false);
    });
  }, [bookingId, clientId, onUpdateContainer]);

  // Carrega URLs das fotos do Firestore (containerPhotos), faz merge com localContainer.photos
  // e inicia em segundo plano o reconhecimento automático dos lacres provisórios Interport existentes
  useEffect(() => {
    let cancelled = false;
    async function loadPhotoUrls() {
      try {
        const photos = await db.getPhotosForContainer(container.id, container.fieldPhotoSourceIds || []);
        if (cancelled) return;

        const photoMap = {};
        photos.forEach(p => { photoMap[p.id] = p; });

        const mergedPhotos = (localContainerRef.current.photos || []).map(ref => ({
          ...ref,
          url: photoMap[ref.id]?.url || ref.url || null,
          storagePath: photoMap[ref.id]?.storagePath || ref.storagePath || null,
          sizeBytes: photoMap[ref.id]?.sizeBytes || ref.sizeBytes || 0,
          compressionVersion: photoMap[ref.id]?.compressionVersion || ref.compressionVersion || '1'
        }));

        const nextCont = { ...localContainerRef.current, photos: mergedPhotos };
        setLocalContainer(nextCont);
        localContainerRef.current = nextCont;

        if (mergedPhotos.some(p => p.url || p.dataUrl)) {
          triggerBackgroundSealRecognition(nextCont);
        }
      } catch (err) {
        console.warn('ContainerDetail: erro ao carregar fotos:', err);
        if (!cancelled && (localContainerRef.current.photos || []).some(p => p.url || p.dataUrl)) {
          triggerBackgroundSealRecognition(localContainerRef.current);
        }
      }
    }
    loadPhotoUrls();
    return () => { cancelled = true; };
  }, [container.id, triggerBackgroundSealRecognition]); // eslint-disable-line react-hooks/exhaustive-deps

  // Alterar campos genéricos (atribui inspetor responsável na primeira ação técnica e registra na linha do tempo)
  const handleChange = (field, value) => {
    const oldVal = localContainer[field];
    let nextCont = { ...localContainer, [field]: value };

    try {
      const authActor = resolveAuthenticatedActor(user);
      const nowIso = new Date().toISOString();
      const respResult = assignOrPreserveResponsibleInspector({
        container: localContainer,
        actor: authActor,
        isTechnicalAction: true,
        clientId: clientId || localContainer.clientId || 'client_interport',
        bookingId: bookingId || localContainer.bookingId || '',
        deviceTimestamp: nowIso,
        serverTimestamp: nowIso
      });
      const events = [];
      if (respResult.startedEvent) events.push(respResult.startedEvent);
      events.push(
        createAuditEvent({
          action: 'field_updated',
          actor: authActor,
          clientId: clientId || localContainer.clientId || 'client_interport',
          bookingId: bookingId || localContainer.bookingId || '',
          containerId: localContainer.id,
          containerNumber: localContainer.containerNumber || localContainer.id,
          targetItem: field,
          oldValue: oldVal ?? null,
          newValue: value ?? null,
          deviceTimestamp: nowIso,
          serverTimestamp: nowIso,
          metadata: { field }
        })
      );
      nextCont = {
        ...nextCont,
        responsibleInspector: respResult.responsibleInspector,
        auditTimeline: appendTimelineEvents(localContainer.auditTimeline || [], events, { serverNow: nowIso })
      };
    } catch {
      // fallback se chamado sem sessão
    }

    setLocalContainer(nextCont);
    localContainerRef.current = nextCont;
    onUpdateContainer(nextCont);
    if ((nextCont.photos || []).length > 0) {
      triggerBackgroundSealRecognition(nextCont);
    }
  };

  // Adicionar Lacre Provisório Múltiplo (manual)
  const handleAddProvisionalSeal = async () => {
    if (!newSealInput.trim()) return;
    const manualSeal = newSealInput.trim();
    setNewSealInput('');

    const mutation = {
      clientId: clientId || 'client_interport',
      bookingId: bookingId || '',
      authenticatedUser: user,
      forceReinsert: true,
      addSeals: [{ sealNumber: manualSeal, source: 'manual', clientId, bookingId, containerId: localContainer.id }]
    };
    const updated = mergeContainerProvisionalSeals(localContainer, mutation);
    setLocalContainer(updated);
    localContainerRef.current = updated;

    if (bookingId && db.mutateContainerProvisionalSeals) {
      try {
        await db.mutateContainerProvisionalSeals(bookingId, localContainer.id, mutation);
      } catch {
        onUpdateContainer(updated);
      }
    } else {
      onUpdateContainer(updated);
    }
  };

  // Remover Lacre Provisório Múltiplo (respeita Regra 8: impede reinserção automática pela mesma foto)
  const handleRemoveProvisionalSeal = async (index) => {
    const currentSeals = localContainer.provisionalSeals || [];
    const targetSeal = getSealText(currentSeals[index]);
    if (!targetSeal) return;

    const mutation = {
      clientId: clientId || 'client_interport',
      bookingId: bookingId || '',
      authenticatedUser: user,
      removeSeals: [{ sealNumber: targetSeal }]
    };
    const updated = mergeContainerProvisionalSeals(localContainer, mutation);
    setLocalContainer(updated);
    localContainerRef.current = updated;

    if (bookingId && db.mutateContainerProvisionalSeals) {
      try {
        await db.mutateContainerProvisionalSeals(bookingId, localContainer.id, mutation);
      } catch {
        onUpdateContainer(updated);
      }
    } else {
      onUpdateContainer(updated);
    }
  };

  // Confirmar leitura duvidosa (Regra 6)
  const handleConfirmDoubtful = async (review) => {
    const typed = reviewDrafts[review.reviewKey] !== undefined
      ? reviewDrafts[review.reviewKey]
      : review.suggestedNumber;
    if (!String(typed || '').trim()) {
      alert('Informe ou confirme a numeração do lacre provisório antes de adicionar.');
      return;
    }
    try {
      const updated = await confirmDoubtfulSealReview({
        container: localContainerRef.current,
        bookingId,
        clientId,
        reviewKey: review.reviewKey,
        photoId: review.photoId,
        photoVersion: review.photoVersion,
        confirmedNumber: typed,
        authenticatedUser: user,
        onContainerUpdated: (nextCont) => {
          setLocalContainer(nextCont);
          localContainerRef.current = nextCont;
          if (!bookingId && onUpdateContainer) onUpdateContainer(nextCont);
        }
      });
      if (!bookingId && onUpdateContainer) onUpdateContainer(updated);
    } catch (err) {
      alert(err.message || 'Não foi possível confirmar o lacre.');
    }
  };

  // Ignorar sugestão duvidosa (Regra 6)
  const handleDismissDoubtful = async (review) => {
    const updated = await dismissDoubtfulSealReview({
      container: localContainerRef.current,
      bookingId,
      clientId,
      reviewKey: review.reviewKey,
      onContainerUpdated: (nextCont) => {
        setLocalContainer(nextCont);
        localContainerRef.current = nextCont;
        if (!bookingId && onUpdateContainer) onUpdateContainer(nextCont);
      }
    });
    if (!bookingId && onUpdateContainer) onUpdateContainer(updated);
  };

  // Upload de Fotos (Processamento de arquivo + reconhecimento em segundo plano das novas fotos)
  const handlePhotoFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    // Reset input para permitir re-seleção do mesmo arquivo
    e.target.value = '';

    try {
      const authActor = resolveAuthenticatedActor(user);
      const nowIso = new Date().toISOString();
      const containerId = localContainer.id;
      const newPhotoRefs = [];
      const photosWithLocalFiles = [];

      for (const file of files) {
        // db.uploadPhoto comprime + faz upload para Firebase Storage
        // Retorna { id, name, url } onde url é a URL pública do Storage
        const result = await db.uploadPhoto(file, containerId, {
          authorId: authActor.id,
          authorName: authActor.name,
          authorEmail: authActor.email,
          clientId: clientId || 'client_interport',
          deviceTimestamp: nowIso
        });
        const refObj = {
          id: result.id,
          name: result.name,
          url: result.url,
          storagePath: result.storagePath,
          authorId: authActor.id,
          authorName: authActor.name,
          capturedBy: { id: authActor.id, uid: authActor.uid, name: authActor.name, role: authActor.role },
          deviceTimestamp: nowIso,
          serverTimestamp: nowIso,
          width: result.width,
          height: result.height,
          sizeBytes: result.sizeBytes,
          compressionVersion: result.compressionVersion
        };
        newPhotoRefs.push(refObj);
        photosWithLocalFiles.push({ ...refObj, file });
      }

      const respResult = assignOrPreserveResponsibleInspector({
        container: localContainer,
        actor: authActor,
        isTechnicalAction: true,
        clientId: clientId || localContainer.clientId || 'client_interport',
        bookingId: bookingId || localContainer.bookingId || '',
        deviceTimestamp: nowIso,
        serverTimestamp: nowIso
      });
      const events = [];
      if (respResult.startedEvent) events.push(respResult.startedEvent);
      events.push(
        createAuditEvent({
          action: 'photo_added',
          actor: authActor,
          clientId: clientId || localContainer.clientId || 'client_interport',
          bookingId: bookingId || localContainer.bookingId || '',
          containerId,
          containerNumber: localContainer.containerNumber || containerId,
          targetItem: `${newPhotoRefs.length} foto(s)`,
          newValue: newPhotoRefs.map(p => p.id).join(', '),
          deviceTimestamp: nowIso,
          serverTimestamp: nowIso,
          metadata: {
            photoCount: newPhotoRefs.length,
            photoIds: newPhotoRefs.map(p => p.id)
          }
        })
      );

      const updatedPhotos = [...(localContainer.photos || []), ...newPhotoRefs];
      const updated = {
        ...localContainer,
        photos: updatedPhotos,
        responsibleInspector: respResult.responsibleInspector,
        auditTimeline: appendTimelineEvents(localContainer.auditTimeline || [], events, { serverNow: nowIso })
      };
      setLocalContainer(updated);
      localContainerRef.current = updated;
      await onUpdateContainer(updated);

      // Analisa em segundo plano somente as fotos novas ou pendentes, usando o arquivo local já disponível
      triggerBackgroundSealRecognition(
        { ...updated, photos: [...(localContainer.photos || []), ...photosWithLocalFiles] }
      );
    } catch (error) {
      console.error("Error uploading photos in ContainerDetail:", error);
      alert(error.message || "Ocorreu um erro ao enviar/salvar as fotos no sistema.");
    }
  };

  // Remover Foto (Firestore + Firebase Storage)
  const handleDeletePhoto = (photoId) => {
    // Remove visualmente de imediato (otimista)
    const photo = (localContainer.photos || []).find(p => p.id === photoId);
    const updatedPhotos = (localContainer.photos || []).filter(p => p.id !== photoId);
    let updated = { ...localContainer, photos: updatedPhotos };
    try {
      const authActor = resolveAuthenticatedActor(user);
      const nowIso = new Date().toISOString();
      const delEv = createAuditEvent({
        action: 'photo_deleted',
        actor: authActor,
        clientId: clientId || localContainer.clientId || 'client_interport',
        bookingId: bookingId || localContainer.bookingId || '',
        containerId: localContainer.id,
        containerNumber: localContainer.containerNumber || localContainer.id,
        targetItem: photo?.name || photoId,
        oldValue: photoId,
        newValue: null,
        deviceTimestamp: nowIso,
        serverTimestamp: nowIso,
        metadata: { photoId }
      });
      updated = {
        ...updated,
        auditTimeline: appendTimelineEvents(localContainer.auditTimeline || [], [delEv], { serverNow: nowIso })
      };
    } catch {
      // fallback
    }
    setLocalContainer(updated);
    localContainerRef.current = updated;
    onUpdateContainer(updated);
    // Apaga do Firestore e do Storage em background
    db.deletePhoto(photoId, photo?.storagePath || null).catch(err => console.warn('deletePhoto error:', err));
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
    localContainerRef.current = updated;
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
    localContainerRef.current = updated;
    onUpdateContainer(updated);
  };

  const pendingReviews = getPendingDoubtfulSealReviews(localContainer);
  const recognitionStates = Object.values(localContainer.sealRecognitionState || {});
  const failedPhotosCount = recognitionStates.filter(s => s?.status === 'failed').length;
  const offlinePendingCount = recognitionStates.filter(s => s?.status === 'pending_offline').length;

  return (
    <>
    <FieldCaptureNotice container={localContainer} />
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
            <option value='20"/DV'>20"/DV</option>
            <option value='20"22G1'>20"22G1</option>
            <option value='40"/HC'>40"/HC</option>
            <option value='40"45G1'>40"45G1</option>
            <option value="40' Reefer">40' Reefer</option>
            <option value="20' Dry">20' Dry</option>
            <option value="40' Dry">40' Dry</option>
            <option value="40' HC">40' HC</option>
            {localContainer.containerType && !['20"/DV', '20"22G1', '40"/HC', '40"45G1', "40' Reefer", "20' Dry", "40' Dry", "40' HC"].includes(localContainer.containerType) && (
              <option value={localContainer.containerType}>{localContainer.containerType}</option>
            )}
          </select>
        </div>

        {/* Lacre Definitivo */}
        <div>
          <label>Lacre Definitivo</label>
          <input 
            type="text" 
            disabled={!canEdit}
            value={getSealText(localContainer.definiteSeal)} 
            onChange={e => handleChange('definiteSeal', e.target.value)}
            placeholder="Nº Lacre Definitivo"
          />
        </div>

        {/* Data Lacre Definitivo */}
        <div>
          <label>Data Lacre Definitivo</label>
          <input 
            type="date" 
            disabled={!canEdit}
            value={localContainer.definiteSealDate || ''} 
            onChange={e => handleChange('definiteSealDate', e.target.value)}
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
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

      </div>

      {/* Seção de Lacres Provisórios Múltiplos */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
          <label style={{ margin: 0 }}>Lacres Provisórios (Múltiplos)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {isRecognizingSeals && (
              <span style={{ fontSize: '11px', color: 'var(--color-brand)', display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: '600' }}>
                <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
                Reconhecendo lacres Interport nas fotos...
              </span>
            )}
            {!isRecognizingSeals && offlinePendingCount > 0 && (
              <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: '600' }}>
                ⏳ {offlinePendingCount} foto(s) aguardando conexão para leitura
              </span>
            )}
            {!isRecognizingSeals && failedPhotosCount > 0 && canEdit && (
              <button
                type="button"
                onClick={() => triggerBackgroundSealRecognition(localContainer, { retryFailed: true })}
                className="btn btn-secondary"
                style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid #f59e0b', color: '#f59e0b' }}
              >
                <RefreshCw size={11} /> Retentar leitura ({failedPhotosCount})
              </button>
            )}
            {!isRecognizingSeals && (localContainer.photos || []).length > 0 && canEdit && (
              <button
                type="button"
                onClick={() => triggerBackgroundSealRecognition(localContainer, { explicitReview: true, retryFailed: true })}
                className="btn btn-secondary"
                style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid var(--border-color)' }}
                title="Reanalisar todas as fotos vinculadas e revisar lacres (inclusive excluídos manualmente)"
              >
                <RefreshCw size={11} /> Revisar lacres das fotos
              </button>
            )}
          </div>
        </div>
        
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
          {(localContainer.provisionalSeals || []).map((seal, index) => {
            const sealText = getSealText(seal);
            const provInfo = localContainer.sealProvenance?.[String(sealText).toUpperCase()];
            const isAutoRecognized = provInfo && provInfo.source !== 'manual';
            return (
              <div 
                key={index}
                title={isAutoRecognized ? `Reconhecido automaticamente da foto (${(provInfo.photoIds || []).join(', ')})` : 'Inserido manualmente'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: isAutoRecognized ? '1px solid rgba(16, 185, 129, 0.45)' : '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                  fontWeight: '600'
                }}
              >
                <span>{sealText}</span>
                {isAutoRecognized && (
                  <span style={{
                    fontSize: '9px',
                    fontWeight: '800',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    color: '#10b981',
                    textTransform: 'uppercase'
                  }}>
                    AUTO
                  </span>
                )}
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
            );
          })}
          {(!localContainer.provisionalSeals || localContainer.provisionalSeals.length === 0) && (
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhum lacre provisório inserido.</span>
          )}
        </div>

        {/* Regra 6: Conferência de leitura incompleta ou duvidosa */}
        {pendingReviews.length > 0 && (
          <div style={{
            marginTop: '12px',
            padding: '12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(245, 158, 11, 0.5)',
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700', color: '#f59e0b' }}>
              <AlertTriangle size={14} />
              <span>Conferência de Lacre Provisório Interport ({pendingReviews.length})</span>
            </div>
            {pendingReviews.map(rev => {
              const photoIdx = (localContainer.photos || []).findIndex(p => String(p.id) === String(rev.photoId));
              const draftVal = reviewDrafts[rev.reviewKey] !== undefined ? reviewDrafts[rev.reviewKey] : rev.suggestedNumber;
              return (
                <div
                  key={rev.reviewKey}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                    padding: '8px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  {rev.photoUrl && (
                    <img
                      src={rev.photoUrl}
                      alt="Foto do lacre para conferência"
                      onClick={() => photoIdx >= 0 && setPreviewPhotoIndex(photoIdx)}
                      style={{
                        width: '52px',
                        height: '68px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                        cursor: photoIdx >= 0 ? 'pointer' : 'default',
                        border: '1px solid var(--border-color)'
                      }}
                      title="Clique para ampliar a foto original"
                    />
                  )}
                  <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{rev.reason}</div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        value={draftVal}
                        onChange={e => setReviewDrafts(prev => ({ ...prev, [rev.reviewKey]: e.target.value }))}
                        placeholder="Digite os dígitos do lacre (ex: 005745)..."
                        style={{
                          padding: '6px 10px',
                          fontSize: '13px',
                          fontWeight: '700',
                          maxWidth: '180px',
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleConfirmDoubtful(rev)}
                        className="btn btn-primary"
                        style={{ padding: '6px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Check size={13} /> Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismissDoubtful(rev)}
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <X size={13} /> Ignorar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
              <div 
                onClick={() => setPreviewPhotoIndex(index)}
                style={{
                  width: '120px',
                  height: '160px',
                  backgroundColor: '#000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  position: 'relative'
                }}
                title="Clique para ampliar"
              >
                <img 
                  src={photo.url} 
                  alt={photo.name} 
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain'
                  }}
                />
                <PhotoDownloadButton
                  photo={photo}
                  containerNumber={localContainer.number || localContainer.id}
                  index={index}
                  date={localContainer.date || localContainer.inspectionDate}
                  variant="thumbnail"
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
      
      {/* Linha do Tempo de Auditoria e Inspetor Responsável (Regras 2 e 4) */}
      <InspectionTimeline
        container={localContainer}
        user={user}
        collaborators={collaboratorOptions}
        onTransferResponsibility={async ({ newResponsibleUser, reason }) => {
          const res = transferContainerResponsibility({
            container: localContainerRef.current,
            authenticatedUser: user,
            newResponsibleUser,
            reason,
            clientId: clientId || localContainerRef.current.clientId || 'client_interport',
            bookingId: bookingId || localContainerRef.current.bookingId || ''
          });
          setLocalContainer(res.container);
          localContainerRef.current = res.container;
          if (bookingId && db.transferContainerResponsibility) {
            await db.transferContainerResponsibility(bookingId, localContainer.id, {
              authenticatedUser: user,
              newResponsibleUser,
              reason
            }).catch(() => onUpdateContainer(res.container));
          } else {
            onUpdateContainer(res.container);
          }
        }}
      />

      {/* Visualizador de Foto Ampliada (Google Fotos) */}
      {previewPhotoIndex !== null && localContainer.photos?.[previewPhotoIndex] && (
        <PhotoEnlargedModal
          photo={localContainer.photos[previewPhotoIndex]}
          photos={localContainer.photos}
          currentIndex={previewPhotoIndex}
          containerNumber={localContainer.number || localContainer.id}
          date={localContainer.date || localContainer.inspectionDate}
          onClose={() => setPreviewPhotoIndex(null)}
          onNavigate={(newIdx) => setPreviewPhotoIndex(newIdx)}
        />
      )}

    </div>
    </>
  );
}
