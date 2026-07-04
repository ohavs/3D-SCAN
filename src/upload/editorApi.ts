/**
 * Direct upload to the user's virtual-tour editor, implementing its exact flow:
 *   1. POST {base}/api/upload   (Cookie: admin=<secret>)  -> { uploadUrl, url }
 *   2. PUT  uploadUrl           (binary JPEG to R2, presigned; expires in 10 min)
 *   3. POST {base}/api/scenes   (Cookie: admin=<secret>)  -> registers the room
 */

import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';

export interface EditorConfig {
  baseUrl: string; // no trailing slash needed; normalized here
  adminSecret: string;
}

export interface PresignResponse {
  uploadUrl: string;
  url: string;
}

function base(cfg: EditorConfig): string {
  return cfg.baseUrl.replace(/\/+$/, '');
}

function authHeaders(cfg: EditorConfig): Record<string, string> {
  return {
    Cookie: `admin=${cfg.adminSecret}`,
    'Content-Type': 'application/json',
  };
}

export async function presignUpload(
  cfg: EditorConfig,
  tourId: string,
): Promise<PresignResponse> {
  const res = await fetch(`${base(cfg)}/api/upload`, {
    method: 'POST',
    headers: authHeaders(cfg),
    body: JSON.stringify({ tourId, contentType: 'image/jpeg' }),
  });
  if (!res.ok) {
    throw new Error(`presign failed: HTTP ${res.status} ${await safeText(res)}`);
  }
  const data = (await res.json()) as Partial<PresignResponse>;
  if (!data.uploadUrl || !data.url) throw new Error('presign: malformed response');
  return { uploadUrl: data.uploadUrl, url: data.url };
}

export async function uploadJpeg(uploadUrl: string, fileUri: string): Promise<void> {
  const result = await uploadAsync(uploadUrl, fileUri, {
    httpMethod: 'PUT',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': 'image/jpeg' },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`R2 upload failed: HTTP ${result.status}`);
  }
}

export async function registerScene(
  cfg: EditorConfig,
  scene: {
    tour_id: string;
    title: string;
    image_url: string;
    order_index: number;
  },
): Promise<void> {
  const res = await fetch(`${base(cfg)}/api/scenes`, {
    method: 'POST',
    headers: authHeaders(cfg),
    body: JSON.stringify(scene),
  });
  if (!res.ok) {
    throw new Error(`scene register failed: HTTP ${res.status} ${await safeText(res)}`);
  }
}

/** Full flow for one room. Returns the public image URL. */
export async function uploadRoom(
  cfg: EditorConfig,
  tourId: string,
  roomTitle: string,
  orderIndex: number,
  fileUri: string,
): Promise<string> {
  const { uploadUrl, url } = await presignUpload(cfg, tourId);
  await uploadJpeg(uploadUrl, fileUri);
  await registerScene(cfg, {
    tour_id: tourId,
    title: roomTitle,
    image_url: url,
    order_index: orderIndex,
  });
  return url;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '';
  }
}
