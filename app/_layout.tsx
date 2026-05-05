import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { GlobalBackground } from '../src/components/navigation/GlobalBackground';
import { initAdMob } from '../src/lib/admob';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { isLoading } = useAuth();

  useEffect(() => {
    initAdMob().catch((err) => console.warn('AdMob init failed:', err));
  }, []);

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) {
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