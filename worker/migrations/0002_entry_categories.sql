ALTER TABLE entries ADD COLUMN category TEXT DEFAULT 'other'
  CHECK (category IS NULL OR category IN ('produce', 'bakery', 'meat-seafood', 'dairy-eggs', 'pantry', 'frozen', 'beverages', 'household', 'personal-care', 'other'));

ALTER TABLE entries ADD COLUMN category_manual INTEGER NOT NULL DEFAULT 0
  CHECK (category_manual IN (0, 1));