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
  /** Reverse the horizontal (yaw) rotation sense if it feels inverted on device. */
  invertHorizontal: boolean;
}

export const DEFAULT_CALIBRATION: FovCalibration = {
  referenceFovDeg: 66,
  mirrorX: false,
  mirrorY: false,
  invertHorizontal: false,
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
  // These only drive target spacing. We assume generous per-shot coverage to keep
  // the number of guided shots reasonable (~20 for a full sphere) — the feather
  // blend tolerates the larger spacing.
  return { hfovDeg: referenceFovDeg * 1.1, vfovDeg: referenceFovDeg };
}
