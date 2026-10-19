import {startBookingPhotoQueue} from './utils/bookingPhotoQueue.js';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { db } from './db'
import { registerSW } from 'virtual:pwa-register'

// Controle de versão do build para invalidar caches antigos no navegador do usuário
const CURRENT_APP_BUILD = '2026.10.19.r3';
try {
  const cachedBuild = localStorage.getItem('unispect_app_build');
  if (cachedBuild !== CURRENT_APP_BUILD) {
    localStorage.setItem('unispect_app_build', CURRENT_APP_BUILD);
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).catch(() => {});
    }
  }
} catch (e) {
  void e;
}

// Registrar Service Worker do PWA com atualização automática forçada
const updateSW = registerSW({ 
  immediate: true,
  onNeedRefresh() {
    console.log("Novo conteúdo disponível, atualizando cache...");
    updateSW(true);
  },
  onOfflineReady() {
    console.log("App pronto para uso offline.");
  }
});

// Forçar atualização e reload imediato quando novo SW assumir controle
let isReloading = false;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (let registration of registrations) {
      registration.update().catch(() => {});
    }
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!isReloading) {
      isReloading = true;
      window.location.reload();
    }
  });
}

// Inicializar banco de dados se necessário (cria coleções padrão se vazias)
db.init().catch(err => console.error("Database initialization failed:", err));

startBookingPhotoQueue();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

