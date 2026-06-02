const fs = require('fs');

// --- Dashboard.jsx ---
let dash = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');
dash = dash.replace(/import \{ db \} from '\.\.\/db';/, "import { db, useBookings, useExportadores } from '../db';");
dash = dash.replace(/const \[bookings, setBookings\] = useState\(db\.getBookings\(\)\);/, "const bookings = useBookings();\n  const exportadores = useExportadores();");
dash = dash.replace(/const handleRefresh = \(\) => \{[\s\S]*?\}, 1000\);\n    \}\);\n  \};/, "const handleRefresh = () => { return new Promise((resolve) => { setTimeout(() => resolve(), 1000); }); };");
dash = dash.replace(/db\.getExportadores\(\)/g, "exportadores");
fs.writeFileSync('src/components/Dashboard.jsx', dash);

// --- BookingManager.jsx ---
let bm = fs.readFileSync('src/components/BookingManager.jsx', 'utf8');
bm = bm.replace(/import \{ db \} from '\.\.\/db';/, "import { db, useBookings, useLocais, useExportadores } from '../db';");
bm = bm.replace(/const \[bookings, setBookings\] = useState\(db\.getBookings\(\)\);/, "const bookings = useBookings();\n  const exportadores = useExportadores();\n  const locais = useLocais();");
bm = bm.replace(/const handleRefresh = \(\) => \{[\s\S]*?\}, 1000\);\n    \}\);\n  \};/, "const handleRefresh = () => { return new Promise((resolve) => { setTimeout(() => resolve(), 1000); }); };");
bm = bm.replace(/db\.deleteBooking\(id\);\n      setBookings\(db\.getBookings\(\)\);/, "await db.deleteBooking(id);");
bm = bm.replace(/const handleDelete = \(id, e\) => \{/, "const handleDelete = async (id, e) => {");
bm = bm.replace(/db\.getExportadores\(\)/g, "exportadores");
bm = bm.replace(/db\.getLocais\(\)/g, "locais");
fs.writeFileSync('src/components/BookingManager.jsx', bm);

// --- ReportView.jsx ---
let rv = fs.readFileSync('src/components/ReportView.jsx', 'utf8');
rv = rv.replace(/import \{ db \} from '\.\.\/db';/, "import { db, useLocais, useExportadores, useBookings } from '../db';");
rv = rv.replace(/const exporters = db\.getExportadores\(\);/, "const exporters = useExportadores();");
rv = rv.replace(/const locations = db\.getLocais\(\);/, "const locations = useLocais();\n  const bookings = useBookings();");
rv = rv.replace(/db\.getBookings\(\)/g, "bookings");
fs.writeFileSync('src/components/ReportView.jsx', rv);

// --- BookingDetail.jsx ---
let bd = fs.readFileSync('src/components/BookingDetail.jsx', 'utf8');
bd = bd.replace(/import \{ db \} from '\.\.\/db';/, "import { db, useBookings, useLocais, useExportadores } from '../db';");
const bdHooks = `
  const bookings = useBookings();
  const exporters = useExportadores();
  const locations = useLocais();
  const [prevBookingId, setPrevBookingId] = useState(bookingId);
  const [booking, setBooking] = useState(() => bookings.find(b => b.id === bookingId));

  useEffect(() => {
    const bk = bookings.find(b => b.id === bookingId);
    if (bk) setBooking(bk);
  }, [bookings, bookingId]);
`;
bd = bd.replace(/const \[prevBookingId, setPrevBookingId\] = useState\(bookingId\);\n[\s\S]*?const locations = db\.getLocais\(\);/, bdHooks);
bd = bd.replace(/db\.saveBooking\(/g, "await db.saveBooking(");
bd = bd.replace(/const updateBookingField = \(field, value\) => \{/, "const updateBookingField = async (field, value) => {");
fs.writeFileSync('src/components/BookingDetail.jsx', bd);

console.log('All components updated!');
