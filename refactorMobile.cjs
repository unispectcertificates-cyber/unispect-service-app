const fs = require('fs');
let content = fs.readFileSync('src/components/MobileAppView.jsx', 'utf8');

// Imports
content = content.replace(/import \{ db \} from '\.\.\/db';/, "import { db, useBookings, useExportadores, useLocais } from '../db';");

// State
content = content.replace(/const \[bookings, setBookings\] = useState\(\(\) => db\.getBookings\(\)\);/, "const bookings = useBookings();\n  const exportadores = useExportadores();\n  const locais = useLocais();");

// handleRefreshData
content = content.replace(/const handleRefreshData = useCallback\(\(\) => \{[\s\S]*?\}, \[selectedBooking, selectedContainer\]\);/, "const handleRefreshData = useCallback(() => {}, []);");

// useEffect poll
content = content.replace(/useEffect\(\(\) => \{[\s\S]*?const doPoll = async \(\) => \{[\s\S]*?return \(\) => clearInterval\(interval\);\n  \}, \[handleRefreshData\]\);/, "useEffect(() => {}, []);");

// Filter usage
content = content.replace(/db\.getExportadores\(\)\.find/g, 'exportadores.find');
content = content.replace(/db\.getLocais\(\)\.find/g, 'locais.find');

// Async actions
content = content.replace(/const handleUpdateContainerField = \(field, value\) => \{/, 'const handleUpdateContainerField = async (field, value) => {');
content = content.replace(/db\.saveBooking\(updatedBooking\);/, 'await db.saveBooking(updatedBooking);');
content = content.replace(/setBookings\(db\.getBookings\(\)\);/g, ''); // Not needed with hooks

fs.writeFileSync('src/components/MobileAppView.jsx', content);
console.log('MobileAppView.jsx updated!');
