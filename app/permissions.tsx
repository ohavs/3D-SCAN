import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { DeviceMotion } from 'expo-sensors';
import { Button } from '../src/ui/Button';
import { colors, font, radius, spacing } from '../src/ui/theme';

type Status = 'unknown' | 'granted' | 'denied';

function Row({ title, desc, status }: { title: string; desc: string; status: Status }) {
  const color =
    status === 'granted'
      ? colors.success
      : status === 'denied'
        ? colors.danger
        : colors.textDim;
  const label =
    status === 'granted' ? 'אושר' : status === 'denied' ? 'נדחה' : 'ממתין';
  return (
    <View style={styles.row}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>
      <Text style={[styles.rowStatus, { color }]}>{label}</Text>
    </View>
  );
}

export default function PermissionsScreen() {
  const [camPerm, requestCam] = useCameraPermissions();
  const [mediaPerm, requestMedia] = MediaLibrary.usePermissions();
  const [motion, setMotion] = useState<Status>('unknown');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    DeviceMotion.isAvailableAsync()
      .then((ok) => setMotion(ok ? 'granted' : 'denied'))
      .catch(() => setMotion('denied'));
  }, []);

  const camStatus: Status = camPerm?.granted
    ? 'granted'
    : camPerm && !camPerm.granted && camPerm.status === 'denied'
      ? 'denied'
      : 'unknown';
  const mediaStatus: Status = mediaPerm?.granted
    ? 'granted'
    : mediaPerm && mediaPerm.status === 'denied'
      ? 'denied'
      : 'unknown';

  const requestAll = async () => {
    setBusy(true);
    try {
      await requestCam();
      await requestMedia();
      try {
        await DeviceMotion.requestPermissionsAsync();
        const ok = await DeviceMotion.isAvailableAsync();
        setMotion(ok ? 'granted' : 'denied');
      } catch {
        setMotion('denied');
      }
    } finally {
      setBusy(false);
    }
  };

  const canContinue = camStatus === 'granted';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>הרשאות</Text>
        <Text style={styles.subtitle}>
          כדי לצלם ולשמור פנורמות, האפליקציה צריכה את ההרשאות הבאות:
        </Text>
      </View>

      <View style={styles.list}>
        <Row
          title="מצלמה"
          desc="צילום התמונות שמרכיבות את הפנורמה."
          status={camStatus}
        />
        <Row
          title="חיישני תנועה"
          desc="מעקב אחר כיוון הטלפון בזמן הסיבוב."
          status={motion}
        />
        <Row
          title="גלריית תמונות"
          desc="שמירת הפנורמה המוגמרת למכשיר."
          status={mediaStatus}
        />
      </View>

      <View style={styles.actions}>
        <Button
          label="אשר הרשאות"
          onPress={requestAll}
          loading={busy}
          variant="secondary"
        />
        <Button
          label="המשך"
          onPress={() => router.push('/calibrate')}
          disabled={!canContinue}
        />
        {!canContinue && (
          <Text style={styles.hint}>הרשאת מצלמה נדרשת כדי להמשיך.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  header: { gap: spacing.sm, marginTop: spacing.lg },
  title: { color: colors.text, fontSize: font.title, fontWeight: '900' },
  subtitle: { color: colors.textDim, fontSize: font.body, lineHeight: 23 },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  rowText: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  rowDesc: { color: colors.textDim, fontSize: font.small, marginTop: 2 },
  rowStatus: { fontSize: font.small, fontWeight: '700' },
  actions: { gap: spacing.sm },
  hint: { color: colors.textDim, fontSize: font.small, textAlign: 'center' },
});
