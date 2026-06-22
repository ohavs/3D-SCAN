import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Target } from '../lib/geo';
import { Quat, quatConjugate, quatRotateVec3 } from '../lib/quaternion';
import { colors } from './theme';

interface Props {
  targets: Target[];
  done: ReadonlySet<number>;
  nearestIndex: number;
  viewQuat: Quat; // camera->world
  tanU: number;
  tanV: number;
  width: number;
  height: number;
}

interface Projected {
  index: number;
  x: number;
  y: number;
  done: boolean;
  active: boolean;
}

/**
 * Projects every target onto the screen using the same camera model as the display
 * shader, so the dots sit exactly where the painted panorama meets the live feed.
 * Targets behind the camera are skipped.
 */
export function TargetOverlay({
  targets,
  done,
  nearestIndex,
  viewQuat,
  tanU,
  tanV,
  width,
  height,
}: Props) {
  const inv = quatConjugate(viewQuat); // world->camera
  const dots: Projected[] = [];

  for (let i = 0; i < targets.length; i++) {
    const dc = quatRotateVec3(inv, targets[i]!.dir);
    const depth = -dc[2]; // camera looks down -Z
    if (depth <= 0.05) continue; // behind camera
    const ndcX = dc[0] / depth / tanU;
    const ndcY = dc[1] / depth / tanV;
    if (Math.abs(ndcX) > 1.6 || Math.abs(ndcY) > 1.6) continue; // well offscreen
    const x = (ndcX * 0.5 + 0.5) * width;
    const y = (0.5 - ndcY * 0.5) * height;
    dots.push({
      index: i,
      x,
      y,
      done: done.has(i),
      active: i === nearestIndex,
    });
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {dots.map((d) => {
        const size = d.active ? 30 : d.done ? 16 : 22;
        return (
          <View
            key={d.index}
            style={[
              styles.dot,
              {
                left: d.x - size / 2,
                top: d.y - size / 2,
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: d.done
                  ? colors.success
                  : d.active
                    ? colors.accentSoft
                    : 'transparent',
                borderColor: d.done
                  ? colors.success
                  : d.active
                    ? colors.accent
                    : 'rgba(255,255,255,0.7)',
                borderWidth: d.active ? 3 : 2,
              },
            ]}
          >
            {d.active && <View style={styles.activeCore} />}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});
