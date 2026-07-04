import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '../src/ui/Button';
import { PanoViewer } from '../src/ui/PanoViewer';
import { colors, font, radius, spacing } from '../src/ui/theme';
import { useProjects } from '../src/store/projects';
import { useSession } from '../src/session/SessionContext';
import { saveToGallery, sharePano } from '../src/lib/save';

export default function ReviewScreen() {
  const { project: projectId, room: roomId } = useLocalSearchParams<{
    project: string;
    room: string;
  }>();
  const store = useProjects();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);

  const project = store.getProject(projectId ?? '');
  const room = project?.rooms.find((r) => r.id === roomId);
  const uri = room?.imageUri ?? session.exportedUri;

  const retake = () => {
    Alert.alert('לצלם מחדש?', 'הפנורמה הנוכחית של החדר תוחלף.', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'צלם מחדש',
        onPress: () => {
          if (projectId && roomId) {
            store.clearRoomCapture(projectId, roomId);
            session.reset();
            router.replace(`/capture?project=${projectId}&room=${roomId}`);
          }
        },
      },
    ]);
  };

  const doSave = async () => {
    if (!uri) return;
    setBusy(true);
    try {
      await saveToGallery(uri);
      Alert.alert('נשמר', 'הפנורמה נשמרה לגלריית התמונות.');
    } catch (e) {
      Alert.alert('שגיאה', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doShare = async () => {
    if (!uri) return;
    setBusy(true);
    try {
      await sharePano(uri);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{room?.title ?? 'סקירה'}</Text>
        <Text style={styles.subtitle}>
          גררו להסתכל סביב. אם הכל תקין — אשרו וחזרו לרשימת החדרים.
        </Text>
      </View>

      <View style={styles.viewer}>
        {uri ? (
          <PanoViewer
            uri={uri}
            style={StyleSheet.absoluteFill as object}
            onReady={() => setViewerReady(true)}
          />
        ) : (
          <Text style={styles.empty}>אין פנורמה להצגה.</Text>
        )}
        {uri && !viewerReady && (
          <View style={styles.loaderOverlay}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loaderText}>טוען פנורמה…</Text>
          </View>
        )}
        {room?.status === 'uploaded' && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>הועלה לעורך ✓</Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <Button
          label="אשר וחזור לחדרים"
          onPress={() => router.replace(`/project/${projectId}`)}
        />
        <View style={styles.row}>
          <Button
            label="צלם מחדש"
            variant="secondary"
            onPress={retake}
            style={styles.flex}
          />
          <Button
            label="שמור לגלריה"
            variant="secondary"
            onPress={doSave}
            loading={busy}
            style={styles.flex}
          />
          <Button
            label="שתף"
            variant="secondary"
            onPress={doShare}
            loading={busy}
            style={styles.flex}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  header: { gap: 4, marginBottom: spacing.md },
  title: { color: colors.text, fontSize: font.title, fontWeight: '900' },
  subtitle: { color: colors.textDim, fontSize: font.small, lineHeight: 19 },
  viewer: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: { color: colors.textDim, fontSize: font.body },
  loaderOverlay: {
    ...StyleSheet.absoluteFill as object,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loaderText: { color: colors.textDim, fontSize: font.small, fontWeight: '700' },
  badge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: 'rgba(34,197,94,0.9)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeText: { color: '#fff', fontSize: font.small, fontWeight: '800' },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  row: { flexDirection: 'row-reverse', gap: spacing.sm },
  flex: { flex: 1 },
});
