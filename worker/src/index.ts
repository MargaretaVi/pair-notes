import { Hono } from "hono";
import type { Env, StoredEntry, StoredNote, StoredSpace, SyncBody } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.post("/api/spaces", async (context) => {
  const id = crypto.randomUUID();
  const accessToken = randomToken();
  const tokenHash = await hashToken(accessToken);
  await context.env.DB.prepare(
    "INSERT INTO spaces (id, token_hash, created_at) VALUES (?, ?, ?)",
  ).bind(id, tokenHash, Date.now()).run();
  return context.json({ id, accessToken });
});

app.get("/api/sync/:spaceId", async (context) => {
  const spaceId = context.req.param("spaceId");
  if (!await hasAccess(context.env.DB, spaceId, context.req.header("Authorization"))) {
    return context.json({ error: "Access denied" }, 401);
  }

  const [noteRows, entryRows] = await Promise.all([
    context.env.DB.prepare("SELECT * FROM notes WHERE space_id = ? ORDER BY position, id").bind(spaceId).all<StoredNote>(),
    context.env.DB.prepare("SELECT * FROM entries WHERE space_id = ? ORDER BY position, id").bind(spaceId).all<StoredEntry>(),
  ]);

  return context.json({
    notes: noteRows.results.map((note) => ({
      id: note.id,
      title: note.title,
      kind: note.kind,
      body: note.body,
      position: note.position,
      sortModes: parseSortModes(note.sort_modes),
      updatedAt: note.updated_at,
      deleted: note.deleted === 1,
    })),
    entries: entryRows.results.map((entry) => ({
      id: entry.id,
      noteId: entry.note_id,
      parentId: entry.parent_id,
      kind: entry.kind,
      text: entry.text,
      checked: entry.checked === 1,
      position: entry.position,
      updatedAt: entry.updated_at,
      deleted: entry.deleted === 1,
    })),
    serverTime: Date.now(),
  });
});

app.put("/api/sync/:spaceId", async (context) => {
  const spaceId = context.req.param("spaceId");
  if (!await hasAccess(context.env.DB, spaceId, context.req.header("Authorization"))) {
    return context.json({ error: "Access denied" }, 401);
  }

  let body: SyncBody;
  try {
    body = await context.req.json<SyncBody>();
  } catch {
    return context.json({ error: "Invalid JSON body" }, 400);
  }
  if (!Array.isArray(body.notes) || !Array.isArray(body.entries) || body.notes.length > 500 || body.entries.length > 5000) {
    return context.json({ error: "Invalid sync payload" }, 400);
  }

  const noteIds = new Set(body.notes.map((note) => note.id));
  const noteStatements = body.notes.map((note) => {
    if (!isValidId(note.id) || !isValidTitle(note.title) || !["text", "checklist"].includes(note.kind)
      || typeof note.body !== "string" || note.body.length > 100_000 || !isValidPosition(note.position)
      || !isValidTimestamp(note.updatedAt) || typeof note.deleted !== "boolean") return null;
    return context.env.DB.prepare(`
      INSERT INTO notes (id, space_id, title, kind, body, position, sort_modes, updated_at, deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        kind = excluded.kind,
        body = excluded.body,
        position = excluded.position,
        sort_modes = excluded.sort_modes,
        updated_at = excluded.updated_at,
        deleted = excluded.deleted
      WHERE notes.space_id = excluded.space_id AND excluded.updated_at >= notes.updated_at
    `).bind(note.id, spaceId, note.title.trim(), note.kind, note.body, note.position,
      JSON.stringify(note.sortModes ?? { root: "alphabetical" }), note.updatedAt, Number(note.deleted));
  });

  const entryStatements = body.entries.map((entry) => {
    if (!isValidId(entry.id) || !isValidId(entry.noteId) || !noteIds.has(entry.noteId)
      || (entry.parentId !== null && !isValidId(entry.parentId)) || !["check", "text"].includes(entry.kind)
      || !isValidTitle(entry.text) || !isValidPosition(entry.position) || !isValidTimestamp(entry.updatedAt)
      || typeof entry.checked !== "boolean" || typeof entry.deleted !== "boolean") return null;
    return context.env.DB.prepare(`
      INSERT INTO entries (id, space_id, note_id, parent_id, kind, text, checked, position, updated_at, deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        note_id = excluded.note_id,
        parent_id = excluded.parent_id,
        kind = excluded.kind,
        text = excluded.text,
        checked = excluded.checked,
        position = excluded.position,
        updated_at = excluded.updated_at,
        deleted = excluded.deleted
      WHERE entries.space_id = excluded.space_id AND excluded.updated_at >= entries.updated_at
    `).bind(entry.id, spaceId, entry.noteId, entry.parentId, entry.kind, entry.text.trim(), Number(entry.checked),
      entry.position, entry.updatedAt, Number(entry.deleted));
  });

  if ([...noteStatements, ...entryStatements].some((statement) => statement === null)) {
    return context.json({ error: "Invalid note or checklist entry" }, 400);
  }

  const statements = [...noteStatements, ...entryStatements].filter((statement) => statement !== null);
  if (statements.length > 0) await context.env.DB.batch(statements);
  return context.json({ ok: true });
});

app.post("/api/spaces/:spaceId/rotate-link", async (context) => {
  const spaceId = context.req.param("spaceId");
  if (!await hasAccess(context.env.DB, spaceId, context.req.header("Authorization"))) {
    return context.json({ error: "Access denied" }, 401);
  }
  const accessToken = randomToken();
  await context.env.DB.prepare("UPDATE spaces SET token_hash = ? WHERE id = ?")
    .bind(await hashToken(accessToken), spaceId).run();
  return context.json({ id: spaceId, accessToken });
});

app.delete("/api/spaces/:spaceId", async (context) => {
  const spaceId = context.req.param("spaceId");
  if (!await hasAccess(context.env.DB, spaceId, context.req.header("Authorization"))) {
    return context.json({ error: "Access denied" }, 401);
  }
  await context.env.DB.batch([
    context.env.DB.prepare("DELETE FROM entries WHERE space_id = ?").bind(spaceId),
    context.env.DB.prepare("DELETE FROM notes WHERE space_id = ?").bind(spaceId),
    context.env.DB.prepare("DELETE FROM spaces WHERE id = ?").bind(spaceId),
  ]);
  return context.json({ ok: true });
});

app.notFound((context) => context.json({ error: "Not found" }, 404));

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hasAccess(db: D1Database, spaceId: string, authorization?: string): Promise<boolean> {
  const token = authorization?.match(/^Bearer\s+([a-f\d]{64})$/i)?.[1];
  if (!token) return false;
  const space = await db.prepare("SELECT token_hash FROM spaces WHERE id = ?").bind(spaceId).first<StoredSpace>();
  if (!space) return false;
  const candidate = await hashToken(token);
  let difference = 0;
  for (let index = 0; index < space.token_hash.length; index += 1) {
    difference |= space.token_hash.charCodeAt(index) ^ candidate.charCodeAt(index);
  }
  return difference === 0;
}

function parseSortModes(value: string): Record<string, "alphabetical" | "manual"> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([, mode]) => mode === "alphabetical" || mode === "manual")) as Record<string, "alphabetical" | "manual">;
  } catch {
    return { root: "alphabetical" };
  }
}

function isValidId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100;
}

function isValidTitle(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 1000;
}

function isValidPosition(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100_000;
}

function isValidTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

export default app;