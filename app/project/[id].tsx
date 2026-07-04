import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Room, useProjects } from '../../src/store/projects';
import { uploadRoom } from '../../src/upload/editorApi';
import { Button } from '../../src/ui/Button';
import { colors, font, radius, spacing } from '../../src/ui/theme';

const STATUS_LABEL: Record<Room['status'], string> = {
  empty: 'טרם צולם',
  captured: 'צולם ✓',
  uploaded: 'הועלה ✓✓',
};

const STATUS_COLOR: Record<Room['status'], string> = {
  empty: colors.textDim,
  captured: colors.accent,
  uploaded: colors.success,
};

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useProjects();
  const project = store.getProject(id ?? '');
  const [newRoom, setNewRoom] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  if (!project) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>הנכס לא נמצא</Text>
        <Button label="חזרה" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const addRoom = () => {
    const title = newRoom.trim();
    if (!title) return;
    store.addRoom(project.id, title);
    setNewRoom('');
  };

  const openRoom = (room: Room) => {
    if (room.status === 'empty') {
      router.push(`/capture?project=${project.id}&room=${room.id}`);
    } else {
      router.push(`/review?project=${project.id}&room=${room.id}`);
    }
  };

  const confirmDeleteRoom = (room: Room) => {
    Alert.alert('מחיקת חדר', `למחוק את "${room.title}"?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: () => store.deleteRoom(project.id, room.id),
      },
    ]);
  };

  const uploadAll = async () => {
    const cfg = {
      baseUrl: store.settings.editorBaseUrl,
      adminSecret: store.settings.adminSecret,
    };
    if (!cfg.baseUrl || !cfg.adminSecret) {
      Alert.alert('חסרות הגדרות', 'הגדירו כתובת אתר וסיסמת אדמין במסך ההגדרות.');
      return;
    }
    if (!project.tourId.trim()) {
      Alert.alert('חסר Tour ID', 'הדביקו את ה-UUID של הסיור מהעורך בשדה למעלה.');
      return;
    }
    const pending = project.rooms.filter(
      (r) => r.status === 'captured' && r.imageUri,
    );
    if (pending.length === 0) {
      Alert.alert('אין מה להעלות', 'אין חדרים שצולמו וממתינים להעלאה.');
      return;
    }
    setUploading(true);
    try {
      // order_index continues after rooms that were already uploaded.
      let orderIndex = project.rooms.filter((r) => r.status === 'uploaded').length;
      for (const room of pending) {
        setUploadStatus(`מעלה: ${room.title}…`);
        // eslint-disable-next-line no-await-in-loop
        const url = await uploadRoom(
          cfg,
          project.tourId.trim(),
          room.title,
          orderIndex,
          room.imageUri!,
        );
        store.setRoomUploaded(project.id, room.id, url);
        orderIndex += 1;
      }
      Alert.alert('הועלה בהצלחה', `${pending.length} חדרים הועלו לעורך.`);
    } catch (e) {
      Alert.alert('שגיאת העלאה', e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      setUploadStatus('');
    }
  };

  const capturedCount = project.rooms.filter((r) => r.status === 'captured').length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>‹ חזרה</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {project.title}
        </Text>
      </View>

      <View style={styles.tourIdRow}>
        <Text style={styles.tourIdLabel}>Tour ID:</Text>
        <TextInput
          style={styles.tourIdInput}
          placeholder="הדביקו את ה-UUID של הסיור מהעורך"
          placeholderTextColor={colors.textDim}
          value={project.tourId}
          onChangeText={(t) => store.setTourId(project.id, t)}
          autoCapitalize="none"
          autoCorrect={false}
          textAlign="left"
        />
      </View>

      <View style={styles.newRow}>
        <TextInput
          style={styles.input}
          placeholder="שם חדר (סלון, מטבח, חדר שינה…)"
          placeholderTextColor={colors.textDim}
          value={newRoom}
          onChangeText={setNewRoom}
          onSubmitEditing={addRoom}
          returnKeyType="done"
        />
        <Button label="הוסף" onPress={addRoom} disabled={!newRoom.trim()} />
      </View>

      <FlatList
        data={project.rooms}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.room}
            onPress={() => openRoom(item)}
            onLongPress={() => confirmDeleteRoom(item)}
          >
            <View style={styles.roomBody}>
              <Text style={styles.roomTitle}>{item.title}</Text>
              <Text style={[styles.roomStatus, { color: STATUS_COLOR[item.status] }]}>
                {STATUS_LABEL[item.status]}
              </Text>
            </View>
            <View
              style={[
                styles.roomAction,
                item.status === 'empty' && styles.roomActionPrimary,
              ]}
            >
              <Text
                style={[
                  styles.roomActionText,
                  item.status === 'empty' && { color: '#fff' },
                ]}
              >
                {item.status === 'empty' ? 'סרוק' : 'צפה'}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              הוסיפו את החדרים של הנכס — ואז סרקו כל אחד מהם ב-360°.
            </Text>
          </View>
        }
      />

      <View style={styles.footer}>
        {uploading ? (
          <View style={styles.uploadingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.uploadingText}>{uploadStatus}</Text>
          </View>
        ) : (
          <Button
            label={
              capturedCount > 0
                ? `העלה לעורך (${capturedCount} חדרים)`
                : 'העלה לעורך'
            }
            onPress={uploadAll}
            disabled={capturedCount === 0}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  back: { paddingVertical: 4 },
  backText: { color: colors.accent, fontSize: font.body, fontWeight: '700' },
  title: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '900',
    flex: 1,
  },
  tourIdRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tourIdLabel: { color: colors.textDim, fontSize: font.small, fontWeight: '700' },
  tourIdInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: font.small,
  },
  newRow: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    marginBottom: spacing.md,
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
  list: { gap: spacing.sm, paddingBottom: spacing.md },
  room: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  roomBody: { flex: 1, gap: 2 },
  roomTitle: { color: colors.text, fontSize: font.body, fontWeight: '800' },
  roomStatus: { fontSize: font.small, fontWeight: '700' },
  roomAction: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roomActionPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  roomActionText: { color: colors.text, fontSize: font.small, fontWeight: '800' },
  empty: { paddingTop: spacing.xl, alignItems: 'center' },
  emptyText: {
    color: colors.textDim,
    fontSize: font.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  footer: { paddingTop: spacing.sm },
  uploadingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
  },
  uploadingText: { color: colors.text, fontSize: font.body, fontWeight: '700' },
});
