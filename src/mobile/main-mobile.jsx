import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import MobileAppView from '../components/MobileAppView';
import Login from '../components/Login';
import { db } from '../db';
import { registerSW } from 'virtual:pwa-register';
import { startBookingPhotoQueue } from '../utils/bookingPhotoQueue.js';

let isReloading = false;
registerSW({ 
  immediate: true,
  onNeedRefresh() {
    if (!isReloading) {
      isReloading = true;
      window.location.reload();
    }
  }
});

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

// Inicializar banco
db.init().catch(err => console.error('DB init error:', err));
startBookingPhotoQueue();

function MobileRoot() {
  const [user, setUser] = useState(db.getUser());

  const handleLogin = (u) => {
    db.setUser(u);
    setUser(u);
  };

  const handleLogout = () => {
    db.setUser(null);
    setUser(null);
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <MobileAppView
      user={user}
      onLogout={handleLogout}
    />
  );
}

createRoot(document.getElementById('root')).render(<MobileRoot />);
