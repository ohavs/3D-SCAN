import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font } from './theme';

interface Props {
  /** 0..1 coverage fraction. */
  progress: number;
  size?: number;
}

/**
 * Lightweight coverage indicator — a conic-style ring approximated with a stroked
 * circle whose visible arc grows. Pure RN views (no SVG dependency).
 */
export function ProgressRing({ progress, size = 64 }: Props) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const ringColor =
    pct >= 90 ? colors.success : pct >= 40 ? colors.accent : colors.warn;
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: colors.border,
          },
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: ringColor,
            borderTopColor: pct > 12 ? ringColor : 'transparent',
            borderRightColor: pct > 37 ? ringColor : 'transparent',
            borderBottomColor: pct > 62 ? ringColor : 'transparent',
            borderLeftColor: pct > 87 ? ringColor : 'transparent',
            transform: [{ rotate: '-45deg' }],
          },
        ]}
      />
      <Text style={styles.label}>{pct}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: 'center', alignItems: 'center' },
  ring: {
    position: 'absolute',
    borderWidth: 4,
  },
  label: {
    color: colors.text,
    fontSize: font.small,
    fontWeight: '800',
  },
});
