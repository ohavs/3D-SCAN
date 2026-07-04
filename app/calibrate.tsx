import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CameraView } from 'expo-camera';
import { Button } from '../src/ui/Button';
import { colors, font, radius, spacing } from '../src/ui/theme';
import { useOrientation } from '../src/capture/useOrientation';
import { cameraForward, cameraUp } from '../src/lib/geo';
import { MAX_FOV_DEG, MIN_FOV_DEG } from '../src/lib/fov';
import { useSession } from '../src/session/SessionContext';

export default function CalibrateScreen() {
  const session = useSession();
  const { uiQuat } = useOrientation(true);

  const fwd = cameraForward(uiQuat);
  const up = cameraUp(uiQuat);
  const pitchDeg = Math.round(
    (Math.asin(Math.max(-1, Math.min(1, fwd[1]))) * 180) / Math.PI,
  );
  const rollDeg = (Math.atan2(up[0], up[1]) * 180) / Math.PI;
  const level = Math.abs(pitchDeg) <= 4 && Math.abs(rollDeg) <= 4;

  const setFov = (delta: number) => {
    const next = Math.max(
      MIN_FOV_DEG,
      Math.min(MAX_FOV_DEG, session.calibration.referenceFovDeg + delta),
    );
    session.setCalibration({ ...session.calibration, referenceFovDeg: next });
  };

  return (
    <View style={styles.container}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" />
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />

      <View style={styles.center} pointerEvents="none">
        <View
          style={[
            styles.horizon,
            {
              borderColor: level ? colors.success : colors.warn,
              transform: [
                { translateY: Math.max(-120, Math.min(120, pitchDeg * 3)) },
                { rotate: `${-rollDeg}deg` },
              ],
            },
          ]}
        />
      </View>

      <SafeAreaView style={styles.ui}>
        <View style={styles.card}>
          <Text style={styles.title}>כיול</Text>
          <Text style={styles.subtitle}>
            בדיקת יישור: החזיקו את הטלפון מול האופק — הקו אמור להתיישר ולהוריק.
          </Text>
        </View>

        <View style={styles.controls}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>שדה ראייה (FOV)</Text>
            <View style={styles.stepper}>
              <Pressable style={styles.stepBtn} onPress={() => setFov(-1)}>
                <Text style={styles.stepBtnText}>−</Text>
              </Pressable>
              <Text style={styles.stepValue}>
                {session.calibration.referenceFovDeg}°
              </Text>
              <Pressable style={styles.stepBtn} onPress={() => setFov(1)}>
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>
            <Text style={styles.cardHint}>
              אם יש תפרים/כפילויות בין תמונות סמוכות — כווננו בהדרגה (±1°).
            </Text>
          </View>

          <Button label="שמור וחזור" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrim: { backgroundColor: 'rgba(0,0,0,0.3)' },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  horizon: { width: '70%', borderTopWidth: 2, borderStyle: 'dashed' },
  ui: { flex: 1, justifyContent: 'space-between', padding: spacing.lg },
  card: {
    backgroundColor: 'rgba(11,11,15,0.72)',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: { color: colors.text, fontSize: font.title, fontWeight: '900' },
  subtitle: { color: colors.text, fontSize: font.small, lineHeight: 19 },
  controls: { gap: spacing.md },
  cardTitle: { color: colors.text, fontSize: font.body, fontWeight: '800' },
  cardHint: { color: colors.textDim, fontSize: font.small },
  stepper: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBtnText: { color: colors.text, fontSize: 26, fontWeight: '800' },
  stepValue: {
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '800',
    minWidth: 70,
    textAlign: 'center',
  },
});
