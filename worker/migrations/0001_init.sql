PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'checklist')),
  body TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  sort_modes TEXT NOT NULL DEFAULT '{"root":"alphabetical"}',
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  parent_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('check', 'text')),
  text TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_notes_space_position ON notes (space_id, position);
CREATE INDEX IF NOT EXISTS idx_entries_space_note_parent ON entries (space_id, note_id, parent_id, position);