import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button } from '../src/ui/Button';
import { colors, font, spacing } from '../src/ui/theme';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>360°</Text>
        </View>
        <Text style={styles.title}>פנורמה 360°</Text>
        <Text style={styles.subtitle}>
          סובבו את הטלפון לאט, והאפליקציה תצלם אוטומטית ותרכיב פנורמה כדורית מלאה —
          כולל תקרה ורצפה. הפלט: JPG בפורמט 2:1 מוכן להעלאה.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button label="התחל צילום" onPress={() => router.push('/permissions')} />
        <Text style={styles.hint}>מומלץ אור אחיד וסיבוב איטי וקבוע סביב הציר.</Text>
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
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accentSoft,
    borderWidth: 2,
    borderColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  badgeText: {
    color: colors.accent,
    fontSize: 28,
    fontWeight: '900',
  },
  title: {
    color: colors.text,
    fontSize: font.title + 6,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textDim,
    fontSize: font.body,
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  actions: {
    gap: spacing.md,
  },
  hint: {
    color: colors.textDim,
    fontSize: font.small,
    textAlign: 'center',
  },
});
