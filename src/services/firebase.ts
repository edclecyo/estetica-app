import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import app from '@react-native-firebase/app';

const fn = functions(app(), 'southamerica-east1');

export { auth, firestore, fn };