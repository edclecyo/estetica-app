import auth from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

const WEB_CLIENT_ID =
  '1043439367326-jp6d5smhkvjtnpnusj59g7c7hv33v2o7.apps.googleusercontent.com';

let configured = false;

export function configurarGoogleSignIn() {
  if (configured) return;

  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
  });

  configured = true;
}

export async function entrarComGoogle() {
  configurarGoogleSignIn();

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  await GoogleSignin.signOut().catch(() => {});

  const signInResult = await GoogleSignin.signIn();
  const idToken = signInResult.data?.idToken;

  if (!idToken) {
    throw new Error('Token nao encontrado.');
  }

  const googleCredential = auth.GoogleAuthProvider.credential(idToken);
  const { user } = await auth().signInWithCredential(googleCredential);

  return user;
}

export async function sairGoogle() {
  configurarGoogleSignIn();
  await GoogleSignin.signOut().catch(() => {});
}
