import { EMPTY_CLAUDE_MOD_UI_STATE } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { selectClaudeModPane, takeUnseenClaudeModToasts } from "./claudeMods.ts";

const panes = [
  { id: "a", title: "A", plugin: "p" },
  { id: "b", title: "B", plugin: "p" },
];

describe("selectClaudeModPane", () => {
  it("prefers the local pick, then the CLI's shown pane, then the first", () => {
    const state = { ...EMPTY_CLAUDE_MOD_UI_STATE, panes, shownId: "b" };
    expect(selectClaudeModPane(state, "a")?.id).toBe("a");
    expect(selectClaudeModPane(state, "closed")?.id).toBe("b");
    expect(selectClaudeModPane({ ...state, shownId: null }, null)?.id).toBe("a");
    expect(selectClaudeModPane(EMPTY_CLAUDE_MOD_UI_STATE, "a")).toBeNull();
  });
});

describe("takeUnseenClaudeModToasts", () => {
  const toast = (seq: number) => ({ seq, plugin: "p", text: `t${seq}`, timeoutMs: 0 });

  it("does not replay toasts already there when a thread is first seen", () => {
    const first = takeUnseenClaudeModToasts([toast(3), toast(4)], null);
    expect(first.toasts).toEqual([]);
    const next = takeUnseenClaudeModToasts([toast(4), toast(6), toast(5)], first.seenSeq);
    expect(next.toasts.map((entry) => entry.seq)).toEqual([5, 6]);
    expect(takeUnseenClaudeModToasts([toast(6)], next.seenSeq).toasts).toEqual([]);
  });

  it("shows the first toast of a thread that had none", () => {
    const first = takeUnseenClaudeModToasts([], null);
    expect(takeUnseenClaudeModToasts([toast(0)], first.seenSeq).toasts).toEqual([toast(0)]);
  });
});
