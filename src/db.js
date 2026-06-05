import { useState, useEffect } from 'react';
import { dbFirestore, storage } from './firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot, getDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';

// Coleções
const LOCALS_COL = 'locais';
const EXPORTERS_COL = 'exportadores';
const BOOKINGS_COL = 'bookings';
const INSPECTORS_COL = 'inspectors';
const USERS_COL = 'usuarios';
const USER_KEY = 'containtrack_user';

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

  async uploadPhoto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const tempImg = new Image();
        tempImg.onload = async () => {
          // Determina as novas dimensões preservando o aspect ratio
          let width = tempImg.width;
          let height = tempImg.height;
          
          // Limites de resolução mantendo a orientação
          const maxWidth = width > height ? 1024 : 768;
          const maxHeight = width > height ? 768 : 1024;
          
          if (width > maxWidth) {
            height = Math.round(height * (maxWidth / width));
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = Math.round(width * (maxHeight / height));
            height = maxHeight;
          }
          
          // Redimensiona usando Canvas
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(tempImg, 0, 0, width, height);
          
          // Compacta em JPEG com qualidade 0.8
          const resizedBase64 = canvas.toDataURL('image/jpeg', 0.8);
          const filename = `photos/photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
          
          try {
            const storageRef = ref(storage, filename);
            await uploadString(storageRef, resizedBase64, 'data_url');
            const downloadURL = await getDownloadURL(storageRef);
            resolve(downloadURL);
          } catch (error) {
            console.error("Firebase Storage Upload failed:", error);
            reject(new Error("Não foi possível enviar a imagem para o Firebase Storage. " +
                              "Verifique se o serviço Storage está ativo no Console do Firebase e se as Regras de Segurança (Rules) " +
                              "permitem gravação pública (sem autenticação). Detalhes: " + (error.message || error)));
          }
        };
        tempImg.onerror = () => {
          reject(new Error('Image loading failed'));
        };
        tempImg.src = reader.result;
      };
      reader.onerror = () => {
        reject(new Error('File reading failed'));
      };
      reader.readAsDataURL(file);
    });
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
