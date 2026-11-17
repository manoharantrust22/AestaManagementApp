import { describe, expect, it } from "vitest";
import {
  composeText,
  fromHubPriority,
  fromHubSize,
  fromHubStatus,
  hubCommentsToUpdates,
  hubPhotosToAttachments,
  hubTaskToTask,
  statusChangeAction,
  toHubPriority,
  toHubSize,
  toHubStatus,
} from "./mapping";
import type { HubTaskDetail } from "./types";

const ME = "8f1c0000-0000-4000-8000-000000000001";
const HARI = "1a2b0000-0000-4000-8000-000000000002";

const detail = (over: Partial<HubTaskDetail> = {}): HubTaskDetail => ({
  id: "0b9c0000-0000-4000-8000-0000000000aa",
  title: "Count the cement bags",
  notes: "Before the truck comes",
  status: "doing",
  checkAsked: false,
  priority: "normal",
  size: "short",
  dueDate: "2026-11-15",
  dueTime: null,
  owner: { externalId: ME, name: "Ajit Kumar" },
  givenBy: { externalId: HARI, name: "Hari" },
  checker: null,
  waitingOn: null,
  waitingReason: null,
  proofRequired: false,
  checklist: [],
  page: { url: "https://app.aesta.co.in/site/materials/hub?site=s1", title: "Materials hub", siteId: "s1", siteName: "Anna Nagar" },
  createdAt: "2026-11-14T04:00:00.000Z",
  updatedAt: "2026-11-14T05:00:00.000Z",
  doneAt: null,
  comments: [],
  photos: [],
  time: null,
  ...over,
});

describe("the words", () => {
  it("status: in_progress ↔ doing, blocked ↔ waiting, the rest the same", () => {
    expect(toHubStatus("in_progress")).toBe("doing");
    expect(toHubStatus("blocked")).toBe("waiting");
    expect(fromHubStatus("doing")).toBe("in_progress");
    expect(fromHubStatus("waiting")).toBe("blocked");
    for (const s of ["todo", "done", "cancelled"] as const) {
      expect(toHubStatus(s)).toBe(s);
      expect(fromHubStatus(s)).toBe(s);
    }
  });

  it("priority: medium ↔ normal", () => {
    expect(toHubPriority("medium")).toBe("normal");
    expect(fromHubPriority("normal")).toBe("medium");
    expect(toHubPriority("high")).toBe("high");
    expect(fromHubPriority("low")).toBe("low");
  });

  it("size: small → short, medium → half, large → big (and back; quick counts as small)", () => {
    expect(toHubSize("small")).toBe("short");
    expect(toHubSize("medium")).toBe("half");
    expect(toHubSize("large")).toBe("big");
    expect(fromHubSize("short")).toBe("small");
    expect(fromHubSize("half")).toBe("medium");
    expect(fromHubSize("big")).toBe("large");
    expect(fromHubSize("quick")).toBe("small");
    expect(fromHubSize(null)).toBe("small");
  });
});

describe("hubTaskToTask", () => {
  it("turns a hub task into Aesta's Task", () => {
    const t = hubTaskToTask(detail());
    expect(t).toMatchObject({
      title: "Count the cement bags",
      description: "Before the truck comes",
      status: "in_progress",
      priority: "medium",
      size: "small",
      assignee_id: ME,
      created_by: HARI,
      due_date: "2026-11-15",
      source: "manual",
      site_id: "s1",
      site: { id: "s1", name: "Anna Nagar" },
      assignee: { id: ME, name: "Ajit Kumar" },
      creator: { id: HARI, name: "Hari" },
    });
    expect(t.context.url).toBe("https://app.aesta.co.in/site/materials/hub?site=s1");
  });

  it("a self-made task has the owner as creator", () => {
    const t = hubTaskToTask(detail({ givenBy: null }));
    expect(t.created_by).toBe(ME);
  });

  it("a waiting task shows its reason (or who it waits on) as the blocker", () => {
    expect(hubTaskToTask(detail({ status: "waiting", waitingReason: "No cement" })).blocker_note).toBe("No cement");
    expect(
      hubTaskToTask(detail({ status: "waiting", waitingOn: { externalId: HARI, name: "Hari" } })).blocker_note,
    ).toBe("Waiting on Hari");
  });

  it("a 🐞 title is a bug report, shown without the bug", () => {
    const t = hubTaskToTask(detail({ title: "🐞 Save button does nothing" }));
    expect(t.source).toBe("bug_report");
    expect(t.title).toBe("Save button does nothing");
    expect(t.category).toBe("app");
  });

  it("someone at Neram not linked in Aesta keeps their name", () => {
    const t = hubTaskToTask(detail({ givenBy: { externalId: null, name: "Priya" } }));
    expect(t.creator).toEqual({ id: "neram:Priya", name: "Priya" });
  });
});

describe("comments and photos", () => {
  it("comments become the update thread, oldest first", () => {
    const ups = hubCommentsToUpdates(
      detail({
        comments: [
          { id: "c2", by: { externalId: ME, name: "Ajit Kumar" }, text: "Done counting", at: "2026-11-14T06:00:00Z" },
          { id: "c1", by: null, text: "Truck came at 4.", at: "2026-11-14T05:30:00Z" },
        ],
      }),
    );
    expect(ups.map((u) => u.id)).toEqual(["c1", "c2"]);
    expect(ups[1]).toMatchObject({ kind: "comment", body: "Done counting", author: { id: ME, name: "Ajit Kumar" } });
    expect(ups[0].author).toBeNull();
  });

  it("photos become task attachments with their signed links", () => {
    const atts = hubPhotosToAttachments(detail({ photos: [{ name: "bags.jpg", url: "https://x/bags.jpg" }] }));
    expect(atts).toEqual([
      expect.objectContaining({ kind: "photo", update_id: null, url: "https://x/bags.jpg", storage_path: "bags.jpg" }),
    ]);
  });
});

describe("status changes → hub actions", () => {
  it("maps every change made on Aesta's screens", () => {
    expect(statusChangeAction("todo", "in_progress", null)).toEqual({ action: "start" });
    expect(statusChangeAction("blocked", "in_progress", null)).toEqual({ action: "start" });
    expect(statusChangeAction("in_progress", "done", "All 40 bags")).toEqual({ action: "done", note: "All 40 bags" });
    expect(statusChangeAction("in_progress", "done", null)).toEqual({ action: "done" });
    expect(statusChangeAction("todo", "blocked", "No cement")).toEqual({ action: "waiting", reason: "No cement" });
    expect(statusChangeAction("done", "todo", null)).toEqual({ action: "put_back" });
    expect(statusChangeAction("todo", "cancelled", null)).toEqual({ action: "cancel", reason: "other" });
  });
});

describe("composeText (voice → words for the hub)", () => {
  it("sends the English transcript, keeping the Tamil original when it differs", () => {
    expect(composeText({ transcript: "சிமெண்ட் வந்தது", transcriptEn: "Cement arrived" })).toBe(
      "Cement arrived\n(Tamil: சிமெண்ட் வந்தது)",
    );
  });

  it("puts typed text first and the spoken words after it", () => {
    expect(composeText({ typed: "Checked", transcriptEn: "Truck came at 4" })).toBe("Checked\n🎤 Truck came at 4");
  });

  it("is empty when there is nothing", () => {
    expect(composeText({})).toBe("");
    expect(composeText({ typed: "  " })).toBe("");
  });
});
