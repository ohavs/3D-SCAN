import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import * as Haptics from 'expo-haptics';
import { copyAsync } from 'expo-file-system/legacy';
import { useSession } from '../src/session/SessionContext';
import { useOrientation } from '../src/capture/useOrientation';
import { orientationEngine } from '../src/capture/orientationEngine';
import { Compositor, CaptureRecord } from '../src/gl/Compositor';
import { ALIGN_THRESHOLD_RAD } from '../src/capture/autoCapture';
import { Target, angleBetween, cameraForward } from '../src/lib/geo';
import { Quat } from '../src/lib/quaternion';
import { ensurePanosDir, PANOS_DIR, useProjects } from '../src/store/projects';
import { GuidanceLayer } from '../src/ui/GuidanceLayer';
import { ProgressBar } from '../src/ui/ProgressBar';
import { Button } from '../src/ui/Button';
import { colors, font, radius, spacing } from '../src/ui/theme';

const CAPTURE_COOLDOWN_MS = 900;
const DWELL_MS = 800; // hold steady this long before auto-shoot (autofocus settles)
const STEADY_SPEED = 0.5; // rad/s

// eslint-disable-next-line @typescript-eslint/no-require-imports
const CHIME = require('../assets/sounds/capture-chime.wav');

function firstPending(targets: Target[], done: ReadonlySet<number>): number {
  for (let i = 0; i < targets.length; i++) if (!done.has(i)) return i;
  return -1;
}

export default function CaptureScreen() {
  const { project: projectId, room: roomId } = useLocalSearchParams<{
    project: string;
    room: string;
  }>();
  const store = useProjects();
  const session = useSession();
  const [camPerm, requestCam] = useCameraPermissions();

  const project = store.getProject(projectId ?? '');
  const room = project?.rooms.find((r) => r.id === roomId);

  const { quatRef, angularSpeedRef } = useOrientation();
  const cameraRef = useRef<CameraView>(null);
  const chime = useAudioPlayer(CHIME);
  const flashOpacity = useRef(new Animated.Value(0)).current;

  const [size, setSize] = useState({ width: 1, height: 1 });
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [poleHint, setPoleHint] = useState<'ceiling' | 'floor' | null>(null);

  // Live refs consumed by GuidanceLayer (no re-render churn during motion).
  const currentIndexRef = useRef(-1);
  const alignedRef = useRef(false);
  const dwellRef = useRef(0);

  const compositorRef = useRef<Compositor | null>(null);
  const rafRef = useRef<number | null>(null);
  const capturingRef = useRef(false);
  const lastCaptureTs = useRef(0);
  const alignedSince = useRef(0);
  const doneRef = useRef(session.doneSet);
  const targetsRef = useRef(session.targets);
  const autoRef = useRef(autoEnabled);
  const readyRef = useRef(false);
  const finishingRef = useRef(false);

  doneRef.current = session.doneSet;
  targetsRef.current = session.targets;
  autoRef.current = autoEnabled;
  readyRef.current = cameraReady;

  // Begin/continue this room's session. On a fresh session, re-level the tracker
  // and zero the yaw once it's live, so the first shot becomes the panorama front.
  useEffect(() => {
    if (!roomId) return;
    const fresh = session.sessionRoomId !== roomId;
    session.beginRoomSession(roomId);
    if (fresh) {
      const timer = setInterval(() => {
        if (orientationEngine.isInitialized) {
          orientationEngine.zeroYaw();
          clearInterval(timer);
        }
      }, 120);
      return () => clearInterval(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const tanV = Math.tan((session.calibration.referenceFovDeg * Math.PI) / 180 / 2);
  const tanU = tanV * (size.width / Math.max(1, size.height));

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
        if (!photo?.uri) throw new Error('המצלמה לא החזירה תמונה');
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
        // Gentle feedback: soft chime + light haptic + quick white flash.
        try {
          chime.seekTo(0);
          chime.play();
        } catch {
          // audio is best-effort
        }
        flashOpacity.setValue(0.55);
        Animated.timing(flashOpacity, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }).start();
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) {
        setAutoEnabled(false);
        Alert.alert('שגיאת צילום', e instanceof Error ? e.message : String(e));
      } finally {
        lastCaptureTs.current = Date.now();
        alignedSince.current = 0;
        capturingRef.current = false;
        setBusy(false);
      }
    },
    [session, quatRef, chime, flashOpacity],
  );

  const finish = useCallback(async () => {
    const comp = compositorRef.current;
    if (!comp || finishingRef.current || !projectId || !roomId) return;
    finishingRef.current = true;
    setExporting(true);
    await new Promise((r) => setTimeout(r, 50)); // let the overlay paint
    try {
      const exportUri = await comp.exportJpegAsync(0.9);
      await ensurePanosDir();
      const dest = `${PANOS_DIR}${roomId}_${Date.now()}.jpg`;
      await copyAsync({ from: exportUri, to: dest });
      store.setRoomCaptured(projectId, roomId, dest);
      session.setExportedUri(dest);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/review?project=${projectId}&room=${roomId}`);
    } catch (e) {
      Alert.alert('שגיאת עיבוד', e instanceof Error ? e.message : String(e));
      finishingRef.current = false;
    } finally {
      setExporting(false);
    }
  }, [projectId, roomId, store, session]);

  // Auto-finish when the whole sphere is covered.
  const allDone =
    session.targets.length > 0 && session.doneSet.size >= session.targets.length;
  useEffect(() => {
    if (allDone && !exporting) {
      void finish();
    }
  }, [allDone, exporting, finish]);

  const onContextCreate = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      const comp = new Compositor(gl, {
        outputWidth: store.settings.outputWidth,
        outputHeight: store.settings.outputWidth / 2,
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
        c.renderDisplay(quatRef.current, dTanU, dTanV, dbW, dbH);
        gl.endFrameEXP();

        const targets = targetsRef.current;
        const done = doneRef.current;
        const cur = firstPending(targets, done);
        currentIndexRef.current = cur;

        // Pole hint: tell the user to point up/down for ceiling/floor shots.
        const kind = cur >= 0 ? targets[cur]!.kind : null;
        setPoleHint((p) => {
          const next = kind === 'ceiling' ? 'ceiling' : kind === 'floor' ? 'floor' : null;
          return p === next ? p : next;
        });

        const fwd = cameraForward(quatRef.current);
        const isAligned =
          cur >= 0 && angleBetween(fwd, targets[cur]!.dir) <= ALIGN_THRESHOLD_RAD;
        const steady = angularSpeedRef.current <= STEADY_SPEED;
        alignedRef.current = isAligned;

        const now = Date.now();
        if (isAligned && steady) {
          if (alignedSince.current === 0) alignedSince.current = now;
          const frac = Math.min(1, (now - alignedSince.current) / DWELL_MS);
          dwellRef.current = frac;
          if (
            autoRef.current &&
            frac >= 1 &&
            !capturingRef.current &&
            now - lastCaptureTs.current > CAPTURE_COOLDOWN_MS
          ) {
            void fireCapture(cur);
          }
        } else {
          alignedSince.current = 0;
          dwellRef.current = 0;
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
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  };

  const undo = async () => {
    const removed = session.undoLast();
    if (removed) await compositorRef.current?.undoLastAsync();
  };

  const restart = () => {
    Alert.alert('להתחיל מחדש?', 'כל הצילומים של החדר יימחקו.', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'התחל מחדש',
        style: 'destructive',
        onPress: async () => {
          session.reset();
          await compositorRef.current?.resetAsync();
        },
      },
    ]);
  };

  // ---- permission gate ----
  if (!camPerm?.granted) {
    return (
      <SafeAreaView style={styles.permContainer}>
        <Text style={styles.permTitle}>נדרשת גישה למצלמה</Text>
        <Text style={styles.permText}>
          כדי לסרוק את החדר ב-360°, אשרו גישה למצלמה ולחיישני התנועה.
        </Text>
        <Button label="אשר גישה למצלמה" onPress={() => requestCam()} />
        <Button label="חזרה" variant="ghost" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container} onLayout={onLayout}>
      {/* Fullscreen live camera */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        autofocus="on"
        onCameraReady={() => setCameraReady(true)}
      />

      {/* Transparent panorama overlay: captured tiles painted onto the world,
          moving with the rotation over the live camera (Photaf-style) */}
      <GLView
        style={StyleSheet.absoluteFill}
        onContextCreate={onContextCreate}
        pointerEvents="none"
      />

      {/* Capture flash */}
      <Animated.View
        pointerEvents="none"
        style={[styles.flash, { opacity: flashOpacity }]}
      />

      <GuidanceLayer
        targets={session.targets}
        quatRef={quatRef}
        currentIndexRef={currentIndexRef}
        alignedRef={alignedRef}
        dwellRef={dwellRef}
        tanU={tanU}
        tanV={tanV}
        width={size.width}
        height={size.height}
      />

      <SafeAreaView style={styles.ui} pointerEvents="box-none">
        <View style={styles.topCard} pointerEvents="box-none">
          <View style={styles.topRow} pointerEvents="box-none">
            <Pressable onPress={() => router.back()} style={styles.exitBtn}>
              <Text style={styles.exitText}>יציאה</Text>
            </Pressable>
            <Text style={styles.roomTitle} numberOfLines={1}>
              {room?.title ?? 'סריקה'}
            </Text>
            <Pressable
              onPress={() => router.push('/calibrate')}
              style={styles.exitBtn}
            >
              <Text style={styles.exitText}>כיול</Text>
            </Pressable>
          </View>
          <ProgressBar
            progress={session.coverage}
            label={`${session.doneSet.size}/${session.targets.length} צילומים`}
          />
        </View>

        {poleHint && (
          <View style={styles.poleHint} pointerEvents="none">
            <Text style={styles.poleHintText}>
              {poleHint === 'ceiling' ? '⤴ כוונו למעלה — תקרה' : '⤵ כוונו למטה — רצפה'}
            </Text>
          </View>
        )}

        <View style={styles.bottomBar} pointerEvents="box-none">
          <View style={styles.sideCol}>
            <RoundBtn
              label={`בטל (${session.captures.length})`}
              onPress={undo}
              disabled={session.captures.length === 0 || busy}
            />
            <RoundBtn label="התחל מחדש" onPress={restart} disabled={busy} small />
          </View>

          <Pressable
            onPress={() => void fireCapture(firstPending(targetsRef.current, doneRef.current))}
            disabled={busy}
            style={styles.shutter}
          >
            <View style={styles.shutterInner} />
          </Pressable>

          <View style={styles.sideCol}>
            <RoundBtn
              label={autoEnabled ? 'אוטו ✓' : 'אוטו ✗'}
              onPress={() => setAutoEnabled((v) => !v)}
              active={autoEnabled}
            />
            <RoundBtn
              label="סיים עכשיו"
              onPress={() => void finish()}
              disabled={session.captures.length === 0 || busy || exporting}
              primary
            />
          </View>
        </View>
      </SafeAreaView>

      {!cameraReady && (
        <View style={styles.exportOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.exportText}>מכין את המצלמה…</Text>
        </View>
      )}

      {busy && !exporting && (
        <View pointerEvents="none" style={styles.savingPill}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.savingText}>מוסיף לפנורמה…</Text>
        </View>
      )}

      {exporting && (
        <View style={styles.exportOverlay}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.exportText}>מעבד פנורמה…</Text>
          <Text style={styles.exportSub}>
            {store.settings.outputWidth >= 4096
              ? 'איכות מלאה — עד חצי דקה'
              : 'כמה שניות'}
          </Text>
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
        primary && { backgroundColor: colors.accent, borderColor: colors.accent },
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
  flash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
  },
  ui: { flex: 1, justifyContent: 'space-between', padding: spacing.md },
  topCard: {
    backgroundColor: 'rgba(11,11,15,0.72)',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  exitBtn: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exitText: { color: colors.text, fontSize: font.small, fontWeight: '700' },
  roomTitle: {
    flex: 1,
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '900',
    textAlign: 'center',
  },
  poleHint: {
    alignSelf: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  poleHintText: { color: '#fff', fontSize: font.body, fontWeight: '800' },
  bottomBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideCol: { gap: spacing.sm, alignItems: 'center', minWidth: 100 },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  roundBtn: {
    backgroundColor: 'rgba(11,11,15,0.72)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 100,
    alignItems: 'center',
  },
  roundBtnSmall: { paddingVertical: 6 },
  roundBtnText: { color: colors.text, fontSize: font.small, fontWeight: '700' },
  savingPill: {
    position: 'absolute',
    bottom: 132,
    alignSelf: 'center',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(11,11,15,0.85)',
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
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  exportText: { color: colors.text, fontSize: font.heading, fontWeight: '800' },
  exportSub: { color: colors.textDim, fontSize: font.small },
  permContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  permTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '900',
    textAlign: 'center',
  },
  permText: {
    color: colors.textDim,
    fontSize: font.body,
    textAlign: 'center',
    lineHeight: 22,
  },
});
