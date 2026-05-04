// src/components/navigation/GlobalBackground.tsx
// Phase 9 Session 2: full-screen title-page background rendered behind ALL
// authenticated screens. A dark overlay sits on top so foreground UI stays
// readable; OVERLAY_OPACITY is the single knob to tune.
//
// The title page lives in Firebase Storage at app/title-page.webp (uploaded
// by scripts/upload-assets.ts). Hardcoded URL — no Firestore lookup needed
// since this is a single global asset, not per-faction or per-card.
//
// expo-image's memory-disk cache means the image is fetched once per fresh
// install and reused across navigations.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

const TITLE_PAGE_URL =
  'https://storage.googleapis.com/ember-crown.firebasestorage.app/app/title-page.webp';

// Single knob for tuning readability. 0 = no overlay (full image), 1 = solid black.
// 0.7 was the design target; revisit once the actual asset is uploaded.
const OVERLAY_OPACITY = 0.7;

export function GlobalBackground() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.root]} pointerEvents="none">
      <ExpoImage
        source={{ uri: TITLE_PAGE_URL }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: `rgba(10, 10, 15, ${OVERLAY_OPACITY})` },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Dark fallback shows during the ~ms before the cached/network image renders.
  // Without this, the screen would flash whatever the system default is.
  root: {
    backgroundColor: '#0a0a0f',
  },
});
