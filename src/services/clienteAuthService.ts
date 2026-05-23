import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { registrarTokenPush } from './notificacao.service';
import { entrarComGoogle, sairGoogle } from './googleAuthService';

export async function loginClienteEmail(email: string, senha: string) {
  const { user } = await auth().signInWithEmailAndPassword(email, senha);
  await registrarTokenPush(user.uid, 'cliente');
  return user;
}

export async function cadastrarClienteEmail(
  nome: string,
  email: string,
  senha: string
) {
  const { user } = await auth().createUserWithEmailAndPassword(email, senha);
  await registrarTokenPush(user.uid, 'cliente');

  await user.updateProfile({ displayName: nome });

  try {
    await firestore().collection('clientes').doc(user.uid).set({
      nome,
      email,
      criadoEm: firestore.FieldValue.serverTimestamp(),
    });
  } catch (firestoreError) {
    console.log('Firestore erro cliente:', firestoreError);
  }

  return user;
}

export async function loginClienteGoogle() {
  try {
    const user = await entrarComGoogle();
    const adminSnap = await firestore().collection('admins').doc(user.uid).get();

    if (adminSnap.exists && adminSnap.data()?.ativo) {
      await auth().signOut();
      await sairGoogle();
      throw new Error('admin-account');
    }

    await registrarTokenPush(user.uid, 'cliente');

    try {
      const doc = await firestore().collection('clientes').doc(user.uid).get();
      if (!doc.exists) {
        await firestore().collection('clientes').doc(user.uid).set(
          {
            nome: user.displayName || '',
            email: user.email || '',
            foto: user.photoURL || '',
            criadoEm: firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (firestoreError) {
      console.log('Firestore erro cliente Google:', firestoreError);
    }

    return user;
  } catch (e: any) {
    console.log('Google erro completo:', e);
    throw e;
  }
}

export async function logoutCliente() {
  try {
    const user = auth().currentUser;
    if (user) await auth().signOut();
  } catch (e) {
    console.log('Logout erro:', e);
  }

  await sairGoogle();
}

export async function getClienteAtual() {
  return auth().currentUser;
}
