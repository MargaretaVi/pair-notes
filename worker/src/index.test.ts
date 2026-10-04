import { describe, expect, it, vi } from "vitest";
import app from "./index";
import type { Env } from "./types";

function testEnv(changes = 1) {
  const run = vi.fn(async () => ({ meta: { changes } }));
  const bind = vi.fn(() => ({ run }));
  const prepare = vi.fn(() => ({ bind }));
  return { env: { DB: { prepare } } as unknown as Env, prepare, bind };
}

describe("POST /api/spaces", () => {
  it("creates a custom-named space with a separate access token", async () => {
    const { env, prepare, bind } = testEnv();
    const response = await app.request("/api/spaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "weekend-plans" }),
    }, env);
    const result = await response.json() as { id: string; accessToken: string };

    expect(response.status).toBe(200);
    expect(result.id).toBe("weekend-plans");
    expect(result.accessToken).toMatch(/^[a-f0-9]{64}$/);
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT(id) DO NOTHING"));
    expect(bind).toHaveBeenCalledWith("weekend-plans", expect.any(String), expect.any(Number));
  });

  it("keeps generated IDs for requests without a body", async () => {
    const { env } = testEnv();
    const response = await app.request("/api/spaces", { method: "POST" }, env);
    const result = await response.json() as { id: string; accessToken: string };

    expect(response.status).toBe(200);
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.accessToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects invalid slugs and reports name conflicts", async () => {
    const invalid = testEnv();
    const invalidResponse = await app.request("/api/spaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "Not a slug" }),
    }, invalid.env);
    expect(invalidResponse.status).toBe(400);
    expect(invalid.prepare).not.toHaveBeenCalled();

    const taken = testEnv(0);
    const conflictResponse = await app.request("/api/spaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "weekend-plans" }),
    }, taken.env);
    expect(conflictResponse.status).toBe(409);
    expect(await conflictResponse.json()).toEqual({ error: "That space name is already taken." });
  });
});

describe("checklist category sync", () => {
  const accessToken = "a".repeat(64);

  async function tokenHash(token: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  it("returns persisted category and manual-override state", async () => {
    const entry = {
      id: "entry-1",
      note_id: "note-1",
      parent_id: null,
      kind: "check",
      text: "Tomatoes",
      original_text: "Tomatos",
      category: "systembolaget",
      category_manual: 1,
      checked: 0,
      position: 0,
      updated_at: 1,
      deleted: 0,
    };
    const hash = await tokenHash(accessToken);
    const env = {
      DB: {
        prepare: vi.fn((query: string) => ({
          bind: () => ({
            first: async () => ({ token_hash: hash }),
            all: async () => ({ results: query.includes("FROM entries") ? [entry] : [] }),
          }),
        })),
      },
    } as unknown as Env;

    const response = await app.request("/api/sync/space-1", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }, env);
    const result = await response.json() as { clearedAt: number; entries: Array<{ originalText: string | null; category: string; categoryManual: boolean }> };

    expect(response.status).toBe(200);
    expect(result.clearedAt).toBe(0);
    expect(result.entries[0]).toMatchObject({ originalText: "Tomatos", category: "systembolaget", categoryManual: true });
  });

  it("rejects uploads from a client with a stale clear marker", async () => {
    const hash = await tokenHash(accessToken);
    const env = {
      DB: {
        prepare: vi.fn((query: string) => ({
          bind: () => ({
            first: async () => query.includes("cleared_at") ? { cleared_at: 123 } : { token_hash: hash },
          }),
        })),
      },
    } as unknown as Env;

    const response = await app.request("/api/sync/space-1", {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ clearedAt: 0, notes: [], entries: [] }),
    }, env);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Shared space was cleared. Refresh before syncing." });
  });

  it("persists category data from a sync payload", async () => {
    const hash = await tokenHash(accessToken);
    const statements: Array<{ query: string; values: unknown[] }> = [];
    const database = {
      prepare: vi.fn((query: string) => ({
        bind: (...values: unknown[]) => {
          const statement = { query, values };
          statements.push(statement);
          return { ...statement, first: async () => ({ token_hash: hash }) };
        },
      })),
      batch: vi.fn(async () => ({ meta: { changes: 2 } })),
    };
    const env = { DB: database } as unknown as Env;

    const response = await app.request("/api/sync/space-1", {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        notes: [{
          id: "note-1",
          title: "Groceries",
          kind: "checklist",
          body: "",
          position: 0,
          sortModes: { root: "alphabetical" },
          updatedAt: 1,
          deleted: false,
        }],
        entries: [{
          id: "entry-1",
          noteId: "note-1",
          parentId: null,
          kind: "check",
          text: "Beer",
          originalText: "Beerr",
          category: "systembolaget",
          categoryManual: true,
          checked: false,
          position: 0,
          updatedAt: 1,
          deleted: false,
        }, {
          id: "entry-2",
          noteId: "note-1",
          parentId: "entry-1",
          kind: "check",
          text: "A few apples",
          originalText: null,
          category: null,
          categoryManual: false,
          checked: false,
          position: 0,
          updatedAt: 1,
          deleted: false,
        }, {
          id: "entry-3",
          noteId: "note-1",
          parentId: null,
          kind: "text",
          text: "Remember the bags",
          originalText: null,
          category: null,
          categoryManual: false,
          checked: false,
          position: 1,
          updatedAt: 1,
          deleted: false,
        }],
      }),
    }, env);
    const entryStatement = statements.find((statement) => statement.query.includes("INSERT INTO entries"));

    expect(response.status).toBe(200);
    expect(entryStatement?.query).toContain("category_manual");
    expect(entryStatement?.query).toContain("original_text");
    expect(entryStatement?.values[6]).toBe("Beerr");
    expect(entryStatement?.values[7]).toBe("systembolaget");
    expect(entryStatement?.values[8]).toBe(1);
    expect(statements.filter((statement) => statement.query.includes("INSERT INTO entries")).map((statement) => statement.values[7]))
      .toEqual(["systembolaget", null, null]);
    expect(database.batch).toHaveBeenCalledOnce();
  });
});
