export interface Env {
  DB: D1Database;
}

export interface StoredSpace {
  id: string;
  token_hash: string;
}

export type GroceryCategory =
  | "produce"
  | "bakery"
  | "meat-seafood"
  | "dairy-eggs"
  | "pantry"
  | "frozen"
  | "beverages"
  | "systembolaget"
  | "household"
  | "personal-care"
  | "other";

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
  original_text: string | null;
  category: GroceryCategory | null;
  category_manual: number;
  checked: number;
  position: number;
  updated_at: number;
  deleted: number;
}

export interface SyncBody {
  clearedAt?: number;
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
    originalText: string | null;
    category: GroceryCategory | null;
    categoryManual: boolean;
    checked: boolean;
    position: number;
    updatedAt: number;
    deleted: boolean;
  }>;
}