import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font } from './theme';

interface Props {
  progress: number; // 0..1
  label?: string;
}

/** A clean, thin coverage bar with a percentage label. */
export function ProgressBar({ progress, label }: Props) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const tint = pct >= 90 ? colors.success : colors.accent;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>{label ?? 'כיסוי'}</Text>
        <Text style={[styles.pct, { color: tint }]}>{pct}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: tint }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { color: colors.textDim, fontSize: font.small, fontWeight: '700' },
  pct: { fontSize: font.small, fontWeight: '900' },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3 },
});
