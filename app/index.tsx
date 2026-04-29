import { Redirect } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  return <Redirect href={user ? '/home' : '/login'} />;
}