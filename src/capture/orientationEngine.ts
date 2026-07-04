/**
 * Orientation engine: gyroscope + gravity complementary filter (Mahony-style).
 *
 * WHY NOT the OS rotation vector (what we used before): Android's fused rotation
 * vector includes the MAGNETOMETER. Indoors — rebar, appliances, speakers — the
 * magnetic field swims, so the yaw "drifts": leave a spot, come back, and the
 * world has rotated. That was exactly the reported bug (targets not staying put,
 * shots landing on top of each other). Panorama apps (Street View, Photaf) track
 * with GYRO-only orientation for this reason.
 *
 * The filter: integrate gyro body rates into a device->world quaternion, and
 * continuously nudge pitch/roll toward the accelerometer's gravity direction
 * (only when |a| ≈ 1g, i.e. the phone isn't accelerating). Yaw has no absolute
 * reference — it starts at 0 facing wherever the user faces (which is what we
 * want: first shot = panorama front) and drifts only with gyro bias (a few
 * degrees over minutes, invisible within one room scan).
 *
 * Device coords (Android): X right, Y up (portrait), Z out of the screen.
 * The back camera looks along -Z, matching our camera convention exactly, so the
 * engine quaternion IS the camera->world rotation.
 *
 * Singleton: tracking must survive navigation (capture -> review -> capture)
 * so replayed tiles stay aligned with the live yaw reference. Subscriptions
 * start on first acquire() and stay on for the app's life (a scanning session).
 */

import { Accelerometer, Gyroscope } from 'expo-sensors';
import {
  IDENTITY_QUAT,
  Quat,
  Vec3,
  quatConjugate,
  quatFromAxisAngle,
  quatMultiply,
  quatNormalize,
  quatRotateVec3,
} from '../lib/quaternion';

const UPDATE_MS = 16; // ~60Hz
const KP = 1.6; // gravity-correction gain (rad/s per rad of tilt error)
const ACCEL_MIN_G = 0.7; // gate: ignore gravity correction while accelerating
const ACCEL_MAX_G = 1.3;
const MAX_DT = 0.05; // clamp integration steps (sensor hiccups)

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Shortest-arc quaternion rotating unit vector u onto unit vector v. */
function shortestArc(u: Vec3, v: Vec3): Quat {
  const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  if (d < -0.9999) {
    // Antiparallel: rotate 180° around any axis orthogonal to u.
    const axis: Vec3 =
      Math.abs(u[0]) < 0.9 ? cross(u, [1, 0, 0]) : cross(u, [0, 1, 0]);
    const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    return [axis[0] / len, axis[1] / len, axis[2] / len, 0];
  }
  const axis = cross(u, v);
  return quatNormalize([axis[0], axis[1], axis[2], 1 + d]);
}

class OrientationEngine {
  private q: Quat = IDENTITY_QUAT;
  private speed = 0; // |ω| rad/s
  private initialized = false;
  private started = false;
  private lastGyroTs = 0;
  private accelDir: Vec3 | null = null; // normalized, device frame (points up)
  private accelValid = false;
  private gyroSub: { remove(): void } | null = null;
  private accelSub: { remove(): void } | null = null;

  get quaternion(): Quat {
    return this.q;
  }

  get angularSpeed(): number {
    return this.speed;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  /** Start the sensors (idempotent). Tracking stays on for the app's life. */
  acquire(): void {
    if (this.started) return;
    this.started = true;

    Accelerometer.setUpdateInterval(UPDATE_MS);
    this.accelSub = Accelerometer.addListener((a) => {
      const mag = Math.hypot(a.x, a.y, a.z);
      this.accelValid = mag > ACCEL_MIN_G && mag < ACCEL_MAX_G;
      if (mag > 1e-6) {
        this.accelDir = [a.x / mag, a.y / mag, a.z / mag];
      }
      if (!this.initialized && this.accelValid && this.accelDir) {
        // Level the world from gravity; yaw arbitrary until zeroYaw().
        this.q = shortestArc(this.accelDir, [0, 1, 0]);
        this.initialized = true;
        this.zeroYaw();
      }
    });

    Gyroscope.setUpdateInterval(UPDATE_MS);
    this.gyroSub = Gyroscope.addListener((g) => {
      const ts: number = g.timestamp ?? Date.now() / 1000;
      const dt = this.lastGyroTs > 0 ? Math.min(MAX_DT, ts - this.lastGyroTs) : 0;
      this.lastGyroTs = ts;
      if (!this.initialized || dt <= 0) return;

      let wx = g.x;
      let wy = g.y;
      let wz = g.z;
      this.speed = Math.hypot(wx, wy, wz);

      // Gravity correction: pull the predicted device-frame "up" toward the
      // measured one (Mahony proportional term), only while not accelerating.
      if (this.accelValid && this.accelDir) {
        const predictedUp = quatRotateVec3(quatConjugate(this.q), [0, 1, 0]);
        const e = cross(this.accelDir, predictedUp);
        wx += KP * e[0];
        wy += KP * e[1];
        wz += KP * e[2];
      }

      const angle = Math.hypot(wx, wy, wz) * dt;
      if (angle > 1e-9) {
        const inv = 1 / Math.hypot(wx, wy, wz);
        const dq = quatFromAxisAngle([wx * inv, wy * inv, wz * inv], angle);
        // Body-frame rates -> right-multiply.
        this.q = quatNormalize(quatMultiply(this.q, dq));
      }
    });
  }

  /** Rotate the world so the current facing direction becomes lon=0 (front). */
  zeroYaw(): void {
    const f = quatRotateVec3(this.q, [0, 0, -1]);
    const lon = Math.atan2(f[0], f[2]);
    this.q = quatNormalize(
      quatMultiply(quatFromAxisAngle([0, 1, 0], -lon), this.q),
    );
  }

  /** Re-level from gravity and re-zero yaw (fresh session). */
  reinitialize(): void {
    if (this.accelDir && this.accelValid) {
      this.q = shortestArc(this.accelDir, [0, 1, 0]);
      this.zeroYaw();
    } else {
      this.initialized = false; // next valid accel sample re-inits
    }
  }

  release(): void {
    // Intentionally keep sensors running across screens so the yaw reference
    // survives capture -> review -> capture. Call shutdown() to actually stop.
  }

  shutdown(): void {
    this.gyroSub?.remove();
    this.accelSub?.remove();
    this.gyroSub = null;
    this.accelSub = null;
    this.started = false;
    this.initialized = false;
    this.lastGyroTs = 0;
  }
}

export const orientationEngine = new OrientationEngine();
