import { useState, useEffect } from 'react';
import { dbFirestore } from './firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';

// Coleções
const LOCALS_COL       = 'locais';
const EXPORTERS_COL    = 'exportadores';
const BOOKINGS_COL     = 'bookings';
const INSPECTORS_COL   = 'inspectors';
const USERS_COL        = 'usuarios';
const PHOTOS_COL       = 'containerPhotos'; // ← Fotos salvas aqui (sem Firebase Storage)
const USER_KEY         = 'containtrack_user';

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

const defaultUsers = [
  { id: 'usr_master', name: 'Master Supervisor', login: 'admin', password: '123', role: 'ADM' },
  { id: 'usr_inspector', name: 'Carlos Santos', login: 'carlos', password: '123', role: 'Inspector' }
];

// Funções de Inicialização (se a coleção estiver vazia)
async function initializeCollectionIfEmpty(colName, defaultData) {
  const snap = await getDocs(collection(dbFirestore, colName));
  if (snap.empty) {
    for (const item of defaultData) {
      await setDoc(doc(dbFirestore, colName, item.id), item);
    }
  }
}

// ── Compresão de imagem no cliente ──────────────────────────────────────────
// Retorna Promise<string> com dataURL JPEG comprimido (max 800px, qualidade 0.65).
// 100% client-side, sem dependência de Firebase Storage ou rede.
function compressImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo de imagem.'));
    reader.onloadend = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Falha ao carregar a imagem.'));
      img.onload  = () => {
        const MAX_PX = 800;
        let w = img.width;
        let h = img.height;
        // Redimensiona proporcionalmente ao lado maior
        if (w > h) {
          if (w > MAX_PX) { h = Math.round(h * (MAX_PX / w)); w = MAX_PX; }
        } else {
          if (h > MAX_PX) { w = Math.round(w * (MAX_PX / h)); h = MAX_PX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        // JPEG 0.65 = bom equilíbrio qualidade/tamanho (~80-200KB por foto)
        resolve(canvas.toDataURL('image/jpeg', 0.65));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export const db = {
  async init() {
    await initializeCollectionIfEmpty(LOCALS_COL, defaultLocais);
    await initializeCollectionIfEmpty(EXPORTERS_COL, defaultExportadores);
    await initializeCollectionIfEmpty(INSPECTORS_COL, defaultInspectors);
    await initializeCollectionIfEmpty(USERS_COL, defaultUsers);
  },

  // Locais
  async getLocais() {
    const snap = await getDocs(collection(dbFirestore, LOCALS_COL));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async saveLocal(local) {
    const id = local.id || 'loc_' + Date.now();
    local.id = id;
    await setDoc(doc(dbFirestore, LOCALS_COL, id), local);
    return local;
  },
  async deleteLocal(id) {
    await deleteDoc(doc(dbFirestore, LOCALS_COL, id));
  },

  // Exportadores
  async getExportadores() {
    const snap = await getDocs(collection(dbFirestore, EXPORTERS_COL));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async saveExportador(exporter) {
    const id = exporter.id || 'exp_' + Date.now();
    exporter.id = id;
    await setDoc(doc(dbFirestore, EXPORTERS_COL, id), exporter);
    return exporter;
  },
  async deleteExportador(id) {
    await deleteDoc(doc(dbFirestore, EXPORTERS_COL, id));
  },

  // Inspetores
  async getInspectors() {
    const snap = await getDocs(collection(dbFirestore, INSPECTORS_COL));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async saveInspector(inspector) {
    const id = inspector.id || 'ins_' + Date.now();
    inspector.id = id;
    await setDoc(doc(dbFirestore, INSPECTORS_COL, id), inspector);
    return inspector;
  },
  async deleteInspector(id) {
    await deleteDoc(doc(dbFirestore, INSPECTORS_COL, id));
  },

  // Bookings
  async getBookings() {
    const snap = await getDocs(collection(dbFirestore, BOOKINGS_COL));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  /**
   * saveBooking — upsert puro, seguro para auto-save.
   * NÃO valida duplicatas (use saveBookingWithValidation para criação).
   */
  async saveBooking(booking) {
    const id = booking.id || 'bk_' + Date.now();
    booking.id = id;

    if (!booking.certificateNumber) {
      booking.certificateNumber = await this.generateNextCertificateNumber();
    }
    if (!booking.containers) booking.containers = [];

    await setDoc(doc(dbFirestore, BOOKINGS_COL, id), booking);
    return booking;
  },

  /**
   * saveBookingWithValidation — usar APENAS na criação de novos bookings.
   * Valida duplicatas de bookingNumber antes de salvar.
   */
  async saveBookingWithValidation(booking, allBookings = null) {
    const id = booking.id || 'bk_' + Date.now();
    booking.id = id;

    if (booking.bookingNumber && booking.bookingNumber.trim()) {
      const list = allBookings || await this.getBookings();
      const cleanNum = booking.bookingNumber.trim().toLowerCase();
      const duplicate = list.find(
        b => b.id !== id && (b.bookingNumber || '').trim().toLowerCase() === cleanNum
      );
      if (duplicate) {
        throw new Error(
          `Este romaneio já foi inserido no sistema. (Booking: ${booking.bookingNumber.trim()})`
        );
      }
    }

    return this.saveBooking(booking);
  },
  async deleteBooking(id) {
    await deleteDoc(doc(dbFirestore, BOOKINGS_COL, id));
  },
  async generateNextCertificateNumber() {
    const list = await this.getBookings();
    let maxNum = 999;
    list.forEach(b => {
      if (b.certificateNumber) {
        const match = b.certificateNumber.match(/^UN(\d+)\/2026$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    });
    return `UN${maxNum + 1}/2026`;
  },

  // Perfil ativo
  getUser() {
    const usr = localStorage.getItem(USER_KEY);
    return usr ? JSON.parse(usr) : null;
  },
  setUser(user) {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  },

  // Usuários
  async getUsers() {
    const snap = await getDocs(collection(dbFirestore, USERS_COL));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async saveUser(user) {
    const id = user.id || 'usr_' + Date.now();
    user.id = id;
    await setDoc(doc(dbFirestore, USERS_COL, id), user);
    return user;
  },
  async deleteUser(id) {
    await deleteDoc(doc(dbFirestore, USERS_COL, id));
  },

  // ── Fotos (sem Firebase Storage — tudo no Firestore) ─────────────────────────

  /**
   * uploadPhoto — comprime a imagem no cliente e salva no Firestore.
   * NÃO usa Firebase Storage. NÃO depende de regras de autenticação.
   * Retorna { id, name, url } onde url é o dataURL base64 para uso imediato na UI.
   *
   * @param {File}   file        - Arquivo de imagem selecionado pelo usuário
   * @param {string} containerId - ID do container ao qual a foto pertence
   */
  async uploadPhoto(file, containerId = '') {
    // 1. Comprime a imagem localmente (sem upload para Storage)
    const dataUrl = await compressImageToDataUrl(file);

    // 2. ID único para a foto
    const photoId = 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // 3. Salva como documento individual na coleção containerPhotos
    //    (separado do booking para não estourar o limite de 1MB por documento)
    await setDoc(doc(dbFirestore, PHOTOS_COL, photoId), {
      id:          photoId,
      containerId: containerId,
      dataUrl:     dataUrl,
      name:        '',
      createdAt:   Date.now()
    });

    // 4. Retorna metadados + url para exibição imediata sem nova busca
    return { id: photoId, name: '', url: dataUrl };
  },

  /**
   * getPhotosForContainer — busca todas as fotos de um container.
   */
  async getPhotosForContainer(containerId) {
    const q    = query(collection(dbFirestore, PHOTOS_COL), where('containerId', '==', containerId));
    const snap = await getDocs(q);
    return snap.docs.map(d => {
      const data = d.data();
      return { ...data, id: d.id, url: data.dataUrl };
    });
  },

  /**
   * deletePhoto — apaga a foto do Firestore.
   * Fotos antigas com URL de Firebase Storage continuam visíveis até serem removidas pela UI.
   */
  async deletePhoto(photoId) {
    try {
      await deleteDoc(doc(dbFirestore, PHOTOS_COL, photoId));
    } catch (err) {
      console.warn('deletePhoto: não encontrada em containerPhotos', photoId, err);
    }
  },

  // Métodos de Sync Obsoletos (mantidos vazios para não quebrar componentes não migrados)
  async syncPull() { return false; },
  async syncPush() {}
};

// --- REACT HOOKS PARA TEMPO REAL --- //

export function useCollectionRealtime(colName) {
  const [data, setData] = useState([]);
  
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(dbFirestore, colName), (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setData(items);
    }, (error) => {
      console.error(`Error fetching ${colName}:`, error);
    });
    return () => unsubscribe();
  }, [colName]);
  
  return data;
}

export function useLocais() { return useCollectionRealtime(LOCALS_COL); }
export function useExportadores() { return useCollectionRealtime(EXPORTERS_COL); }
export function useInspectors() { return useCollectionRealtime(INSPECTORS_COL); }
export function useBookings() { return useCollectionRealtime(BOOKINGS_COL); }
export function useUsers() { return useCollectionRealtime(USERS_COL); }

export function isBookingNumberDuplicate(bookings, bookingNumber, currentBookingId = null) {
  if (!bookingNumber || typeof bookingNumber !== 'string') return false;
  const cleanNumber = bookingNumber.trim().toLowerCase();
  if (!cleanNumber) return false;

  return (bookings || []).some(b => {
    if (!b || !b.bookingNumber) return false;
    if (currentBookingId && b.id === currentBookingId) return false;
    return (b.bookingNumber || '').trim().toLowerCase() === cleanNumber;
  });
}
