import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';
import { Target } from '../lib/geo';
import {
  IDENTITY_QUAT,
  Quat,
  quatConjugate,
  quatRotateVec3,
} from '../lib/quaternion';
import { colors } from './theme';

interface Props {
  targets: Target[];
  done: ReadonlySet<number>;
  /** Live refs written by the capture loop — read here on our own clock. */
  quatRef: React.RefObject<Quat>;
  currentIndexRef: React.RefObject<number>;
  alignedRef: React.RefObject<boolean>;
  dwellRef: React.RefObject<number>; // 0..1
  tanU: number;
  tanV: number;
  width: number;
  height: number;
}

const TICK_MS = 33; // ~30fps for the overlay; the GL canvas runs at full rate
const RING_R = 46;

/**
 * Street View-style guidance, isolated from the parent screen: it polls the live
 * orientation refs on its own timer so the capture screen never re-renders during
 * motion (that was the main source of lag).
 *
 * Visual language:
 *  - centre ring = "the lens"; the current target dot must be brought inside it
 *  - while holding, an arc fills around the ring (dwell -> auto-shoot)
 *  - a soft line + edge chevron point toward the target when it's away/off-screen
 *  - green dots = captured, faint dots = remaining
 */
export function GuidanceLayer({
  targets,
  done,
  quatRef,
  currentIndexRef,
  alignedRef,
  dwellRef,
  tanU,
  tanV,
  width,
  height,
}: Props) {
  const [frame, setFrame] = useState<{
    q: Quat;
    cur: number;
    aligned: boolean;
    dwell: number;
  }>({ q: IDENTITY_QUAT, cur: -1, aligned: false, dwell: 0 });

  useEffect(() => {
    const t = setInterval(() => {
      setFrame({
        q: quatRef.current,
        cur: currentIndexRef.current,
        aligned: alignedRef.current,
        dwell: dwellRef.current,
      });
    }, TICK_MS);
    return () => clearInterval(t);
  }, [quatRef, currentIndexRef, alignedRef, dwellRef]);

  const { q, cur, aligned, dwell } = frame;
  const inv = quatConjugate(q);
  const cx = width / 2;
  const cy = height / 2;

  const project = (dir: readonly [number, number, number]) => {
    const dc = quatRotateVec3(inv, dir);
    const depth = -dc[2];
    return { dc, depth };
  };
  const toScreen = (dc: readonly [number, number, number], depth: number) => ({
    x: ((dc[0] / depth / tanU) * 0.5 + 0.5) * width,
    y: (0.5 - (dc[1] / depth / tanV) * 0.5) * height,
  });

  // Current target position (or edge direction when behind/off-screen).
  let target: { x: number; y: number; onScreen: boolean } | null = null;
  if (cur >= 0 && targets[cur]) {
    const { dc, depth } = project(targets[cur]!.dir);
    if (depth > 0.05) {
      const p = toScreen(dc, depth);
      const onScreen =
        p.x > -30 && p.x < width + 30 && p.y > -30 && p.y < height + 30;
      target = { ...p, onScreen };
    }
    if (!target || !target.onScreen) {
      // Point toward it along the screen edge.
      const ang = Math.atan2(dc[0], dc[1]); // screen-plane direction
      const r = Math.min(width, height) * 0.44;
      target = {
        x: cx + Math.sin(ang) * r,
        y: cy - Math.cos(ang) * r,
        onScreen: false,
      };
    }
  }

  // Neighbour dots (done + pending) that are in front of the camera.
  const dots: { key: number; x: number; y: number; isDone: boolean }[] = [];
  for (let i = 0; i < targets.length; i++) {
    if (i === cur) continue;
    const { dc, depth } = project(targets[i]!.dir);
    if (depth <= 0.05) continue;
    const p = toScreen(dc, depth);
    if (p.x < -20 || p.x > width + 20 || p.y < -20 || p.y > height + 20) continue;
    dots.push({ key: i, x: p.x, y: p.y, isDone: done.has(i) });
  }

  const tint = aligned ? colors.success : colors.accent;
  const circumference = 2 * Math.PI * RING_R;

  // Edge chevron triangle points toward the off-screen target.
  let chevron: string | null = null;
  if (target && !target.onScreen) {
    const ang = Math.atan2(target.x - cx, cy - target.y);
    const bx = target.x;
    const by = target.y;
    const s = 14;
    const tipX = bx + Math.sin(ang) * s;
    const tipY = by - Math.cos(ang) * s;
    const leftX = bx + Math.sin(ang + 2.4) * s;
    const leftY = by - Math.cos(ang + 2.4) * s;
    const rightX = bx + Math.sin(ang - 2.4) * s;
    const rightY = by - Math.cos(ang - 2.4) * s;
    chevron = `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`;
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        {/* guide line from ring toward the target */}
        {target && !aligned && (
          <Line
            x1={cx}
            y1={cy}
            x2={target.x}
            y2={target.y}
            stroke={tint}
            strokeWidth={3.5}
            strokeLinecap="round"
            opacity={0.75}
          />
        )}
        {chevron && <Polygon points={chevron} fill={colors.accent} opacity={0.95} />}

        {/* neighbour dots */}
        {dots.map((d) => (
          <Circle
            key={d.key}
            cx={d.x}
            cy={d.y}
            r={d.isDone ? 8 : 6}
            fill={d.isDone ? colors.success : 'rgba(255,255,255,0.06)'}
            stroke={d.isDone ? colors.success : 'rgba(255,255,255,0.5)'}
            strokeWidth={d.isDone ? 0 : 1.5}
          />
        ))}

        {/* current target dot */}
        {target && target.onScreen && (
          <>
            <Circle
              cx={target.x}
              cy={target.y}
              r={17}
              fill="rgba(59,130,246,0.25)"
              stroke={tint}
              strokeWidth={3}
            />
            <Circle cx={target.x} cy={target.y} r={5.5} fill={tint} />
          </>
        )}

        {/* centre ring ("lens") */}
        <Circle
          cx={cx}
          cy={cy}
          r={RING_R}
          fill="none"
          stroke={aligned ? colors.success : 'rgba(255,255,255,0.85)'}
          strokeWidth={3}
          opacity={0.95}
        />
        {/* dwell progress arc */}
        {aligned && dwell > 0 && (
          <Circle
            cx={cx}
            cy={cy}
            r={RING_R}
            fill="none"
            stroke={colors.success}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={`${circumference * dwell} ${circumference}`}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )}
        <Circle cx={cx} cy={cy} r={3.5} fill={aligned ? colors.success : '#fff'} />
      </Svg>
    </View>
  );
}
