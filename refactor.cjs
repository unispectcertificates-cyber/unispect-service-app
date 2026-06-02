const fs = require('fs');
let content = fs.readFileSync('src/App.jsx', 'utf8');

// Imports
content = content.replace(/import \{ db \} from '\.\/db';/, "import { db, useBookings, useLocais, useExportadores } from './db';");

// State
content = content.replace(/const \[bookings, setBookings\] = useState\(db\.getBookings\(\)\);/, "const bookings = useBookings();\n  const exportadores = useExportadores();\n  const locais = useLocais();");

// Remove doSync and interval
content = content.replace(/const doSync = async \(\) => \{[\s\S]*?const interval = setInterval\(doSync, 3000\);/, "// Sincronização via Firebase");
content = content.replace(/clearInterval\(interval\);\n/g, '');

// handleRefreshData
content = content.replace(/const handleRefreshData = \(\) => \{\n    setBookings\(db\.getBookings\(\)\);\n  \};/, "const handleRefreshData = () => {};");

// Filter usage
content = content.replace(/db\.getExportadores\(\)\.find/g, 'exportadores.find');
content = content.replace(/db\.getLocais\(\)\.find/g, 'locais.find');

// PdfUpload await
content = content.replace(/const exporters = db\.getExportadores\(\);/g, 'const exporters = await db.getExportadores();');
content = content.replace(/const locais = db\.getLocais\(\);/g, 'const locais = await db.getLocais();');

// Form mapping
content = content.replace(/\{db\.getExportadores\(\)\.map/g, '{exportadores.map');
content = content.replace(/\{db\.getLocais\(\)\.map/g, '{locais.map');

// Async handles
content = content.replace(/const handleCreateBooking = \(e\) => \{/, 'const handleCreateBooking = async (e) => {');
content = content.replace(/const created = db\.saveBooking/, 'const created = await db.saveBooking');

content = content.replace(/const handleFinalizeBooking = \(id, e\) => \{/, 'const handleFinalizeBooking = async (id, e) => {');
content = content.replace(/db\.saveBooking\(bk\);/, 'await db.saveBooking(bk);');

content = content.replace(/const handleDeleteBooking = \(id, e\) => \{/, 'const handleDeleteBooking = async (id, e) => {');
content = content.replace(/db\.deleteBooking\(id\);/, 'await db.deleteBooking(id);');

// Handle db.generateNextCertificateNumber - wait, it is inside the form state rendering, which is sync!
// In the JSX: <input value={db.generateNextCertificateNumber()} />
// We can't use await here! We should remove the auto-generation from the input rendering, or store it in state!
// Since db.generateNextCertificateNumber() is now async, let's just show "Auto gerado ao salvar" in the input.
content = content.replace(/value=\{db\.generateNextCertificateNumber\(bookings\)\}/, 'value="Gerado Automaticamente"');

fs.writeFileSync('src/App.jsx', content);
console.log('App.jsx updated!');
