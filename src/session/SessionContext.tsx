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
import { Target, generateTargets } from '../lib/geo';
import { IDENTITY_QUAT, Quat } from '../lib/quaternion';

function buildTargets(referenceFovDeg: number): Target[] {
  const { hfovDeg, vfovDeg } = shotCoverageDeg(referenceFovDeg);
  return generateTargets(hfovDeg, vfovDeg);
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
  targets: Target[];
  captures: CaptureEntry[];
  doneSet: Set<number>;
  addCapture: (record: CaptureRecord, targetIndex: number) => void;
  undoLast: () => CaptureEntry | undefined;
  reset: () => void;
  exportedUri: string | null;
  setExportedUri: (uri: string | null) => void;
  coverage: number;
  /** The room this capture session belongs to (resets when switching rooms). */
  sessionRoomId: string | null;
  beginRoomSession: (roomId: string) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [calibration, setCalibration] = useState<FovCalibration>(DEFAULT_CALIBRATION);
  const [outputSize, setOutputSize] = useState<OutputSize>(OUTPUT_SIZES[0]!);
  const [captures, setCaptures] = useState<CaptureEntry[]>([]);
  const [exportedUri, setExportedUri] = useState<string | null>(null);
  const [headingOffset, setHeadingOffset] = useState<Quat>(IDENTITY_QUAT);

  // Targets depend only on the FOV (per-shot coverage).
  const targets = useMemo<Target[]>(
    () => buildTargets(calibration.referenceFovDeg),
    [calibration.referenceFovDeg],
  );

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

  const [sessionRoomId, setSessionRoomId] = useState<string | null>(null);
  const beginRoomSession = useCallback(
    (roomId: string) => {
      setSessionRoomId((prev) => {
        if (prev !== roomId) {
          reset();
        }
        return roomId;
      });
    },
    [reset],
  );

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
    targets,
    captures,
    doneSet,
    addCapture,
    undoLast,
    reset,
    exportedUri,
    setExportedUri,
    coverage,
    sessionRoomId,
    beginRoomSession,
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
