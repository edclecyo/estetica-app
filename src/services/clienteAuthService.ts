import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { registrarTokenPush } from './notificacaoService';
GoogleSignin.configure({
  webClientId: '1043439367326-jp6d5smhkvjtnpnusj59g7c7hv33v2o7.apps.googleusercontent.com',
});

export async function loginClienteEmail(email: string, senha: string) {
  const { user } = await auth().signInWithEmailAndPassword(email, senha);
  return user;
  await registrarTokenPush(credential.user.uid, 'cliente');
}

export async function cadastrarClienteEmail(nome: string, email: string, senha: string) {
  
  try {
    // 1 — Cria no Auth
    const { user } = await auth().createUserWithEmailAndPassword(email, senha);
    await registrarTokenPush(credential.user.uid, 'cliente');
    // 2 — Atualiza nome
    await user.updateProfile({ displayName: nome });

    // 3 — Tenta salvar no Firestore (não bloqueia se falhar)
    try {
      await firestore().collection('clientes').doc(user.uid).set({
        nome,
        email,
        criadoEm: firestore.FieldValue.serverTimestamp(),
      });
    } catch (firestoreError) {
      console.log('Firestore erro (não crítico):', firestoreError);
    }

    return user;
  } catch (e) {
    throw e;
  }
}

export async function loginClienteGoogle() {
  try {
	  await registrarTokenPush(credential.user.uid, 'cliente');
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signOut(); // limpa sessão anterior
    const signInResult = await GoogleSignin.signIn();
    const idToken = signInResult.data?.idToken;
    
    if (!idToken) throw new Error('Token não encontrado.');
    
    const credential = auth.GoogleAuthProvider.credential(idToken);
    const { user } = await auth().signInWithCredential(credential);

    // Salva no Firestore sem bloquear
    try {
      const doc = await firestore().collection('clientes').doc(user.uid).get();
      if (!doc.exists) {
        await firestore().collection('clientes').doc(user.uid).set({
          nome: user.displayName || '',
          email: user.email || '',
          foto: user.photoURL || '',
          criadoEm: firestore.FieldValue.serverTimestamp(),
        });
      }
    } catch (firestoreError) {
      console.log('Firestore erro (não crítico):', firestoreError);
    }

    return user;
  } catch (e: any) {
    console.log('Google erro completo:', JSON.stringify(e));
    throw e;
  }
}

export async function logoutCliente() {
  try {
    const user = auth().currentUser;
    if (user) {
      await auth().signOut();
    }
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