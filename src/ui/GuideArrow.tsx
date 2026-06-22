import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Target } from '../lib/geo';
import { Quat, quatConjugate, quatRotateVec3 } from '../lib/quaternion';
import { colors, font } from './theme';

interface Props {
  target: Target | null;
  viewQuat: Quat; // camera->world
  aligned: boolean;
}

/**
 * A single large arrow at screen centre that rotates to point toward the current
 * target, plus a short Hebrew hint ("turn right", "up", ...). This is the Google
 * Camera-style guidance: always one clear direction to follow. When the target is
 * centred (`aligned`) the arrow hides and the reticle goes green.
 */
export function GuideArrow({ target, viewQuat, aligned }: Props) {
  if (!target || aligned) return null;

  const inv = quatConjugate(viewQuat); // world->camera
  const dc = quatRotateVec3(inv, target.dir);
  // Arrow points up at 0°; rotate toward the target's screen-plane offset.
  const angleDeg = (Math.atan2(dc[0], dc[1]) * 180) / Math.PI;

  // Direction hint text.
  let hint = '';
  if (dc[2] > 0.2) {
    // Target is behind — tell them which way to turn around.
    hint = dc[0] >= 0 ? 'הסתובב ימינה' : 'הסתובב שמאלה';
  } else {
    const horiz = Math.abs(dc[0]);
    const vert = Math.abs(dc[1]);
    if (horiz >= vert) hint = dc[0] >= 0 ? 'סובב ימינה' : 'סובב שמאלה';
    else hint = dc[1] >= 0 ? 'הרם למעלה' : 'כוון למטה';
  }

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View style={[styles.arrow, { transform: [{ rotate: `${angleDeg}deg` }] }]}>
        <Text style={styles.arrowText}>▲</Text>
      </View>
      <View style={styles.hintPill}>
        <Text style={styles.hintText}>{hint}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrow: {
    position: 'absolute',
    // Offset above centre so it sits around the reticle.
    marginBottom: 170,
  },
  arrowText: {
    fontSize: 56,
    color: colors.accent,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
  },
  hintPill: {
    position: 'absolute',
    bottom: '32%',
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  hintText: { color: '#fff', fontSize: font.body, fontWeight: '800' },
});
