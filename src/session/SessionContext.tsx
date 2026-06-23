/**
 * Session store shared across screens. It holds lightweight, serialisable state
 * (capture records = photo file URI + capture orientation + calibration), never GL
 * objects. The capture screen rebuilds the GPU accumulation buffer by replaying
 * these records, so leaving and re-entering capture preserves the panorama.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { CaptureRecord } from '../gl/Compositor';
import { DEFAULT_CALIBRATION, FovCalibration, shotCoverageDeg } from '../lib/fov';
import {
  CaptureMode,
  Target,
  angleBetween,
  cameraForward,
  generateTargets,
} from '../lib/geo';
import { IDENTITY_QUAT, Quat } from '../lib/quaternion';

function buildTargets(referenceFovDeg: number, mode: CaptureMode): Target[] {
  const { hfovDeg, vfovDeg } = shotCoverageDeg(referenceFovDeg);
  return generateTargets(hfovDeg, vfovDeg, mode);
}

/** Index of the target whose direction is closest to `dir`. */
function nearestTargetIndex(
  dir: readonly [number, number, number],
  targets: Target[],
): number {
  let best = 0;
  let bestAngle = Infinity;
  for (let i = 0; i < targets.length; i++) {
    const a = angleBetween(dir, targets[i]!.dir);
    if (a < bestAngle) {
      bestAngle = a;
      best = i;
    }
  }
  return best;
}

export interface OutputSize {
  width: number;
  height: number;
  label: string;
}

export const OUTPUT_SIZES: OutputSize[] = [
  { width: 2048, height: 1024, label: '2048 × 1024 (מהיר)' },
  { width: 4096, height: 2048, label: '4096 × 2048' },
  { width: 5760, height: 2880, label: '5760 × 2880' },
];

interface CaptureEntry {
  record: CaptureRecord;
  targetIndex: number;
}

interface SessionValue {
  calibration: FovCalibration;
  setCalibration: (c: FovCalibration) => void;
  outputSize: OutputSize;
  setOutputSize: (s: OutputSize) => void;
  headingOffset: Quat;
  setHeadingOffset: (q: Quat) => void;
  captureMode: CaptureMode;
  toggleCaptureMode: () => void;
  targets: Target[];
  captures: CaptureEntry[];
  doneSet: Set<number>;
  addCapture: (record: CaptureRecord, targetIndex: number) => void;
  undoLast: () => CaptureEntry | undefined;
  reset: () => void;
  exportedUri: string | null;
  setExportedUri: (uri: string | null) => void;
  coverage: number;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [calibration, setCalibration] = useState<FovCalibration>(DEFAULT_CALIBRATION);
  const [outputSize, setOutputSize] = useState<OutputSize>(OUTPUT_SIZES[0]!);
  const [captures, setCaptures] = useState<CaptureEntry[]>([]);
  const [exportedUri, setExportedUri] = useState<string | null>(null);
  const [headingOffset, setHeadingOffset] = useState<Quat>(IDENTITY_QUAT);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('rows');

  // Targets depend on the FOV (shot coverage) and the chosen capture order.
  const targets = useMemo<Target[]>(
    () => buildTargets(calibration.referenceFovDeg, captureMode),
    [calibration.referenceFovDeg, captureMode],
  );

  // Switching order re-indexes targets, so remap each capture to its new nearest.
  const toggleCaptureMode = useCallback(() => {
    setCaptureMode((prev) => {
      const next: CaptureMode = prev === 'rows' ? 'columns' : 'rows';
      const newTargets = buildTargets(calibration.referenceFovDeg, next);
      setCaptures((cs) =>
        cs.map((c) => ({
          ...c,
          targetIndex: nearestTargetIndex(cameraForward(c.record.rot), newTargets),
        })),
      );
      return next;
    });
  }, [calibration.referenceFovDeg]);

  const doneSet = useMemo(
    () => new Set(captures.map((c) => c.targetIndex)),
    [captures],
  );

  const addCapture = useCallback(
    (record: CaptureRecord, targetIndex: number) => {
      setCaptures((prev) => [...prev, { record, targetIndex }]);
      setExportedUri(null);
    },
    [],
  );

  const undoLast = useCallback((): CaptureEntry | undefined => {
    let removed: CaptureEntry | undefined;
    setCaptures((prev) => {
      if (prev.length === 0) return prev;
      removed = prev[prev.length - 1];
      return prev.slice(0, -1);
    });
    setExportedUri(null);
    return removed;
  }, []);

  const reset = useCallback(() => {
    setCaptures([]);
    setExportedUri(null);
  }, []);

  const coverage = useMemo(
    () => (targets.length === 0 ? 0 : doneSet.size / targets.length),
    [doneSet, targets.length],
  );

  const value: SessionValue = {
    calibration,
    setCalibration,
    outputSize,
    setOutputSize,
    headingOffset,
    setHeadingOffset,
    captureMode,
    toggleCaptureMode,
    targets,
    captures,
    doneSet,
    addCapture,
    undoLast,
    reset,
    exportedUri,
    setExportedUri,
    coverage,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
