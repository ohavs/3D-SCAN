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

const TICK_MS = 33; // ~30fps overlay
const RING_R = 44;

/**
 * Street View-style guidance, redesigned: exactly ONE target on screen — the next
 * one in the guided order. Bring it into the centre ring; a green arc fills while
 * holding; the shot fires. No other dots, no clutter. When the target is off to
 * the side, a short line + edge chevron point the way. Runs on its own 30fps
 * timer reading live refs, so the parent never re-renders during motion.
 */
export function GuidanceLayer({
  targets,
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

  // Project the single current target.
  let tx = 0;
  let ty = 0;
  let onScreen = false;
  let hasTarget = false;
  if (cur >= 0 && targets[cur]) {
    hasTarget = true;
    const dc = quatRotateVec3(inv, targets[cur]!.dir);
    const depth = -dc[2];
    if (depth > 0.05) {
      tx = ((dc[0] / depth / tanU) * 0.5 + 0.5) * width;
      ty = (0.5 - (dc[1] / depth / tanV) * 0.5) * height;
      onScreen =
        tx > 30 && tx < width - 30 && ty > 30 && ty < height - 30;
    }
    if (!onScreen) {
      // Clamp to a screen-edge direction indicator.
      const ang = Math.atan2(dc[0], dc[1]);
      const r = Math.min(width, height) * 0.42;
      tx = cx + Math.sin(ang) * r;
      ty = cy - Math.cos(ang) * r;
    }
  }

  const tint = aligned ? colors.success : colors.accent;
  const circumference = 2 * Math.PI * RING_R;

  // Distance-based: shorten the guide line so it starts at the ring edge.
  const dx = tx - cx;
  const dy = ty - cy;
  const dist = Math.hypot(dx, dy);
  const lineNeeded = hasTarget && !aligned && dist > RING_R + 26;
  const ux = dist > 0 ? dx / dist : 0;
  const uy = dist > 0 ? dy / dist : 0;
  const lineX1 = cx + ux * (RING_R + 8);
  const lineY1 = cy + uy * (RING_R + 8);
  const lineX2 = tx - ux * 26;
  const lineY2 = ty - uy * 26;

  // Edge chevron when off-screen.
  let chevron: string | null = null;
  if (hasTarget && !onScreen) {
    const ang = Math.atan2(dx, -dy);
    const s = 15;
    const tipX = tx + Math.sin(ang) * s;
    const tipY = ty - Math.cos(ang) * s;
    const leftX = tx + Math.sin(ang + 2.5) * s;
    const leftY = ty - Math.cos(ang + 2.5) * s;
    const rightX = tx + Math.sin(ang - 2.5) * s;
    const rightY = ty - Math.cos(ang - 2.5) * s;
    chevron = `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`;
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        {lineNeeded && (
          <Line
            x1={lineX1}
            y1={lineY1}
            x2={lineX2}
            y2={lineY2}
            stroke={colors.accent}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="2 10"
            opacity={0.9}
          />
        )}
        {chevron && <Polygon points={chevron} fill={colors.accent} />}

        {/* The single target: soft glow + dot */}
        {hasTarget && onScreen && !aligned && (
          <>
            <Circle cx={tx} cy={ty} r={34} fill="rgba(56,189,248,0.10)" />
            <Circle cx={tx} cy={ty} r={22} fill="rgba(56,189,248,0.18)" />
            <Circle
              cx={tx}
              cy={ty}
              r={13}
              fill="rgba(56,189,248,0.9)"
              stroke="#fff"
              strokeWidth={2}
            />
          </>
        )}

        {/* Centre ring ("bring the dot here") */}
        <Circle
          cx={cx}
          cy={cy}
          r={RING_R}
          fill={aligned ? 'rgba(52,211,153,0.10)' : 'none'}
          stroke={aligned ? colors.success : 'rgba(255,255,255,0.8)'}
          strokeWidth={aligned ? 3 : 2}
        />
        {/* Dwell progress arc */}
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
        <Circle
          cx={cx}
          cy={cy}
          r={3}
          fill={aligned ? colors.success : 'rgba(255,255,255,0.9)'}
        />
      </Svg>
    </View>
  );
}
