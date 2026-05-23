// Live "Resets in 5h 23m" countdown. Ticks once a minute to keep the
// display fresh without per-second jitter.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatCountdown, nextDailyReset, nextWeeklyReset } from '../../lib/quests';

type Props = {
  period: 'daily' | 'weekly';
};

export function CycleCountdown({ period }: Props) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const next = period === 'daily' ? nextDailyReset(now) : nextWeeklyReset(now);
  const ms = next.getTime() - now.getTime();

  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>
        Resets in {formatCountdown(ms)} (UTC)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 4,
  },
  text: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
