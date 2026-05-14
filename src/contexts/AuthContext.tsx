// src/contexts/AuthContext.tsx
// Auth state provider. Subscribes to Firebase auth changes and exposes
// sign-in / sign-up / sign-out methods to the rest of the app.

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  EmailAuthProvider,
  linkWithCredential,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import { auth } from '../lib/firebase';

type AuthContextValue = {
  user: User | null;
  isAnonymous: boolean;
  isLoading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInAsGuest: () => Promise<void>;
  upgradeAnonymousAccount: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // onAuthStateChanged returns an unsubscribe function. We fire it on unmount
    // to avoid setState calls on a torn-down component.
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpWithEmail = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const signInAsGuest = async () => {
    await signInAnonymously(auth);
  };

  // Upgrades the current anonymous user to a permanent email/password account
  // by linking the credential to the existing UID. This preserves all
  // Firestore data keyed on the UID — wallet, inventory, decks, progress.
  // Throws Firebase auth errors (e.g. auth/email-already-in-use,
  // auth/weak-password) for the caller to map to UI messages.
  const upgradeAnonymousAccount = async (email: string, password: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No signed-in user to upgrade.');
    }
    const credential = EmailAuthProvider.credential(email, password);
    await linkWithCredential(currentUser, credential);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const value: AuthContextValue = {
    user,
    isAnonymous: user?.isAnonymous ?? false,
    isLoading,
    signInWithEmail,
    signUpWithEmail,
    signInAsGuest,
    upgradeAnonymousAccount,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}