import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, ShieldAlert, Hourglass, CheckCircle2, X, Menu, Trash2, UploadCloud, Users, Settings, Camera, RefreshCw, Plus } from 'lucide-react';
import { db, useBookings, useLocais, useExportadores } from './db';
import BookingManagementModal from './components/BookingManagementModal';
import ExportadoresList from './components/ExportadoresList';
import LocaisList from './components/LocaisList';
import InspectorsList from './components/InspectorsList';
import ReportView from './components/ReportView';
import MobileAppView from './components/MobileAppView';

export default function App() {
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(() => window.innerWidth <= 1024);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileOrTablet(window.innerWidth <= 1024);
    };
    window.addEventListener('resize', handleResize);

    // DEBUG: Global error handler to catch silent UI freezes
    const origError = window.onerror;
    window.onerror = function (msg, url, line, col, error) {
      alert("ERRO NO SISTEMA: " + msg + "\nLinha: " + line);
      if (origError) return origError(msg, url, line, col, error);
      return false;
    };
    const origUnhandled = window.onunhandledrejection;
    window.onunhandledrejection = function (event) {
      alert("ERRO ASSÍNCRONO: " + (event.reason ? event.reason.message || event.reason : 'Unknown'));
      if (origUnhandled) return origUnhandled(event);
    };

    return () => {
      window.removeEventListener('resize', handleResize);
      window.onerror = origError;
      window.onunhandledrejection = origUnhandled;
    };
  }, []);

  const [currentTab, setCurrentTab] = useState(() => {
    const isMobile = window.innerWidth <= 1024;
    const usr = db.getUser();
    if (isMobile && (usr.role === 'Inspector' || usr.role === 'ADM')) {
      return 'field-portal';
    }
    return 'bookings';
  });
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [activeReport, setActiveReport] = useState(null); // { id, type }
  const [user, setUser] = useState(db.getUser());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [serverIp, setServerIp] = useState(localStorage.getItem('containtrack_server_ip') || '');
  const bookings = useBookings();
  const exportadores = useExportadores();
  const locais = useLocais();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');

  // Modais e Menu Dropdown
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Form de Novo Booking/Certificado
  const [newBookingData, setNewBookingData] = useState({
    bookingNumber: '',
    exporterId: '',
    startDate: new Date().toISOString().split('T')[0],
    vesselVoyage: '',
    vesselName: '',
    vesselVoyageNum: '',
    bagsQuantity: '',
    locationId: '',
    status: 'Pendente',
    type: 'Redex Operation Report',
    stuffingReportNumber: '',
    mercadoria: 'café',
    portoDestino: '',
    armador: '',
    embalagem: 'sacaria',
    containers: []
  });

  // PDF parsing state
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [pdfParseStatus, setPdfParseStatus] = useState(null); // 'success' | 'error' | null
  const [pdfParseMessage, setPdfParseMessage] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    // Fechar menu ao clicar fora
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    // Sincronização periódica em background (Polling leve de 3 segundos)
    // Sincronização via Firebase

    // Detecção automática de conexão online/offline
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRefreshData = () => { };

  // Estatísticas operacionais dos Bookings
  const countPendentes = bookings.filter(b => b.status === 'Pendente').length;
  const countAndamento = bookings.filter(b => b.status === 'Em andamento').length;
  const countFinalizados = bookings.filter(b => b.status === 'Finalizado').length;

  // Filtragem dos Bookings
  const filteredBookings = bookings.filter(b => {
    const term = searchQuery.toLowerCase();
    const matchesSearch = term === '' ||
      b.certificateNumber.toLowerCase().includes(term) ||
      b.bookingNumber.toLowerCase().includes(term) ||
      (b.vesselVoyage || '').toLowerCase().includes(term) ||
      (exportadores.find(e => e.id === b.exporterId)?.name || '').toLowerCase().includes(term) ||
      (locais.find(l => l.id === b.locationId)?.name || '').toLowerCase().includes(term);

    const matchesStatus = statusFilter === 'Todos' || b.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Criar booking (Salvar)
  const handleCreateBooking = async (e) => {
    e.preventDefault();
    if (!newBookingData.bookingNumber || !newBookingData.exporterId || !newBookingData.locationId) {
      alert('Preencha os campos obrigatórios.');
      return;
    }

    const navioVoy = `${newBookingData.vesselName} V.${newBookingData.vesselVoyageNum}`;

    const created = await db.saveBooking({
      ...newBookingData,
      vesselVoyage: navioVoy,
      bagsQuantity: parseInt(newBookingData.bagsQuantity, 10) || 0,
      containers: newBookingData.containers || []
    });

    handleClearForm();
    setShowCreateModal(false);
    handleRefreshData();
    setSelectedBookingId(created.id);
  };

  const handleClearForm = () => {
    setNewBookingData({
      bookingNumber: '',
      exporterId: '',
      startDate: new Date().toISOString().split('T')[0],
      vesselVoyage: '',
      vesselName: '',
      vesselVoyageNum: '',
      bagsQuantity: '',
      locationId: '',
      status: 'Pendente',
      type: 'Redex Operation Report',
      stuffingReportNumber: '',
      mercadoria: 'café',
      portoDestino: '',
      armador: '',
      embalagem: 'sacaria',
      containers: []
    });
    setIsParsingPdf(false);
    setPdfParseStatus(null);
    setPdfParseMessage('');
    setIsDragOver(false);
  };

  const handleDiscardBookingCreation = () => {
    handleClearForm();
    setShowCreateModal(false);
  };

  const handleServerIpChange = (val) => {
    setServerIp(val);
    if (val.trim()) {
      localStorage.setItem('containtrack_server_ip', val.trim());
    } else {
      localStorage.removeItem('containtrack_server_ip');
    }
  };

  const handlePdfUpload = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      setPdfParseStatus('error');
      setPdfParseMessage('Por favor, envie apenas arquivos PDF.');
      return;
    }

    setIsParsingPdf(true);
    setPdfParseStatus(null);
    setPdfParseMessage('Lendo arquivo PDF...');

    try {
      const reader = new FileReader();

      const readAsArrayBuffer = (f) => new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(f);
      });

      const arrayBuffer = await readAsArrayBuffer(file);

      const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
      }

      // Normalize container types that might be split across spaces/slashes (e.g. 20" / DV, 40" / HC)
      fullText = fullText.replace(/\b(20|40)\s*["']?\s*[\s|]*\/\s*(DV|HC|Dry|Reefer|GP|HR)\b/gi, (match, p1, p2) => p1 + '"/' + p2);

      console.log('PDF Extracted Text:', fullText);

      // HEURISTIC REGEX PARSING

      // 1. Booking Number
      let bookingNumber = '';
      const bookingRegexes = [
        /(?:booking|reserva|reserva\s*n[oºª.]?)[^a-zA-Z0-9]*([A-Z0-9-]+)/i,
        /booking\s*number\s*([0-9A-Z-]+)/i,
        /reserva\s*([0-9A-Z-]+)/i
      ];
      for (const rx of bookingRegexes) {
        const match = fullText.match(rx);
        if (match && match[1]) {
          bookingNumber = match[1].trim();
          break;
        }
      }

      // 2. Vessel Name & Voyage
      let vesselName = '';
      let vesselVoyageNum = '';

      const vesselMatch = fullText.match(/(?:vessel|navio)[^a-zA-Z0-9]*([^\n\r]+)/i);
      if (vesselMatch && vesselMatch[1]) {
        let rawVessel = vesselMatch[1].trim();
        const stopKeywords = [
          /\bviagem\b/i, /\bvoyage\b/i, /\bv\./i, /\bvoy\b/i,
          /\bimportador\b/i, /\bexportador\b/i, /\bdestino\b/i,
          /\bquantidade\b/i, /\bmercadoria\b/i, /\barmador\b/i,
          /\bagente\b/i, /\brecinto\b/i
        ];
        for (const kw of stopKeywords) {
          const idx = rawVessel.search(kw);
          if (idx !== -1) {
            rawVessel = rawVessel.substring(0, idx).trim();
          }
        }
        vesselName = rawVessel.replace(/\s+/g, ' ').trim().replace(/[:\-.\s]+$/, '').trim();
      }

      const voyageRegexes = [
        /(?:voyage|viagem|voy|v\.)[^a-zA-Z0-9]*([A-Z0-9/]+)/i,
        /voy\s*([A-Z0-9/]+)/i
      ];
      for (const rx of voyageRegexes) {
        const match = fullText.match(rx);
        if (match && match[1]) {
          vesselVoyageNum = match[1].trim().toUpperCase();
          break;
        }
      }

      // 3. Exporter
      // 3. Exporter
      let exporterId = '';
      let exporterNameExtracted = '';
      const exporterMatch = fullText.match(/(?:exportador|exporter)[^a-zA-Z0-9]*([^\n\r]+)/i);
      if (exporterMatch && exporterMatch[1]) {
        let rawName = exporterMatch[1].trim();
        const stopKeywords = [
          /\bcnpj\b/i,
          /\bimportador\b/i,
          /\bdestino\b/i,
          /\barmador\b/i,
          /\bagente\b/i,
          /\brecinto\b/i,
          /\bquantidade\b/i,
          /\bmercadoria\b/i,
          /\bmarca\b/i
        ];
        for (const kw of stopKeywords) {
          const idx = rawName.search(kw);
          if (idx !== -1) {
            rawName = rawName.substring(0, idx).trim();
          }
        }
        exporterNameExtracted = rawName.replace(/\s+/g, ' ').trim().replace(/[:\-.\s]+$/, '').trim();
      }

      const exporters = db.getExportadores();
      if (exporterNameExtracted) {
        const exactMatch = exporters.find(exp => exp.name.toLowerCase() === exporterNameExtracted.toLowerCase());
        if (exactMatch) {
          exporterId = exactMatch.id;
        } else {
          const partialMatch = exporters.find(exp => {
            const expWords = exp.name.split(' ').filter(w => w.length > 4);
            return expWords.some(w => exporterNameExtracted.toLowerCase().includes(w.toLowerCase()));
          });
          if (partialMatch) {
            exporterId = partialMatch.id;
          } else {
            // Dynamically register new exporter
            const newExp = db.saveExportador({
              name: exporterNameExtracted,
              email: `${exporterNameExtracted.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`,
              phone: ''
            });
            exporterId = newExp.id;
          }
        }
      } else {
        const ignoreFallback = ['exportadora', 'companhia', 'comércio', 'comercio', 'exterior', 'ltda', 'ltda.', 's.a.', 'logistica', 'exportacao', 'importacao', 'agroindustrial', 'industria'];
        for (const exp of exporters) {
          if (fullText.toLowerCase().includes(exp.name.toLowerCase())) {
            exporterId = exp.id;
            break;
          }
          const signWords = exp.name.split(' ').filter(w => w.length > 4);
          if (signWords.some(w => fullText.toLowerCase().includes(w.toLowerCase()))) {
            exporterId = exp.id;
            break;
          }
        }
      }

      // 4. Location of Operation
      let locationId = '';
      const ignoreWordsLoc = ['logistica', 'terminal', 'armazéns', 'gerais', 'exportação'];

      for (const loc of locais) {
        if (fullText.toLowerCase().includes(loc.name.toLowerCase())) {
          locationId = loc.id;
          break;
        }
        const signWords = loc.name.split(' ').filter(w => w.length > 4 && !ignoreWordsLoc.includes(w.toLowerCase()));
        if (signWords.length > 0 && signWords.some(w => fullText.toLowerCase().includes(w.toLowerCase()))) {
          locationId = loc.id;
          break;
        }
      }
      if (!locationId && fullText.toLowerCase().includes('interport')) {
        const interportLoc = locais.find(l => l.name.toLowerCase().includes('interport'));
        if (interportLoc) {
          locationId = interportLoc.id;
        }
      }

      // 5. Commodity
      let mercadoria = 'café';
      const lowercaseText = fullText.toLowerCase();
      if (lowercaseText.includes('cravo') || lowercaseText.includes('clove')) {
        mercadoria = 'Cravo';
      } else if (lowercaseText.includes('pimenta preta') || lowercaseText.includes('black pepper')) {
        mercadoria = 'Pimenta Preta';
      } else if (lowercaseText.includes('pimenta vermelha') || lowercaseText.includes('red pepper')) {
        mercadoria = 'Pimenta Vermelha';
      } else if (lowercaseText.includes('pimenta branca') || lowercaseText.includes('white pepper')) {
        mercadoria = 'Pimenta Branca';
      } else if (lowercaseText.includes('café') || lowercaseText.includes('coffee') || lowercaseText.includes('cafe')) {
        mercadoria = 'café';
      }

      // 6. Bags Quantity
      let bagsQuantity = '';
      const qtyRegexes = [
        /\b(\d+)\s*(?:bags|sacas|volumes|sacaria|bag|bags\s*qty)\b/i,
        /(?:quantidade|quantity|quant|qty|qtd|bags\s*qty)[^a-zA-Z0-9]*([0-9.,]+)/i
      ];
      for (const rx of qtyRegexes) {
        const match = fullText.match(rx);
        if (match && match[1]) {
          const cleanNum = match[1].replace(/[.\s,]/g, '').trim();
          if (cleanNum && !isNaN(cleanNum)) {
            bagsQuantity = cleanNum;
            break;
          }
        }
      }

      // 7. Port of Destination
      let portoDestino = '';
      const destMatch = fullText.match(/(?:destino|destination|port\s*of\s*discharge|porto\s*de\s*destino)[^a-zA-Z0-9]*([^\n\r]+)/i);
      if (destMatch && destMatch[1]) {
        let rawDest = destMatch[1].trim();
        const stopKeywords = [
          /\bquantidade\b/i, /\bmercadoria\b/i, /\barmador\b/i,
          /\bmarca\b/i, /\bagente\b/i, /\brecinto\b/i
        ];
        for (const kw of stopKeywords) {
          const idx = rawDest.search(kw);
          if (idx !== -1) {
            rawDest = rawDest.substring(0, idx).trim();
          }
        }
        portoDestino = rawDest.replace(/\s+/g, ' ').trim().replace(/[:\-.\s]+$/, '').trim();
      }

      // 8. Carrier / Armador
      let armador = '';
      const carriers = ['Maersk', 'MSC', 'CMA CGM', 'Hapag-Lloyd', 'Hapag', 'HMM', 'Cosco', 'ONE', 'Ocean Network Express', 'Zim'];
      for (const carrier of carriers) {
        if (fullText.toLowerCase().includes(carrier.toLowerCase())) {
          armador = carrier === 'Hapag' ? 'Hapag-Lloyd' : carrier;
          break;
        }
      }
      if (!armador) {
        const carrierMatch = fullText.match(/(?:carrier|shipping\s*line|armador)[^a-zA-Z0-9]*([^\n\r]+)/i);
        if (carrierMatch && carrierMatch[1]) {
          let rawCarrier = carrierMatch[1].trim();
          const stopKeywords = [
            /\bagente\b/i, /\brecinto\b/i, /\bquantidade\b/i, /\bmercadoria\b/i
          ];
          for (const kw of stopKeywords) {
            const idx = rawCarrier.search(kw);
            if (idx !== -1) {
              rawCarrier = rawCarrier.substring(0, idx).trim();
            }
          }
          armador = rawCarrier.replace(/\s+/g, ' ').trim().replace(/[:\-.\s]+$/, '').trim();
        }
      }

      // 9. Packaging
      let embalagem = 'sacaria';
      if (lowercaseText.includes('big bag') || lowercaseText.includes('bigbag') || lowercaseText.includes('bag 1000') || lowercaseText.includes('bag 1.000')) {
        embalagem = 'Big bags';
      } else if (lowercaseText.includes('bulk') || lowercaseText.includes('granel')) {
        embalagem = 'Bulk Line';
      } else if (lowercaseText.includes('box') || lowercaseText.includes('caixa')) {
        embalagem = 'Caixa';
      }

      // 10. Parse Containers and Seals
      const containerRegex = /\b([A-Z]{3}[UJZ][-\s]?\d{6}[-\s]?\d)\b/gi;
      const containerMatches = [];
      let match;
      while ((match = containerRegex.exec(fullText)) !== null) {
        const rawNum = match[1].trim().toUpperCase();

        // Verificação extra forçada no Javascript (à prova de falhas de regex)
        const prefixChars = rawNum.replace(/[^A-Z]/g, '');
        if (prefixChars.length >= 4 && !['U', 'J', 'Z'].includes(prefixChars[3])) {
          continue; // Se a 4ª letra não for U, J ou Z, ignora.
        }
        if (rawNum.startsWith('MLB') || rawNum.includes('MLBR')) {
          continue; // Força ignorar qualquer coisa que comece com MLB (Maersk Line Booking) ou contenha MLBR (Lacres)
        }

        containerMatches.push({
          number: rawNum,
          index: match.index,
          length: match[0].length
        });
      }

      const parsedContainers = [];

      for (let i = 0; i < containerMatches.length; i++) {
        const currentMatch = containerMatches[i];
        const nextMatch = containerMatches[i + 1];

        const startIndex = currentMatch.index;
        const endIndex = nextMatch ? nextMatch.index : fullText.length;
        const segment = fullText.substring(startIndex, endIndex);

        const containerNumber = currentMatch.number;
        const rawTokens = segment.split(/[\s|]+/).map(t => t.trim()).filter(Boolean);

        const maxSearch = Math.min(rawTokens.length, 15);
        let brandIndex = -1;
        for (let tIdx = 1; tIdx < maxSearch; tIdx++) {
          if (rawTokens[tIdx].includes('/') && rawTokens[tIdx].split('/').length === 3) {
            // Ignorar datas
            if (!rawTokens[tIdx].match(/\d{2}\/\d{2}\/\d{2,4}/)) {
              brandIndex = tIdx;
              break;
            }
          }
        }

        let typeIndex = -1;
        for (let tIdx = 1; tIdx < maxSearch; tIdx++) {
          const lowerToken = rawTokens[tIdx].toLowerCase();
          if (lowerToken.includes('hc') || lowerToken.includes('dry') || lowerToken.includes('dv') || lowerToken.includes('reefer') || lowerToken.includes('"') || lowerToken.includes('\'')) {
            typeIndex = tIdx;
            break;
          }
        }

        if (typeIndex === -1) {
          for (let tIdx = 1; tIdx < maxSearch; tIdx++) {
            if (rawTokens[tIdx] === '40' || rawTokens[tIdx] === '20') {
              typeIndex = tIdx;
              break;
            }
          }
        }

        let definiteSeal = '';
        let brand = '';
        let containerType = "40' HC";
        let containerBagsQuantity = '';
        let netWeight = '';
        let tara = '';
        let grossWeight = '';

        if (brandIndex !== -1) {
          brand = rawTokens[brandIndex];
          const sealsTokens = rawTokens.slice(1, brandIndex);
          definiteSeal = sealsTokens.join(' ');
        } else if (typeIndex !== -1) {
          const sealsTokens = rawTokens.slice(1, typeIndex);
          definiteSeal = sealsTokens.join(' ');
        }

        if (typeIndex !== -1) {
          const typeStr = rawTokens[typeIndex].toLowerCase();
          if (typeStr.includes('40') && (typeStr.includes('hc') || typeStr.includes('high'))) {
            containerType = "40' HC";
          } else if (typeStr.includes('40')) {
            containerType = "40' Dry";
          } else if (typeStr.includes('20') && (typeStr.includes('dv') || typeStr.includes('dry') || typeStr.includes('dryvan'))) {
            containerType = "20' Dry";
          } else if (typeStr.includes('20')) {
            containerType = "20' Dry";
          } else if (typeStr.includes('reefer')) {
            containerType = "40' Reefer";
          }

          const allMetricsTokens = rawTokens.slice(typeIndex + 1);
          // Filter to keep only tokens that contain digits and are formatted as numbers
          const metricsTokens = allMetricsTokens.filter(t => /^\d+([.,]\d+)*$/.test(t));

          // Heuristic to fix MSMU-303940-3 issue: if the first two tokens are small (< 100), the first is likely Pallets and the second is Bags.
          let bagsIdx = 0;
          if (metricsTokens.length >= 2) {
            const m0 = parseFloat(metricsTokens[0].replace(/,/g, ''));
            const m1 = parseFloat(metricsTokens[1].replace(/,/g, ''));
            if (m0 < 150 && m1 < 150) {
              bagsIdx = 1;
            }
          }

          if (metricsTokens.length >= 4 + bagsIdx) {
            containerBagsQuantity = metricsTokens[bagsIdx];
            netWeight = metricsTokens[bagsIdx + 1];
            tara = metricsTokens[bagsIdx + 2];
            grossWeight = metricsTokens[bagsIdx + 3];
          } else if (metricsTokens.length === 3 + bagsIdx) {
            containerBagsQuantity = metricsTokens[bagsIdx];
            netWeight = metricsTokens[bagsIdx + 1];
            grossWeight = metricsTokens[bagsIdx + 2];
          } else if (metricsTokens.length === 2 + bagsIdx) {
            containerBagsQuantity = metricsTokens[bagsIdx];
            netWeight = metricsTokens[bagsIdx + 1];
          } else if (metricsTokens.length > bagsIdx) {
            containerBagsQuantity = metricsTokens[bagsIdx];
          }
        }

        parsedContainers.push({
          id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          containerNumber,
          containerType,
          provisionalSeals: [],
          definiteSeal: definiteSeal || '',
          fumigationDate: '',
          fitoDate: '',
          definiteSealDate: new Date().toISOString().split('T')[0],
          notes: '',
          photos: [],
          bagsQuantity: containerBagsQuantity ? parseInt(containerBagsQuantity, 10) || 0 : 0,
          netWeight: netWeight || '',
          tara: tara || '',
          grossWeight: grossWeight || '',
          brand: brand || ''
        });
      }

      // Pre-fill fields
      setNewBookingData(prev => ({
        ...prev,
        bookingNumber: bookingNumber || prev.bookingNumber,
        vesselName: vesselName || prev.vesselName,
        vesselVoyageNum: vesselVoyageNum || prev.vesselVoyageNum,
        exporterId: exporterId || prev.exporterId,
        locationId: locationId || prev.locationId,
        mercadoria: mercadoria || prev.mercadoria,
        bagsQuantity: bagsQuantity || prev.bagsQuantity,
        portoDestino: portoDestino || prev.portoDestino,
        armador: armador || prev.armador,
        embalagem: embalagem || prev.embalagem,
        containers: parsedContainers
      }));

      setPdfParseStatus('success');

      let fieldsFound = [];
      if (bookingNumber) fieldsFound.push('Booking');
      if (vesselName) fieldsFound.push('Navio');
      if (vesselVoyageNum) fieldsFound.push('Viagem');
      if (exporterId) fieldsFound.push('Exportador');
      if (bagsQuantity) fieldsFound.push('Qtd Sacas');
      if (portoDestino) fieldsFound.push('Destino');

      if (fieldsFound.length > 0) {
        let msg = `Sucesso! Preenchido: ${fieldsFound.join(', ')}.`;
        if (parsedContainers.length > 0) {
          msg += ` Encontrado(s) ${parsedContainers.length} container(s).`;
        }
        setPdfParseMessage(msg);
      } else {
        setPdfParseMessage('PDF lido, mas nenhum campo padrão pôde ser extraído. Preencha manualmente.');
        setPdfParseStatus('error');
      }

    } catch (err) {
      console.error('Error parsing PDF:', err);
      setPdfParseStatus('error');
      setPdfParseMessage('Erro ao processar o PDF. Verifique se o arquivo está corrompido.');
    } finally {
      setIsParsingPdf(false);
    }
  };

  // Ações da Tabela
  const handleFinalizeBooking = async (id, e) => {
    e.stopPropagation();
    const bk = bookings.find(b => b.id === id);
    if (bk) {
      bk.status = 'Finalizado';
      await db.saveBooking(bk);
      handleRefreshData();
    }
  };

  const handleDeleteBooking = async (id, e) => {
    e.stopPropagation();
    if (confirm('Deseja excluir este booking e todos os seus containers?')) {
      await db.deleteBooking(id);
      handleRefreshData();
    }
  };

  // Simulador de Perfil
  const handleRoleChange = (role) => {
    let username = 'Usuário';
    if (role === 'ADM') username = 'Supervisor Admin';
    if (role === 'Inspector') username = 'Carlos (Inspetor)';
    if (role === 'Exporter') username = 'Café Atlântica (Exportador)';
    const updated = { role, username };
    setUser(updated);
    db.setUser(updated);
  };

  // Funções do Menu Dropdown
  const handleMenuOptionClick = (option) => {
    setMenuOpen(false);

    // Fecha visualizações detalhadas ativas antes de navegar
    setSelectedBookingId(null);
    setActiveReport(null);

    switch (option) {
      case 'new_booking':
        setShowCreateModal(true);
        break;
      case 'exportador':
        setCurrentTab('exportadores');
        break;
      case 'locais':
        setCurrentTab('locais');
        break;
      case 'inspetor':
        setCurrentTab('inspectors');
        break;
      case 'dashboard':
        setCurrentTab('bookings');
        break;
      default:
        break;
    }
  };

  // Mobile redirect removed to support responsive layouts

  const pageTransition = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.2 }
  };

  return (
    <div className="app-container">
      {/* Mobile Top Bar */}
      {isMobileOrTablet && (
        <header className="mobile-top-bar no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              background: 'linear-gradient(135deg, var(--color-brand), #b88f28)',
              color: '#0d1127',
              fontWeight: '800',
              fontSize: '14px',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              US
            </div>
            <div>
              <h1 style={{ fontSize: '13px', fontWeight: '800', margin: 0 }}>Unispect Service</h1>
              <span style={{ fontSize: '9px', color: 'var(--color-brand)', fontWeight: '700', textTransform: 'uppercase' }}>Mobile Portal</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isOnline ? '#10b981' : '#ef4444'
            }} />
            <button
              onClick={async () => {
                await db.syncPull();
                await db.syncPush();
                handleRefreshData();
              }}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                padding: '4px 8px',
                color: '#fff',
                fontSize: '11px',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={10} />
              <span>Sincronizar</span>
            </button>
          </div>
        </header>
      )}

      {/* CABEÇALHO UNISPECT */}
      <header className="app-header app-header-desktop no-print">

        {/* Logo Unispect */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            border: '2px solid var(--text-primary)',
            padding: '4px 8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: '1',
            fontWeight: 'bold',
            borderRadius: '2px'
          }}>
            <span style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '1px', color: 'var(--text-primary)' }}>UN</span>
            <span style={{ fontSize: '7px', fontWeight: '800', marginTop: '2px', letterSpacing: '0.5px', color: 'var(--text-primary)' }}>UNISPECT</span>
          </div>
          <div>
            <div className="header-logo-text">
              <span style={{ color: 'var(--text-primary)' }}>Unispect</span>
              <span style={{ color: 'var(--color-brand)' }}>Service & Certificate</span>
            </div>
            <div className="header-subtitle-text">
              VISTORIAS & CERTIFICAÇÕES
            </div>
          </div>
        </div>

        {/* Controles de Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Toggle Online */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--bg-tertiary)',
            padding: '8px 14px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--border-color)'
          }} className="no-select">
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isOnline ? '#10b981' : '#ef4444',
              display: 'inline-block'
            }} />
            <span style={{ fontSize: '11px', fontWeight: '700', color: isOnline ? '#10b981' : 'var(--text-muted)' }}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
            <input
              type="checkbox"
              checked={isOnline}
              onChange={() => setIsOnline(!isOnline)}
              style={{ width: '32px', height: '16px', borderRadius: '10px', cursor: 'pointer' }}
            />
          </div>

          <select
            value={user.role}
            onChange={e => handleRoleChange(e.target.value)}
            style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', fontWeight: '600', color: 'var(--text-primary)' }}
          >
            <option value="ADM">ADM (Supervisor)</option>
            <option value="Inspector">Inspetor (Carlos)</option>
            <option value="Exporter">Exportador (Cliente)</option>
          </select>

          {/* BOTÃO DE MENU DROPDOWN NO CANTO SUPERIOR DIREITO */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="btn btn-secondary"
              style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--text-secondary)' }}
            >
              <Menu size={16} />
              <span>Menu</span>
            </button>

            {menuOpen && (
              <div className="glass-panel mobile-menu-drawer" style={{
                position: 'absolute',
                top: '110%',
                right: 0,
                width: '260px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                padding: '8px 0',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column'
              }}>
                <button
                  onClick={() => handleMenuOptionClick('dashboard')}
                  style={{
                    padding: '12px 20px',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: currentTab === 'bookings' ? 'var(--color-brand)' : 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'var(--transition-fast)'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  📊 Ver Painel / Dashboard
                </button>

                <button
                  onClick={() => handleMenuOptionClick('new_booking')}
                  style={{
                    padding: '12px 20px',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    borderTop: '1px solid var(--border-color)'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  1 + Novo Certificado
                </button>
                <button
                  onClick={() => handleMenuOptionClick('exportador')}
                  style={{
                    padding: '12px 20px',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  2 Cadastro e consulta Exportador
                </button>
                <button
                  onClick={() => handleMenuOptionClick('locais')}
                  style={{
                    padding: '12px 20px',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  3 Locais de Operação e Cadastro
                </button>
                <button
                  onClick={() => handleMenuOptionClick('inspetor')}
                  style={{
                    padding: '12px 20px',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  4 Cadastro de Inspetor
                </button>

                {/* Configuração de rede para sincronizar de fora (Wifi / 5G / VPN) */}
                <div style={{
                  padding: '12px 20px',
                  borderTop: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)'
                }}>
                  <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                    SERVIDOR DE SINCRONIZAÇÃO
                  </span>
                  <input
                    type="text"
                    placeholder="IP do Servidor (ex: 192.168.1.15)"
                    value={serverIp}
                    onChange={e => handleServerIpChange(e.target.value)}
                    style={{
                      fontSize: '11px',
                      padding: '6px 10px',
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      color: '#fff',
                      borderRadius: '4px',
                      outline: 'none',
                      width: '100%'
                    }}
                  />
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: '1.2' }}>
                    Deixe em branco para usar o IP atual ({window.location.hostname}). Funciona em Wi-Fi, 5G ou VPN (Tailscale).
                  </span>
                </div>
              </div>
            )}
          </div>

          <button onClick={() => handleRoleChange('Exportador')} className="btn btn-secondary" style={{ padding: '8px 14px' }}>
            Sair
          </button>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="main-content app-main-content">

        {activeReport ? (
          <ReportView
            bookingId={activeReport.id}
            reportType={activeReport.type}
            onBack={() => {
              setActiveReport(null);
              if (activeReport.id) setSelectedBookingId(activeReport.id);
            }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Boas-vindas e Estatísticas no topo do conteúdo */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: '800' }}>Controle de Certificados Unispect</h1>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Bem-vindo, {user.username}</p>
              </div>

              {currentTab !== 'bookings' && currentTab !== 'field-portal' && currentTab !== 'settings' && (
                <button
                  onClick={() => {
                    const isMobile = window.innerWidth <= 1024;
                    if (isMobile && (currentTab === 'locais' || currentTab === 'inspectors')) {
                      setCurrentTab('settings');
                    } else {
                      setCurrentTab('bookings');
                    }
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '8px 14px' }}
                >
                  ← Voltar
                </button>
              )}
            </div>

            {/* CARDS DE STATUS */}
            {currentTab === 'bookings' && (
              <div className="stats-grid">
                <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldAlert size={24} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '32px', fontWeight: '800', lineHeight: '1' }}>{countPendentes}</h3>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pendentes</span>
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(230, 185, 65, 0.1)', color: 'var(--color-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Hourglass size={24} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '32px', fontWeight: '800', lineHeight: '1' }}>{countAndamento}</h3>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Em andamento</span>
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '32px', fontWeight: '800', lineHeight: '1' }}>{countFinalizados}</h3>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Finalizados</span>
                  </div>
                </div>
              </div>
            )}

            {/* Renderizador das guias baseadas na escolha do Dropdown */}
            <AnimatePresence mode="wait">
              {currentTab === 'bookings' && (
                <motion.div key="tab-bookings" {...pageTransition}>
                  <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                    <div className="filters-grid">
                      <div>
                        <label>Busca por Booking ou Certificado</label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
                          <input
                            type="text"
                            placeholder="Buscar..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{ paddingLeft: '36px' }}
                          />
                        </div>
                      </div>

                      <div>
                        <label>Filtro de Status</label>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                          <option value="Todos">Todos os Status</option>
                          <option value="Pendente">Pendentes</option>
                          <option value="Em andamento">Em andamento</option>
                          <option value="Finalizado">Finalizados</option>
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={() => setActiveReport({ id: null, type: 'administrative' })}
                      className="btn btn-secondary"
                      style={{ alignSelf: 'center', padding: '10px 24px', fontSize: '13px' }}
                    >
                      📄 Gerar Relatório Geral
                    </button>
                  </div>

                  <h2 style={{ fontSize: '16px', color: 'var(--color-brand)', marginBottom: '16px', fontFamily: 'var(--font-display)' }}>
                    Lista de Bookings
                  </h2>

                  <div className="glass-panel bookings-table-desktop" style={{ overflowX: 'auto', border: '1px solid var(--border-color)' }}>
                    <table style={{ minWidth: '800px' }}>
                      <thead>
                        <tr>
                          <th>Certificado</th>
                          <th>Booking</th>
                          <th>Exportador</th>
                          <th>Vessel / Navio</th>
                          <th>Local</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBookings.map(b => {
                          const exp = exportadores.find(e => e.id === b.exporterId)?.name || 'N/A';
                          const loc = locais.find(l => l.id === b.locationId)?.name || 'N/A';

                          const statusColors = {
                            'Pendente': 'badge-pending',
                            'Em andamento': 'badge-progress',
                            'Finalizado': 'badge-success'
                          };

                          return (
                            <tr key={b.id}>
                              <td style={{ fontWeight: '700', color: 'var(--color-brand)' }}>{b.certificateNumber}</td>
                              <td style={{ fontWeight: '600' }}>{b.bookingNumber}</td>
                              <td>{exp}</td>
                              <td>{b.vesselVoyage}</td>
                              <td>{loc}</td>
                              <td>
                                <span className={`badge ${statusColors[b.status] || 'badge-pending'}`}>
                                  {(b.status || 'Pendente').toUpperCase()}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: '6px' }}>
                                  <button onClick={() => {
                                    setSelectedBookingId(b.id);
                                  }} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px', border: '1px solid var(--text-muted)' }}>
                                    Gerenciar
                                  </button>

                                  {b.status !== 'Finalizado' && user.role !== 'Exportador' && (
                                    <button onClick={(e) => handleFinalizeBooking(b.id, e)} className="btn btn-success" style={{ padding: '6px 12px', fontSize: '11px' }}>
                                      Finalizar
                                    </button>
                                  )}

                                  {user.role === 'ADM' && (
                                    <button onClick={(e) => handleDeleteBooking(b.id, e)} className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '11px' }}>
                                      Excluir
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {filteredBookings.length === 0 && (
                          <tr>
                            <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                              Nenhum booking encontrado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Lista de Cards de Bookings (Apenas no mobile) */}
                  <div className="bookings-cards-mobile">
                    {filteredBookings.map(b => {
                      const exp = exportadores.find(e => e.id === b.exporterId)?.name || 'N/A';
                      const loc = locais.find(l => l.id === b.locationId)?.name || 'N/A';
                      const statusColors = {
                        'Pendente': 'badge-pending',
                        'Em andamento': 'badge-progress',
                        'Finalizado': 'badge-success'
                      };

                      return (
                        <div key={b.id} className="booking-card glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: '700', color: 'var(--color-brand)', fontSize: '15px' }}>{b.certificateNumber}</span>
                            <span className={`badge ${statusColors[b.status] || 'badge-pending'}`} style={{ fontSize: '10px' }}>
                              {(b.status || 'Pendente').toUpperCase()}
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                            <div><span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Booking:</span> <span style={{ color: '#fff', fontWeight: 'bold' }}>{b.bookingNumber}</span></div>
                            <div><span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Exportador:</span> <span style={{ color: '#fff' }}>{exp}</span></div>
                            <div><span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Local:</span> <span style={{ color: '#fff' }}>{loc}</span></div>
                            <div><span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Navio/Viagem:</span> <span style={{ color: '#fff' }}>{b.vesselVoyage}</span></div>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '4px' }}>
                            <button onClick={() => setSelectedBookingId(b.id)} className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '12px', flex: 1, border: '1px solid var(--text-muted)' }}>
                              Gerenciar
                            </button>

                            {b.status !== 'Finalizado' && user.role !== 'Exportador' && (
                              <button onClick={(e) => handleFinalizeBooking(b.id, e)} className="btn btn-success" style={{ padding: '8px 12px', fontSize: '12px', flex: 1 }}>
                                Finalizar
                              </button>
                            )}

                            {user.role === 'ADM' && (
                              <button onClick={(e) => handleDeleteBooking(b.id, e)} className="btn btn-danger" style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {filteredBookings.length === 0 && (
                      <div className="glass-panel" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                        Nenhum booking encontrado.
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {currentTab === 'inspectors' && (
                <motion.div key="tab-inspectors" {...pageTransition}>
                  <InspectorsList onDataChange={handleRefreshData} />
                </motion.div>
              )}

              {currentTab === 'exportadores' && (
                <motion.div key="tab-exportadores" {...pageTransition}>
                  <ExportadoresList onDataChange={handleRefreshData} />
                </motion.div>
              )}

              {currentTab === 'locais' && (
                <motion.div key="tab-locais" {...pageTransition}>
                  <LocaisList onDataChange={handleRefreshData} />
                </motion.div>
              )}

              {currentTab === 'field-portal' && (
                <motion.div key="tab-field-portal" {...pageTransition}>
                  <MobileAppView user={user} onRoleChange={handleRoleChange} hideHeader={true} />
                </motion.div>
              )}

              {currentTab === 'settings' && (
                <motion.div key="tab-settings" {...pageTransition} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h3 style={{ fontSize: '16px', color: 'var(--color-brand)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', margin: 0 }}>
                      Configurações do Dispositivo
                    </h3>

                    <div>
                      <label>Perfil Simulador</label>
                      <select
                        value={user.role}
                        onChange={e => handleRoleChange(e.target.value)}
                        style={{ padding: '10px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: '#fff', fontWeight: '600' }}
                      >
                        <option value="ADM">ADM (Supervisor)</option>
                        <option value="Inspector">Inspetor (Carlos)</option>
                        <option value="Exporter">Exportador (Cliente)</option>
                      </select>
                    </div>

                    <div>
                      <label>Servidor de Sincronização</label>
                      <input
                        type="text"
                        placeholder="IP do Servidor (ex: 192.168.1.15)"
                        value={serverIp}
                        onChange={e => handleServerIpChange(e.target.value)}
                        style={{ padding: '10px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: '#fff' }}
                      />
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '4px', display: 'block' }}>
                        Deixe em branco para usar o IP atual ({window.location.hostname}).
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600' }}>Modo de Conexão</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isOnline ? '#10b981' : '#ef4444' }} />
                        <span style={{ fontSize: '12px', fontWeight: '700', color: isOnline ? '#10b981' : 'var(--text-muted)', marginRight: '8px' }}>
                          {isOnline ? 'ONLINE' : 'OFFLINE'}
                        </span>
                        <input
                          type="checkbox"
                          checked={isOnline}
                          onChange={() => setIsOnline(!isOnline)}
                          style={{ width: '32px', height: '16px', borderRadius: '10px', cursor: 'pointer' }}
                        />
                      </div>
                    </div>
                  </div>

                  {user.role === 'ADM' && (
                    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <h4 style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', margin: 0 }}>
                        Administração
                      </h4>
                      <button
                        onClick={() => setCurrentTab('locais')}
                        className="btn btn-secondary"
                        style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', width: '100%' }}
                      >
                        <span>📍 Locais de Operação</span>
                        <span>→</span>
                      </button>
                      <button
                        onClick={() => setCurrentTab('inspectors')}
                        className="btn btn-secondary"
                        style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', width: '100%' }}
                      >
                        <span>👤 Cadastro de Inspetores</span>
                        <span>→</span>
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => handleRoleChange('Exportador')}
                    className="btn btn-danger"
                    style={{ padding: '14px', fontWeight: '800' }}
                  >
                    Sair do Sistema
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        )}

      </main>

      {/* JANELA MODAL DE GERENCIAMENTO (Screenshot 2 overlay) */}
      {selectedBookingId && (
        <BookingManagementModal
          bookingId={selectedBookingId}
          onClose={() => {
            setSelectedBookingId(null);
            handleRefreshData();
          }}
          user={user}
          onDataChange={handleRefreshData}
          onOpenReport={(id, type) => {
            setActiveReport({ id, type });
            setSelectedBookingId(null);
          }}
        />
      )}

      {/* MODAL ADM: CADASTRAR NOVO CERTIFICADO */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(5, 7, 15, 0.75)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <form onSubmit={handleCreateBooking} className="glass-panel create-modal-form" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <h2 style={{ fontSize: '18px', fontFamily: 'var(--font-display)', color: 'var(--color-brand)' }}>Cadastrar Novo Booking / Certificado</h2>
              <button type="button" onClick={handleDiscardBookingCreation} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {/* Campo Drag & Drop PDF */}
            <div
              className={`pdf-drag-drop-zone ${isDragOver ? 'dragover' : ''} ${pdfParseStatus || ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handlePdfUpload(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => document.getElementById('booking-pdf-input').click()}
            >
              <input
                id="booking-pdf-input"
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handlePdfUpload(e.target.files[0]);
                  }
                }}
              />
              <div className="icon-container">
                {isParsingPdf ? (
                  <div className="pdf-loading-spinner"></div>
                ) : pdfParseStatus === 'success' ? (
                  <CheckCircle2 size={28} />
                ) : pdfParseStatus === 'error' ? (
                  <ShieldAlert size={28} />
                ) : (
                  <UploadCloud size={28} />
                )}
              </div>
              <div>
                <span className="pdf-drag-drop-zone-text">
                  {isParsingPdf ? 'Processando PDF...' : 'Arraste o PDF do Booking aqui para preenchimento automático'}
                </span>
                <p className="pdf-drag-drop-zone-subtext" style={{ margin: '4px 0 0 0' }}>
                  {pdfParseMessage || 'Ou clique para selecionar um arquivo PDF do seu dispositivo'}
                </p>
              </div>
            </div>

            <div className="form-grid">
              <div>
                <label>Número do Booking *</label>
                <input
                  type="text"
                  value={newBookingData.bookingNumber}
                  onChange={e => setNewBookingData({ ...newBookingData, bookingNumber: e.target.value })}
                  placeholder="BK-XXXXXX"
                  required
                />
              </div>

              <div>
                <label>Tipo de Operação *</label>
                <select
                  value={newBookingData.type}
                  onChange={e => {
                    const newType = e.target.value;
                    setNewBookingData({
                      ...newBookingData,
                      type: newType,
                      stuffingReportNumber: newType === 'Redex Operation Report' ? '' : newBookingData.stuffingReportNumber
                    });
                  }}
                  required
                >
                  <option value="Redex Operation Report">Redex Operation Report</option>
                  <option value="Container Stuffing Report">Container Stuffing Report</option>
                </select>
              </div>

              {newBookingData.type === 'Container Stuffing Report' && (
                <div>
                  <label>Stuffing Report Number *</label>
                  <input
                    type="text"
                    value={newBookingData.stuffingReportNumber}
                    onChange={e => setNewBookingData({ ...newBookingData, stuffingReportNumber: e.target.value })}
                    placeholder="Ex: SR-XXXXXX"
                    required
                  />
                </div>
              )}

              <div>
                <label>Nº Certificado (Auto)</label>
                <input
                  type="text"
                  value="Gerado Automaticamente"
                  disabled
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--color-brand)',
                    fontWeight: 'bold',
                    border: '1px solid var(--border-color)',
                    cursor: 'not-allowed'
                  }}
                />
              </div>

              <div>
                <label>Mercadoria *</label>
                <select
                  value={newBookingData.mercadoria}
                  onChange={e => setNewBookingData({ ...newBookingData, mercadoria: e.target.value })}
                  required
                >
                  <option value="café">Café</option>
                  <option value="Cravo">Cravo</option>
                  <option value="Pimenta Preta">Pimenta Preta</option>
                  <option value="Pimenta Vermelha">Pimenta Vermelha</option>
                  <option value="Pimenta Branca">Pimenta Branca</option>
                </select>
              </div>

              <div>
                <label>Porto de Destino *</label>
                <input
                  type="text"
                  value={newBookingData.portoDestino}
                  onChange={e => setNewBookingData({ ...newBookingData, portoDestino: e.target.value })}
                  placeholder="Ex: Porto de Roterdã"
                  required
                />
              </div>

              <div>
                <label>Navio *</label>
                <input
                  type="text"
                  value={newBookingData.vesselName}
                  onChange={e => setNewBookingData({ ...newBookingData, vesselName: e.target.value })}
                  placeholder="Ex: MSC INGRID"
                  required
                />
              </div>

              <div>
                <label>Viagem *</label>
                <input
                  type="text"
                  value={newBookingData.vesselVoyageNum}
                  onChange={e => setNewBookingData({ ...newBookingData, vesselVoyageNum: e.target.value })}
                  placeholder="Ex: 26A"
                  required
                />
              </div>

              <div>
                <label>Armador / Linha</label>
                <input
                  type="text"
                  value={newBookingData.armador}
                  onChange={e => setNewBookingData({ ...newBookingData, armador: e.target.value })}
                  placeholder="Ex: Maersk"
                />
              </div>

              <div>
                <label>Embalagem *</label>
                <select
                  value={newBookingData.embalagem}
                  onChange={e => setNewBookingData({ ...newBookingData, embalagem: e.target.value })}
                  required
                >
                  <option value="sacaria">sacaria</option>
                  <option value="Big bags">Big bags</option>
                  <option value="Bulk Line">Bulk Line</option>
                  <option value="Caixa">Caixa</option>
                </select>
              </div>

              <div>
                <label>Exportador *</label>
                <select
                  value={newBookingData.exporterId}
                  onChange={e => setNewBookingData({ ...newBookingData, exporterId: e.target.value })}
                  required
                >
                  <option value="">Selecione...</option>
                  {exportadores.map(exp => <option key={exp.id} value={exp.id}>{exp.name}</option>)}
                </select>
              </div>

              <div>
                <label>Local da Operação *</label>
                <select
                  value={newBookingData.locationId}
                  onChange={e => setNewBookingData({ ...newBookingData, locationId: e.target.value })}
                  required
                >
                  <option value="">Selecione...</option>
                  {locais.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
              </div>

              <div>
                <label>Quantidade de Sacas *</label>
                <input
                  type="number"
                  value={newBookingData.bagsQuantity}
                  onChange={e => setNewBookingData({ ...newBookingData, bagsQuantity: e.target.value })}
                  placeholder="Qtd Sacas"
                  required
                />
              </div>

              <div>
                <label>Quantidade de Containers</label>
                <input
                  type="number"
                  placeholder="Quantidade de Containers na reserva"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                  value={newBookingData.containers && newBookingData.containers.length > 0 ? newBookingData.containers.length : ''}
                  readOnly
                />
              </div>
            </div>

            {newBookingData.containers && newBookingData.containers.length > 0 && (
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <h4 style={{ fontSize: '13px', color: 'var(--color-brand)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                  Containers Importados do Romaneio ({newBookingData.containers.length})
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', maxHeight: '150px', overflowY: 'auto', paddingRight: '4px' }}>
                  {newBookingData.containers.map((c, index) => (
                    <div key={index} style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>{c.containerNumber}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{c.containerType}</span>
                      </div>
                      {c.definiteSeal && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          Lacre: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{c.definiteSeal}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '6px' }}>
              <button type="button" onClick={handleDiscardBookingCreation} className="btn btn-danger">
                Excluir
              </button>
              <button type="submit" className="btn btn-primary" style={{ backgroundColor: '#10b981', color: '#fff' }}>
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      {isMobileOrTablet && (
        <nav className="mobile-bottom-nav no-print no-select">
          {(user.role === 'Inspector' || user.role === 'ADM') && (
            <button
              onClick={() => setCurrentTab('field-portal')}
              className={`mobile-nav-item ${currentTab === 'field-portal' ? 'active' : ''}`}
            >
              <Camera size={20} />
              <span>Modo Campo</span>
            </button>
          )}

          <button
            onClick={() => setCurrentTab('bookings')}
            className={`mobile-nav-item ${currentTab === 'bookings' ? 'active' : ''}`}
          >
            <Search size={20} />
            <span>Bookings</span>
          </button>

          {user.role === 'ADM' && (
            <button
              onClick={() => setCurrentTab('exportadores')}
              className={`mobile-nav-item ${currentTab === 'exportadores' ? 'active' : ''}`}
            >
              <Users size={20} />
              <span>Exportadores</span>
            </button>
          )}

          <button
            onClick={() => setCurrentTab('settings')}
            className={`mobile-nav-item ${currentTab === 'settings' ? 'active' : ''}`}
          >
            <Settings size={20} />
            <span>Ajustes</span>
          </button>
        </nav>
      )}

      {/* Floating Action Button on Mobile */}
      {isMobileOrTablet && currentTab === 'bookings' && user.role === 'ADM' && (
        <button
          onClick={() => setShowCreateModal(true)}
          className="mobile-fab"
        >
          <Plus size={24} />
        </button>
      )}
    </div>
  );
}
