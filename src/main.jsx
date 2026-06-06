import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { db } from './db'
import { registerSW } from 'virtual:pwa-register'

// Registrar Service Worker do PWA para carregamento offline/instantâneo
registerSW({ immediate: true });

// Inicializar banco de dados se necessário (cria coleções padrão se vazias)
db.init().catch(err => console.error("Database initialization failed:", err));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

