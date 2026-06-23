import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { ALIGN_THRESHOLD_RAD } from '../src/capture/autoCapture';
import { Target, angleBetween, cameraForward } from '../src/lib/geo';
import { Quat } from '../src/lib/quaternion';
import { ProgressBar } from '../src/ui/ProgressBar';
import { PanoGuide } from '../src/ui/PanoGuide';
import { colors, font, radius, spacing } from '../src/ui/theme';

const CAPTURE_COOLDOWN_MS = 900;
const DWELL_MS = 850; // hold steady on a target this long (lets autofocus settle)
const STEADY_SPEED = 0.5; // rad/s — "holding still enough"

/** First target in the chosen order that hasn't been captured yet. */
function firstPending(targets: Target[], done: ReadonlySet<number>): number {
  for (let i = 0; i < targets.length; i++) if (!done.has(i)) return i;
  return -1;
}

export default function CaptureScreen() {
  const session = useSession();
  const { quatRef, angularSpeedRef, uiQuat } = useOrientation(
    session.headingOffset,
    session.calibration.invertHorizontal,
  );
  const cameraRef = useRef<CameraView>(null);

  const [size, setSize] = useState({ width: 1, height: 1 });
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [aligned, setAligned] = useState(false);
  const [dwelling, setDwelling] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compositorRef = useRef<Compositor | null>(null);
  const rafRef = useRef<number | null>(null);
  const capturingRef = useRef(false);
  const lastCaptureTs = useRef(0);
  const alignedSince = useRef(0);
  const alertedRef = useRef(false);
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
  const winW = size.width * 0.96;
  const winH = size.height * 0.72;

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
        if (!photo?.uri) throw new Error('takePictureAsync returned no image');
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
        setError(null);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (e) {
        const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
        setError(msg);
        if (!alertedRef.current) {
          alertedRef.current = true;
          setAutoEnabled(false); // stop the loop so the error stays on screen
          Alert.alert('שגיאת צילום', msg);
        }
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
      try {
        for (const entry of session.captures) {
          // eslint-disable-next-line no-await-in-loop
          await comp.addCaptureAsync(entry.record);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      compositorRef.current = comp;

      const dbW = gl.drawingBufferWidth;
      const dbH = gl.drawingBufferHeight;
      const dTanV = tanV;
      const dTanU = dTanV * (dbW / Math.max(1, dbH));

      const loop = () => {
        const c = compositorRef.current;
        if (!c) return;
        c.renderDisplay(quatRef.current, dTanU, dTanV, dbW, dbH);
        gl.endFrameEXP();

        const targets = targetsRef.current;
        const done = doneRef.current;
        const cur = firstPending(targets, done);
        setCurrentIndex((p) => (p === cur ? p : cur));

        const fwd = cameraForward(quatRef.current);
        const isAligned =
          cur >= 0 && angleBetween(fwd, targets[cur]!.dir) <= ALIGN_THRESHOLD_RAD;
        const steady = angularSpeedRef.current <= STEADY_SPEED;
        setAligned((p) => (p === isAligned ? p : isAligned));

        const now = Date.now();
        if (isAligned && steady) {
          if (alignedSince.current === 0) alignedSince.current = now;
          setDwelling((p) => (p ? p : true));
          if (
            autoRef.current &&
            now - alignedSince.current >= DWELL_MS &&
            !capturingRef.current &&
            now - lastCaptureTs.current > CAPTURE_COOLDOWN_MS
          ) {
            void fireCapture(cur);
          }
        } else {
          alignedSince.current = 0;
          setDwelling((p) => (p ? false : p));
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
    const cur = firstPending(targetsRef.current, doneRef.current);
    void fireCapture(cur >= 0 ? cur : 0);
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
    setExporting(true);
    // Let the overlay paint before the heavy synchronous encode blocks the thread.
    await new Promise((r) => setTimeout(r, 50));
    try {
      const uri = await comp.exportJpegAsync(0.92);
      session.setExportedUri(uri);
      router.push('/review');
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
      setError(msg);
      Alert.alert('שגיאת ייצוא', msg);
    } finally {
      setExporting(false);
    }
  };

  const toggleInvert = () => {
    session.setCalibration({
      ...session.calibration,
      invertHorizontal: !session.calibration.invertHorizontal,
    });
  };

  const curTarget: Target | null =
    currentIndex >= 0 ? session.targets[currentIndex]! : null;
  const frameColor = aligned ? colors.success : dwelling ? colors.warn : 'rgba(255,255,255,0.9)';

  return (
    <View style={styles.container} onLayout={onLayout}>
      {/* Sphere canvas (dark wireframe + captured tiles) */}
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />

      {/* Live-camera window — large, almost fullscreen */}
      <View pointerEvents="none" style={styles.center}>
        <View
          style={[
            styles.window,
            { width: winW, height: winH, borderColor: frameColor },
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
        nearestIndex={currentIndex}
        viewQuat={uiQuat}
        tanU={tanU}
        tanV={tanV}
        width={size.width}
        height={size.height}
        aligned={aligned}
      />

      <SafeAreaView style={styles.ui} pointerEvents="box-none">
        <View style={styles.topCard} pointerEvents="box-none">
          <View style={styles.chipsRow} pointerEvents="box-none">
            <Pressable onPress={session.toggleCaptureMode} style={styles.chip}>
              <Text style={styles.chipLabel}>סריקה</Text>
              <Text style={styles.chipValue}>
                {session.captureMode === 'rows' ? 'שורות' : 'עמודות'}
              </Text>
            </Pressable>
            <Pressable onPress={toggleInvert} style={styles.chip}>
              <Text style={styles.chipLabel}>סיבוב</Text>
              <Text style={styles.chipValue}>
                {session.calibration.invertHorizontal ? 'הפוך' : 'רגיל'}
              </Text>
            </Pressable>
          </View>
          <ProgressBar progress={session.coverage} />
        </View>

        {(error || curTarget) && (
          <View style={styles.centerInfo} pointerEvents="none">
            {error ? (
              <View style={styles.errorPill}>
                <Text style={styles.errorText}>שגיאה: {error}</Text>
              </View>
            ) : (
              <View style={styles.countPill}>
                <Text style={styles.countText}>
                  {session.captures.length} תמונות
                </Text>
              </View>
            )}
          </View>
        )}

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
              disabled={session.captures.length === 0 || busy || exporting}
              primary
            />
          </View>
        </View>
      </SafeAreaView>

      {busy && !exporting && (
        <View pointerEvents="none" style={styles.savingPill}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.savingText}>שומר תמונה…</Text>
        </View>
      )}

      {exporting && (
        <View style={styles.exportOverlay}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.exportText}>מעבד פנורמה…</Text>
          <Text style={styles.exportSub}>זה עשוי לקחת כמה שניות</Text>
        </View>
      )}
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
    borderRadius: 22,
    borderWidth: 2,
    backgroundColor: '#000',
  },
  ui: { flex: 1, justifyContent: 'space-between', padding: spacing.md },
  topCard: {
    backgroundColor: 'rgba(11,11,15,0.66)',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipLabel: { color: colors.textDim, fontSize: font.small - 1, fontWeight: '600' },
  chipValue: { color: colors.text, fontSize: font.small, fontWeight: '800' },
  centerInfo: { alignItems: 'center' },
  errorPill: {
    backgroundColor: 'rgba(239,68,68,0.92)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '90%',
  },
  errorText: { color: '#fff', fontSize: font.small, fontWeight: '700' },
  countPill: {
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  countText: { color: colors.text, fontSize: font.small, fontWeight: '700' },
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
  savingPill: {
    position: 'absolute',
    bottom: 130,
    alignSelf: 'center',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  savingText: { color: '#fff', fontSize: font.small, fontWeight: '700' },
  exportOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  exportText: { color: colors.text, fontSize: font.heading, fontWeight: '800' },
  exportSub: { color: colors.textDim, fontSize: font.small },
});
