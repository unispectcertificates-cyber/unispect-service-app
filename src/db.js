import { createConcurrentRepository } from './utils/bookingConcurrent.js';
import { createBookingRepository, normalizeBookingNumber } from './utils/bookingImport';
import { removeFieldPhotoMetadata } from './utils/fieldService';
import { compressImage } from './utils/imageCompression';
import { generateUUID } from './utils/uuid';
import {
  formatExporterCnpj,
  inferExporterRegistrationDate,
  formatExporterDateBr,
  generateNextExporterCode,
  normalizeExportadoresWithCodes,
  getExporterDocumentLabel
} from './utils/exporterUtils';
import {
  COFFEE_ANALYSES_COL,
  COFFEE_ANALYSIS_AUDIT_COL,
  createCoffeeAnalysisRepository
} from './utils/coffeeAnalysisService';
import { useState, useEffect, useMemo } from 'react';
import { dbFirestore, storage } from './firebase';
import { collection, doc, setDoc, deleteDoc, getDoc, getDocs, onSnapshot, query, where, runTransaction, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

// Coleções
const LOCALS_COL       = 'locais';
const EXPORTERS_COL    = 'exportadores';
const BOOKINGS_COL     = 'bookings';
const INSPECTORS_COL   = 'inspectors';
const USERS_COL        = 'usuarios';
const PHOTOS_COL       = 'containerPhotos'; // ← Metadados das fotos (URL do Storage)
const USER_KEY         = 'containtrack_user';

const defaultLocais = [
  { id: '1', name: 'Interport Logistica' },
  { id: '2', name: 'Vila Velha Terminal' },
  { id: '3', name: 'ADV Armazéns Gerais' },
  { id: '4', name: 'Coopeavi – Santa Maria de Jetibá' },
  { id: '5', name: 'TPJ Exportação' }
];

const defaultExportadores = [
  { id: '1', code: 'EXP-0001', name: 'Café Atlântica Exportadora Ltda', cnpj: '', registrationDate: '2026-01-10', email: 'contato@cafeatlantica.com.br', phone: '(27) 3322-1100', omitNameInDocuments: false },
  { id: '2', code: 'EXP-0002', name: 'Tristão Companhia de Comércio Exterior', cnpj: '', registrationDate: '2026-01-10', email: 'tristao@tristao.com.br', phone: '(27) 3200-5500', omitNameInDocuments: false },
  { id: '3', code: 'EXP-0003', name: 'Terra Forte Exportação de Café', cnpj: '', registrationDate: '2026-01-10', email: 'terraforte@terraforte.com.br', phone: '(27) 3199-8800', omitNameInDocuments: false }
];

const defaultInspectors = [
  {
    id: 'ins_bruno',
    name: 'Bruno O. G. Lobo',
    email: 'bruno@unispect.com',
    phone: '(27) 99999-0001',
    role: 'Signatory',
    isOperational: true,
    signatureImageUrl: '/assinatura.jpg'
  },
  {
    id: 'ins_marcos',
    name: 'Marcos Oliveira',
    email: 'marcos@unispect.com',
    phone: '(27) 99882-3344',
    role: 'Inspector',
    isOperational: true,
    signatureImageUrl: null
  },
  // Perfil demonstrativo EXCLUSIVO para testes locais e simulação de múltiplos usuários
  {
    id: 'ins_carlos_test',
    name: 'Carlos Santos [Demonstração / Teste]',
    email: 'carlos.teste@unispect.demo',
    phone: '(27) 90000-0000',
    role: 'Inspector',
    isOperational: false,
    isTestDemonstrationUser: true,
    signatureImageUrl: '/assinatura_carlos.svg'
  }
];

const defaultUsers = [
  {
    id: 'usr_bruno',
    uid: 'usr_bruno',
    name: 'Bruno O. G. Lobo',
    login: 'blobo',
    password: '123',
    role: 'ADM',
    isSignatory: true,
    isOperational: true,
    signatureImageUrl: '/assinatura.jpg'
  },
  {
    id: 'usr_master',
    uid: 'usr_master',
    name: 'Master Supervisor',
    login: 'admin',
    password: '123',
    role: 'ADM',
    isSignatory: true,
    isOperational: true,
    signatureImageUrl: null
  },
  {
    id: 'usr_marcos',
    uid: 'usr_marcos',
    name: 'Marcos Oliveira',
    login: 'marcos',
    password: '123',
    role: 'Inspector',
    isSignatory: false,
    isOperational: true,
    signatureImageUrl: null
  },
  // Perfil demonstrativo EXCLUSIVO para testes locais de concorrência e autorização
  {
    id: 'usr_carlos_test',
    uid: 'usr_carlos_test',
    name: 'Carlos Santos [Demonstração / Teste]',
    login: 'carlos_teste',
    password: '123',
    role: 'Inspector',
    isSignatory: true,
    isOperational: false,
    isTestDemonstrationUser: true,
    signatureImageUrl: '/assinatura_carlos.svg'
  }
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

// ── Compressão padronizada de imagem no cliente (módulo compartilhado) ────────
// Mantido para compatibilidade retroativa com chamadas legadas
export async function compressImageToDataUrl(file) {
  const compressed = await compressImage(file);
  return compressed.dataUrl;
}

const bookingRepository = createBookingRepository({
  listBookings: async () => {
    const snap = await getDocs(collection(dbFirestore, BOOKINGS_COL));
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  },
  reference: (col, id) => doc(dbFirestore, col, id),
  newId: prefix => prefix + '_' + doc(collection(dbFirestore, BOOKINGS_COL)).id,
  transaction: callback => runTransaction(dbFirestore, callback),
  now: () => Date.now()
});

const concurrent = createConcurrentRepository({
  reference: (col, id) => doc(dbFirestore, col, id),
  transaction: callback => runTransaction(dbFirestore, callback)
});

const coffeeAnalysisRepository = createCoffeeAnalysisRepository({
  listRecords: async () => {
    const snap = await getDocs(collection(dbFirestore, COFFEE_ANALYSES_COL));
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  },
  getRecord: async id => {
    const d = await getDoc(doc(dbFirestore, COFFEE_ANALYSES_COL, String(id)));
    return d.exists() ? { ...d.data(), id: d.id } : null;
  },
  saveRecord: async record => {
    await setDoc(doc(dbFirestore, COFFEE_ANALYSES_COL, String(record.id)), record);
    return record;
  },
  appendAuditEvent: async event => {
    await setDoc(doc(dbFirestore, COFFEE_ANALYSIS_AUDIT_COL, String(event.id)), event);
    return event;
  },
  listAuditEvents: async laudoId => {
    const snap = await getDocs(
      query(collection(dbFirestore, COFFEE_ANALYSIS_AUDIT_COL), where('laudoId', '==', String(laudoId)))
    );
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  },
  reference: (col, id) => doc(dbFirestore, col, String(id)),
  transaction: callback => runTransaction(dbFirestore, callback),
  serverTimestamp: () => serverTimestamp(),
  now: () => Date.now(),
  auditAvailable: true
});

export const db = {
  subscribeBooking: (id, next, error) => onSnapshot(doc(dbFirestore, BOOKINGS_COL, id), snap => next(snap.exists() ? {...snap.data(),id:snap.id} : null), error),
  patchBookingContainer: concurrent.patchContainer,
  patchBookingFields: concurrent.patchBooking,
  appendBookingPhoto: concurrent.appendPhoto,
  removeBookingPhoto: concurrent.removePhoto,
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
    return normalizeExportadoresWithCodes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  },
  async saveExportador(exporter) {
    const id = exporter.id || 'exp_' + Date.now();
    let code = String(exporter.code || '').trim().toUpperCase();
    if (!code) {
      const existing = await this.getExportadores();
      code = generateNextExporterCode(existing);
    }
    const payload = {
      ...exporter,
      id,
      code,
      registrationDate: inferExporterRegistrationDate(exporter),
      cnpj: formatExporterCnpj(exporter.cnpj || ''),
      omitNameInDocuments: Boolean(exporter.omitNameInDocuments),
      updatedAt: Date.now()
    };
    if (!payload.createdAt) {
      payload.createdAt = Date.now();
    }
    await setDoc(doc(dbFirestore, EXPORTERS_COL, id), payload, { merge: true });
    return payload;
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

  // All Booking writers share uniqueness and optimistic revision protection.
  async saveBooking(booking) {
    const saved = await bookingRepository.saveBooking(booking);
    Object.assign(booking, { id: saved.id, _revision: saved._revision, certificateNumber: saved.certificateNumber });
    return saved;
  },
  async saveBookingWithValidation(booking) {
    return bookingRepository.saveBooking(booking);
  },
  async importBooking(booking, options) {
    return bookingRepository.importBooking(booking, options);
  },
  async getBookingImportHistory(bookingId) {
    const snap = await getDocs(query(collection(dbFirestore, 'bookingImports'), where('bookingId', '==', bookingId)));
    return snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => b.createdAt - a.createdAt);
  },
  async deleteBooking(id) {
    return bookingRepository.deleteBooking(id);
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

  // ── Analysis of coffee (Laudos de Classificação de Café) ───────────────────
  async getCoffeeAnalyses(user) {
    return coffeeAnalysisRepository.listForUser(user || this.getUser());
  },
  async createCoffeeAnalysisDraft(params, options = {}) {
    return coffeeAnalysisRepository.createDraft(params, options);
  },
  async openCoffeeAnalysisDraft(params) {
    return coffeeAnalysisRepository.openDraftForConsultation(params);
  },
  async updateCoffeeAnalysisDraftLinks(params) {
    return coffeeAnalysisRepository.updateDraftLinks(params);
  },
  async getCoffeeAnalysisAuditTimeline(laudoId, user) {
    return coffeeAnalysisRepository.getAuditTimeline(laudoId, user || this.getUser());
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

  // ── Fotos (Firebase Storage — apenas metadados no Firestore) ─────────────────

  /**
   * uploadPhoto — comprime a imagem no cliente, faz upload para o Firebase Storage
   * e salva apenas os metadados (URL pública) no Firestore.
   * Resolve o erro de limite de 1MB do Firestore.
   *
   * @param {File}   file        - Arquivo de imagem selecionado pelo usuário
   * @param {string} containerId - ID do container ao qual a foto pertence
   * @returns {Promise<{id: string, name: string, url: string}>}
   */
  async uploadPhoto(file, containerId = '', options = {}) {
    // 1. Comprime a imagem localmente com a regra padronizada (<= 45.000 bytes, adaptativo)
    const compressed = await compressImage(file, { includeDataUrl: false });
    if (!compressed.blob?.size) throw new Error('Não foi possível preparar esta foto; a captura continua no aparelho.');

    // 2. ID único para a foto
    const photoId = options.photoId || 'photo_' + generateUUID();

    // 3. Blob comprimido pronto para upload direto sem conversões redundantes
    const blob = compressed.blob;

    // 4. Faz upload do Blob para Firebase Storage
    //    Path: containers/{containerId}/{photoId}.jpg
    const storagePath = `containers/${containerId || 'uncategorized'}/${photoId}.jpg`;
    const storageRef  = ref(storage, storagePath);
    const task = uploadBytesResumable(storageRef, blob, { contentType: blob.type || 'image/jpeg' });
    await new Promise((resolve, reject) => {
      let timer;
      const arm = () => { clearTimeout(timer); timer = setTimeout(() => {
        task.cancel(); reject(new Error('Envio sem progresso. A foto permanece na fila para nova tentativa.'));
      }, 60000); };
      arm();
      let transferred = -1;
      task.on('state_changed', snapshot => {
        if (snapshot.bytesTransferred > transferred) { transferred = snapshot.bytesTransferred; arm(); }
      }, error => { clearTimeout(timer); reject(error); }, () => { clearTimeout(timer); resolve(); });
    });

    // 5. Obtém a URL pública permanente do Storage
    const downloadUrl = await getDownloadURL(storageRef);

    // 6. Salva metadados no Firestore com informações de resolução e versão da compressão
    await setDoc(doc(dbFirestore, PHOTOS_COL, photoId), {
      id:                  photoId,
      containerId:         containerId,
      storagePath:         storagePath,
      url:                 downloadUrl,
      name:                '',
      createdAt:           Date.now(),
      width:               compressed.width,
      height:              compressed.height,
      sizeBytes:           compressed.sizeBytes,
      compressionVersion:  compressed.compressionVersion,
      quality:             compressed.quality,
      withinLimit:         compressed.withinLimit
    });

    // 7. Retorna metadados + URL do Storage para exibição imediata
    return {
      id:                  photoId,
      name:                '',
      url:                 downloadUrl,
      storagePath:         storagePath,
      width:               compressed.width,
      height:              compressed.height,
      sizeBytes:           compressed.sizeBytes,
      compressionVersion:  compressed.compressionVersion
    };
  },

  /**
   * getPhotosForContainer — busca todos os metadados de fotos de um container.
   * Retorna { id, url, name, storagePath } — url aponta para o Firebase Storage.
   */
  async getPhotosForContainer(containerId, sourceIds = []) {
    const snapshots = await Promise.all([...new Set([containerId, ...sourceIds])].map(id =>
      getDocs(query(collection(dbFirestore, PHOTOS_COL), where('containerId', '==', id)))));
    return [...new Map(snapshots.flatMap(snap => snap.docs).map(d => {
      const data = d.data();
      // Compatibilidade retroativa: fotos antigas podem ter dataUrl em vez de url
      return [d.id, { ...data, id: d.id, url: data.url || data.dataUrl || null }];
    })).values()];
  },

  /**
   * deletePhoto — apaga a foto do Firestore E do Firebase Storage.
   */
  async deletePhoto(photoId, storagePath = null) {
    // Remove the source reference too, so a later field upload cannot restore a deleted photo.
    const registeredPath = await removeFieldPhotoMetadata(photoId);
    storagePath = storagePath || registeredPath;

    // 1. Apaga do Firestore
    try {
      // Busca o storagePath se não foi fornecido
      if (!storagePath) {
        const docSnap = await getDocs(
          query(collection(dbFirestore, PHOTOS_COL), where('id', '==', photoId))
        );
        if (!docSnap.empty) {
          storagePath = docSnap.docs[0].data().storagePath || null;
        }
      }
      await deleteDoc(doc(dbFirestore, PHOTOS_COL, photoId));
    } catch (err) {
      console.warn('deletePhoto: não encontrada em containerPhotos', photoId, err);
    }

    // 2. Apaga o arquivo do Firebase Storage (se tiver o path)
    if (storagePath) {
      try {
        await deleteObject(ref(storage, storagePath));
      } catch (err) {
        // Ignora erro se o arquivo já não existe no Storage
        if (err.code !== 'storage/object-not-found') {
          console.warn('deletePhoto: erro ao apagar do Storage', storagePath, err);
        }
      }
    }
  },

  // Métodos de Sync Obsoletos (mantidos vazios para não quebrar componentes não migrados)
  async syncPull() { return false; },
  async syncPush() {},

  // Coffee Analysis Repository Methods
  coffeeAnalysis: coffeeAnalysisRepository
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

export function useCoffeeAnalysesWithState() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(dbFirestore, COFFEE_ANALYSES_COL),
      snapshot => {
        const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setData(items);
        setLoading(false);
        setError('');
      },
      err => {
        console.error('Error fetching coffeeAnalyses:', err);
        setError(err.message || 'Erro ao carregar laudos de café.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { data, loading, error };
}

export function useLocais() { return useCollectionRealtime(LOCALS_COL); }
export function useExportadores() {
  const raw = useCollectionRealtime(EXPORTERS_COL);
  return useMemo(() => normalizeExportadoresWithCodes(raw), [raw]);
}
export function useInspectors() { return useCollectionRealtime(INSPECTORS_COL); }
export function useBookings() { return useCollectionRealtime(BOOKINGS_COL); }
export function useUsers() { return useCollectionRealtime(USERS_COL); }
export function useCoffeeAnalyses() { return useCollectionRealtime(COFFEE_ANALYSES_COL); }

export function useCoffeeAnalysisAuditEvents(laudoId) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!laudoId) {
      setEvents([]);
      return undefined;
    }
    const q = query(
      collection(dbFirestore, COFFEE_ANALYSIS_AUDIT_COL),
      where('laudoId', '==', String(laudoId))
    );
    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setEvents(items);
      },
      err => {
        console.error('Error fetching coffeeAnalysisAuditEvents:', err);
      }
    );
    return () => unsubscribe();
  }, [laudoId]);

  return events;
}

import { normalizeText, normalizeCode, matchesContainerQuery, matchesBooking, getMatchedContainers } from './utils/searchUtils';

export {
  normalizeText,
  normalizeCode,
  matchesContainerQuery,
  matchesBooking,
  getMatchedContainers,
  formatExporterCnpj,
  inferExporterRegistrationDate,
  formatExporterDateBr,
  generateNextExporterCode,
  normalizeExportadoresWithCodes,
  getExporterDocumentLabel
};

export function isBookingNumberDuplicate(bookings, bookingNumber, currentBookingId = null) {
  const key = normalizeBookingNumber(bookingNumber);
  return Boolean(key) && (bookings || []).some(b => b.id !== currentBookingId && normalizeBookingNumber(b.bookingNumber) === key);
}

/**
 * Retorna com segurança a representação em texto (string) de um lacre,
 * seja ele uma string simples, número ou um objeto (ex: { sealNumber: "..." }, { seal: "..." }, etc.).
 * Evita o erro 'React Error #31: Objects are not valid as a React child'.
 */
export function getSealText(seal) {
  if (seal === null || seal === undefined) return '';
  if (typeof seal === 'string') return seal;
  if (typeof seal === 'number') return String(seal);
  if (typeof seal === 'object') {
    return seal.sealNumber || seal.seal || seal.number || seal.value || seal.lacre || seal.id || '';
  }
  return String(seal);
}
