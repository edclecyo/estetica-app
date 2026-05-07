import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import type { Admin } from '../types';
import { registrarTokenPush } from './notificacao.service';

export async function cadastrarAdmin(dados: {
  nome: string;
  email: string;
  telefone: string;
  senha: string;
}) {
  const { user } = await auth().createUserWithEmailAndPassword(
    dados.email,
    dados.senha
  );

  await user.updateProfile({ displayName: dados.nome });

  await firestore().collection('admins').doc(user.uid).set({
    nome: dados.nome,
    email: dados.email,
    telefone: dados.telefone || '',
    cargo: 'Admin',
    ativo: true,
    criadoEm: firestore.FieldValue.serverTimestamp(),
  });
}

export async function loginAdmin(email: string, senha: string) {
  const { user } = await auth().signInWithEmailAndPassword(email, senha);
  await registrarTokenPush(user.uid, 'admin');
}

export async function logoutAdmin() {
  await auth().signOut();
}

export async function recuperarSenha(email: string) {
  await auth().sendPasswordResetEmail(email);
}

export async function getAdminData(uid: string): Promise<Admin | null> {
  const snap = await firestore().collection('admins').doc(uid).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as Admin;
}