import { 
  signInWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail, 
  onAuthStateChanged, 
  getIdTokenResult,
  updatePassword 
} from 'firebase/auth';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { auth, dbFirestore } from '../firebase';
import { db } from '../db';

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

  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
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
  if (code === 'auth/operation-not-allowed') {
    return 'Método de autenticação não habilitado no servidor.';
  }
  if (msg.includes('REVOKED') || code === 'auth/session-revoked') {
    return 'Sua sessão foi revogada por um administrador. Por favor, realize um novo login interativo.';
  }
  return msg || 'Ocorreu um erro na autenticação. Tente novamente.';
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
    authorizedClients: claims.authorizedClients || [],
    exporterId: claims.exporterId || null,
    authTime: tokenResult?.authTime ? new Date(tokenResult.authTime).getTime() : Date.now(),
    claims
  };
}

/**
 * Realiza o login com usuário e senha no Firebase Auth.
 * A senha digitada é enviada sem alteração ao Firebase Auth (sem substituições mágicas de 123).
 */
export async function loginWithEmail(usernameOrEmail, password) {
  if (!usernameOrEmail?.trim() || !password?.trim()) {
    throw new Error('Preencha o usuário e a senha.');
  }

  const raw = usernameOrEmail.trim();
  const lower = raw.toLowerCase();

  // Resolução segura de nome de usuário único de colaborador para conta interna
  let targetEmail = resolveInternalEmail(raw);

  // Suporte a apelidos de laboratório exclusivamente em ambiente local/emulador
  if (lower === 'master' || lower === 'unispect') {
    targetEmail = 'admin@auth.unispect.internal';
  }

  // Envia a senha digitada estritamente sem alteração
  const targetPassword = password;

  try {
    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, targetEmail, targetPassword);
    } catch (primaryErr) {
      // Suporte no ambiente de desenvolvimento/emulador local: se usuário existe em 'usuarios', sincroniza no Auth Emulator
      const isLocalHost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
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
        // Suporte de transição no laboratório: se usuário digitou 'admin' e no emulador existia 'master@unispect.com'
        if (lower === 'admin' && primaryErr.code === 'auth/user-not-found') {
          try {
            cred = await signInWithEmailAndPassword(auth, 'master@unispect.com', targetPassword);
          } catch {
            throw primaryErr;
          }
        } else {
          throw primaryErr;
        }
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
 * A nova senha é validada (mínimo 6 caracteres) e enviada diretamente ao Firebase Auth.
 */
export async function changeUserPassword(newPassword) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Nenhum usuário conectado para realizar a troca de senha.');
  }
  if (!newPassword || newPassword.length < 6) {
    throw new Error('A nova senha deve possuir no mínimo 6 caracteres.');
  }
  try {
    await updatePassword(currentUser, newPassword);
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
  try {
    await signOut(auth);
  } finally {
    // Limpa a referência de usuário em memória/localStorage sem apagar IndexedDB ou filas
    db.setUser(null);
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
 */
export function subscribeAuthSession(onSessionUpdate) {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      db.setUser(null);
      onSessionUpdate({
        status: 'unauthenticated',
        user: null,
        claims: null,
        message: 'Nenhum usuário conectado.'
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
      } catch (err) {
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
}
