CREATE TABLE entries_rebuilt (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  parent_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('check', 'text')),
  text TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  category TEXT DEFAULT 'other'
    CHECK (category IS NULL OR category IN ('produce', 'bakery', 'meat-seafood', 'dairy-eggs', 'pantry', 'frozen', 'beverages', 'systembolaget', 'household', 'personal-care', 'other')),
  category_manual INTEGER NOT NULL DEFAULT 0 CHECK (category_manual IN (0, 1))
);

INSERT INTO entries_rebuilt (
  id, space_id, note_id, parent_id, kind, text, checked, position, updated_at, deleted, category, category_manual
)
SELECT id, space_id, note_id, parent_id, kind, text, checked, position, updated_at, deleted, category, category_manual
FROM entries;

DROP TABLE entries;
ALTER TABLE entries_rebuilt RENAME TO entries;

CREATE INDEX idx_entries_space_note_parent ON entries (space_id, note_id, parent_id, position);