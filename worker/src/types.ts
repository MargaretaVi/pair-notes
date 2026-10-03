export interface Env {
  DB: D1Database;
}

export interface StoredSpace {
  id: string;
  token_hash: string;
}

export interface StoredNote {
  id: string;
  title: string;
  kind: "text" | "checklist";
  body: string;
  position: number;
  sort_modes: string;
  updated_at: number;
  deleted: number;
}

export interface StoredEntry {
  id: string;
  note_id: string;
  parent_id: string | null;
  kind: "check" | "text";
  text: string;
  checked: number;
  position: number;
  updated_at: number;
  deleted: number;
}

export interface SyncBody {
  notes?: Array<{
    id: string;
    title: string;
    kind: "text" | "checklist";
    body: string;
    position: number;
    sortModes: Record<string, "alphabetical" | "manual">;
    updatedAt: number;
    deleted: boolean;
  }>;
  entries?: Array<{
    id: string;
    noteId: string;
    parentId: string | null;
    kind: "check" | "text";
    text: string;
    checked: boolean;
    position: number;
    updatedAt: number;
    deleted: boolean;
  }>;
}