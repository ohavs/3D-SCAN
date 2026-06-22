import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button } from '../src/ui/Button';
import { PanoViewer } from '../src/ui/PanoViewer';
import { colors, font, radius, spacing } from '../src/ui/theme';
import { useSession } from '../src/session/SessionContext';
import {
  panoFilename,
  renameToCache,
  saveToGallery,
  sharePano,
} from '../src/lib/save';

export default function ReviewScreen() {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const uri = session.exportedUri;

  const withFile = async (fn: (u: string) => Promise<void>) => {
    if (!uri) return;
    setBusy(true);
    try {
      const named = renameToCache(uri, panoFilename());
      await fn(named);
    } catch (e) {
      Alert.alert('שגיאה', String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const onSave = () =>
    withFile(async (u) => {
      await saveToGallery(u);
      Alert.alert('נשמר', 'הפנורמה נשמרה לגלריה.');
    });

  const onShare = () => withFile((u) => sharePano(u));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>סקירה</Text>
        <Text style={styles.subtitle}>
          גררו כדי לבדוק את הפנורמה. אם חסרים אזורים — חזרו והשלימו, אחרת שמרו.
        </Text>
      </View>

      <View style={styles.viewer}>
        {uri ? (
          <PanoViewer uri={uri} style={StyleSheet.absoluteFill as object} />
        ) : (
          <Text style={styles.empty}>אין פנורמה להצגה.</Text>
        )}
        <View style={styles.coverageBadge}>
          <Text style={styles.coverageText}>
            כיסוי {Math.round(session.coverage * 100)}% · {session.captures.length}{' '}
            תמונות
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <View style={styles.row}>
          <Button
            label="השלם אזורים"
            variant="secondary"
            onPress={() => router.push('/capture')}
            style={styles.flex}
          />
          <Button
            label="שתף"
            variant="secondary"
            onPress={onShare}
            loading={busy}
            style={styles.flex}
          />
        </View>
        <Button label="שמור לגלריה" onPress={onSave} loading={busy} />
        <Button
          label="פנורמה חדשה"
          variant="ghost"
          onPress={() => {
            session.reset();
            router.replace('/calibrate');
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  title: { color: colors.text, fontSize: font.title, fontWeight: '900' },
  subtitle: { color: colors.textDim, fontSize: font.small, lineHeight: 20 },
  viewer: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: { color: colors.textDim, fontSize: font.body },
  coverageBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  coverageText: { color: colors.text, fontSize: font.small, fontWeight: '700' },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  row: { flexDirection: 'row-reverse', gap: spacing.sm },
  flex: { flex: 1 },
});
