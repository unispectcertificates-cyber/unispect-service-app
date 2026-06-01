const LOCALS_KEY = 'containtrack_locais';
const EXPORTERS_KEY = 'containtrack_exportadores';
const BOOKINGS_KEY = 'containtrack_bookings';
const USER_KEY = 'containtrack_user';
const INSPECTORS_KEY = 'containtrack_inspectors';

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
        provisionalSeals: ['P-998811', 'P-998812'], // Múltiplos lacres provisórios
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

export const db = {
  init() {
    // Limpa dados antigos incompatíveis para forçar carregamento da nova estrutura
    const oldBookings = localStorage.getItem(BOOKINGS_KEY);
    if (oldBookings) {
      try {
        const parsed = JSON.parse(oldBookings);
        if (parsed.length > 0 && !Object.prototype.hasOwnProperty.call(parsed[0], 'mercadoria')) {
          localStorage.removeItem(BOOKINGS_KEY);
          localStorage.removeItem(LOCALS_KEY);
          localStorage.removeItem(EXPORTERS_KEY);
          localStorage.removeItem(USER_KEY);
        }
      } catch {
        localStorage.clear();
      }
    }

    if (!localStorage.getItem(LOCALS_KEY)) {
      localStorage.setItem(LOCALS_KEY, JSON.stringify(defaultLocais));
    }
    if (!localStorage.getItem(EXPORTERS_KEY)) {
      localStorage.setItem(EXPORTERS_KEY, JSON.stringify(defaultExportadores));
    }
    if (!localStorage.getItem(INSPECTORS_KEY)) {
      localStorage.setItem(INSPECTORS_KEY, JSON.stringify(defaultInspectors));
    }
    if (!localStorage.getItem(BOOKINGS_KEY)) {
      localStorage.setItem(BOOKINGS_KEY, JSON.stringify(defaultBookings));
    }
    if (!localStorage.getItem(USER_KEY)) {
      localStorage.setItem(USER_KEY, JSON.stringify({ role: 'ADM', username: 'Supervisor Admin' }));
    }
  },

  // Locais
  getLocais() {
    this.init();
    return JSON.parse(localStorage.getItem(LOCALS_KEY));
  },
  saveLocal(local) {
    const locais = this.getLocais();
    if (local.id) {
      const idx = locais.findIndex(l => l.id === local.id);
      if (idx !== -1) locais[idx] = local;
    } else {
      local.id = 'loc_' + Date.now();
      locais.push(local);
    }
    localStorage.setItem(LOCALS_KEY, JSON.stringify(locais));
    this.syncPush();
    return local;
  },
  deleteLocal(id) {
    const locais = this.getLocais().filter(l => l.id !== id);
    localStorage.setItem(LOCALS_KEY, JSON.stringify(locais));
    this.syncPush();
  },

  // Exportadores
  getExportadores() {
    this.init();
    return JSON.parse(localStorage.getItem(EXPORTERS_KEY));
  },
  saveExportador(exporter) {
    const exporters = this.getExportadores();
    if (exporter.id) {
      const idx = exporters.findIndex(e => e.id === exporter.id);
      if (idx !== -1) exporters[idx] = exporter;
    } else {
      exporter.id = 'exp_' + Date.now();
      exporters.push(exporter);
    }
    localStorage.setItem(EXPORTERS_KEY, JSON.stringify(exporters));
    this.syncPush();
    return exporter;
  },
  deleteExportador(id) {
    const exporters = this.getExportadores().filter(e => e.id !== id);
    localStorage.setItem(EXPORTERS_KEY, JSON.stringify(exporters));
    this.syncPush();
  },

  // Inspetores
  getInspectors() {
    this.init();
    return JSON.parse(localStorage.getItem(INSPECTORS_KEY)) || defaultInspectors;
  },
  saveInspector(inspector) {
    const inspectors = this.getInspectors();
    if (inspector.id) {
      const idx = inspectors.findIndex(i => i.id === inspector.id);
      if (idx !== -1) inspectors[idx] = inspector;
    } else {
      inspector.id = 'ins_' + Date.now();
      inspectors.push(inspector);
    }
    localStorage.setItem(INSPECTORS_KEY, JSON.stringify(inspectors));
    this.syncPush();
    return inspector;
  },
  deleteInspector(id) {
    const inspectors = this.getInspectors().filter(i => i.id !== id);
    localStorage.setItem(INSPECTORS_KEY, JSON.stringify(inspectors));
    this.syncPush();
  },

  // Bookings
  getBookings() {
    this.init();
    return JSON.parse(localStorage.getItem(BOOKINGS_KEY));
  },
  saveBooking(booking) {
    const bookings = this.getBookings();
    if (booking.id) {
      const idx = bookings.findIndex(b => b.id === booking.id);
      if (idx !== -1) bookings[idx] = booking;
    } else {
      booking.id = 'bk_' + Date.now();
      booking.certificateNumber = this.generateNextCertificateNumber(bookings);
      booking.containers = booking.containers || [];
      bookings.push(booking);
    }
    localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
    this.syncPush();
    return booking;
  },
  deleteBooking(id) {
    const bookings = this.getBookings().filter(b => b.id !== id);
    localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
    this.syncPush();
  },
  generateNextCertificateNumber(bookingsList) {
    const list = bookingsList || this.getBookings();
    let maxNum = 999;
    list.forEach(b => {
      const match = b.certificateNumber.match(/^UN(\d+)\/2026$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    return `UN${maxNum + 1}/2026`;
  },

  // Perfil ativo
  getUser() {
    this.init();
    return JSON.parse(localStorage.getItem(USER_KEY));
  },
  setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  getServerUrl() {
    const savedIp = localStorage.getItem('containtrack_server_ip');
    if (savedIp) {
      const base = savedIp.includes('://') ? savedIp : `http://${savedIp}:3000`;
      return `${base}/api/data`;
    }
    return '/api/data';
  },

  async uploadPhoto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result;
        const extension = file.name.split('.').pop() || 'jpg';
        const filename = `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${extension}`;
        
        try {
          const savedIp = localStorage.getItem('containtrack_server_ip');
          let urlPath = '/api/upload';
          if (savedIp) {
            const base = savedIp.includes('://') ? savedIp : `http://${savedIp}:3000`;
            urlPath = `${base}/api/upload`;
          }
          const response = await fetch(urlPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, base64 })
          });
          
          if (!response.ok) {
            throw new Error('Upload failed');
          }
          
          const result = await response.json();
          // Normalize URL to relative path to allow proxying and prevent port 3000 firewall blocks
          const relativeUrl = result.url.replace(/^https?:\/\/[^/]+/, '');
          resolve(relativeUrl);
        } catch (error) {
          console.warn("Upload server offline, falling back to base64", error);
          resolve(base64);
        }
      };
      reader.onerror = () => {
        reject(new Error('File reading failed'));
      };
      reader.readAsDataURL(file);
    });
  },

  async syncPull() {
    try {
      const response = await fetch(this.getServerUrl());
      if (!response.ok) return false;
      const data = await response.json();
      
      const oldBookings = localStorage.getItem(BOOKINGS_KEY);
      const newBookings = JSON.stringify(data.bookings || []);
      const hasChanged = oldBookings !== newBookings;
      
      if (data.bookings) localStorage.setItem(BOOKINGS_KEY, newBookings);
      if (data.locais) localStorage.setItem(LOCALS_KEY, JSON.stringify(data.locais));
      if (data.exportadores) localStorage.setItem(EXPORTERS_KEY, JSON.stringify(data.exportadores));
      if (data.inspectors) localStorage.setItem(INSPECTORS_KEY, JSON.stringify(data.inspectors));
      
      return hasChanged;
    } catch {
      return false;
    }
  },

  async syncPush() {
    try {
      const payload = {
        bookings: JSON.parse(localStorage.getItem(BOOKINGS_KEY)) || [],
        locais: JSON.parse(localStorage.getItem(LOCALS_KEY)) || [],
        exportadores: JSON.parse(localStorage.getItem(EXPORTERS_KEY)) || [],
        inspectors: JSON.parse(localStorage.getItem(INSPECTORS_KEY)) || []
      };

      await fetch(this.getServerUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch {
      // Ignora erro se o servidor estiver offline
    }
  }
};
