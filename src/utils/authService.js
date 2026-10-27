import { 
  signInWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail, 
  onAuthStateChanged, 
  getIdTokenResult 
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, dbFirestore } from '../firebase';
import { db } from '../db';

/**
 * Traduz códigos de erro do Firebase Auth para mensagens amigáveis em português.
 */
export function translateAuthError(error) {
  if (!error) return '';
  const code = error.code || '';
  const msg = error.message || '';

  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'E-mail ou senha incorretos.';
  }
  if (code === 'auth/invalid-email') {
    return 'Formato de e-mail inválido.';
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
 * garantindo compatibilidade total com os layouts e componentes legados existentes.
 */
export function mapUserFromClaims(firebaseUser, tokenResult) {
  const claims = tokenResult?.claims || {};
  const isMaster = Boolean(claims.isUnispectMaster || claims.role === 'MASTER');
  
  // Normaliza o papel para exibição e controle de telas
  let normalizedRole = 'INSPECTOR';
  if (isMaster) {
    normalizedRole = 'MASTER';
  } else if (claims.role === 'CLIENT_ADMIN') {
    normalizedRole = 'CLIENT_ADMIN';
  } else if (claims.role === 'INSPECTOR') {
    normalizedRole = 'INSPECTOR';
  } else if (claims.role === 'EXPORTER') {
    normalizedRole = 'EXPORTER';
  } else if (claims.role) {
    normalizedRole = claims.role;
  }

  // Papel legado para manter compatibilidade com componentes existentes que checam u.role === 'ADM'
  const legacyRole = isMaster || normalizedRole === 'CLIENT_ADMIN' ? 'ADM' : (normalizedRole === 'EXPORTER' ? 'Exportador' : 'Inspector');

  return {
    uid: firebaseUser.uid,
    id: firebaseUser.uid,
    email: firebaseUser.email,
    login: firebaseUser.email,
    displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuário',
    name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuário',
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
 * Realiza o login com e-mail e senha no Firebase Auth.
 */
export async function loginWithEmail(email, password) {
  if (!email?.trim() || !password?.trim()) {
    throw new Error('Preencha o e-mail e a senha.');
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
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
      // Se não tiver permissão para ler ou doc não existir, prossegue com o fluxo normal
      if (e.message.includes('revogada')) throw e;
    }

    const appUser = mapUserFromClaims(cred.user, tokenResult);
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

      // 2. Verificação de usuário sem papel reconhecido
      const hasRecognizedRole = Boolean(
        claims.isUnispectMaster || 
        claims.role === 'MASTER' || 
        claims.role === 'CLIENT_ADMIN' || 
        claims.role === 'INSPECTOR' || 
        claims.role === 'EXPORTER'
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
