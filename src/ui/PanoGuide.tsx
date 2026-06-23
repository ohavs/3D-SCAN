import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
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
  aligned: boolean;
}

/**
 * SVG overlay drawn on top of the fullscreen live camera: target dots projected
 * with the same camera model as the panorama, plus a guide LINE from the centre
 * reticle to the next target so the path is obvious (no text needed). Captured
 * targets turn green; the active one is highlighted.
 */
export function PanoGuide({
  targets,
  done,
  nearestIndex,
  viewQuat,
  tanU,
  tanV,
  width,
  height,
  aligned,
}: Props) {
  const inv = quatConjugate(viewQuat); // world->camera
  const cx = width / 2;
  const cy = height / 2;

  const project = (dir: readonly [number, number, number]) => {
    const dc = quatRotateVec3(inv, dir);
    const depth = -dc[2]; // camera looks down -Z
    return { dc, depth };
  };

  const toScreen = (dc: readonly [number, number, number], depth: number) => {
    const ndcX = dc[0] / depth / tanU;
    const ndcY = dc[1] / depth / tanV;
    return { x: (ndcX * 0.5 + 0.5) * width, y: (0.5 - ndcY * 0.5) * height };
  };

  // Guide line endpoint toward the nearest pending target.
  let guide: { x: number; y: number } | null = null;
  if (nearestIndex >= 0 && targets[nearestIndex]) {
    const { dc, depth } = project(targets[nearestIndex]!.dir);
    if (depth > 0.05) {
      guide = toScreen(dc, depth);
    } else {
      // Behind the camera — point the line toward the screen edge in its direction.
      const ang = Math.atan2(dc[0], dc[1]);
      const r = Math.min(width, height) * 0.42;
      guide = { x: cx + Math.sin(ang) * r, y: cy - Math.cos(ang) * r };
    }
  }

  const dots: {
    key: number;
    x: number;
    y: number;
    r: number;
    fill: string;
    stroke: string;
  }[] = [];
  for (let i = 0; i < targets.length; i++) {
    const { dc, depth } = project(targets[i]!.dir);
    if (depth <= 0.05) continue;
    const { x, y } = toScreen(dc, depth);
    if (x < -40 || x > width + 40 || y < -40 || y > height + 40) continue;
    const isDone = done.has(i);
    const isCurrent = i === nearestIndex;
    dots.push({
      key: i,
      x,
      y,
      r: isCurrent ? 16 : isDone ? 9 : 7,
      fill: isDone ? colors.success : isCurrent ? colors.accentSoft : 'transparent',
      stroke: isDone
        ? colors.success
        : isCurrent
          ? colors.accent
          : 'rgba(255,255,255,0.65)',
    });
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        {guide && (
          <Line
            x1={cx}
            y1={cy}
            x2={guide.x}
            y2={guide.y}
            stroke={aligned ? colors.success : colors.accent}
            strokeWidth={3}
            strokeDasharray="10 8"
            strokeLinecap="round"
          />
        )}
        {dots.map((d) => (
          <Circle
            key={d.key}
            cx={d.x}
            cy={d.y}
            r={d.r}
            fill={d.fill}
            stroke={d.stroke}
            strokeWidth={d.key === nearestIndex ? 3 : 2}
          />
        ))}
        {/* Small centre crosshair (the live-camera window is the main reticle) */}
        <Circle cx={cx} cy={cy} r={3} fill={aligned ? colors.success : '#fff'} />
      </Svg>
    </View>
  );
}
