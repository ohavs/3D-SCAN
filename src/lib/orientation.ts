/**
 * Convert Expo DeviceMotion readings into a stable camera->world quaternion.
 *
 * This is a direct port of three.js' DeviceOrientationControls math, which is the
 * battle-tested mapping from the W3C deviceorientation (alpha/beta/gamma) angles
 * plus screen orientation to a camera quaternion. The resulting quaternion orients
 * a camera that looks down its local -Z axis (three.js convention) — exactly the
 * frame the accumulation shader expects.
 *
 * Expo DeviceMotion notes:
 *  - `rotation.{alpha,beta,gamma}` are in radians.
 *  - `orientation` is the screen rotation in degrees (0, 90, 180, -90).
 */

import {
  IDENTITY_QUAT,
  Quat,
  quatFromAxisAngle,
  quatFromEuler,
  quatMultiply,
  quatNormalize,
} from './quaternion';
import { cameraForward } from './geo';

const DEG = Math.PI / 180;
const HALF_SQRT2 = Math.sqrt(0.5);
// -90° about X: re-points "looking at the screen" to "looking out the back camera".
const Q_BACK_CAMERA: Quat = [-HALF_SQRT2, 0, 0, HALF_SQRT2];
const ZEE: [number, number, number] = [0, 0, 1];

export interface DeviceRotation {
  alpha: number; // radians
  beta: number; // radians
  gamma: number; // radians
  orientation: number; // degrees: 0 | 90 | 180 | -90
}

/**
 * Map a raw DeviceMotion reading to a camera->world quaternion.
 *
 * `invertHorizontal` reverses the yaw sense. Some devices/conventions report the
 * azimuth (alpha) with the opposite sign, which makes the whole panorama feel like
 * it rotates the wrong way; flipping alpha corrects it without affecting pitch.
 */
export function deviceQuaternion(r: DeviceRotation, invertHorizontal = false): Quat {
  const { alpha, beta, gamma, orientation } = r;
  const a = invertHorizontal ? -alpha : alpha;
  // three.js: euler.set(beta, alpha, -gamma, 'YXZ')
  let q = quatFromEuler(beta, a, -gamma, 'YXZ');
  q = quatMultiply(q, Q_BACK_CAMERA);
  // Compensate for the current screen rotation.
  const orient = orientation * DEG;
  q = quatMultiply(q, quatFromAxisAngle(ZEE, invertHorizontal ? orient : -orient));
  return quatNormalize(q);
}

/**
 * Heading-zero calibration: returns a world-space correction quaternion that, when
 * pre-multiplied (`qCalib * qDevice`), rotates the currently-faced direction to
 * lon=0 (the panorama's "front"). Pitch/roll are left to the fused gravity sensor,
 * which already levels the horizon.
 */
export function headingOffset(qDevice: Quat): Quat {
  const f = cameraForward(qDevice);
  const lon = Math.atan2(f[0], f[2]);
  return quatFromAxisAngle([0, 1, 0], -lon);
}

export const NO_OFFSET: Quat = IDENTITY_QUAT;

/** Apply a calibration offset to a device quaternion. */
export function applyOffset(offset: Quat, qDevice: Quat): Quat {
  return quatNormalize(quatMultiply(offset, qDevice));
}
