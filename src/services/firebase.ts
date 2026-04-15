import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';

const fn = functions('southamerica-east1');

export { auth, firestore, fn };