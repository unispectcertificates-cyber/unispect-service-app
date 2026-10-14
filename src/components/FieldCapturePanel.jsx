import { useEffect, useRef, useState } from 'react';
import { Camera, Image, X, Save, RefreshCw, PackagePlus, Trash2, AlertTriangle } from 'lucide-react';
import { fieldQueue } from '../utils/fieldQueue';
import { fieldSyncState, subscribePendingFieldContainers, syncFieldNow, deleteFieldContainer } from '../utils/fieldService';
import { findFieldTarget, mergePhotos, validateFieldCapture } from '../utils/fieldContainers';
import { normalizeContainerNumber } from '../utils/containerIdentity';
import { generateUUID } from '../utils/uuid';
import PhotoDownloadButton from './PhotoDownloadButton';

const sealText = seal => typeof seal === 'string' ? seal : (seal?.sealNumber || seal?.seal || seal?.number || '');
const inputStyle = { width: '100%', minHeight: '48px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-secondary)' };
const buttonStyle = { minHeight: '48px', justifyContent: 'center', padding: '12px 16px' };

function SavedPhoto({ photo, containerNumber = '', index = 0 }) {
  const [localUrl, setLocalUrl] = useState('');
  useEffect(() => {
    if (photo.url) return;
    let active = true;
    let url;
    fieldQueue.getPhoto(photo.id).then(record => {
      if (!active || !record?.blob) return;
      url = URL.createObjectURL(record.blob); setLocalUrl(url);
    }).catch(() => {});
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [photo.id, photo.url]);
  const url = photo.url || localUrl;
  return (
    <div style={{ position: 'relative', width: '100%', height: '90px' }}>
      {url ? (
        <img src={url} alt="Foto já cadastrada do container" loading="lazy" style={{ width: '100%', height: '90px', objectFit: 'cover', borderRadius: '6px' }} />
      ) : (
        <div style={{ width: '100%', height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', borderRadius: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
          Foto salva
        </div>
      )}
      <PhotoDownloadButton
        photo={photo}
        containerNumber={containerNumber}
        index={index}
        variant="thumbnail"
        style={{ top: '2px', right: '2px' }}
      />
    </div>
  );
}

const checkIsDevice = () => {
  if (typeof window === 'undefined') return false;
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  const matchesMedia = window.matchMedia('(max-width: 1024px)').matches;
  const isTouchTablet = (navigator.maxTouchPoints > 0 && window.innerWidth <= 1366);
  return isMobileUA || matchesMedia || isTouchTablet;
};

export default function FieldCapturePanel({ user, bookings, initialCapture, onClearInitialCapture }) {
  const [isDevice, setIsDevice] = useState(checkIsDevice);
  const [drafts, setDrafts] = useState([]);
  const [operations, setOperations] = useState([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [remoteRecords, setRemoteRecords] = useState([]);
  const [syncState, setSyncState] = useState(fieldSyncState);
  const [storageError, setStorageError] = useState('');
  const [remoteError, setRemoteError] = useState('');
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [tara, setTara] = useState('');
  const [sealType, setSealType] = useState('definitive');
  const [sealNumber, setSealNumber] = useState('');
  const [context, setContext] = useState(null);
  const [newPhotos, setNewPhotos] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showPending, setShowPending] = useState(false);
  const [deleteConfirmRecord, setDeleteConfirmRecord] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteModalError, setDeleteModalError] = useState('');
  const urls = useRef(new Set());
  const savingRef = useRef(false);
  const camera = useRef(null);
  const gallery = useRef(null);
  const userRole = String(user?.role || '').trim().toUpperCase();
  const canCapture = userRole === 'ADM' || userRole === 'INSPECTOR';

  const canDeleteRecord = (record) => {
    if (userRole === 'ADM') return true;
    const actor = record?.remote?.container?.fieldCapture?.actor || record?.draft?.actor || record?.actor;
    if (!actor) return false;
    const currentId = String(user?.id || '');
    const currentName = String(user?.name || user?.username || '').trim().toLowerCase();
    const currentLogin = String(user?.login || '').trim().toLowerCase();
    return Boolean(
      (currentId && actor.id && String(actor.id) === currentId) ||
      (currentName && actor.name && String(actor.name).trim().toLowerCase() === currentName) ||
      (currentLogin && actor.login && String(actor.login).trim().toLowerCase() === currentLogin)
    );
  };

  const handleRequestDelete = (record, e) => {
    if (e) e.stopPropagation();
    if (!canDeleteRecord(record)) {
      alert('Permissão negada. Apenas o inspetor que cadastrou ou um administrador pode excluir este container.');
      return;
    }
    setDeleteModalError('');
    setDeleteConfirmRecord(record);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmRecord) return;
    setIsDeleting(true);
    setDeleteModalError('');
    const targetNumber = deleteConfirmRecord.number;
    const sourceContainerId = deleteConfirmRecord.sourceContainerId || deleteConfirmRecord.remote?.sourceContainerId || deleteConfirmRecord.draft?.sourceContainerId;
    const isOnline = navigator.onLine;

    try {
      if (!isOnline) {
        if (deleteConfirmRecord.remote || deleteConfirmRecord.draft?.remoteStatus === 'pending') {
          await fieldQueue.enqueueDeletion(targetNumber, sourceContainerId, user);
          setMessage(`Exclusão de ${targetNumber} salva no aparelho. Sincronizará quando o sinal voltar.`);
        } else {
          await fieldQueue.deleteLocal(targetNumber);
          setMessage(`Container ${targetNumber} e fotos locais removidos do aparelho.`);
        }
      } else {
        if (deleteConfirmRecord.remote || deleteConfirmRecord.draft?.remoteStatus === 'pending') {
          await deleteFieldContainer(targetNumber, user);
          setMessage(`Container ${targetNumber} e suas fotos foram excluídos com sucesso.`);
        } else {
          await fieldQueue.deleteLocal(targetNumber);
          setMessage(`Container ${targetNumber} e fotos locais removidos com sucesso.`);
        }
      }

      setDeleteConfirmRecord(null);
      if (open && number === targetNumber) {
        releasePhotos();
        setOpen(false);
      }
      setTimeout(() => setMessage(''), 6000);
    } catch (err) {
      console.error('Erro ao excluir container:', err);
      setDeleteModalError(err.message || 'Erro ao excluir o container.');
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    const resize = () => setIsDevice(checkIsDevice());
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    if (!isDevice || !canCapture) return;
    let active = true;
    const refresh = () => Promise.all([fieldQueue.listDrafts(), fieldQueue.listOperations()]).then(([local, jobs]) => {
      if (active) { setDrafts(local); setOperations(jobs); setStorageError(''); setQueueLoaded(true); }
    }).catch(() => { if (active) setStorageError('Não foi possível acessar o armazenamento do aparelho. O salvamento precisa ser verificado.'); });
    const state = () => { if (active) setSyncState(fieldSyncState); };
    const stop = subscribePendingFieldContainers(records => { if (active) { setRemoteRecords(records); setRemoteError(''); } },
      () => { if (active) setRemoteError('Não foi possível consultar os registros enviados. Os registros locais continuam disponíveis; confira a conexão e as permissões.'); });
    refresh();
    window.addEventListener('unispect-field-change', refresh);
    window.addEventListener('unispect-field-sync', state);
    return () => { active = false; stop(); window.removeEventListener('unispect-field-change', refresh); window.removeEventListener('unispect-field-sync', state); };
  }, [isDevice, canCapture]);
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url); }, []);

  const releasePhotos = () => { for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear(); setNewPhotos([]); };
  const lookup = value => {
    setNumber(value.toUpperCase()); setError('');
    const key = normalizeContainerNumber(value);
    if (!/^[A-Z]{4}\d{7}$/.test(key)) { setContext(null); setTara(''); setSealNumber(''); return; }
    const local = drafts.find(d => d.number === key);
    const remote = remoteRecords.find(record => record.id === key);
    let booked;
    try { booked = findFieldTarget(bookings, key); }
    catch (problem) { setError(problem.message); setContext(null); return; }
    if (local?.remoteStatus === 'linked' && !booked && !remote) {
      setError('Este registro já foi vinculado a um Booking que não está ativo. Peça ao administrador para revisar antes de iniciar outra operação.'); setContext(null); return;
    }
    const container = remote?.container || booked?.container;
    const fields = remote ? {
      tara: container.tara, sealType: container.definiteSeal ? 'definitive' : 'provisional',
      sealNumber: sealText(container.definiteSeal || container.provisionalSeals?.[0])
    } : local?.fields || (container ? {
      tara: container.tara, sealType: container.definiteSeal ? 'definitive' : 'provisional',
      sealNumber: sealText(container.definiteSeal || container.provisionalSeals?.[0])
    } : {});
    setTara(prev => fields.tara || prev || ''); setSealType(fields.sealType || 'definitive'); setSealNumber(fields.sealNumber || '');
    setContext({ exists: Boolean(local || remote || booked), sourceContainerId: remote?.sourceContainerId || local?.sourceContainerId,
      photos: mergePhotos(container?.photos, local?.photos), status: booked ? 'linked' : 'pending',
      lockedTara: Boolean(fields.tara), lockedSeal: Boolean(fields.sealNumber), booking: booked?.booking });
  };

  useEffect(() => {
    if (!initialCapture) return;
    const targetNum = initialCapture.number || '';
    releasePhotos();
    setNumber(targetNum);
    setSealType('definitive');
    setSealNumber('');
    setError('');

    if (initialCapture.photoFile) {
      const url = initialCapture.photoUrl || URL.createObjectURL(initialCapture.photoFile);
      urls.current.add(url);
      setNewPhotos([{ id: generateUUID(), file: initialCapture.photoFile, url }]);
    } else {
      setNewPhotos([]);
    }

    if (targetNum) {
      lookup(targetNum);
    }
    if (initialCapture.tara) {
      setTara(initialCapture.tara);
    }

    setOpen(true);
    if (onClearInitialCapture) {
      onClearInitialCapture();
    }
  }, [initialCapture]);

  const openForm = (value = '') => {
    releasePhotos(); setNumber(''); setTara(''); setSealType('definitive'); setSealNumber(''); setContext(null); setError(''); setOpen(true);
    if (value) lookup(value);
  };
  const openPendingRecord = event => openForm(event.currentTarget.dataset.containerNumber);
  const close = () => {
    if (savingRef.current) return;
    if (newPhotos.length && !window.confirm('Sair sem salvar estas novas fotos?')) return;
    releasePhotos(); setOpen(false);
  };
  const addPhotos = event => {
    const files = [...(event.target.files || [])]; event.target.value = '';
    if (savingRef.current) return;
    if (newPhotos.length + files.length > 100) { setError('Salve até 100 fotos por vez. Você pode acrescentar outras depois.'); return; }
    if (files.some(file => !file.type.startsWith('image/'))) { setError('Selecione apenas arquivos de imagem.'); return; }
    const added = files.map(file => { const url = URL.createObjectURL(file); urls.current.add(url); return { id: generateUUID(), file, url }; });
    setNewPhotos(previous => [...previous, ...added]); setError('');
  };
  const save = async event => {
    event.preventDefault();
    if (savingRef.current) return;
    try {
      if (!context) throw new Error('Confira o número completo do container antes de continuar.');
      validateFieldCapture({ containerNumber: number, tara, sealType, sealNumber }, newPhotos.length);
      savingRef.current = true; setSaving(true); setError('');
      await fieldQueue.save({ containerNumber: number, tara, sealType, sealNumber }, newPhotos.map(p => p.file),
        { id: user.id || '', name: user.name || '' }, context);
      // Return to the main screen immediately after local commit; uploads run independently.
      releasePhotos(); setOpen(false); setMessage(`✓ ${normalizeContainerNumber(number)} salvo no aparelho. ${navigator.onLine ? 'Envio iniciado em segundo plano.' : 'Aguardando sinal para enviar automaticamente.'}`);
      syncFieldNow();
    } catch (problem) { setError(problem.name === 'QuotaExceededError' ? 'O aparelho está sem espaço para salvar as fotos. A tela foi mantida aberta; libere espaço e tente novamente.' : problem.message || 'Não foi possível salvar no aparelho. As fotos continuam nesta tela.'); }
    finally { savingRef.current = false; setSaving(false); }
  };

  if (!isDevice || !canCapture) return null;
  const merged = new Map(remoteRecords.map(record => [record.id, { number: record.id, remote: record }]));
  for (const draft of drafts) {
    const linked = bookings.some(booking => (booking.containers || []).some(container => container.id === draft.sourceContainerId || container.fieldPhotoSourceIds?.includes(draft.sourceContainerId)));
    if (draft.pendingOperationIds.length || (!linked && draft.remoteStatus === 'pending')) merged.set(draft.number, { ...merged.get(draft.number), number: draft.number, draft });
  }
  const records = [...merged.values()];
  const pendingPhotos = operations.reduce((sum, operation) => sum + operation.photoIds.length, 0);
  const pendingContainers = new Set(operations.map(operation => operation.number)).size;
  return <section style={{ display: 'grid', gap: '10px' }}>
    <button type="button" className="btn btn-primary" style={{ ...buttonStyle, width: '100%', fontSize: '16px', fontWeight: '800' }} onClick={() => openForm()}><PackagePlus size={22} /> Inserir container sem Booking</button>
    <div aria-live="polite" style={{ fontSize: '12px' }}>
      {message && <p style={{ color: '#059669' }}>{message}</p>}
      {!queueLoaded ? <p>Conferindo registros salvos no aparelho…</p> : operations.length > 0 ? <p>{syncState.syncing ? `Enviando ${syncState.number || ''}…` : navigator.onLine ? 'Aguardando envio automático.' : 'Sem sinal. Registros salvos no aparelho.'} {pendingContainers} container(s) e {pendingPhotos} foto(s) na fila.</p> : !storageError && <p>Todos os registros locais foram enviados.</p>}
      {(storageError || remoteError || syncState.error) && <p role="alert">{storageError || remoteError || syncState.error}</p>}
      {operations.some(job => job.error) && <p role="alert">Alguns envios precisam de atenção: {operations.find(job => job.error)?.error} As fotos continuam no aparelho.</p>}
    </div>
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-secondary" onClick={() => setShowPending(!showPending)}>Containers sem Booking / envios pendentes ({records.length})</button>
      {operations.length > 0 && <button type="button" className="btn btn-secondary" onClick={syncFieldNow}><RefreshCw size={16} /> Tentar enviar agora</button>}
    </div>
    {showPending && records.map(record => {
      const isDeletingPending = record.draft?.pendingDeletion;
      const canDel = canDeleteRecord(record);
      return (
        <div key={record.number} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            data-container-number={record.number}
            type="button"
            className="btn btn-secondary"
            style={{ flex: 1, justifyContent: 'space-between', minHeight: '48px' }}
            onClick={openPendingRecord}
            disabled={isDeletingPending}
          >
            <strong>{record.number}</strong>
            <span style={{ fontSize: '12px', color: isDeletingPending ? '#ef4444' : undefined, fontWeight: isDeletingPending ? '700' : undefined }}>
              {isDeletingPending
                ? 'Exclusão pendente de sincronização'
                : record.draft?.pendingOperationIds?.length
                ? 'Aguardando envio'
                : 'Enviado · aguardando Booking'}
            </span>
          </button>
          {!isDeletingPending && canDel && (
            <button
              type="button"
              className="btn btn-danger"
              style={{ minHeight: '48px', padding: '0 12px' }}
              onClick={e => handleRequestDelete(record, e)}
              title="Excluir container sem Booking"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      );
    })}
    {open && <div role="dialog" aria-modal="true" aria-labelledby="field-capture-title" style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'var(--bg-primary)', overflowY: 'auto', padding: 'max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom))' }}>
      <form onSubmit={save} style={{ maxWidth: '700px', margin: '0 auto', display: 'grid', gap: '16px' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><h2 id="field-capture-title" style={{ fontSize: '20px' }}>Container sem Booking</h2><button type="button" aria-label="Voltar para a tela principal" disabled={saving} onClick={close} className="btn btn-secondary"><X /></button></header>
        <fieldset disabled={saving} style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: '16px', minWidth: 0 }}>
          <label>Número do container *<input autoFocus style={inputStyle} value={number} onChange={event => lookup(event.target.value)} disabled={newPhotos.length > 0} placeholder="ABCU1234567" autoCapitalize="characters" autoComplete="off" required /></label>
          {context?.exists && <p>Container já cadastrado. As novas fotos serão acrescentadas ao mesmo registro.{context.booking && ` Booking: ${context.booking.bookingNumber}.`}</p>}
          <label>Tara do container (kg) *<input style={inputStyle} value={tara} onChange={event => setTara(event.target.value)} inputMode="decimal" readOnly={context?.exists && context.lockedTara} required /></label>
          <label>Tipo de lacre *<select style={inputStyle} value={sealType} onChange={event => setSealType(event.target.value)} disabled={context?.exists && context.lockedSeal}><option value="definitive">Definitivo</option><option value="provisional">Provisório</option></select></label>
          <label>Número do lacre *<input style={inputStyle} value={sealNumber} onChange={event => setSealNumber(event.target.value)} readOnly={context?.exists && context.lockedSeal} autoCapitalize="characters" required /></label>
          {context?.photos.length > 0 && <div><strong>Fotos já cadastradas ({context.photos.length})</strong><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px', marginTop: '8px' }}>{context.photos.map((photo, idx) => <SavedPhoto key={photo.id || idx} photo={photo} containerNumber={number} index={idx} />)}</div></div>}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" style={buttonStyle} disabled={!context} onClick={() => camera.current.click()}><Camera /> Tirar foto</button>
            <button type="button" className="btn btn-secondary" style={buttonStyle} disabled={!context} onClick={() => gallery.current.click()}><Image /> Galeria</button>
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={addPhotos} />
            <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={addPhotos} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '10px' }}>{newPhotos.map(photo => <div key={photo.id} style={{ position: 'relative' }}>
            <img src={photo.url} alt="Nova foto para salvar" style={{ width: '100%', height: '110px', objectFit: 'cover', borderRadius: '8px' }} />
            <button type="button" aria-label="Remover esta foto antes de salvar" onClick={() => { URL.revokeObjectURL(photo.url); urls.current.delete(photo.url); setNewPhotos(previous => previous.filter(p => p.id !== photo.id)); }} style={{ position: 'absolute', right: '4px', top: '4px', padding: '6px', background: 'white', color: '#b91c1c', borderRadius: '6px' }}><X size={18} /></button>
          </div>)}</div>
          {error && <p role="alert" style={{ color: '#dc2626' }}>{error}</p>}
          <button type="submit" className="btn btn-primary" style={{ ...buttonStyle, width: '100%', fontSize: '17px', background: '#059669' }} disabled={saving || !context || !newPhotos.length}><Save /> {saving ? 'Salvando no aparelho…' : `Salvar${newPhotos.length ? ` (${newPhotos.length} foto${newPhotos.length > 1 ? 's' : ''})` : ''}`}</button>
          <p style={{ fontSize: '12px' }}>Ao salvar, você volta à tela principal. As fotos são enviadas automaticamente em segundo plano.</p>

          {context?.exists && !context.booking && (
            <button
              type="button"
              className="btn btn-danger"
              style={{ ...buttonStyle, width: '100%', fontSize: '15px', marginTop: '10px' }}
              disabled={saving}
              onClick={() => {
                const matchedRec = records.find(r => r.number === number) || {
                  number,
                  sourceContainerId: context.sourceContainerId,
                  remote: remoteRecords.find(r => r.id === number),
                  draft: drafts.find(d => d.number === number)
                };
                handleRequestDelete(matchedRec);
              }}
            >
              <Trash2 size={18} /> Excluir container sem Booking
            </button>
          )}
        </fieldset>
      </form>
    </div>}

    {deleteConfirmRecord && (
      <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div className="glass-panel" style={{ maxWidth: '440px', width: '100%', padding: '20px', backgroundColor: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'grid', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>Excluir container sem Booking?</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Confirmação de remoção</span>
            </div>
          </div>
          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px', fontSize: '13px', display: 'grid', gap: '4px' }}>
            <div>Container: <strong style={{ color: 'var(--color-brand)' }}>{deleteConfirmRecord.number}</strong></div>
            <div>Fotos: <strong>{(deleteConfirmRecord.remote?.container?.photos || deleteConfirmRecord.draft?.photos || []).length} foto(s)</strong></div>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: '#ef4444' }}>
            Atenção: Todos os dados desta conferência e as fotografias serão removidos em definitivo.
          </p>
          {deleteModalError && (
            <p role="alert" style={{ margin: 0, fontSize: '12px', color: '#ef4444' }}>{deleteModalError}</p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
            <button type="button" className="btn btn-secondary" disabled={isDeleting} onClick={() => setDeleteConfirmRecord(null)}>Cancelar</button>
            <button type="button" className="btn btn-danger" disabled={isDeleting} onClick={handleConfirmDelete} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {isDeleting ? <><RefreshCw size={14} className="rotating" /> Excluindo…</> : <><Trash2 size={14} /> Confirmar Exclusão</>}
            </button>
          </div>
        </div>
      </div>
    )}
  </section>;
}
