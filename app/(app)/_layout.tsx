import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';

export default function AppLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  if (!user) {
    return <Redirect href="/login" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}