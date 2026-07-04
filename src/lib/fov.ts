/**
 * Field-of-view calibration. expo-camera does not reliably expose the sensor
 * FOV, so we keep a single reference horizontal FOV (for the *wider* image axis)
 * and derive the other axis from the actual texture aspect ratio. The calibration
 * screen lets the user nudge `referenceFovDeg` until vertical seams disappear.
 */

export interface FovCalibration {
  /** Horizontal FOV (degrees) of the sensor's wider edge. ~65° is typical. */
  referenceFovDeg: number;
  /** Mirror the sampled photo horizontally (some front/rear sensor mappings). */
  mirrorX: boolean;
  /** Mirror the sampled photo vertically. */
  mirrorY: boolean;
}

export const DEFAULT_CALIBRATION: FovCalibration = {
  referenceFovDeg: 66,
  mirrorX: false,
  mirrorY: false,
};

export const MIN_FOV_DEG = 40;
export const MAX_FOV_DEG = 90;

/**
 * Given the reference (wider-axis) FOV and a texture's pixel size, return the
 * half-angle tangents along the texture's U (width) and V (height) axes.
 */
export function fovTangents(
  referenceFovDeg: number,
  texWidth: number,
  texHeight: number,
): { tanU: number; tanV: number } {
  const refTan = Math.tan((referenceFovDeg * Math.PI) / 180 / 2);
  if (texWidth >= texHeight) {
    // Landscape texture: reference FOV is the horizontal (U) axis.
    return { tanU: refTan, tanV: refTan * (texHeight / texWidth) };
  }
  // Portrait texture: reference FOV is the vertical (V) axis.
  return { tanU: refTan * (texWidth / texHeight), tanV: refTan };
}

/** Approximate angular coverage (deg) of a single shot, used for target layout. */
export function shotCoverageDeg(referenceFovDeg: number): {
  hfovDeg: number;
  vfovDeg: number;
} {
  // The phone is held in PORTRAIT, so the reference FOV is the tall (vertical) axis
  // and the horizontal coverage is narrower by the image aspect (~3:4). Target
  // spacing must match the *true* per-shot coverage or the tiles won't overlap and
  // black gaps appear between them.
  const vfovDeg = referenceFovDeg;
  const aspect = 3 / 4; // portrait width / height
  const hHalf = Math.atan(Math.tan((vfovDeg * Math.PI) / 180 / 2) * aspect);
  const hfovDeg = (hHalf * 2 * 180) / Math.PI;
  return { hfovDeg, vfovDeg };
}
