import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { GlobalBackground } from '../src/components/navigation/GlobalBackground';
import { usePlayerProfile } from '../src/hooks/usePlayerProfile';
import { initAdMob } from '../src/lib/admob';
import { initObservability, setObservabilityUser } from '../src/lib/observability';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { user, isLoading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading } = usePlayerProfile();

  useEffect(() => {
    initAdMob().catch((err) => console.warn('AdMob init failed:', err));
    initObservability().catch((err) => console.warn('Observability init failed:', err));
  }, []);

  useEffect(() => {
    setObservabilityUser(user?.uid ?? null);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (user && (profileLoading || !profile)) return;
    SplashScreen.hideAsync();
  }, [authLoading, user, profileLoading, profile]);

  if (authLoading) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <View style={styles.root}>
        <GlobalBackground />
        <RootLayoutNav />
      </View>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});