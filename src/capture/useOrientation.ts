/**
 * Subscribes to Expo DeviceMotion and exposes a smoothed camera->world quaternion.
 *
 * The live quaternion is kept in a ref (not React state) so the GL render loop can
 * read it every frame without triggering re-renders. A throttled copy is mirrored
 * into state for UI (target highlighting) at a lower rate. The heading offset is
 * passed in from the session so calibration persists across screens.
 */

import { useEffect, useRef, useState } from 'react';
import { DeviceMotion } from 'expo-sensors';
import { IDENTITY_QUAT, Quat, quatAngle, quatSlerp } from '../lib/quaternion';
import { applyOffset, deviceQuaternion } from '../lib/orientation';

const UPDATE_INTERVAL_MS = 1000 / 60;
const SMOOTHING = 0.35; // slerp factor toward the latest reading
const UI_THROTTLE_MS = 60;

export interface OrientationApi {
  /** Smoothed, offset-applied camera->world quaternion (updated in place). */
  quatRef: React.RefObject<Quat>;
  /** Raw (no offset) quaternion — used to compute a heading calibration. */
  rawQuatRef: React.RefObject<Quat>;
  /** Angular speed estimate in rad/s (for "hold steady" shutter gating). */
  angularSpeedRef: React.RefObject<number>;
  /** Latest quaternion mirrored to state (throttled) for UI. */
  uiQuat: Quat;
  available: boolean | null;
}

export function useOrientation(
  offset: Quat | null,
  enabled = true,
): OrientationApi {
  const quatRef = useRef<Quat>(IDENTITY_QUAT);
  const rawQuatRef = useRef<Quat>(IDENTITY_QUAT);
  const angularSpeedRef = useRef<number>(0);
  const offsetRef = useRef<Quat | null>(offset);
  const lastRaw = useRef<Quat>(IDENTITY_QUAT);
  const lastTs = useRef<number>(0);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [uiQuat, setUiQuat] = useState<Quat>(IDENTITY_QUAT);
  const lastUi = useRef(0);

  // Keep the offset ref in sync without re-subscribing the sensor.
  offsetRef.current = offset;

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    (async () => {
      try {
        const ok = await DeviceMotion.isAvailableAsync();
        if (!mounted) return;
        setAvailable(ok);
        if (!ok) return;
        await DeviceMotion.requestPermissionsAsync();
      } catch {
        if (mounted) setAvailable(false);
      }
    })();

    DeviceMotion.setUpdateInterval(UPDATE_INTERVAL_MS);
    const sub = DeviceMotion.addListener((data) => {
      if (!data?.rotation) return;
      const { alpha, beta, gamma } = data.rotation;
      const raw = deviceQuaternion({
        alpha,
        beta,
        gamma,
        orientation: data.orientation ?? 0,
      });
      rawQuatRef.current = raw;

      const now = Date.now();
      if (lastTs.current > 0) {
        const dt = Math.max(0.001, (now - lastTs.current) / 1000);
        angularSpeedRef.current = quatAngle(lastRaw.current, raw) / dt;
      }
      lastRaw.current = raw;
      lastTs.current = now;

      const target = offsetRef.current
        ? applyOffset(offsetRef.current, raw)
        : raw;
      // Low-pass via slerp for shake-free tracking.
      quatRef.current = quatSlerp(quatRef.current, target, SMOOTHING);

      if (now - lastUi.current >= UI_THROTTLE_MS) {
        lastUi.current = now;
        setUiQuat(quatRef.current);
      }
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, [enabled]);

  return { quatRef, rawQuatRef, angularSpeedRef, uiQuat, available };
}
