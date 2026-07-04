/**
 * Local project store: properties ("projects") with rooms, plus app settings for
 * the editor connection. Persisted as a single JSON file in the app's document
 * directory — no external state library needed.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

export type RoomStatus = 'empty' | 'captured' | 'uploaded';

export interface Room {
  id: string;
  title: string;
  status: RoomStatus;
  imageUri?: string; // local file of the approved panorama
  capturedAt?: number;
  uploadedUrl?: string; // public R2 URL after upload
  uploadedAt?: number;
}

export interface Project {
  id: string;
  title: string;
  tourId: string; // UUID of the tour in the editor (pasted by the user)
  createdAt: number;
  rooms: Room[];
}

export interface AppSettings {
  editorBaseUrl: string; // e.g. https://my-tours.example.com
  adminSecret: string;
  outputWidth: number; // 4096 (quality) or 2048 (fast)
}

interface StoreShape {
  projects: Project[];
  settings: AppSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  editorBaseUrl: '',
  adminSecret: '',
  outputWidth: 4096,
};

const STORE_PATH = `${documentDirectory}pano360-store.json`;
export const PANOS_DIR = `${documentDirectory}panos/`;

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function loadStore(): Promise<StoreShape> {
  try {
    const info = await getInfoAsync(STORE_PATH);
    if (!info.exists) return { projects: [], settings: DEFAULT_SETTINGS };
    const raw = await readAsStringAsync(STORE_PATH);
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    return {
      projects: parsed.projects ?? [],
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    };
  } catch {
    return { projects: [], settings: DEFAULT_SETTINGS };
  }
}

export async function ensurePanosDir(): Promise<void> {
  const info = await getInfoAsync(PANOS_DIR);
  if (!info.exists) await makeDirectoryAsync(PANOS_DIR, { intermediates: true });
}

interface ProjectsApi {
  loaded: boolean;
  projects: Project[];
  settings: AppSettings;
  setSettings: (s: Partial<AppSettings>) => void;
  createProject: (title: string) => Project;
  renameProject: (id: string, title: string) => void;
  setTourId: (id: string, tourId: string) => void;
  deleteProject: (id: string) => void;
  addRoom: (projectId: string, title: string) => Room;
  renameRoom: (projectId: string, roomId: string, title: string) => void;
  deleteRoom: (projectId: string, roomId: string) => void;
  setRoomCaptured: (projectId: string, roomId: string, imageUri: string) => void;
  clearRoomCapture: (projectId: string, roomId: string) => void;
  setRoomUploaded: (projectId: string, roomId: string, url: string) => void;
  getProject: (id: string) => Project | undefined;
}

const Ctx = createContext<ProjectsApi | null>(null);

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadStore().then((s) => {
      setProjects(s.projects);
      setSettingsState(s.settings);
      setLoaded(true);
    });
  }, []);

  // Debounced persistence on any change.
  useEffect(() => {
    if (!loaded) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      const data: StoreShape = { projects, settings };
      writeAsStringAsync(STORE_PATH, JSON.stringify(data)).catch(() => {});
    }, 250);
  }, [projects, settings, loaded]);

  const mutateProject = useCallback(
    (id: string, fn: (p: Project) => Project) => {
      setProjects((prev) => prev.map((p) => (p.id === id ? fn(p) : p)));
    },
    [],
  );

  const api: ProjectsApi = {
    loaded,
    projects,
    settings,
    setSettings: (s) => setSettingsState((prev) => ({ ...prev, ...s })),
    createProject: (title) => {
      const p: Project = {
        id: newId(),
        title,
        tourId: '',
        createdAt: Date.now(),
        rooms: [],
      };
      setProjects((prev) => [p, ...prev]);
      return p;
    },
    renameProject: (id, title) => mutateProject(id, (p) => ({ ...p, title })),
    setTourId: (id, tourId) => mutateProject(id, (p) => ({ ...p, tourId })),
    deleteProject: (id) => setProjects((prev) => prev.filter((p) => p.id !== id)),
    addRoom: (projectId, title) => {
      const room: Room = { id: newId(), title, status: 'empty' };
      mutateProject(projectId, (p) => ({ ...p, rooms: [...p.rooms, room] }));
      return room;
    },
    renameRoom: (projectId, roomId, title) =>
      mutateProject(projectId, (p) => ({
        ...p,
        rooms: p.rooms.map((r) => (r.id === roomId ? { ...r, title } : r)),
      })),
    deleteRoom: (projectId, roomId) =>
      mutateProject(projectId, (p) => ({
        ...p,
        rooms: p.rooms.filter((r) => r.id !== roomId),
      })),
    setRoomCaptured: (projectId, roomId, imageUri) =>
      mutateProject(projectId, (p) => ({
        ...p,
        rooms: p.rooms.map((r) =>
          r.id === roomId
            ? { ...r, status: 'captured', imageUri, capturedAt: Date.now() }
            : r,
        ),
      })),
    clearRoomCapture: (projectId, roomId) =>
      mutateProject(projectId, (p) => ({
        ...p,
        rooms: p.rooms.map((r) =>
          r.id === roomId
            ? { id: r.id, title: r.title, status: 'empty' as RoomStatus }
            : r,
        ),
      })),
    setRoomUploaded: (projectId, roomId, url) =>
      mutateProject(projectId, (p) => ({
        ...p,
        rooms: p.rooms.map((r) =>
          r.id === roomId
            ? { ...r, status: 'uploaded', uploadedUrl: url, uploadedAt: Date.now() }
            : r,
        ),
      })),
    getProject: (id) => projects.find((p) => p.id === id),
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useProjects(): ProjectsApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProjects must be used within ProjectsProvider');
  return ctx;
}
