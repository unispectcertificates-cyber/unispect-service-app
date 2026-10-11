import { useEffect, useState } from 'react';
import { db } from '../db';

export default function BookingImportHistory({ bookingId }) {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let active = true;
    db.getBookingImportHistory(bookingId).then(rows => {
      if (active) setRecords(rows);
    }).catch(() => {
      if (active) setError('Não foi possível carregar o histórico. Verifique a conexão e as permissões.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, bookingId]);
  return <section style={{ padding: '16px', borderTop: '1px solid var(--border-color)' }}>
    <button type="button" className="btn btn-secondary" aria-expanded={open} onClick={() => {
      if (!open) { setLoading(true); setError(''); }
      setOpen(!open);
    }}>Histórico de importações</button>
    {open && <div aria-live="polite">
      {loading && <p>Carregando...</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && records.length === 0 && <p>Nenhuma importação registrada nesta versão.</p>}
      {!loading && !error && records.map(record => <article key={record.id} style={{ marginTop: '12px' }}>
        <strong>{new Date(record.createdAt).toLocaleString('pt-BR')} — {record.actor?.name || 'Usuário não informado'}</strong>
        <p>{record.sourceName}: {record.added.length} novo(s), {record.existing.length} já cadastrado(s), {record.repeated.length} repetição(ões). Total: {record.before} → {record.after}.</p>
        {record.added.length > 0 && <p>Inseridos: {record.added.join(', ')}</p>}
        {record.conflicts.length > 0 && <p>Divergências preservadas: {record.conflicts.map(item => item.number).join(', ')}</p>}
        {record.fieldLinked?.length > 0 && <p>Registros de campo vinculados automaticamente: {record.fieldLinked.map(item => item.number).join(', ')}</p>}
      </article>)}
    </div>}
  </section>;
}
