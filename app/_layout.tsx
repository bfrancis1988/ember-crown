import { useCallback, useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { SaveProgressProvider } from '../src/contexts/SaveProgressContext';
import { GlobalBackground } from '../src/components/navigation/GlobalBackground';
import { usePlayerProfile } from '../src/hooks/usePlayerProfile';
import { initAdMob } from '../src/lib/admob';
import { initObservability, setObservabilityUser } from '../src/lib/observability';
import { configureGoogleSignin } from '../src/lib/googleSignin';

SplashScreen.preventAutoHideAsync();

// Force-hide the native splash before Android's ~5s ANR threshold even if auth
// never resolves (e.g. network-restricted devices). Without this, a stalled
// onAuthStateChanged left the splash up and tripped an ANR in onCreate.
const SPLASH_FAILSAFE_MS = 4000;

function RootLayoutNav() {
  const { user, isLoading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading } = usePlayerProfile();
  const splashHidden = useRef(false);

  const hideSplash = useCallback(() => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    initAdMob().catch((err) => console.warn('AdMob init failed:', err));
    initObservability().catch((err) => console.warn('Observability init failed:', err));
    // Native module — guarded so a not-yet-rebuilt client warns instead of crashing.
    try {
      configureGoogleSignin();
    } catch (err) {
      console.warn('Google Sign-In config failed:', err);
    }
  }, []);

  useEffect(() => {
    setObservabilityUser(user?.uid ?? null);
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(hideSplash, SPLASH_FAILSAFE_MS);
    return () => clearTimeout(timer);
  }, [hideSplash]);

  useEffect(() => {
    if (authLoading) return;
    if (user && (profileLoading || !profile)) return;
    hideSplash();
  }, [authLoading, user, profileLoading, profile, hideSplash]);

  if (authLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <SaveProgressProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </SaveProgressProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AuthProvider>
        <View style={styles.root}>
          <GlobalBackground />
          <RootLayoutNav />
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});