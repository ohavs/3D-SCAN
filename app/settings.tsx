import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useProjects } from '../src/store/projects';
import { Button } from '../src/ui/Button';
import { colors, font, radius, spacing } from '../src/ui/theme';

const SIZES = [
  { width: 4096, label: '4096 × 2048 — איכות מלאה (מומלץ לעורך)' },
  { width: 2048, label: '2048 × 1024 — מהיר (לבדיקות)' },
];

export default function SettingsScreen() {
  const store = useProjects();
  const [baseUrl, setBaseUrl] = useState(store.settings.editorBaseUrl);
  const [secret, setSecret] = useState(store.settings.adminSecret);

  const save = () => {
    store.setSettings({
      editorBaseUrl: baseUrl.trim(),
      adminSecret: secret.trim(),
    });
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>הגדרות</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>חיבור לעורך הסיורים</Text>
          <Text style={styles.label}>כתובת האתר (Base URL)</Text>
          <TextInput
            style={styles.input}
            placeholder="https://your-tours-site.com"
            placeholderTextColor={colors.textDim}
            value={baseUrl}
            onChangeText={setBaseUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textAlign="left"
          />
          <Text style={styles.label}>סיסמת אדמין (ADMIN_SECRET)</Text>
          <TextInput
            style={styles.input}
            placeholder="הסיסמה מה-env של העורך"
            placeholderTextColor={colors.textDim}
            value={secret}
            onChangeText={setSecret}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            textAlign="left"
          />
          <Text style={styles.hint}>
            עם החיבור הזה האפליקציה מעלה חדרים ישירות לסיור בעורך: קבלת כתובת
            העלאה ← העלאת הקובץ ← רישום הסצנה.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>רזולוציית פלט</Text>
          {SIZES.map((s) => {
            const active = store.settings.outputWidth === s.width;
            return (
              <Pressable
                key={s.width}
                style={[styles.option, active && styles.optionActive]}
                onPress={() => store.setSettings({ outputWidth: s.width })}
              >
                <View style={[styles.radio, active && styles.radioActive]} />
                <Text style={[styles.optionText, active && { color: colors.text }]}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
          <Text style={styles.hint}>
            העורך מקבל עד 4096px רוחב — איכות מלאה נכנסת בדיוק בלי כיווץ נוסף.
          </Text>
        </View>

        <Button label="שמור וחזור" onPress={save} />
        <Button label="ביטול" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: font.title, fontWeight: '900' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { color: colors.text, fontSize: font.heading, fontWeight: '800' },
  label: { color: colors.textDim, fontSize: font.small, fontWeight: '700' },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: font.body,
  },
  hint: { color: colors.textDim, fontSize: font.small, lineHeight: 18 },
  option: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  optionActive: {},
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
  },
  radioActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  optionText: { color: colors.textDim, fontSize: font.body, flex: 1 },
});
