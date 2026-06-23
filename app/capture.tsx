import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CameraView } from 'expo-camera';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import * as Haptics from 'expo-haptics';
import { useSession } from '../src/session/SessionContext';
import { useOrientation } from '../src/capture/useOrientation';
import { Compositor, CaptureRecord } from '../src/gl/Compositor';
import { ALIGN_THRESHOLD_RAD, nearestFromQuat } from '../src/capture/autoCapture';
import { Quat } from '../src/lib/quaternion';
import { ProgressRing } from '../src/ui/ProgressRing';
import { PanoGuide } from '../src/ui/PanoGuide';
import { colors, font, radius, spacing } from '../src/ui/theme';

const CAPTURE_COOLDOWN_MS = 900;
const DWELL_MS = 850; // hold steady on a target this long (lets autofocus settle)
const STEADY_SPEED = 0.5; // rad/s — "holding still enough"
const WINDOW_FRAC = 0.7; // live-camera window size as a fraction of screen width

export default function CaptureScreen() {
  const session = useSession();
  const { quatRef, angularSpeedRef, uiQuat } = useOrientation(
    session.headingOffset,
    session.calibration.invertHorizontal,
  );
  const cameraRef = useRef<CameraView>(null);

  const [size, setSize] = useState({ width: 1, height: 1 });
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [nearestIndex, setNearestIndex] = useState(-1);
  const [aligned, setAligned] = useState(false);
  const [dwelling, setDwelling] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const compositorRef = useRef<Compositor | null>(null);
  const rafRef = useRef<number | null>(null);
  const capturingRef = useRef(false);
  const lastCaptureTs = useRef(0);
  const alignedSince = useRef(0);
  const doneRef = useRef(session.doneSet);
  const targetsRef = useRef(session.targets);
  const autoRef = useRef(autoEnabled);
  const readyRef = useRef(false);

  doneRef.current = session.doneSet;
  targetsRef.current = session.targets;
  autoRef.current = autoEnabled;
  readyRef.current = cameraReady;

  const tanV = Math.tan((session.calibration.referenceFovDeg * Math.PI) / 180 / 2);
  const tanU = tanV * (size.width / Math.max(1, size.height));
  const windowSize = Math.min(size.width, size.height) * WINDOW_FRAC;

  const fireCapture = useCallback(
    async (targetIndex: number) => {
      if (capturingRef.current || !readyRef.current || targetIndex < 0) return;
      const comp = compositorRef.current;
      if (!comp) return;
      capturingRef.current = true;
      setBusy(true);
      const rot: Quat = quatRef.current;
      try {
        const photo = await cameraRef.current?.takePictureAsync({
          quality: 0.85,
          skipProcessing: false,
        });
        if (photo?.uri) {
          const record: CaptureRecord = {
            uri: photo.uri,
            width: photo.width,
            height: photo.height,
            rot,
            referenceFovDeg: session.calibration.referenceFovDeg,
            mirrorX: session.calibration.mirrorX,
            mirrorY: session.calibration.mirrorY,
          };
          await comp.addCaptureAsync(record);
          session.addCapture(record, targetIndex);
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      } catch {
        // a failed frame just won't be added
      } finally {
        lastCaptureTs.current = Date.now();
        alignedSince.current = 0;
        capturingRef.current = false;
        setBusy(false);
      }
    },
    [session, quatRef],
  );

  const onContextCreate = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      const comp = new Compositor(gl, {
        outputWidth: session.outputSize.width,
        outputHeight: session.outputSize.height,
      });
      comp.init();
      for (const entry of session.captures) {
        // eslint-disable-next-line no-await-in-loop
        await comp.addCaptureAsync(entry.record);
      }
      compositorRef.current = comp;

      const dbW = gl.drawingBufferWidth;
      const dbH = gl.drawingBufferHeight;
      const dTanV = tanV;
      const dTanU = dTanV * (dbW / Math.max(1, dbH));

      const loop = () => {
        const c = compositorRef.current;
        if (!c) return;
        // Draw the sphere canvas (dark + wireframe + captured tiles, world-fixed).
        c.renderDisplay(quatRef.current, dTanU, dTanV, dbW, dbH);
        gl.endFrameEXP();

        const targets = targetsRef.current;
        const done = doneRef.current;
        const nearest = nearestFromQuat(quatRef.current, targets, done);
        setNearestIndex((p) => (p === nearest.index ? p : nearest.index));

        const isAligned =
          nearest.index >= 0 && nearest.angle <= ALIGN_THRESHOLD_RAD;
        const steady = angularSpeedRef.current <= STEADY_SPEED;
        setAligned((p) => (p === isAligned ? p : isAligned));

        const now = Date.now();
        if (isAligned && steady) {
          if (alignedSince.current === 0) alignedSince.current = now;
          const held = now - alignedSince.current;
          setDwelling((p) => (p ? p : true));
          if (
            autoRef.current &&
            held >= DWELL_MS &&
            !capturingRef.current &&
            now - lastCaptureTs.current > CAPTURE_COOLDOWN_MS
          ) {
            void fireCapture(nearest.index);
          }
        } else {
          alignedSince.current = 0;
          setDwelling((p) => (p === false ? p : false));
        }

        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      compositorRef.current?.dispose();
      compositorRef.current = null;
    };
  }, []);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  const manualShutter = () => {
    const nearest = nearestFromQuat(
      quatRef.current,
      targetsRef.current,
      doneRef.current,
    );
    void fireCapture(nearest.index >= 0 ? nearest.index : 0);
  };

  const undo = async () => {
    const removed = session.undoLast();
    if (removed) await compositorRef.current?.undoLastAsync();
  };

  const restart = async () => {
    session.reset();
    await compositorRef.current?.resetAsync();
  };

  const finish = async () => {
    const comp = compositorRef.current;
    if (!comp) return;
    setBusy(true);
    try {
      const uri = await comp.exportJpegAsync(0.92);
      session.setExportedUri(uri);
      router.push('/review');
    } finally {
      setBusy(false);
    }
  };

  const toggleInvert = () => {
    session.setCalibration({
      ...session.calibration,
      invertHorizontal: !session.calibration.invertHorizontal,
    });
  };

  const frameColor = aligned
    ? colors.success
    : dwelling
      ? colors.warn
      : 'rgba(255,255,255,0.92)';

  return (
    <View style={styles.container} onLayout={onLayout}>
      {/* Sphere canvas (dark wireframe + captured tiles) */}
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />

      {/* Live-camera window, centred (the aiming "lens") */}
      <View pointerEvents="none" style={styles.center}>
        <View
          style={[
            styles.window,
            {
              width: windowSize,
              height: windowSize,
              borderColor: frameColor,
            },
          ]}
        >
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            autofocus="on"
            onCameraReady={() => setCameraReady(true)}
          />
        </View>
      </View>

      <PanoGuide
        targets={session.targets}
        done={session.doneSet}
        nearestIndex={nearestIndex}
        viewQuat={uiQuat}
        tanU={tanU}
        tanV={tanV}
        width={size.width}
        height={size.height}
        aligned={aligned}
      />

      <SafeAreaView style={styles.ui} pointerEvents="box-none">
        <View style={styles.topBar} pointerEvents="box-none">
          <ProgressRing progress={session.coverage} />
          <Pressable onPress={toggleInvert} style={styles.invertBtn}>
            <Text style={styles.invertText}>
              סיבוב{'\n'}
              {session.calibration.invertHorizontal ? 'הפוך' : 'רגיל'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.bottomBar} pointerEvents="box-none">
          <View style={styles.sideCol}>
            <RoundBtn
              label="בטל"
              onPress={undo}
              disabled={session.captures.length === 0 || busy}
            />
            <RoundBtn label="התחל מחדש" onPress={restart} disabled={busy} small />
          </View>

          <Pressable
            onPress={manualShutter}
            disabled={busy}
            style={[styles.shutter, aligned && styles.shutterAligned]}
          >
            <View style={styles.shutterInner} />
          </Pressable>

          <View style={styles.sideCol}>
            <RoundBtn
              label={autoEnabled ? 'אוטו: פעיל' : 'אוטו: כבוי'}
              onPress={() => setAutoEnabled((v) => !v)}
              active={autoEnabled}
            />
            <RoundBtn
              label="סיום"
              onPress={finish}
              disabled={session.captures.length === 0 || busy}
              primary
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function RoundBtn({
  label,
  onPress,
  disabled,
  primary,
  active,
  small,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  active?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.roundBtn,
        small && styles.roundBtnSmall,
        primary && { backgroundColor: colors.accent },
        active && { borderColor: colors.accent },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text style={[styles.roundBtnText, primary && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  window: {
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 3,
    backgroundColor: '#000',
  },
  ui: { flex: 1, justifyContent: 'space-between', padding: spacing.md },
  topBar: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  invertBtn: {
    backgroundColor: colors.overlay,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  invertText: {
    color: colors.text,
    fontSize: font.small - 1,
    fontWeight: '700',
    textAlign: 'center',
  },
  bottomBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideCol: { gap: spacing.sm, alignItems: 'center' },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterAligned: { borderColor: colors.success },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  roundBtn: {
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 92,
    alignItems: 'center',
  },
  roundBtnSmall: { paddingVertical: 6 },
  roundBtnText: { color: colors.text, fontSize: font.small, fontWeight: '700' },
});
