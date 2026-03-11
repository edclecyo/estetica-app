import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import type { Admin } from '../types';

export async function cadastrarAdmin(dados: {
  nome: string;
  email: string;
  telefone: string;
  senha: string;
}): Promise<void> {
  // 1. Cria no Auth
  const { user } = await auth().createUserWithEmailAndPassword(
    dados.email,
    dados.senha
  );

  // 2. Atualiza nome
  await user.updateProfile({ displayName: dados.nome });

  // 3. Salva direto no Firestore (sem Functions)
  const docRef = firestore().collection('admins').doc(user.uid);

  await docRef.set({
    nome: dados.nome,
    email: dados.email,
    telefone: dados.telefone || '',
    cargo: 'Admin',
    ativo: true,
    criadoEm: firestore.FieldValue.serverTimestamp(),
  });
}

export async function loginAdmin(
  email: string,
  senha: string
): Promise<void> {
  await auth().signInWithEmailAndPassword(email, senha);
}

export async function logoutAdmin(): Promise<void> {
  await auth().signOut();
}

export async function recuperarSenha(email: string): Promise<void> {
  await auth().sendPasswordResetEmail(email);
}

export async function getAdminData(uid: string): Promise<Admin | null> {
  try {
    const snap = await firestore()
      .collection('admins')
      .doc(uid)
      .get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() } as Admin;
  } catch (e) {
    return null;
  }
}