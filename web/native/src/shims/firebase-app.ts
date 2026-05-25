import { getWebApp } from './firebase-core';

export function getApp() {
  return getWebApp();
}

export default {
  app: getApp,
};
