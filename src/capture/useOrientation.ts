/**
 * React hook over the singleton gyro+gravity orientation engine. Exposes live
 * ref-style accessors (zero re-renders during motion) plus a throttled state
 * mirror for screens that render from orientation (the calibrate horizon).
 */

import { useEffect, useMemo, useState } from 'react';
import { Quat } from '../lib/quaternion';
import { orientationEngine } from './orientationEngine';

const UI_THROTTLE_MS = 66;

export interface OrientationApi {
  /** Live camera->world quaternion (getter-backed ref, no re-renders). */
  quatRef: React.RefObject<Quat>;
  /** Live |ω| in rad/s (for the "hold steady" gate). */
  angularSpeedRef: React.RefObject<number>;
  /** Throttled copy for UI that renders from orientation. */
  uiQuat: Quat;
  /** Make the current facing direction the panorama front (lon = 0). */
  zeroYaw: () => void;
}

export function useOrientation(mirrorToState = false): OrientationApi {
  const [uiQuat, setUiQuat] = useState<Quat>(orientationEngine.quaternion);

  useEffect(() => {
    orientationEngine.acquire();
    if (!mirrorToState) return;
    const t = setInterval(
      () => setUiQuat(orientationEngine.quaternion),
      UI_THROTTLE_MS,
    );
    return () => clearInterval(t);
  }, [mirrorToState]);

  const refs = useMemo(
    () => ({
      quatRef: {
        get current(): Quat {
          return orientationEngine.quaternion;
        },
      } as React.RefObject<Quat>,
      angularSpeedRef: {
        get current(): number {
          return orientationEngine.angularSpeed;
        },
      } as React.RefObject<number>,
    }),
    [],
  );

  return {
    quatRef: refs.quatRef,
    angularSpeedRef: refs.angularSpeedRef,
    uiQuat,
    zeroYaw: () => orientationEngine.zeroYaw(),
  };
}
