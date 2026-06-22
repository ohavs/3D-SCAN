/**
 * Convert Expo DeviceMotion readings into a STABLE camera->world quaternion.
 *
 * Why not the three.js DeviceOrientationControls Euler formula? Expo's
 * `DeviceMotion.rotation` already comes from Android `SensorManager.getOrientation`,
 * i.e. Euler angles derived from the rotation-vector matrix:
 *     alpha = -azimuth(Z),  beta = -pitch(X),  gamma = roll(Y)   (radians)
 * Re-feeding those Euler angles through another Euler formula re-introduces gimbal
 * lock — the orientation snaps/jumps when the phone tilts toward the zenith/nadir
 * (exactly the ceiling/floor shots). Instead we reconstruct the original rotation
 * MATRIX and turn it into a quaternion, which is continuous everywhere.
 *
 * Deriving the matrix: Android's getOrientation is the decomposition of
 *     R_device->world(ENU) = Rz(-azimuth) · Rx(-pitch) · Ry(roll)
 *                          = Rz(alpha) · Rx(beta) · Ry(gamma)
 * (verified against the AOSP getOrientation element formulas). ENU = X:east,
 * Y:north, Z:up. We then remap ENU to our Y-up world (Y:up, Z:front) with a fixed
 * rotation Q_WE, and the back camera shares the device axes (it looks down -Z, like
 * our camera convention), so camera->device is identity.
 */

import {
  IDENTITY_QUAT,
  Quat,
  quatFromAxisAngle,
  quatMultiply,
  quatNormalize,
} from './quaternion';
import { cameraForward } from './geo';

const S = Math.SQRT1_2;
// ENU (east,north,up) -> our world (Y up, Z front): 180° about (0,1,1)/√2.
const Q_WORLD_FROM_ENU: Quat = [0, S, S, 0];
const AXIS_Z: [number, number, number] = [0, 0, 1];
const AXIS_X: [number, number, number] = [1, 0, 0];
const AXIS_Y: [number, number, number] = [0, 1, 0];

export interface DeviceRotation {
  alpha: number; // radians (azimuth)
  beta: number; // radians (pitch)
  gamma: number; // radians (roll)
  orientation: number; // degrees: 0 | 90 | 180 | -90 (screen rotation)
}

/** Map a raw DeviceMotion reading to a stable camera->world quaternion. */
export function deviceQuaternion(r: DeviceRotation, invertHorizontal = false): Quat {
  const alpha = invertHorizontal ? -r.alpha : r.alpha;
  // q_device->world(ENU) = Rz(alpha) · Rx(beta) · Ry(gamma)
  const qEnu = quatMultiply(
    quatMultiply(quatFromAxisAngle(AXIS_Z, alpha), quatFromAxisAngle(AXIS_X, r.beta)),
    quatFromAxisAngle(AXIS_Y, r.gamma),
  );
  // camera->our world (camera shares device axes; screen is locked portrait).
  return quatNormalize(quatMultiply(Q_WORLD_FROM_ENU, qEnu));
}

/**
 * Heading-zero calibration: returns a world-space correction quaternion that, when
 * pre-multiplied (`qCalib * qDevice`), rotates the currently-faced direction to
 * lon=0 (the panorama's "front"). Pitch/roll are left to the fused gravity sensor.
 */
export function headingOffset(qDevice: Quat): Quat {
  const f = cameraForward(qDevice);
  const lon = Math.atan2(f[0], f[2]);
  return quatFromAxisAngle(AXIS_Y, -lon);
}

export const NO_OFFSET: Quat = IDENTITY_QUAT;

/** Apply a calibration offset to a device quaternion. */
export function applyOffset(offset: Quat, qDevice: Quat): Quat {
  return quatNormalize(quatMultiply(offset, qDevice));
}
