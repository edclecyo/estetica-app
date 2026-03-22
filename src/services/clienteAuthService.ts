import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { registrarTokenPush } from './notificacaoService';

GoogleSignin.configure({
  webClientId: '1043439367326-jp6d5smhkvjtnpnusj59g7c7hv33v2o7.apps.googleusercontent.com',
});

export async function loginClienteEmail(email: string, senha: string) {
  const { user } = await auth().signInWithEmailAndPassword(email, senha);
  await registrarTokenPush(user.uid, 'cliente');
  return user;
}

export async function cadastrarClienteEmail(nome: string, email: string, senha: string) {
  try {
    const { user } = await auth().createUserWithEmailAndPassword(email, senha);
    await user.updateProfile({ displayName: nome });

    // ✅ Cria doc primeiro
    try {
      await firestore().collection('clientes').doc(user.uid).set({
        nome,
        email,
        criadoEm: firestore.FieldValue.serverTimestamp(),
      }, { merge: true }); // ✅ merge garante que fcmToken não é apagado
    } catch (firestoreError) {
      console.log('Firestore erro (não crítico):', firestoreError);
    }

    // ✅ Token depois do set — não será sobrescrito
    await registrarTokenPush(user.uid, 'cliente');

    return user;
  } catch (e) {
    throw e;
  }
}

export async function loginClienteGoogle() {
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signOut();

    const signInResult = await GoogleSignin.signIn();
    const idToken = signInResult.data?.idToken;
    if (!idToken) throw new Error('Token não encontrado.');

    const googleCredential = auth.GoogleAuthProvider.credential(idToken);
    const { user } = await auth().signInWithCredential(googleCredential);

    // ✅ Salva dados com merge — preserva fcmToken existente
    try {
      await firestore().collection('clientes').doc(user.uid).set({
        nome: user.displayName || '',
        email: user.email || '',
        foto: user.photoURL || '',
        criadoEm: firestore.FieldValue.serverTimestamp(),
      }, { merge: true }); // ✅
    } catch (firestoreError) {
      console.log('Firestore erro (não crítico):', firestoreError);
    }

    // ✅ Token após o set
    await registrarTokenPush(user.uid, 'cliente');

    return user;
  } catch (e: any) {
    console.log('Google erro completo:', JSON.stringify(e));
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
  try {
    await GoogleSignin.signOut();
  } catch {}
}

export async function getClienteAtual() {
  return auth().currentUser;
}