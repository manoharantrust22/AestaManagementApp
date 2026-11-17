import { describe, expect, it } from "vitest";
import { base64Bytes, MAX_PHOTO_BYTES, readAction, readComment, readFile, readNewTask } from "./validate";

const U = "8f1c0000-0000-4000-8000-000000000001";
const canon = (u: unknown) => (typeof u === "string" ? `https://app.aesta.co.in${new URL(u, "https://x").pathname}${new URL(u, "https://x").search}` : null);

describe("readNewTask", () => {
  it("keeps known fields only, and puts the page on Aesta's address", () => {
    const r = readNewTask(
      { title: " Count bags ", owner: U, priority: "normal", size: "short", as: "someone-else", page: { url: "http://localhost:3000/site/x?site=s1", title: "X", siteId: "s1" } },
      canon,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        title: "Count bags",
        owner: U,
        priority: "normal",
        size: "short",
        page: { url: "https://app.aesta.co.in/site/x?site=s1", title: "X", siteId: "s1", siteName: null },
      },
    });
  });

  it("refuses a missing title and a bad owner, date or word", () => {
    expect(readNewTask({}, canon)).toMatchObject({ ok: false, field: "title" });
    expect(readNewTask({ title: "x", owner: "me" }, canon)).toMatchObject({ ok: false, field: "owner" });
    expect(readNewTask({ title: "x", dueDate: "15/11/2026" }, canon)).toMatchObject({ ok: false, field: "dueDate" });
    expect(readNewTask({ title: "x", priority: "medium" }, canon)).toMatchObject({ ok: false, field: "priority" });
    expect(readNewTask({ title: "x", size: "large" }, canon)).toMatchObject({ ok: false, field: "size" });
  });
});

describe("readAction", () => {
  it("passes only the fields each action takes", () => {
    expect(readAction({ action: "start", note: "ignored", as: "x" })).toEqual({ ok: true, value: { action: "start" } });
    expect(readAction({ action: "done", note: " ok " })).toEqual({ ok: true, value: { action: "done", note: "ok" } });
    expect(readAction({ action: "cancel", reason: "mistake" })).toEqual({ ok: true, value: { action: "cancel", reason: "mistake" } });
    expect(readAction({ action: "waiting", reason: "No cement" })).toEqual({ ok: true, value: { action: "waiting", reason: "No cement" } });
    expect(readAction({ action: "reassign", owner: U })).toEqual({ ok: true, value: { action: "reassign", owner: U } });
    expect(readAction({ action: "edit", priority: "high" })).toEqual({ ok: true, value: { action: "edit", priority: "high" } });
  });

  it("refuses unknown actions and missing parts", () => {
    expect(readAction({ action: "delete" })).toMatchObject({ ok: false, field: "action" });
    expect(readAction({ action: "cancel", reason: "bored" })).toMatchObject({ ok: false, field: "reason" });
    expect(readAction({ action: "waiting" })).toMatchObject({ ok: false, field: "reason" });
    expect(readAction({ action: "ask_check" })).toMatchObject({ ok: false, field: "checker" });
    expect(readAction({ action: "edit" })).toMatchObject({ ok: false, field: "action" });
  });
});

describe("readComment / readFile", () => {
  it("needs some text", () => {
    expect(readComment({ text: "  " })).toMatchObject({ ok: false });
    expect(readComment({ text: "Truck came" })).toEqual({ ok: true, value: "Truck came" });
  });

  it("takes JPEG/PNG/WebP up to 3 MB", () => {
    const small = Buffer.alloc(1000, 1).toString("base64");
    expect(readFile({ name: "bags.jpg", type: "image/jpeg", data: small })).toMatchObject({ ok: true, value: { name: "bags.jpg", type: "image/jpeg" } });
    expect(readFile({ type: "image/gif", data: small })).toMatchObject({ ok: false, field: "type" });
    const big = Buffer.alloc(MAX_PHOTO_BYTES + 1, 1).toString("base64");
    expect(readFile({ type: "image/jpeg", data: big })).toMatchObject({ ok: false, field: "data" });
    expect(readFile({ type: "image/jpeg", data: `data:image/jpeg;base64,${small}` })).toMatchObject({ ok: true });
  });

  it("counts decoded bytes from base64", () => {
    expect(base64Bytes(Buffer.alloc(10).toString("base64"))).toBe(10);
    expect(base64Bytes(Buffer.alloc(11).toString("base64"))).toBe(11);
    expect(base64Bytes(Buffer.alloc(12).toString("base64"))).toBe(12);
  });
});
