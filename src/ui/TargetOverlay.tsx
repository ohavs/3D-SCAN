import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Target } from '../lib/geo';
import { Quat, quatConjugate, quatRotateVec3 } from '../lib/quaternion';
import { colors } from './theme';

interface Props {
  targets: Target[];
  done: ReadonlySet<number>;
  currentIndex: number; // the next target to capture (guided)
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
  current: boolean;
}

/**
 * Projects targets onto the screen using the same camera model as the display
 * shader. To avoid clutter we only draw: the current target (big, pulsing), any
 * completed targets near the view (small green), and a few faint pending dots.
 */
export function TargetOverlay({
  targets,
  done,
  currentIndex,
  viewQuat,
  tanU,
  tanV,
  width,
  height,
}: Props) {
  const inv = quatConjugate(viewQuat); // world->camera
  const dots: Projected[] = [];

  for (let i = 0; i < targets.length; i++) {
    const isCurrent = i === currentIndex;
    const isDone = done.has(i);
    const dc = quatRotateVec3(inv, targets[i]!.dir);
    const depth = -dc[2]; // camera looks down -Z
    if (depth <= 0.05) continue; // behind camera
    const ndcX = dc[0] / depth / tanU;
    const ndcY = dc[1] / depth / tanV;
    if (Math.abs(ndcX) > 1.3 || Math.abs(ndcY) > 1.3) continue; // offscreen
    dots.push({
      index: i,
      x: (ndcX * 0.5 + 0.5) * width,
      y: (0.5 - ndcY * 0.5) * height,
      done: isDone,
      current: isCurrent,
    });
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {dots.map((d) => {
        const size = d.current ? 44 : d.done ? 14 : 10;
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
                  : d.current
                    ? colors.accentSoft
                    : 'transparent',
                borderColor: d.done
                  ? colors.success
                  : d.current
                    ? colors.accent
                    : 'rgba(255,255,255,0.4)',
                borderWidth: d.current ? 3 : d.done ? 0 : 1.5,
              },
            ]}
          >
            {d.current && <View style={styles.currentCore} />}
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
  currentCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
});
