const fs = require('fs');
let content = fs.readFileSync('src/components/BookingManagementModal.jsx', 'utf8');

// Imports
content = content.replace(/import \{ db \} from '\.\.\/db';/, "import { db, useBookings, useInspectors, useLocais, useExportadores } from '../db';\nimport { useEffect } from 'react';");

// Hooks
const hooksReplacement = `
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

  useEffect(() => {
    const bk = bookings.find(b => b.id === bookingId);
    if (bk) {
      setBooking(bk);
      setSelectedInspectorId(bk.inspectorId || '');
    }
  }, [bookings, bookingId]);
`;

// Replace state setup
content = content.replace(/const \[prevBookingId, setPrevBookingId\] = useState\(bookingId\);\n[\s\S]*?const inspectors = db\.getInspectors\(\);/m, hooksReplacement);

// Async handles
content = content.replace(/const handleInspectorChange = \(e\) => \{/, 'const handleInspectorChange = async (e) => {');
content = content.replace(/const handleSaveContainer = \(e\) => \{/, 'const handleSaveContainer = async (e) => {');
content = content.replace(/const handleDeleteContainer = \(contId\) => \{/, 'const handleDeleteContainer = async (contId) => {');
content = content.replace(/const handleUpdateContainerPhotos = \(updatedCont\) => \{/, 'const handleUpdateContainerPhotos = async (updatedCont) => {');

// Update db.saveBooking calls
content = content.replace(/db\.saveBooking\(/g, 'await db.saveBooking(');

// exportadores and locais
content = content.replace(/db\.getExportadores\(\)/g, 'exportadores');
content = content.replace(/db\.getLocais\(\)/g, 'locais');

fs.writeFileSync('src/components/BookingManagementModal.jsx', content);
console.log('BookingManagementModal.jsx updated!');
