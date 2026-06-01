/* global Buffer */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, 'db.json');
const PORT = 3000;

// Default Seed Data
const defaultLocais = [
  { id: '1', name: 'Interport Logistica' },
  { id: '2', name: 'Vila Velha Terminal' },
  { id: '3', name: 'ADV Armazéns Gerais' },
  { id: '4', name: 'Coopeavi – Santa Maria de Jetibá' },
  { id: '5', name: 'TPJ Exportação' }
];

const defaultExportadores = [
  { id: '1', name: 'Café Atlântica Exportadora Ltda', email: 'contato@cafeatlantica.com.br', phone: '(27) 3322-1100' },
  { id: '2', name: 'Tristão Companhia de Comércio Exterior', email: 'tristao@tristao.com.br', phone: '(27) 3200-5500' },
  { id: '3', name: 'Terra Forte Exportação de Café', email: 'terraforte@terraforte.com.br', phone: '(27) 3199-8800' }
];

const defaultInspectors = [
  { id: 'ins_1', name: 'Carlos Santos', email: 'carlos@unispect.com', phone: '(27) 99991-2233' },
  { id: 'ins_2', name: 'Marcos Oliveira', email: 'marcos@unispect.com', phone: '(27) 99882-3344' }
];

const defaultBookings = [
  {
    id: 'b1',
    certificateNumber: 'UN1000/2026',
    bookingNumber: 'BK-552091',
    exporterId: '1',
    startDate: '2026-05-28',
    vesselVoyage: 'MSC INGRID - 26A',
    bagsQuantity: 1250,
    locationId: '1',
    status: 'Finalizado',
    type: 'Container Stuffing Report',
    stuffingReportNumber: 'SR-998822',
    mercadoria: 'café',
    portoDestino: 'Porto de Roterdã',
    containers: [
      {
        id: 'c1',
        containerNumber: 'MSCU1234567',
        containerType: "40' HC",
        provisionalSeals: ['P-998811', 'P-998812'],
        definiteSeal: 'D-112233',
        fumigationDate: '2026-05-28',
        fitoDate: '2026-05-28',
        definiteSealDate: '2026-05-28',
        notes: 'Estufagem realizada com sucesso. Carga sem avarias.',
        photos: [
          { id: 'ph1', url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=400&h=300&q=80', name: 'Porta Aberta' },
          { id: 'ph2', url: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=400&h=300&q=80', name: 'Meio Lote' }
        ]
      }
    ]
  },
  {
    id: 'b2',
    certificateNumber: 'UN1001/2026',
    bookingNumber: 'BK-778210',
    exporterId: '2',
    startDate: '2026-05-29',
    vesselVoyage: 'MAERSK LIMA - 410B',
    bagsQuantity: 960,
    locationId: '3',
    status: 'Em andamento',
    type: 'Redex Operation Report',
    stuffingReportNumber: '',
    mercadoria: 'Pimenta Preta',
    portoDestino: 'Porto de Hamburgo',
    containers: [
      {
        id: 'c2',
        containerNumber: 'MRKU7766551',
        containerType: "20' Dry",
        provisionalSeals: ['P-443322'],
        definiteSeal: '',
        fumigationDate: '2026-05-29',
        fitoDate: '',
        definiteSealDate: '',
        notes: 'Em processo de fumigação.',
        photos: []
      }
    ]
  }
];

// Initialize db.json with seed data if it does not exist
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({
    bookings: defaultBookings,
    locais: defaultLocais,
    exportadores: defaultExportadores,
    inspectors: defaultInspectors
  }, null, 2));
}

const server = http.createServer((req, res) => {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Serve static uploads
  if (req.url.startsWith('/uploads/') && req.method === 'GET') {
    const pathname = req.url.split('?')[0];
    const filePath = path.join(__dirname, pathname);
    const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\))+/, '');
    if (!safePath.startsWith(path.join(__dirname, 'uploads'))) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Access Denied' }));
      return;
    }

    fs.access(safePath, fs.constants.F_OK, (err) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File Not Found' }));
        return;
      }

      let contentType = 'application/octet-stream';
      const ext = path.extname(safePath).toLowerCase();
      if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.gif') contentType = 'image/gif';
      else if (ext === '.webp') contentType = 'image/webp';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(safePath).pipe(res);
    });
    return;
  }

  if (req.url === '/api/upload' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const { filename, base64 } = parsed;
        if (!filename || !base64) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing filename or base64 data' }));
          return;
        }

        const matches = base64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
        let fileBuffer;
        if (matches && matches.length === 3) {
          fileBuffer = Buffer.from(matches[2], 'base64');
        } else {
          fileBuffer = Buffer.from(base64, 'base64');
        }

        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const filePath = path.join(uploadsDir, filename);
        fs.writeFile(filePath, fileBuffer, (err) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to write photo file' }));
            return;
          }

          const host = req.headers.host || 'localhost:3000';
          const url = `http://${host}/uploads/${filename}`;

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, url }));
        });
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  if (req.url === '/api/data' && req.method === 'GET') {
    fs.readFile(DB_FILE, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to read database file' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    });
  } else if (req.url === '/api/data' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        fs.writeFile(DB_FILE, JSON.stringify(parsed, null, 2), 'utf8', (err) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to write database file' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Route Not Found' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Unispect Sync Server is running on port ${PORT}`);
});
