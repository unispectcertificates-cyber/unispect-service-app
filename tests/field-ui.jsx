import { createRoot } from 'react-dom/client';
import '../src/index.css';
import FieldCapturePanel from '../src/components/FieldCapturePanel';
import { fieldQueue } from '../src/utils/fieldQueue';
window.testFieldQueue = fieldQueue;
createRoot(document.getElementById('root')).render(<div style={{ padding: '16px' }}><h1>Modo Campo</h1><FieldCapturePanel user={{ id: 'test', name: 'Inspetor de teste', role: 'Inspector' }} bookings={[]} /></div>);
