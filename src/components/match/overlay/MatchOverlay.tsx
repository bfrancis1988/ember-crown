// src/components/match/overlay/MatchOverlay.tsx
// Screen-root overlay host for the Phase B match animations, modeled on the
// existing TutorialTooltipProvider/Overlay pattern.
//
// It owns:
//   - a node registry: components register a measurable view under a string
//     key ("card:<instanceId>" / "lane:<owner>:<lane>") so the overlay can
//     measureInWindow them on demand;
//   - flyCard():           spawns a GhostCard flying between two screen rects;
//   - spawnDamageNumber(): spawns a FloatingNumber above a registered card;
//   - inFlightIds:         the set of cards mid-flight, so HandFan/LaneRow can
//     suppress their own render of those cards.
//
// The host renders as an absolutely-positioned, touch-transparent sibling of
// the screen content. measureInWindow yields true screen coordinates, and the
// host fills the screen window, so registry rects map straight onto host
// child positions.

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { GhostCard } from './GhostCard';
import { FloatingNumber } from './FloatingNumber';
import type { CardLibraryEntry } from '../../../types/card';
import type { LiveBoardState } from '../../../types/board';

// Structural type for anything the registry can measure. Any RN host view ref
// satisfies this — typing it structurally avoids coupling to React ref-type
// quirks across versions.
export type MeasurableNode = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

export type OverlayRect = { x: number; y: number; width: number; height: number };

export type FlyCardRequest = {
  instanceId: string;
  card: LiveBoardState;
  entry: CardLibraryEntry;
  factionColor: string;
  from: OverlayRect;
  to: OverlayRect;
  // Fired once when the flight animation finishes. The ghost stays mounted
  // (parked at the target) afterwards until removeGhost is called.
  onAnimComplete: () => void;
};

export type GhostEntry = FlyCardRequest & { key: number };

export type DamageNumberRequest = {
  instanceId: string;
  delta: number;
};

export type NumberEntry = {
  key: number;
  instanceId: string;
  delta: number;
  x: number; // card center X, screen space
  y: number; // card top Y, screen space
  xOffset: number; // fan-out offset for rapid multi-hits on the same card
};

type MatchOverlayContextValue = {
  registerNode: (key: string, node: MeasurableNode | null) => void;
  measureNode: (key: string) => Promise<OverlayRect | null>;
  flyCard: (req: FlyCardRequest) => void;
  removeGhost: (instanceId: string) => void;
  spawnDamageNumber: (req: DamageNumberRequest) => void;
};

const MatchOverlayContext = createContext<MatchOverlayContextValue | null>(null);

export function useMatchOverlay(): MatchOverlayContextValue {
  const ctx = useContext(MatchOverlayContext);
  if (!ctx) {
    throw new Error('useMatchOverlay must be used within a MatchOverlayProvider');
  }
  return ctx;
}

export function MatchOverlayProvider({ children }: { children: React.ReactNode }) {
  const registryRef = useRef<Map<string, MeasurableNode>>(new Map());
  const idRef = useRef(0);

  const [ghosts, setGhosts] = useState<GhostEntry[]>([]);
  const [numbers, setNumbers] = useState<NumberEntry[]>([]);

  const registerNode = useCallback((key: string, node: MeasurableNode | null) => {
    if (node) {
      registryRef.current.set(key, node);
    } else {
      registryRef.current.delete(key);
    }
  }, []);

  const measureNode = useCallback((key: string): Promise<OverlayRect | null> => {
    const node = registryRef.current.get(key);
    if (!node) return Promise.resolve(null);
    return new Promise((resolve) => {
      node.measureInWindow((x, y, width, height) => {
        if (typeof x !== 'number' || Number.isNaN(x)) {
          resolve(null);
        } else {
          resolve({ x, y, width, height });
        }
      });
    });
  }, []);

  // Ghost lifecycle. flyCard spawns a ghost; it stays mounted (parked at its
  // target once the flight finishes) until removeGhost is called by the match
  // screen, which gates removal on Firestore confirmation.
  const flyCard = useCallback((req: FlyCardRequest) => {
    const key = (idRef.current += 1);
    setGhosts((g) => [
      ...g.filter((x) => x.instanceId !== req.instanceId),
      { ...req, key },
    ]);
  }, []);

  const removeGhost = useCallback((instanceId: string) => {
    setGhosts((g) => g.filter((x) => x.instanceId !== instanceId));
  }, []);

  // Floating-number lifecycle. Position is resolved by measuring the card's
  // registered node; rapid hits on the same card fan out via xOffset.
  const spawnDamageNumber = useCallback(
    async (req: DamageNumberRequest) => {
      const rect = await measureNode(`card:${req.instanceId}`);
      if (!rect) return;
      setNumbers((nums) => {
        const sameCard = nums.filter((n) => n.instanceId === req.instanceId).length;
        const key = (idRef.current += 1);
        return [
          ...nums,
          {
            key,
            instanceId: req.instanceId,
            delta: req.delta,
            x: rect.x + rect.width / 2,
            y: rect.y,
            xOffset: sameCard * 14,
          },
        ];
      });
    },
    [measureNode],
  );

  const handleNumberDone = useCallback((key: number) => {
    setNumbers((nums) => nums.filter((n) => n.key !== key));
  }, []);

  const value = useMemo<MatchOverlayContextValue>(
    () => ({ registerNode, measureNode, flyCard, removeGhost, spawnDamageNumber }),
    [registerNode, measureNode, flyCard, removeGhost, spawnDamageNumber],
  );

  return (
    <MatchOverlayContext.Provider value={value}>
      {children}
      <View style={styles.host} pointerEvents="box-none">
        {ghosts.map((g) => (
          <GhostCard key={g.key} spec={g} />
        ))}
        {numbers.map((n) => (
          <FloatingNumber key={n.key} spec={n} onDone={handleNumberDone} />
        ))}
      </View>
    </MatchOverlayContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
  },
});
