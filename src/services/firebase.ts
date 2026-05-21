import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { getFunctions } from '@react-native-firebase/functions';
import { getApp } from '@react-native-firebase/app';

const fn = getFunctions(getApp(), 'southamerica-east1');

export { auth, firestore, fn };
