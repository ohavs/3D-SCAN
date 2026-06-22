/** Save / share helpers for the exported equirectangular JPEG. */

import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

export function panoFilename(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `pano_${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.jpg`
  );
}

/** Copy the snapshot to a nicely-named cache file. Falls back to the source URI. */
export function renameToCache(srcUri: string, name: string): string {
  try {
    const dest = new File(Paths.cache, name);
    if (dest.exists) dest.delete();
    const src = new File(srcUri);
    src.copy(dest);
    return dest.uri;
  } catch {
    return srcUri;
  }
}

export async function saveToGallery(uri: string): Promise<void> {
  await MediaLibrary.saveToLibraryAsync(uri);
}

export async function sharePano(uri: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'image/jpeg',
      dialogTitle: 'שתף פנורמה',
      UTI: 'public.jpeg',
    });
  }
}
