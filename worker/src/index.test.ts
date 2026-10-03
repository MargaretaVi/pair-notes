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
