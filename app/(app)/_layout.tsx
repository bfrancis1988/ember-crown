import { Redirect, Stack, usePathname } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import { usePlayerProfile } from '../../src/hooks/usePlayerProfile';
import {
  BottomNav,
  BOTTOM_NAV_BASE_HEIGHT,
} from '../../src/components/navigation/BottomNav';

// Pathnames where the bottom nav should be hidden:
//   - active match (player commits to the match flow)
//   - onboarding (faction / commander pickers)
//   - tutorial (player commits to the tutorial flow)
//   - login (signed-out path; this layout shouldn't render it, but guard anyway)
function shouldShowNavForPath(pathname: string): boolean {
  if (pathname.startsWith('/match/')) return false;
  if (pathname.startsWith('/onboarding/')) return false;
  if (pathname === '/tutorial') return false;
  if (pathname === '/login' || pathname.startsWith('/auth/')) return false;
  return true;
}

export default function AppLayout() {
  const { user, isLoading } = useAuth();
  const { profile, isLoading: profileLoading } = usePlayerProfile();
  const pathname = usePathname();

  if (isLoading) return null;

  if (!user) {
    return <Redirect href="/login" />;
  }

  // Hide the nav until onboarding is complete (step 4 = welcome-back state).
  // Profile is still loading on first render — default to hiding so we don't
  // flash the bar before knowing whether the player has finished onboarding.
  const onboardingComplete =
    !profileLoading && profile != null && profile.onboarding_step >= 4;
  const showNav = onboardingComplete && shouldShowNavForPath(pathname);

  // Reserve space for the nav on screens that show it. The nav is absolutely
  // positioned, so screens behind it would otherwise have content cut off.
  // 16 = a small bonus gap so content doesn't sit flush against the bar.
  const reservedBottom = showNav ? BOTTOM_NAV_BASE_HEIGHT + 16 : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.content, { paddingBottom: reservedBottom }]}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
      </View>
      {showNav && <BottomNav />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
});