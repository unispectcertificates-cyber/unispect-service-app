export default function FieldCaptureNotice({ container }) {
  if (!container.fieldCapture) return null;
  return <aside style={{ padding: '12px', marginBottom: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '12px' }}>
    <p>Conferência de campo vinculada automaticamente. Inspetor: {container.fieldCapture.actor?.name || 'não informado'}.</p>
    {container.fieldCaptureConflicts?.map((item, index) => <p key={index}>
      Dado diferente informado no campo: {item.field === 'tara' ? 'tara (kg)' : 'lacre definitivo'} = {item.value}. O valor anterior do Booking foi mantido; confira antes de alterar.
    </p>)}
  </aside>;
}
