import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readEvents, receiveHubEvents, type HubEventStore } from "./events";
import { signHubRequest } from "./signing";
import type { HubEvent } from "./types";

const SECRET = "0123456789abcdef0123456789abcdef";
const PATH = "/api/neram/events";
const NOW = 1_763_114_400_000;
const U1 = "8f1c0000-0000-4000-8000-000000000001";

function memoryStore(): HubEventStore & { nonces: Set<string>; events: Map<number, HubEvent> } {
  const nonces = new Set<string>();
  const events = new Map<number, HubEvent>();
  return {
    nonces,
    events,
    async claimNonce(n) {
      if (nonces.has(n)) return false;
      nonces.add(n);
      return true;
    },
    async recordEvent(e) {
      if (events.has(e.id)) return false;
      events.set(e.id, e);
      return true;
    },
  };
}

const batch = (ids: number[]) =>
  JSON.stringify({
    events: ids.map((id) => ({
      id,
      kind: "assigned",
      taskId: "0b9c0000-0000-4000-8000-0000000000aa",
      to: [U1],
      subject: "Hari gave you a task",
      message: "Count the cement bags.",
      at: "2026-11-14T05:00:00.000Z",
    })),
  });

function signed(body: string, opts: { now?: number; nonce?: string; secret?: string; path?: string; app?: string } = {}) {
  const h = signHubRequest(opts.secret ?? SECRET, opts.app ?? "aesta", "POST", opts.path ?? PATH, body, {
    now: opts.now ?? NOW,
    nonce: opts.nonce ?? "7d1f3c0e-0000-4000-8000-000000000001",
  });
  return new Headers(h);
}

const run = (store: HubEventStore, body: string, headers: Headers, pathAndQuery = PATH, now = NOW) =>
  receiveHubEvents({ headers, method: "POST", pathAndQuery, body, store, now });

beforeEach(() => {
  vi.stubEnv("NERAM_HUB_URL", "https://admin.example.com");
  vi.stubEnv("NERAM_HUB_APP", "aesta");
  vi.stubEnv("NERAM_HUB_SECRET", SECRET);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("event receiver", () => {
  it("stores a correctly signed batch", async () => {
    const store = memoryStore();
    const body = batch([41, 42]);
    const r = await run(store, body, signed(body));
    expect(r).toEqual({ status: 200, body: { ok: true, stored: 2, duplicates: 0 } });
    expect([...store.events.keys()]).toEqual([41, 42]);
    expect(store.events.get(41)?.to).toEqual([U1]);
  });

  it("refuses a bad signature (wrong secret) and stores nothing", async () => {
    const store = memoryStore();
    const body = batch([41]);
    const r = await run(store, body, signed(body, { secret: "x".repeat(32) }));
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ code: "unsigned" });
    expect(store.events.size).toBe(0);
    expect(store.nonces.size).toBe(0);
  });

  it("refuses a body changed after signing", async () => {
    const store = memoryStore();
    const headers = signed(batch([41]));
    const r = await run(store, batch([999]), headers);
    expect(r.status).toBe(401);
    expect(store.events.size).toBe(0);
  });

  it("refuses a request signed for another path", async () => {
    const store = memoryStore();
    const body = batch([41]);
    const r = await run(store, body, signed(body, { path: "/api/neram/other" }), "/api/neram/other");
    expect(r.status).toBe(401);
  });

  it("refuses another app's key", async () => {
    const store = memoryStore();
    const body = batch([41]);
    const r = await run(store, body, signed(body, { app: "other" }));
    expect(r.status).toBe(401);
  });

  it("refuses anything older than 5 minutes (and from more than 5 minutes ahead)", async () => {
    const store = memoryStore();
    const body = batch([41]);
    const old = await run(store, body, signed(body, { now: NOW - 5 * 60_000 - 1 }));
    expect(old.status).toBe(401);
    const ahead = await run(store, body, signed(body, { now: NOW + 5 * 60_000 + 1, nonce: "7d1f3c0e-0000-4000-8000-000000000009" }));
    expect(ahead.status).toBe(401);
    // Just inside the window is fine.
    const ok = await run(store, body, signed(body, { now: NOW - 4 * 60_000, nonce: "7d1f3c0e-0000-4000-8000-000000000010" }));
    expect(ok.status).toBe(200);
  });

  it("refuses a nonce it has already seen (a replay)", async () => {
    const store = memoryStore();
    const body = batch([41]);
    const headers = signed(body);
    expect((await run(store, body, headers)).status).toBe(200);
    const replay = await run(store, body, headers);
    expect(replay.status).toBe(401);
    expect(replay.body).toMatchObject({ code: "unsigned" });
  });

  it("ignores an event id it already stored (pushed twice, or pushed then pulled)", async () => {
    const store = memoryStore();
    const first = batch([41, 42]);
    await run(store, first, signed(first));
    const again = batch([42, 43]);
    const r = await run(store, again, signed(again, { nonce: "7d1f3c0e-0000-4000-8000-000000000002" }));
    expect(r).toEqual({ status: 200, body: { ok: true, stored: 1, duplicates: 1 } });
    expect([...store.events.keys()].sort()).toEqual([41, 42, 43]);
  });

  it("answers 400 for a body that is not { events: [...] }", async () => {
    const store = memoryStore();
    const body = JSON.stringify({ nope: true });
    const r = await run(store, body, signed(body));
    expect(r.status).toBe(400);
  });

  it("is 503 when the hub is not set up, before looking at anything", async () => {
    vi.stubEnv("NERAM_HUB_SECRET", "");
    const store = memoryStore();
    const body = batch([41]);
    const r = await run(store, body, signed(body));
    expect(r.status).toBe(503);
  });

  it("throws (so the route answers 500 and Admin keeps the event) when storing fails", async () => {
    const store = memoryStore();
    store.recordEvent = async () => {
      throw new Error("db down");
    };
    const body = batch([41]);
    await expect(run(store, body, signed(body))).rejects.toThrow("db down");
  });
});

describe("readEvents", () => {
  it("keeps only uuid recipients and falls back to 'changed' for an unknown kind", () => {
    const out = readEvents({
      events: [{ id: 5, kind: "mystery", taskId: "t", to: [U1, "not-a-uuid", 7], subject: "S", message: "M", at: "x" }],
    });
    expect(out).toEqual([{ id: 5, kind: "changed", taskId: "t", to: [U1], subject: "S", message: "M", at: "x" }]);
  });

  it("refuses a missing or bad id", () => {
    expect(readEvents({ events: [{ kind: "done" }] })).toBeNull();
    expect(readEvents({ events: [{ id: -1 }] })).toBeNull();
    expect(readEvents({})).toBeNull();
  });
});
