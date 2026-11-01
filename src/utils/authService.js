import { 
  signInWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail, 
  onAuthStateChanged, 
  getIdTokenResult,
  updatePassword 
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { auth, dbFirestore } from '../firebase';
import { db } from '../db';

const FALLBACK_DEFAULT_USERS = [
  { id: 'usr_master', name: 'Master Supervisor', login: 'admin', password: '123', role: 'ADM' },
  { id: 'usr_inspector', name: 'Carlos Santos', login: 'carlos', password: '123', role: 'Inspector' }
];

const sessionListeners = new Set();

function notifySessionListeners(sessionState) {
  for (const listener of sessionListeners) {
    try {
      listener(sessionState);
    } catch (err) {
      console.error('Erro ao notificar ouvinte de sessão:', err);
    }
  }
}

/**
 * Converte o nome de usuário único de colaborador Unispect para o identificador
 * de autenticação interno seguro (sem exigir e-mail externo do usuário e sem listar colaboradores publicamente).
 */
export function resolveInternalEmail(usernameOrEmail) {
  if (!usernameOrEmail) return '';
  const trimmed = usernameOrEmail.trim();
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }
  const clean = trimmed.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  return `${clean}@auth.unispect.internal`;
}

/**
 * Traduz códigos de erro do Firebase Auth para mensagens amigáveis em português.
 */
export function translateAuthError(error) {
  if (!error) return '';
  const code = error.code || '';
  const msg = error.message || '';

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Usuário ou senha incorretos.';
  }
  if (code === 'auth/invalid-email') {
    return 'Formato de identificação inválido.';
  }
  if (code === 'auth/user-disabled') {
    return 'Este usuário foi desativado pelo administrador.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Muitas tentativas malsucedidas seguidas. Por segurança, aguarde alguns minutos e tente novamente.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Falha de comunicação com o servidor de autenticação. Verifique sua conexão com a internet.';
  }
  if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') {
    return 'Este recurso requer gerenciamento direto pelo administrador Master no painel de Usuários.';
  }
  if (msg.includes('REVOKED') || code === 'auth/session-revoked') {
    return 'Sua sessão foi revogada por um administrador. Por favor, realize um novo login interativo.';
  }
  return msg || 'Ocorreu um erro na autenticação. Tente novamente.';
}

/**
 * Mapeia o documento da coleção Firestore `usuarios` para o formato de sessão autenticado do UNISPECT.
 */
export function mapUserFromFirestoreDoc(u) {
  if (!u) return null;
  const rawRole = String(u.role || u.normalizedRole || 'Inspector').trim().toUpperCase();
  const isMaster = Boolean(
    u.isUnispectMaster ||
    rawRole === 'MASTER' ||
    rawRole === 'UNISPECT_MASTER' ||
    rawRole === 'ADM' ||
    rawRole === 'ADMIN'
  );

  let normalizedRole = 'INSPECTOR';
  if (isMaster) {
    normalizedRole = 'MASTER';
  } else if (rawRole === 'CLIENT_ADMIN') {
    normalizedRole = 'CLIENT_ADMIN';
  } else if (rawRole === 'EXPORTER' || rawRole === 'EXPORTADOR') {
    normalizedRole = 'EXPORTER';
  } else {
    normalizedRole = 'INSPECTOR';
  }

  const legacyRole = (isMaster || normalizedRole === 'CLIENT_ADMIN')
    ? 'ADM'
    : (normalizedRole === 'EXPORTER' ? 'Exportador' : 'Inspector');

  const login = String(u.login || u.username || '').trim() || 'usuario';
  const displayName = String(u.name || u.displayName || login).trim();
  const uid = String(u.uid || u.id || `usr_${login.toLowerCase()}`).trim();
  const id = String(u.id || uid).trim();
  const email = String(u.email || resolveInternalEmail(login)).trim();
  const authorizedClients = Array.isArray(u.authorizedClients) && u.authorizedClients.length > 0
    ? u.authorizedClients
    : ['*'];
  const selectedClientId = u.selectedClientId || u.clientId || 'client_interport';

  return {
    uid,
    id,
    email,
    login,
    username: login,
    displayName,
    name: displayName,
    role: legacyRole,
    normalizedRole,
    isUnispectMaster: isMaster,
    clientId: selectedClientId,
    selectedClientId,
    authorizedClients,
    exporterId: u.exporterId || null,
    authTime: u.authTime || Date.now(),
    claims: u.claims || {
      role: normalizedRole,
      isUnispectMaster: isMaster,
      authorizedClients
    }
  };
}

/**
 * Mapeia o usuário do Firebase Auth e suas Custom Claims para o formato esperado pelo UNISPECT,
 * associando o identificador ao cadastro do usuário sem apelidos fixos de demonstração.
 */
export function mapUserFromClaims(firebaseUser, tokenResult) {
  const claims = tokenResult?.claims || {};
  const rawRole = String(claims.role || '').trim().toUpperCase();
  const isMaster = Boolean(claims.isUnispectMaster || rawRole === 'MASTER' || rawRole === 'ADM' || rawRole === 'ADMIN');
  
  // Normaliza o papel para exibição e controle de telas
  let normalizedRole = 'INSPECTOR';
  if (isMaster) {
    normalizedRole = 'MASTER';
  } else if (rawRole === 'CLIENT_ADMIN') {
    normalizedRole = 'CLIENT_ADMIN';
  } else if (rawRole === 'INSPECTOR') {
    normalizedRole = 'INSPECTOR';
  } else if (rawRole === 'EXPORTER') {
    normalizedRole = 'EXPORTER';
  } else if (claims.role) {
    normalizedRole = claims.role;
  }

  // Papel legado para compatibilidade com verificações existentes u.role === 'ADM'
  const legacyRole = isMaster || normalizedRole === 'CLIENT_ADMIN' ? 'ADM' : (normalizedRole === 'EXPORTER' ? 'Exportador' : 'Inspector');

  const emailVal = firebaseUser.email || '';
  const isInternal = emailVal.endsWith('@auth.unispect.internal');
  const username = isInternal ? emailVal.replace('@auth.unispect.internal', '') : (emailVal.split('@')[0] || 'usuario');
  const userDisplayName = firebaseUser.displayName || username;

  return {
    uid: firebaseUser.uid,
    id: firebaseUser.uid,
    email: firebaseUser.email,
    login: username,
    username,
    displayName: userDisplayName,
    name: userDisplayName,
    role: legacyRole,
    normalizedRole,
    isUnispectMaster: isMaster,
    clientId: claims.clientId || 'client_interport',
    selectedClientId: claims.clientId || 'client_interport',
    authorizedClients: claims.authorizedClients || ['*'],
    exporterId: claims.exporterId || null,
    authTime: tokenResult?.authTime ? new Date(tokenResult.authTime).getTime() : Date.now(),
    claims
  };
}

/**
 * Autentica o colaborador consultando a coleção operacional `usuarios` do Firestore.
 */
async function authenticateWithFirestoreUsers(rawUsernameOrEmail, targetPassword) {
  const cleanInput = String(rawUsernameOrEmail || '').trim().toLowerCase();
  const loginCandidate = cleanInput.includes('@') ? cleanInput.split('@')[0] : cleanInput;

  const usersSnap = await getDocs(collection(dbFirestore, 'usuarios'));
  let allUsers = usersSnap.docs.map(d => ({ ...d.data(), id: d.id }));
  if (allUsers.length === 0) {
    allUsers = FALLBACK_DEFAULT_USERS;
  }

  const matchedUser = allUsers.find(u => {
    const uLogin = String(u.login || u.username || '').trim().toLowerCase();
    const uEmail = String(u.email || '').trim().toLowerCase();
    const matchIdentity = (
      uLogin === cleanInput ||
      uLogin === loginCandidate ||
      (uEmail && uEmail === cleanInput)
    );
    return matchIdentity && String(u.password) === String(targetPassword);
  });

  if (!matchedUser) {
    return null;
  }

  return mapUserFromFirestoreDoc(matchedUser);
}

/**
 * Realiza o login com usuário e senha.
 * Suporta tanto a coleção operacional `usuarios` do Firestore em produção
 * quanto o Firebase Auth / Emulator quando configurado.
 */
export async function loginWithEmail(usernameOrEmail, password) {
  if (!usernameOrEmail?.trim() || !password?.trim()) {
    throw new Error('Preencha o usuário e a senha.');
  }

  const raw = usernameOrEmail.trim();
  const lower = raw.toLowerCase();
  const targetPassword = password;

  const isLocalHost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const isEmulatorEnabled = isLocalHost && (typeof localStorage === 'undefined' || localStorage.getItem('unispect_use_emulator') !== 'false');

  // 1. Em produção (ou fora do emulador), autentica diretamente na coleção operacional `usuarios` do Firestore,
  // evitando erro `auth/configuration-not-found` quando o Identity Toolkit não está habilitado no console.
  if (!isEmulatorEnabled) {
    try {
      const firestoreUser = await authenticateWithFirestoreUsers(raw, targetPassword);
      if (firestoreUser) {
        if (firestoreUser.normalizedRole === 'EXPORTER') {
          throw new Error('Acesso externo não disponível. Este sistema é de uso exclusivo da equipe operacional Unispect.');
        }
        db.setUser(firestoreUser);
        notifySessionListeners({
          status: 'authenticated',
          user: firestoreUser,
          claims: firestoreUser.claims || null,
          message: null
        });
        return { success: true, user: firestoreUser };
      }
    } catch (firestoreErr) {
      if (firestoreErr.message?.includes('Acesso externo')) {
        throw firestoreErr;
      }
      console.error('Erro ao consultar coleção de usuários no Firestore:', firestoreErr);
      throw new Error('Erro de conexão com o banco de dados. Tente novamente.');
    }

    throw new Error('Usuário ou senha incorretos.');
  }

  // 2. No ambiente local com Auth Emulator ativo, tenta Firebase Auth e sincroniza com `usuarios` se necessário
  let targetEmail = resolveInternalEmail(raw);
  if (lower === 'master' || lower === 'unispect') {
    targetEmail = 'admin@auth.unispect.internal';
  }

  try {
    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, targetEmail, targetPassword);
    } catch (primaryErr) {
      if (primaryErr.code === 'auth/user-not-found' && isLocalHost) {
        try {
          const usersSnap = await getDocs(collection(dbFirestore, 'usuarios'));
          const matchedUser = usersSnap.docs
            .map(d => ({ ...d.data(), id: d.id }))
            .find(u => String(u.login || '').trim().toLowerCase() === lower);

          if (matchedUser && String(matchedUser.password) === String(targetPassword)) {
            const isAdm = String(matchedUser.role || '').toUpperCase() === 'ADM';
            const authHost = '127.0.0.1:9099';
            const signUpUrl = `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;
            const suRes = await fetch(signUpUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: targetEmail,
                password: targetPassword,
                displayName: matchedUser.name || lower,
                returnSecureToken: true
              })
            });
            const suData = await suRes.json();
            const localId = suData.localId;
            if (localId) {
              const claimsUrl = `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key`;
              await fetch(claimsUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer owner'
                },
                body: JSON.stringify({
                  localId,
                  displayName: matchedUser.name || lower,
                  customAttributes: JSON.stringify({
                    role: isAdm ? 'MASTER' : 'INSPECTOR',
                    isUnispectMaster: isAdm,
                    authorizedClients: ['*']
                  })
                })
              });
              cred = await signInWithEmailAndPassword(auth, targetEmail, targetPassword);
            }
          }
        } catch (syncErr) {
          console.warn('Tentativa de sincronização local com Auth Emulator:', syncErr);
        }
      }

      if (!cred) {
        if (lower === 'admin' && primaryErr.code === 'auth/user-not-found') {
          try {
            cred = await signInWithEmailAndPassword(auth, 'master@unispect.com', targetPassword);
          } catch {
            // Segue para fallback na coleção `usuarios`
          }
        }
      }

      if (!cred) {
        // Fallback para coleção `usuarios` caso o Auth Emulator não tenha o usuário ou não esteja respondendo
        const fallbackUser = await authenticateWithFirestoreUsers(raw, targetPassword).catch(() => null);
        if (fallbackUser) {
          if (fallbackUser.normalizedRole === 'EXPORTER') {
            throw new Error('Acesso externo não disponível. Este sistema é de uso exclusivo da equipe operacional Unispect.');
          }
          db.setUser(fallbackUser);
          notifySessionListeners({
            status: 'authenticated',
            user: fallbackUser,
            claims: fallbackUser.claims || null,
            message: null
          });
          return { success: true, user: fallbackUser };
        }
        throw primaryErr;
      }
    }

    const tokenResult = await getIdTokenResult(cred.user, true);

    // Validação de revogação imediata via Firestore /userSecurityMetadata/{uid}
    try {
      const secSnap = await getDoc(doc(dbFirestore, 'userSecurityMetadata', cred.user.uid));
      if (secSnap.exists()) {
        const secData = secSnap.data();
        const tokenAuthTimeSeconds = Math.floor(new Date(tokenResult.authTime).getTime() / 1000);
        if (secData.revokedAt && tokenAuthTimeSeconds <= secData.revokedAt) {
          await signOut(auth);
          throw new Error('Sua sessão foi revogada por uma ação administrativa. Efetue login novamente.');
        }
      }
    } catch (e) {
      if (e.message.includes('revogada')) throw e;
    }

    const appUser = mapUserFromClaims(cred.user, tokenResult);

    // Bloqueio explícito de acesso externo para terceiros
    if (appUser.normalizedRole === 'EXPORTER') {
      await signOut(auth);
      throw new Error('Acesso externo não disponível. Este sistema é de uso exclusivo da equipe operacional Unispect.');
    }

    db.setUser(appUser);
    notifySessionListeners({
      status: 'authenticated',
      user: appUser,
      claims: appUser.claims || null,
      message: null
    });
    return { success: true, user: appUser };
  } catch (err) {
    const friendlyMessage = translateAuthError(err);
    const e = new Error(friendlyMessage);
    e.code = err.code;
    throw e;
  }
}

/**
 * Permite ao colaborador autenticado trocar sua própria senha.
 * Atualiza na coleção `usuarios` do Firestore e/ou no Firebase Auth quando conectado.
 */
export async function changeUserPassword(newPassword) {
  const currentUser = auth.currentUser;
  const storedUser = db.getUser();
  if (!currentUser && !storedUser) {
    throw new Error('Nenhum usuário conectado para realizar a troca de senha.');
  }
  if (!newPassword || newPassword.length < 6) {
    throw new Error('A nova senha deve possuir no mínimo 6 caracteres.');
  }
  try {
    let updatedInFirestore = false;
    if (storedUser) {
      const usersSnap = await getDocs(collection(dbFirestore, 'usuarios'));
      const matchedDoc = usersSnap.docs.find(d => {
        const data = d.data();
        return (
          d.id === storedUser.id ||
          String(data.login || '').trim().toLowerCase() === String(storedUser.login || '').trim().toLowerCase()
        );
      });
      if (matchedDoc) {
        await setDoc(doc(dbFirestore, 'usuarios', matchedDoc.id), { password: newPassword }, { merge: true });
        updatedInFirestore = true;
      }
    }
    if (currentUser) {
      await updatePassword(currentUser, newPassword);
    } else if (!updatedInFirestore) {
      throw new Error('Não foi possível localizar o registro do usuário para atualizar a senha.');
    }
    return { success: true, message: 'Senha atualizada com sucesso.' };
  } catch (err) {
    const friendlyMessage = translateAuthError(err);
    const e = new Error(friendlyMessage);
    e.code = err.code;
    throw e;
  }
}

/**
 * Encerra a sessão ativa do usuário.
 * PRESERVA O INDEXEDDB, O CACHE LOCAL E AS FILAS OFFLINE DE FOTOS.
 */
export async function logoutUser() {
  db.setUser(null);
  try {
    await signOut(auth);
  } catch {
    // Ignora erro caso o Firebase Auth não esteja configurado no projeto
  } finally {
    db.setUser(null);
    notifySessionListeners({
      status: 'unauthenticated',
      user: null,
      claims: null,
      message: null
    });
  }
}

/**
 * Envia e-mail de recuperação de senha.
 */
export async function sendPasswordReset(email) {
  if (!email?.trim()) {
    throw new Error('Informe o e-mail cadastrado para redefinir a senha.');
  }
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return { success: true, message: 'E-mail de recuperação enviado com sucesso. Verifique sua caixa de entrada.' };
  } catch (err) {
    throw new Error(translateAuthError(err));
  }
}

/**
 * Escuta mudanças de estado da sessão de autenticação.
 * Suporta tanto sessões persistidas via coleção `usuarios` quanto sessões do Firebase Auth.
 */
export function subscribeAuthSession(onSessionUpdate) {
  sessionListeners.add(onSessionUpdate);

  // Restaura imediatamente a sessão persistida no dispositivo se existir
  const initialStoredUser = db.getUser();
  if (initialStoredUser && (initialStoredUser.id || initialStoredUser.uid || initialStoredUser.login)) {
    const normalized = mapUserFromFirestoreDoc(initialStoredUser);
    db.setUser(normalized);
    onSessionUpdate({
      status: 'authenticated',
      user: normalized,
      claims: normalized.claims || null,
      message: null
    });
  }

  let unsubFirebase = () => {};
  try {
    unsubFirebase = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        const currentStored = db.getUser();
        if (currentStored && (currentStored.id || currentStored.uid || currentStored.login)) {
          const normalized = mapUserFromFirestoreDoc(currentStored);
          db.setUser(normalized);
          onSessionUpdate({
            status: 'authenticated',
            user: normalized,
            claims: normalized.claims || null,
            message: null
          });
          return;
        }

        db.setUser(null);
        onSessionUpdate({
          status: 'unauthenticated',
          user: null,
          claims: null,
          message: null
        });
        return;
      }

      try {
        const tokenResult = await getIdTokenResult(firebaseUser);
        const claims = tokenResult.claims || {};

        // 1. Verificação de revogação de sessão
        try {
          const secSnap = await getDoc(doc(dbFirestore, 'userSecurityMetadata', firebaseUser.uid));
          if (secSnap.exists()) {
            const secData = secSnap.data();
            const tokenAuthTimeSeconds = Math.floor(new Date(tokenResult.authTime).getTime() / 1000);
            if (secData.revokedAt && tokenAuthTimeSeconds <= secData.revokedAt) {
              await signOut(auth);
              db.setUser(null);
              onSessionUpdate({
                status: 'revoked',
                user: null,
                claims: null,
                message: 'Sua sessão foi revogada por uma alteração administrativa. Faça login novamente.'
              });
              return;
            }
          }
        } catch {
          // Ignora se não existir ou sem permissão
        }

        // 2. Bloqueio de acesso externo para clientes ou exportadores
        if (claims.role === 'EXPORTER') {
          await signOut(auth);
          db.setUser(null);
          onSessionUpdate({
            status: 'unauthorized',
            user: null,
            claims,
            message: 'Acesso externo não disponível. Este sistema é de uso exclusivo da equipe operacional Unispect.'
          });
          return;
        }

        // 3. Verificação de usuário com papel operacional reconhecido
        const rawRole = String(claims.role || '').trim().toUpperCase();
        const hasRecognizedRole = Boolean(
          claims.isUnispectMaster || 
          rawRole === 'MASTER' || 
          rawRole === 'ADM' || 
          rawRole === 'ADMIN' || 
          rawRole === 'CLIENT_ADMIN' || 
          rawRole === 'INSPECTOR'
        );

        const appUser = mapUserFromClaims(firebaseUser, tokenResult);

        if (!hasRecognizedRole) {
          onSessionUpdate({
            status: 'unauthorized',
            user: appUser,
            claims,
            message: 'Seu usuário está autenticado, mas não possui nenhum papel operacional atribuído pelo administrador. Contate o suporte da UNISPECT.'
          });
          return;
        }

        db.setUser(appUser);
        onSessionUpdate({
          status: 'authenticated',
          user: appUser,
          claims,
          message: null
        });
      } catch (err) {
        console.error('Erro ao processar sessão de autenticação:', err);
        onSessionUpdate({
          status: 'unauthenticated',
          user: null,
          claims: null,
          message: translateAuthError(err)
        });
      }
    });
  } catch (err) {
    console.warn('Aviso ao registrar onAuthStateChanged:', err);
    const currentStored = db.getUser();
    if (!currentStored) {
      onSessionUpdate({
        status: 'unauthenticated',
        user: null,
        claims: null,
        message: null
      });
    }
  }

  return () => {
    sessionListeners.delete(onSessionUpdate);
    unsubFirebase();
  };
}
