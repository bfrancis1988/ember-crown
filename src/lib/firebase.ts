// src/lib/firebase.ts
// Firebase initialization with AsyncStorage-backed auth persistence for React Native.
import { initializeApp, getApps, getApp } from 'firebase/app';
// @ts-ignore - getReactNativePersistence exists at runtime but isn't always in Firebase's TS types
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyBm-A3jBV9V4AaYdFK1prKsjdr5ygAfzBc',
  authDomain: 'ember-crown.firebaseapp.com',
  projectId: 'ember-crown',
  storageBucket: 'ember-crown.firebasestorage.app',
  messagingSenderId: '903632353042',
  appId: '1:903632353042:web:b3ad8bc7d00f9e0dc9a5cb',
};

// Avoid "Firebase App '[DEFAULT]' already exists" on Fast Refresh in dev.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// initializeAuth must be called exactly once per app. On Fast Refresh it may
// already be initialized, in which case we fall back to getAuth.
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

const db = getFirestore(app);

export { app, auth, db };