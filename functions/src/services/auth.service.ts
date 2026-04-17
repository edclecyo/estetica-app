import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore'; // Importação limpa

// Usando as instâncias centralizadas
import { db, auth } from '../config/firebase'; 
import { REGION } from '../config/region';
/**
 * ─────────────────────────────────────────────
 * 👤 CRIAR USUÁRIO (ADMIN / CLIENTE)
 * ─────────────────────────────────────────────
 */
export const criarUsuario = onCall(
  { region: REGION },
  async (req) => {
    // 1. Verificação de autenticação do chamador
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado');
    }

    const { email, senha, nome, tipo } = req.data;

    // 2. Validação de campos
    if (!email || !senha) {
      throw new HttpsError('invalid-argument', 'Email e senha obrigatórios');
    }

    const adminId = req.auth.uid;

    try {
      // 3. Cria usuário no Firebase Auth usando a instância centralizada
      const user = await auth.createUser({
        email,
        password: senha,
        displayName: nome || '',
      });

      // 4. Cria perfil no Firestore
      await db.collection('usuarios').doc(user.uid).set({
        email,
        nome: nome || '',
        tipo: tipo || 'cliente', // admin | cliente
        adminId, // Vincula o cliente ao admin que o criou
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        ativo: true,
      });

      return { ok: true, uid: user.uid };

    } catch (error: any) {
      console.error('Erro ao criar usuário:', error);

      // Tratamento específico para e-mail duplicado
      if (error.code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'Este e-mail já está sendo usado por outro usuário.');
      }

      // Erro genérico formatado
      throw new HttpsError(
        'internal',
        error?.message || 'Erro ao criar usuário'
      );
    }
  }
);

/**
 * ─────────────────────────────────────────────
 * 🔑 LOGIN CHECK (VALIDAÇÃO BACKEND)
 * ─────────────────────────────────────────────
 */
export const verificarUsuario = onCall(
  { region: REGION },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado');
    }

    const uid = req.auth.uid;
    const snap = await db.collection('usuarios').doc(uid).get();

    if (!snap.exists) {
      throw new HttpsError('not-found', 'Usuário não encontrado no banco de dados');
    }

    const data = snap.data();

    // Verifica se o usuário foi banido ou desativado
    if (!data?.ativo) {
      throw new HttpsError('permission-denied', 'Sua conta está desativada. Entre em contato com o suporte.');
    }

    return {
      uid,
      ...data,
    };
  }
);

/**
 * ─────────────────────────────────────────────
 * 🚫 DESATIVAR USUÁRIO
 * ─────────────────────────────────────────────
 */
export const desativarUsuario = onCall(
  { region: REGION },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado');
    }

    const { uid } = req.data;
    if (!uid) {
      throw new HttpsError('invalid-argument', 'UID do usuário é obrigatório');
    }

    const callerUid = req.auth.uid;

    // 1. Verifica se quem está tentando desativar é um Admin
    const callerSnap = await db.collection('usuarios').doc(callerUid).get();
    if (callerSnap.data()?.tipo !== 'admin') {
      throw new HttpsError('permission-denied', 'Somente administradores podem desativar usuários');
    }

    const userRef = db.collection('usuarios').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'Usuário não encontrado');
    }

    try {
      // 2. Desativa no Firestore (para travas de lógica do app)
      await userRef.update({
        ativo: false,
        desativadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 3. Desativa no Firebase Auth (Impedindo logins futuros e derrubando a sessão)
      await auth.updateUser(uid, { disabled: true });

      return { ok: true };
    } catch (error: any) {
      console.error('Erro ao desativar usuário:', error);
      throw new HttpsError('internal', 'Falha ao processar a desativação');
    }
  }
);