import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addComment,
  addFile,
  buildPathAndQuery,
  createTask,
  getRunning,
  getTask,
  HubError,
  HUB_TIMEOUT_MS,
  listEvents,
  listPeople,
  listTasks,
  taskAction,
} from "./client";
import { hubSignature, HUB_HEADER } from "./signing";

const SECRET = "0123456789abcdef0123456789abcdef";

type Call = { url: string; init: RequestInit };
let calls: Call[];

function respond(status: number, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(text, { status, headers: { "content-type": "application/json" } });
  });
}

/** Re-computes the signature the hub would check, from what was actually sent. */
function expectSignedAsSent(call: Call) {
  const h = call.init.headers as Record<string, string>;
  const u = new URL(call.url);
  const body = (call.init.body as string | undefined) ?? "";
  const expected = hubSignature(
    SECRET,
    h[HUB_HEADER.timestamp],
    h[HUB_HEADER.nonce],
    call.init.method as string,
    u.pathname + u.search,
    body,
  );
  expect(h[HUB_HEADER.signature]).toBe(expected);
  expect(h[HUB_HEADER.app]).toBe("aesta");
}

beforeEach(() => {
  calls = [];
  vi.stubEnv("NERAM_HUB_URL", "https://admin.example.com/");
  vi.stubEnv("NERAM_HUB_APP", "aesta");
  vi.stubEnv("NERAM_HUB_SECRET", SECRET);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("buildPathAndQuery", () => {
  it("keeps the given order and skips empty values", () => {
    expect(buildPathAndQuery("/api/hub/v1/tasks", { as: "u1", view: undefined, state: "open" })).toBe(
      "/api/hub/v1/tasks?as=u1&state=open",
    );
    expect(buildPathAndQuery("/api/hub/v1/people")).toBe("/api/hub/v1/people");
  });
});

describe("hub client requests", () => {
  it("GET: signs the exact path and query with an empty body, and sends no body", async () => {
    vi.stubGlobal("fetch", respond(200, { tasks: [{ id: "t1" }] }));
    const tasks = await listTasks("user-1", { view: "given", state: "closed" });
    expect(tasks).toEqual([{ id: "t1" }]);
    expect(calls[0].url).toBe("https://admin.example.com/api/hub/v1/tasks?as=user-1&view=given&state=closed");
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
    expectSignedAsSent(calls[0]);
  });

  it("POST: sends exactly the JSON text it signed", async () => {
    vi.stubGlobal("fetch", respond(201, { task: { id: "t9" } }));
    const task = await createTask("user-1", {
      title: "Count the cement bags",
      priority: "normal",
      page: { url: "https://app.aesta.co.in/site/x?site=s1", title: "X", siteId: "s1", siteName: "Mathur" },
    });
    expect(task).toEqual({ id: "t9" });
    expect(calls[0].url).toBe("https://admin.example.com/api/hub/v1/tasks?as=user-1");
    expect(JSON.parse(calls[0].init.body as string).title).toBe("Count the cement bags");
    expect((calls[0].init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expectSignedAsSent(calls[0]);
  });

  it("every route hits its path and is signed", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const path = new URL(url).pathname;
      const body =
        path.endsWith("/people") ? { people: [] }
        : path.endsWith("/running") ? { now: "2026-11-17T00:00:00Z", running: [] }
        : path.endsWith("/events") ? { events: [], next: 7 }
        : { task: { id: "t1" } };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await listPeople();
    await getTask("u1", "t1");
    await taskAction("u1", "t1", { action: "done", note: "All counted" });
    await addComment("u1", "t1", "Truck came at 4.");
    await addFile("u1", "t1", { name: "bags.jpg", type: "image/jpeg", data: "AAAA" });
    await getRunning("u1");
    const page = await listEvents(5, 500);

    expect(calls.map((c) => `${c.init.method} ${new URL(c.url).pathname}${new URL(c.url).search}`)).toEqual([
      "GET /api/hub/v1/people",
      "GET /api/hub/v1/tasks/t1?as=u1",
      "POST /api/hub/v1/tasks/t1/actions?as=u1",
      "POST /api/hub/v1/tasks/t1/comments?as=u1",
      "POST /api/hub/v1/tasks/t1/files?as=u1",
      "GET /api/hub/v1/running?as=u1",
      "GET /api/hub/v1/events?after=5&limit=200",
    ]);
    calls.forEach(expectSignedAsSent);
    expect(JSON.parse(calls[2].init.body as string)).toEqual({ action: "done", note: "All counted" });
    expect(page.next).toBe(7);
  });

  it("encodes a task id inside the path", async () => {
    vi.stubGlobal("fetch", respond(200, { task: { id: "a/b" } }));
    await getTask("u1", "a/b");
    expect(new URL(calls[0].url).pathname).toBe("/api/hub/v1/tasks/a%2Fb");
    expectSignedAsSent(calls[0]);
  });

  it("starts the event pull at 0 for a bad `after`", async () => {
    vi.stubGlobal("fetch", respond(200, { events: [], next: 0 }));
    await listEvents(Number.NaN);
    expect(new URL(calls[0].url).search).toBe("?after=0");
  });

  it("refuses an empty `as` without calling the hub", async () => {
    const fetchMock = respond(200, {});
    vi.stubGlobal("fetch", fetchMock);
    await expect(listTasks("  ")).rejects.toMatchObject({ code: "invalid", field: "as" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("hub client errors", () => {
  it("passes the hub's { error, code, field } through for the person to see", async () => {
    vi.stubGlobal("fetch", respond(400, { error: "This task needs a photo or a note to close.", code: "proof" }));
    const err = await taskAction("u1", "t1", { action: "done" }).catch((e) => e);
    expect(err).toBeInstanceOf(HubError);
    expect(err.status).toBe(400);
    expect(err.toBody()).toEqual({ error: "This task needs a photo or a note to close.", code: "proof" });
  });

  it("keeps the field of an invalid request", async () => {
    vi.stubGlobal("fetch", respond(400, { error: "Pick the person.", code: "invalid", field: "checker" }));
    const err = await taskAction("u1", "t1", { action: "ask_check", checker: "" }).catch((e) => e);
    expect(err.toBody()).toEqual({ error: "Pick the person.", code: "invalid", field: "checker" });
  });

  it("not_linked carries the hub's code with status 403", async () => {
    vi.stubGlobal("fetch", respond(403, { error: "That login is not linked.", code: "not_linked" }));
    const err = await listTasks("u1").catch((e) => e);
    expect(err).toMatchObject({ status: 403, code: "not_linked" });
  });

  it("an answer that is not JSON becomes a plain 'try again'", async () => {
    vi.stubGlobal("fetch", respond(502, "<html>Bad gateway</html>"));
    const err = await listPeople().catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: "error" });
    expect(err.message).toMatch(/try again/i);
  });

  it("an unknown code is reported as 'error'", async () => {
    vi.stubGlobal("fetch", respond(418, { error: "Teapot", code: "teapot" }));
    const err = await listPeople().catch((e) => e);
    expect(err.toBody()).toEqual({ error: "Teapot", code: "error" });
  });

  it("a network failure is 'unreachable'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const err = await listPeople().catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: "unreachable" });
  });

  it("times out after 10 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("The operation was aborted.", "AbortError")),
            );
          }),
      ),
    );
    const pending = listPeople().catch((e) => e);
    await vi.advanceTimersByTimeAsync(HUB_TIMEOUT_MS - 1);
    await vi.advanceTimersByTimeAsync(1);
    const err = await pending;
    expect(err).toMatchObject({ status: 504, code: "timeout" });
  });

  it("is 'not_configured' without the env, or with a short secret", async () => {
    const fetchMock = respond(200, {});
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NERAM_HUB_SECRET", "");
    await expect(listPeople()).rejects.toMatchObject({ status: 503, code: "not_configured" });
    vi.stubEnv("NERAM_HUB_SECRET", "too-short");
    await expect(listPeople()).rejects.toMatchObject({ status: 503, code: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
