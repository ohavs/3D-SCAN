import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CameraView } from 'expo-camera';
import { Button } from '../src/ui/Button';
import { colors, font, radius, spacing } from '../src/ui/theme';
import { useOrientation } from '../src/capture/useOrientation';
import { headingOffset } from '../src/lib/orientation';
import { cameraForward, cameraUp } from '../src/lib/geo';
import { MAX_FOV_DEG, MIN_FOV_DEG } from '../src/lib/fov';
import { OUTPUT_SIZES, useSession } from '../src/session/SessionContext';

export default function CalibrateScreen() {
  const session = useSession();
  const { rawQuatRef, uiQuat } = useOrientation(session.headingOffset);

  const fwd = cameraForward(uiQuat);
  const up = cameraUp(uiQuat);
  const pitchDeg = Math.round((Math.asin(Math.max(-1, Math.min(1, fwd[1]))) * 180) / Math.PI);
  // Roll: tilt of the camera's up vector away from world-up, signed.
  const rollRad = Math.atan2(up[0], up[1]);
  const rollDeg = (rollRad * 180) / Math.PI;
  const level = Math.abs(pitchDeg) <= 4 && Math.abs(rollDeg) <= 4;

  const setFov = (delta: number) => {
    const next = Math.max(
      MIN_FOV_DEG,
      Math.min(MAX_FOV_DEG, session.calibration.referenceFovDeg + delta),
    );
    session.setCalibration({ ...session.calibration, referenceFovDeg: next });
  };

  const confirm = () => {
    session.setHeadingOffset(headingOffset(rawQuatRef.current));
    router.push('/capture');
  };

  return (
    <View style={styles.container}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" />
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />

      {/* Horizon guide */}
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
        <View
          style={[styles.bubble, { borderColor: level ? colors.success : colors.warn }]}
        />
      </View>

      <SafeAreaView style={styles.ui}>
        <View style={styles.headerCard}>
          <Text style={styles.title}>כיול</Text>
          <Text style={styles.subtitle}>
            כוונו את הטלפון לאופק עד שהקו ירוק, ולחצו "כייל והמשך". הכיוון הנוכחי
            יוגדר כחזית הפנורמה.
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
              כוונון עדין מצמצם תפרים. ברירת מחדל ~66°.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>רזולוציית פלט</Text>
            <View style={styles.sizes}>
              {OUTPUT_SIZES.map((s) => {
                const active = s.width === session.outputSize.width;
                return (
                  <Pressable
                    key={s.label}
                    onPress={() => session.setOutputSize(s)}
                    style={[styles.sizeChip, active && styles.sizeChipActive]}
                  >
                    <Text style={[styles.sizeText, active && styles.sizeTextActive]}>
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Button label="כייל והמשך" onPress={confirm} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrim: { backgroundColor: 'rgba(0,0,0,0.25)' },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  horizon: {
    width: '70%',
    borderTopWidth: 2,
    borderStyle: 'dashed',
  },
  bubble: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
  },
  ui: { flex: 1, justifyContent: 'space-between', padding: spacing.lg },
  headerCard: {
    backgroundColor: colors.overlay,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: { color: colors.text, fontSize: font.title, fontWeight: '900' },
  subtitle: { color: colors.text, fontSize: font.small, lineHeight: 20 },
  controls: { gap: spacing.md },
  card: {
    backgroundColor: colors.overlay,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { color: colors.text, fontSize: font.body, fontWeight: '700' },
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
  sizes: { flexDirection: 'row-reverse', gap: spacing.sm },
  sizeChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sizeChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  sizeText: { color: colors.textDim, fontSize: font.small, fontWeight: '700' },
  sizeTextActive: { color: colors.text },
});
