export type NoteKind = "text" | "checklist";
export type EntryKind = "check" | "text";
export type SortMode = "alphabetical" | "manual";

export const GROCERY_CATEGORIES = [
  { id: "produce", label: "Produce" },
  { id: "bakery", label: "Bakery" },
  { id: "meat-seafood", label: "Meat & Seafood" },
  { id: "dairy-eggs", label: "Dairy & Eggs" },
  { id: "pantry", label: "Pantry" },
  { id: "frozen", label: "Frozen" },
  { id: "beverages", label: "Beverages" },
  { id: "systembolaget", label: "Systembolaget" },
  { id: "household", label: "Household" },
  { id: "personal-care", label: "Personal Care" },
  { id: "other", label: "Other" },
] as const;

export type GroceryCategory = (typeof GROCERY_CATEGORIES)[number]["id"];

export interface Note {
  id: string;
  title: string;
  kind: NoteKind;
  body: string;
  position: number;
  sortModes: Record<string, SortMode>;
  updatedAt: number;
  deleted: boolean;
}

export interface ChecklistEntry {
  id: string;
  noteId: string;
  parentId: string | null;
  kind: EntryKind;
  text: string;
  originalText: string | null;
  category: GroceryCategory | null;
  categoryManual: boolean;
  checked: boolean;
  position: number;
  updatedAt: number;
  deleted: boolean;
}

export interface SpaceData {
  id: string;
  notes: Note[];
  entries: ChecklistEntry[];
}

const ROOT = "root";

const CATEGORY_ALIASES: Record<Exclude<GroceryCategory, "other">, readonly string[]> = {
  "frozen": ["frozen", "fryst", "frysta", "frystes"],
  "meat-seafood": [
    "meat", "chicken", "beef", "pork", "ham", "bacon", "sausage", "sausages", "fish", "salmon", "shrimp", "prawns",
    "kött", "kyckling", "nötfärs", "fläsk", "skinka", "bacon", "korv", "korvar", "fisk", "lax", "räkor",
  ],
  "dairy-eggs": [
    "milk", "oat milk", "almond milk", "butter", "cheese", "yogurt", "yoghurt", "cream", "eggs", "egg",
    "mjölk", "havremjölk", "mandelmjölk", "smör", "ost", "yoghurt", "grädde", "ägg", "filmjölk", "fil",
  ],
  "bakery": [
    "bread", "loaf", "rolls", "bun", "buns", "bagel", "bagels", "croissant", "tortillas",
    "bröd", "limpa", "fralla", "frallor", "bulle", "bullar", "knäckebröd", "tortillabröd",
  ],
  "beverages": [
    "water", "juice", "coffee", "tea", "soda", "soft drink", "beer", "wine",
    "vatten", "juice", "kaffe", "te", "läsk", "öl", "vin", "saft",
  ],
  "systembolaget": [
    "alcohol", "alcoholic", "beer", "lager", "ale", "stout", "wine", "red wine", "white wine", "sparkling wine",
    "champagne", "prosecco", "cider", "spirits", "liquor", "vodka", "whisky", "whiskey", "rum", "gin", "brandy", "tequila", "sake",
    "alkohol", "alkoholhaltig", "öl", "starköl", "folköl", "vin", "rödvin", "rött vin", "vitt vin", "mousserande vin",
    "champagne", "cider", "sprit", "vodka", "whisky", "rom", "gin", "konjak", "brännvin",
  ],
  "household": [
    "dish soap", "washing up liquid", "detergent", "laundry detergent", "cleaner", "cleaning spray", "sponge", "bin bags", "toilet paper", "paper towels",
    "diskmedel", "tvättmedel", "rengöring", "rengöringsmedel", "svamp", "soppåsar", "toalettpapper", "hushållspapper",
  ],
  "personal-care": [
    "shampoo", "conditioner", "toothpaste", "toothbrush", "deodorant", "soap", "shaving cream",
    "schampo", "balsam", "tandkräm", "tandborste", "deodorant", "tvål", "raklödder",
  ],
  "produce": [
    "apple", "apples", "banana", "bananas", "orange", "oranges", "lemon", "lemons", "lime", "avocado", "avocados",
    "tomato", "tomatoes", "cucumber", "cucumbers", "carrot", "carrots", "potato", "potatoes", "onion", "onions", "garlic",
    "lettuce", "spinach", "broccoli", "pepper", "peppers", "strawberry", "strawberries", "blueberries", "grapes", "fruit", "vegetables",
    "äpple", "äpplen", "banan", "bananer", "apelsin", "apelsiner", "citron", "citroner", "avokado", "tomat", "tomater", "gurka", "gurkor",
    "morot", "morötter", "potatis", "lök", "lökar", "vitlök", "sallad", "spenat", "broccoli", "paprika", "jordgubbe", "jordgubbar",
    "blåbär", "vindruvor", "frukt", "grönsaker",
  ],
  "pantry": [
    "rice", "pasta", "flour", "sugar", "salt", "peppercorns", "oil", "olive oil", "canned beans", "beans", "lentils", "oats", "cereal", "cereal",
    "rice cakes", "crackers", "chocolate", "honey", "jam", "spices", "ketchup", "mustard",
    "ris", "pasta", "mjöl", "socker", "salt", "olja", "olivolja", "bönor", "linser", "havregryn", "flingor", "knäckebröd",
    "kex", "choklad", "honung", "sylt", "kryddor", "ketchup", "senap",
  ],
};

const CATEGORY_MATCH_ORDER: readonly Exclude<GroceryCategory, "other">[] = [
  "frozen", "systembolaget", "meat-seafood", "dairy-eggs", "bakery", "beverages", "household", "personal-care", "produce", "pantry",
];

export function suggestGroceryCategory(text: string): GroceryCategory {
  const words = normalizeCategoryText(text).split(" ").filter(Boolean);
  if (["non alcoholic", "alcohol free", "alcoholfree", "alkoholfri", "alkoholfritt"]
    .some((alias) => containsPhrase(words, normalizeCategoryText(alias).split(" ")))) return "beverages";
  for (const category of CATEGORY_MATCH_ORDER) {
    if (CATEGORY_ALIASES[category].some((alias) => containsPhrase(words, normalizeCategoryText(alias).split(" ")))) {
      return category;
    }
  }
  return "other";
}

export function setEntryCategory(data: SpaceData, entryId: string, category: GroceryCategory): SpaceData {
  const entry = data.entries.find((item) => item.id === entryId && !item.deleted);
  if (!entry || entry.kind !== "check") return data;
  return {
    ...data,
    entries: data.entries.map((item) => item.id === entryId
      ? { ...item, category, categoryManual: true, updatedAt: Date.now() }
      : item,
    ),
  };
}

function normalizeCategoryText(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function containsPhrase(words: string[], phrase: string[]): boolean {
  return phrase.length > 0 && words.some((_, start) => phrase.every((word, offset) => words[start + offset] === word));
}

export function createSpaceData(id: string): SpaceData {
  return { id, notes: [], entries: [] };
}

export function createNote(
  data: SpaceData,
  title: string,
  kind: NoteKind,
  id: string = crypto.randomUUID(),
): SpaceData {
  const note: Note = {
    id,
    title: title.trim(),
    kind,
    body: "",
    position: data.notes.filter((item) => !item.deleted).length,
    sortModes: { [ROOT]: "alphabetical" },
    updatedAt: Date.now(),
    deleted: false,
  };
  return { ...data, notes: [...data.notes, note] };
}

export function updateNote(
  data: SpaceData,
  noteId: string,
  patch: Partial<Pick<Note, "title" | "body">>,
): SpaceData {
  return {
    ...data,
    notes: data.notes.map((note) =>
      note.id === noteId ? { ...note, ...patch, updatedAt: Date.now() } : note,
    ),
  };
}

export function deleteNote(data: SpaceData, noteId: string): SpaceData {
  return {
    ...data,
    notes: data.notes.map((note) =>
      note.id === noteId ? { ...note, deleted: true, updatedAt: Date.now() } : note,
    ),
  };
}

export function getEntries(data: SpaceData, noteId: string, parentId: string | null): ChecklistEntry[] {
  return data.entries
    .filter((entry) => entry.noteId === noteId && entry.parentId === parentId && !entry.deleted)
    .sort((left, right) => left.position - right.position);
}

export function createEntry(
  data: SpaceData,
  noteId: string,
  parentId: string | null,
  kind: EntryKind,
  text: string,
  originalText: string | null = null,
): { data: SpaceData; error?: string } {
  const label = text.trim();
  if (!label) return { data, error: "Enter some text first." };

  const siblings = getEntries(data, noteId, parentId);
  if (kind === "check" && hasDuplicate(siblings, label)) {
    return { data, error: "That item is already in this list." };
  }

  const note = data.notes.find((item) => item.id === noteId);
  if (!note || note.deleted || note.kind !== "checklist") {
    return { data, error: "This checklist is no longer available." };
  }
  if (parentId && !data.entries.some((entry) => entry.id === parentId && entry.noteId === noteId && !entry.deleted)) {
    return { data, error: "Choose a valid parent item." };
  }

  const mode = note.sortModes[parentId ?? ROOT] ?? "alphabetical";
  const entry: ChecklistEntry = {
    id: crypto.randomUUID(),
    noteId,
    parentId,
    kind,
    text: label,
    originalText: originalText?.trim() && originalText.trim() !== label ? originalText.trim() : null,
    category: kind === "check" ? suggestGroceryCategory(label) : null,
    categoryManual: false,
    checked: false,
    position: mode === "manual" ? siblings.length : alphabeticalPosition(siblings, label),
    updatedAt: Date.now(),
    deleted: false,
  };

  let entries = [...data.entries, entry];
  if (mode === "alphabetical") {
    entries = reorderSiblingPositions(entries, noteId, parentId, [...siblings, entry].sort(compareEntries));
  }
  return { data: { ...data, entries } };
}

export function updateEntryText(
  data: SpaceData,
  entryId: string,
  text: string,
): { data: SpaceData; error?: string } {
  const entry = data.entries.find((item) => item.id === entryId && !item.deleted);
  const label = text.trim();
  if (!entry) return { data, error: "This item is no longer available." };
  if (!label) return { data, error: "Enter some text first." };
  if (entry.kind === "check" && hasDuplicate(
    getEntries(data, entry.noteId, entry.parentId).filter((item) => item.id !== entryId),
    label,
  )) return { data, error: "That item is already in this list." };

  let entries = data.entries.map((item) =>
    item.id === entryId ? {
      ...item,
      text: label,
      originalText: null,
      category: item.kind === "check" && !item.categoryManual
        ? suggestGroceryCategory(label)
        : item.category,
      updatedAt: Date.now(),
    } : item,
  );
  const note = data.notes.find((item) => item.id === entry.noteId);
  if (entry.kind === "check" && note?.sortModes[entry.parentId ?? ROOT] !== "manual") {
    const siblings = getEntries({ ...data, entries }, entry.noteId, entry.parentId).sort(compareEntries);
    entries = reorderSiblingPositions(entries, entry.noteId, entry.parentId, siblings);
  }
  return { data: { ...data, entries } };
}

export function revertEntryText(data: SpaceData, entryId: string): { data: SpaceData; error?: string } {
  const entry = data.entries.find((item) => item.id === entryId && !item.deleted);
  if (!entry?.originalText) return { data };
  return updateEntryText(data, entryId, entry.originalText);
}

export function toggleEntry(data: SpaceData, entryId: string): SpaceData {
  return {
    ...data,
    entries: data.entries.map((entry) =>
      entry.id === entryId ? { ...entry, checked: !entry.checked, updatedAt: Date.now() } : entry,
    ),
  };
}

export function deleteEntry(data: SpaceData, entryId: string): SpaceData {
  return {
    ...data,
    entries: data.entries.map((entry) =>
      entry.id === entryId ? { ...entry, deleted: true, updatedAt: Date.now() } : entry,
    ),
  };
}

export function reorderEntry(data: SpaceData, entryId: string, targetId: string): SpaceData {
  const entry = data.entries.find((item) => item.id === entryId && !item.deleted);
  if (!entry || entryId === targetId) return data;
  const siblings = getEntries(data, entry.noteId, entry.parentId);
  const from = siblings.findIndex((item) => item.id === entryId);
  const to = siblings.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0) return data;

  const reordered = [...siblings];
  reordered.splice(to, 0, reordered.splice(from, 1)[0]);
  const entries = reorderSiblingPositions(data.entries, entry.noteId, entry.parentId, reordered);
  const now = Date.now();
  const notes = data.notes.map((note) => note.id === entry.noteId
    ? { ...note, sortModes: { ...note.sortModes, [entry.parentId ?? ROOT]: "manual" as const }, updatedAt: now }
    : note,
  );
  return { ...data, entries, notes };
}

export function setSortMode(data: SpaceData, noteId: string, parentId: string | null, mode: SortMode): SpaceData {
  const note = data.notes.find((item) => item.id === noteId);
  if (!note) return data;
  const siblings = getEntries(data, noteId, parentId);
  const ordered = mode === "alphabetical" ? [...siblings].sort(compareEntries) : siblings;
  const entries = reorderSiblingPositions(data.entries, noteId, parentId, ordered);
  const updatedNote = {
    ...note,
    sortModes: { ...note.sortModes, [parentId ?? ROOT]: mode },
    updatedAt: Date.now(),
  };
  return {
    ...data,
    entries,
    notes: data.notes.map((item) => item.id === noteId ? updatedNote : item),
  };
}

function hasDuplicate(siblings: ChecklistEntry[], label: string): boolean {
  const normalized = label.trim().toLocaleLowerCase();
  return siblings.some((entry) => entry.kind === "check" && entry.text.trim().toLocaleLowerCase() === normalized);
}

function compareEntries(left: ChecklistEntry, right: ChecklistEntry): number {
  return left.text.localeCompare(right.text, undefined, { sensitivity: "base" });
}

function alphabeticalPosition(siblings: ChecklistEntry[], label: string): number {
  return siblings.filter((entry) => entry.text.localeCompare(label, undefined, { sensitivity: "base" }) < 0).length;
}

function reorderSiblingPositions(
  allEntries: ChecklistEntry[],
  noteId: string,
  parentId: string | null,
  ordered: ChecklistEntry[],
): ChecklistEntry[] {
  const positions = new Map(ordered.map((entry, index) => [entry.id, index]));
  const now = Date.now();
  return allEntries.map((entry) =>
    entry.noteId === noteId && entry.parentId === parentId && positions.has(entry.id)
      ? { ...entry, position: positions.get(entry.id)!, updatedAt: now }
      : entry,
  );
}