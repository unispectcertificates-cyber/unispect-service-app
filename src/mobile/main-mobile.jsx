import '../firebase.js';
import { useState, useEffect } from 'react';
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

import { subscribeAuthSession, logoutUser } from '../utils/authService';

// Inicializar banco apenas quando necessário
db.init().catch(err => console.error('DB init error:', err));
startBookingPhotoQueue();

function MobileRoot() {
  const [session, setSession] = useState({
    status: 'checking',
    user: db.getUser(),
    message: null
  });

  useEffect(() => {
    const unsubscribe = subscribeAuthSession(sessionState => {
      setSession(sessionState);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await logoutUser();
  };

  if (session.status === 'checking') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '12px' }}>
        <div style={{ width: '32px', height: '32px', border: '3px solid var(--border-color)', borderTopColor: 'var(--color-brand)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '600' }}>Confirmando sessão segura...</span>
        <style dangerouslySetInnerHTML={{__html: `@keyframes spin { to { transform: rotate(360deg); } }`}} />
      </div>
    );
  }

  if (session.status !== 'authenticated' || !session.user) {
    return (
      <Login
        onLogin={(u) => setSession({ status: 'authenticated', user: u, message: null })}
        initialMessage={session.message}
      />
    );
  }

  return (
    <MobileAppView
      user={session.user}
      onLogout={handleLogout}
    />
  );
}

createRoot(document.getElementById('root')).render(<MobileRoot />);

