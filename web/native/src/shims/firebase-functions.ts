import { getFunctions as getWebFunctions, httpsCallable as webHttpsCallable } from 'firebase/functions';
import { getWebApp } from './firebase-core';

export function getFunctions(_app?: any, region = 'southamerica-east1') {
  return getWebFunctions(getWebApp(), region);
}

export function httpsCallable(functions: any, name: string) {
  return (payload?: any) => webHttpsCallable(functions, name)(payload);
}
