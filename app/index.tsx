import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Project, useProjects } from '../src/store/projects';
import { Button } from '../src/ui/Button';
import { colors, font, radius, spacing } from '../src/ui/theme';

function ProjectCard({ project }: { project: Project }) {
  const store = useProjects();
  const captured = project.rooms.filter((r) => r.status !== 'empty').length;
  const uploaded = project.rooms.filter((r) => r.status === 'uploaded').length;

  const confirmDelete = () => {
    Alert.alert('מחיקת נכס', `למחוק את "${project.title}" על כל החדרים שלו?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: () => store.deleteProject(project.id),
      },
    ]);
  };

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/project/${project.id}`)}
      onLongPress={confirmDelete}
    >
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{project.title}</Text>
        <Text style={styles.cardMeta}>
          {project.rooms.length} חדרים · {captured} צולמו
          {uploaded > 0 ? ` · ${uploaded} הועלו` : ''}
        </Text>
      </View>
      <Text style={styles.cardChevron}>‹</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const store = useProjects();
  const [newTitle, setNewTitle] = useState('');

  const create = () => {
    const title = newTitle.trim();
    if (!title) return;
    const p = store.createProject(title);
    setNewTitle('');
    router.push(`/project/${p.id}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>סריקת נכסים 360°</Text>
          <Text style={styles.subtitle}>
            נכס ← חדרים ← סריקה ← העלאה ישירה לעורך הסיורים
          </Text>
        </View>
        <Pressable style={styles.gear} onPress={() => router.push('/settings')}>
          <Text style={styles.gearText}>הגדרות</Text>
        </Pressable>
      </View>

      <View style={styles.newRow}>
        <TextInput
          style={styles.input}
          placeholder="שם נכס חדש (למשל: דירה ברח׳ הרצל 12)"
          placeholderTextColor={colors.textDim}
          value={newTitle}
          onChangeText={setNewTitle}
          onSubmitEditing={create}
          returnKeyType="done"
        />
        <Button label="צור" onPress={create} disabled={!newTitle.trim()} />
      </View>

      <FlatList
        data={store.projects}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <ProjectCard project={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>אין עדיין נכסים</Text>
            <Text style={styles.emptyText}>
              צרו נכס ראשון למעלה, הוסיפו חדרים, וסרקו כל חדר ב-360°.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerText: { flex: 1, gap: 4 },
  title: { color: colors.text, fontSize: font.title, fontWeight: '900' },
  subtitle: { color: colors.textDim, fontSize: font.small, lineHeight: 19 },
  gear: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gearText: { color: colors.text, fontSize: font.small, fontWeight: '700' },
  newRow: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: font.body,
    textAlign: 'right',
  },
  list: { gap: spacing.sm, paddingBottom: spacing.xl },
  card: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { color: colors.text, fontSize: font.heading, fontWeight: '800' },
  cardMeta: { color: colors.textDim, fontSize: font.small },
  cardChevron: { color: colors.textDim, fontSize: 26, fontWeight: '300' },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xl * 2,
    gap: spacing.sm,
  },
  emptyTitle: { color: colors.text, fontSize: font.heading, fontWeight: '800' },
  emptyText: {
    color: colors.textDim,
    fontSize: font.body,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
  },
});
