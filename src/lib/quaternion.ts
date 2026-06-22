/**
 * Minimal quaternion + vector math for orientation tracking and projection.
 *
 * Conventions:
 *  - Quaternion stored as [x, y, z, w] (same layout three.js uses).
 *  - World frame is Y-up, right-handed. lon=0 looks toward +Z (see geo.ts).
 *  - A "capture quaternion" rotates a direction expressed in the CAMERA frame
 *    into the WORLD frame (camera -> world). The camera frame matches three.js'
 *    camera convention: looks down -Z, +X right, +Y up. The accumulation shader
 *    is written against that same convention.
 */

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number]; // x, y, z, w

export const IDENTITY_QUAT: Quat = [0, 0, 0, 1];

export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatConjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

export function quatNormalize(q: Quat): Quat {
  const [x, y, z, w] = q;
  const len = Math.hypot(x, y, z, w);
  if (len === 0) return IDENTITY_QUAT;
  const inv = 1 / len;
  return [x * inv, y * inv, z * inv, w * inv];
}

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const half = angle / 2;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

/**
 * Build a quaternion from intrinsic Euler angles in the given order.
 * Ported from three.js Quaternion.setFromEuler. Angles in radians.
 */
export function quatFromEuler(
  x: number,
  y: number,
  z: number,
  order: 'XYZ' | 'YXZ' | 'ZXY' | 'ZYX' | 'YZX' | 'XZY',
): Quat {
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);

  switch (order) {
    case 'XYZ':
      return [
        s1 * c2 * c3 + c1 * s2 * s3,
        c1 * s2 * c3 - s1 * c2 * s3,
        c1 * c2 * s3 + s1 * s2 * c3,
        c1 * c2 * c3 - s1 * s2 * s3,
      ];
    case 'YXZ':
      return [
        s1 * c2 * c3 + c1 * s2 * s3,
        c1 * s2 * c3 - s1 * c2 * s3,
        c1 * c2 * s3 - s1 * s2 * c3,
        c1 * c2 * c3 + s1 * s2 * s3,
      ];
    case 'ZXY':
      return [
        s1 * c2 * c3 - c1 * s2 * s3,
        c1 * s2 * c3 + s1 * c2 * s3,
        c1 * c2 * s3 + s1 * s2 * c3,
        c1 * c2 * c3 - s1 * s2 * s3,
      ];
    case 'ZYX':
      return [
        s1 * c2 * c3 - c1 * s2 * s3,
        c1 * s2 * c3 + s1 * c2 * s3,
        c1 * c2 * s3 - s1 * s2 * c3,
        c1 * c2 * c3 + s1 * s2 * s3,
      ];
    case 'YZX':
      return [
        s1 * c2 * c3 + c1 * s2 * s3,
        c1 * s2 * c3 + s1 * c2 * s3,
        c1 * c2 * s3 - s1 * s2 * c3,
        c1 * c2 * c3 - s1 * s2 * s3,
      ];
    case 'XZY':
      return [
        s1 * c2 * c3 - c1 * s2 * s3,
        c1 * s2 * c3 - s1 * c2 * s3,
        c1 * c2 * s3 + s1 * s2 * c3,
        c1 * c2 * c3 + s1 * s2 * s3,
      ];
  }
}

/** Rotate a vector by a quaternion. */
export function quatRotateVec3(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  // v + qw * t + cross(q.xyz, t)
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

/** Spherical linear interpolation between two unit quaternions. */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let [ax, ay, az, aw] = a;
  let [bx, by, bz, bw] = b;
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    cos = -cos;
  }
  if (cos > 0.9995) {
    // Nearly parallel — linear interpolate and normalize.
    return quatNormalize([
      ax + (bx - ax) * t,
      ay + (by - ay) * t,
      az + (bz - az) * t,
      aw + (bw - aw) * t,
    ]);
  }
  const theta0 = Math.acos(cos);
  const theta = theta0 * t;
  const sin = Math.sin(theta);
  const sin0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - (cos * sin) / sin0;
  const s1 = sin / sin0;
  return [
    ax * s0 + bx * s1,
    ay * s0 + by * s1,
    az * s0 + bz * s1,
    aw * s0 + bw * s1,
  ];
}

/**
 * Convert a quaternion to a column-major 3x3 rotation matrix (Float32Array, 9
 * elements) suitable for a `mat3` uniform. Columns are the world-space images of
 * the camera basis vectors X, Y, Z — i.e. this is the camera->world matrix.
 */
export function quatToMat3(q: Quat): Float32Array {
  const [x, y, z, w] = q;
  const x2 = x + x,
    y2 = y + y,
    z2 = z + z;
  const xx = x * x2,
    xy = x * y2,
    xz = x * z2;
  const yy = y * y2,
    yz = y * z2,
    zz = z * z2;
  const wx = w * x2,
    wy = w * y2,
    wz = w * z2;

  const m = new Float32Array(9);
  // column 0
  m[0] = 1 - (yy + zz);
  m[1] = xy + wz;
  m[2] = xz - wy;
  // column 1
  m[3] = xy - wz;
  m[4] = 1 - (xx + zz);
  m[5] = yz + wx;
  // column 2
  m[6] = xz + wy;
  m[7] = yz - wx;
  m[8] = 1 - (xx + yy);
  return m;
}

/** Angular distance (radians) between the forward directions of two quats. */
export function quatAngle(a: Quat, b: Quat): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  return 2 * Math.acos(Math.min(1, Math.abs(dot)));
}

export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}
