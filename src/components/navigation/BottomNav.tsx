// src/components/navigation/BottomNav.tsx
// Phase 9 Session 2: persistent bottom tab bar for the authenticated app
// shell. Five tabs: Home, Battle, Forge, Record, Guild.
//
// Visibility is controlled at the layout level (see app/(app)/_layout.tsx) —
// this component just renders the bar. Active tab is decided by pathname
// startsWith() so nested routes (e.g. /campaign/[factionId]) keep the
// Battle tab highlighted if we ever route them under Battle.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type NavTab = {
  id: string;
  label: string;
  icon: string;
  route: string;
  // pathnames that should show this tab as active (in addition to `route`).
  matchPrefixes?: string[];
};

const TABS: NavTab[] = [
  { id: 'home', label: 'Home', icon: '🏠', route: '/home' },
  {
    id: 'battle',
    label: 'Battle',
    icon: '⚔️',
    route: '/battle',
    matchPrefixes: ['/campaign'],
  },
  {
    id: 'forge',
    label: 'Forge',
    icon: '⚒️',
    route: '/forge',
    matchPrefixes: ['/summon', '/library'],
  },
  { id: 'record', label: 'Record', icon: '📊', route: '/record' },
  { id: 'guild', label: 'Guild', icon: '🛡️', route: '/guild-hall' },
];

function isTabActive(tab: NavTab, pathname: string): boolean {
  if (pathname === tab.route) return true;
  if (pathname.startsWith(tab.route + '/')) return true;
  if (tab.matchPrefixes) {
    for (const prefix of tab.matchPrefixes) {
      if (pathname === prefix) return true;
      if (pathname.startsWith(prefix + '/')) return true;
    }
  }
  return false;
}

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const handlePress = (route: string) => {
    router.push(route as never);
  };

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom, 8), height: 64 + Math.max(insets.bottom, 8) },
      ]}
    >
      {TABS.map((tab) => {
        const active = isTabActive(tab, pathname);
        return (
          <Pressable
            key={tab.id}
            style={styles.tab}
            onPress={() => handlePress(tab.route)}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[styles.icon, active && styles.iconActive]}>{tab.icon}</Text>
            <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const BOTTOM_NAV_BASE_HEIGHT = 64;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 15, 20, 0.95)',
    borderTopWidth: 1,
    borderTopColor: '#2a2a30',
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 22,
    opacity: 0.55,
  },
  iconActive: {
    opacity: 1,
  },
  label: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  labelActive: {
    color: '#FFD700',
    fontWeight: '700',
  },
});
