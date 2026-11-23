import { takeUnseenClaudeModToasts } from "@t3tools/client-runtime/state/claude-mods";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EMPTY_CLAUDE_MOD_UI_STATE, type ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import { useRightPanelStore } from "../../rightPanelStore";
import {
  claudeModEnvironment,
  useClaudeModPanePickStore,
  useLoadedClaudeModUi,
} from "../../state/claudeMods";
import { useAtomCommand } from "../../state/use-atom-command";
import { stackedThreadToast, toastManager } from "../ui/toast";

/**
 * The open thread's mod panes: whether it has any, and the CLI's asks that reach past the panel
 * (focus requests and toasts). Mount once, for the thread on screen.
 */
export function useClaudeModPanes(input: {
  readonly threadRef: ScopedThreadRef | null;
  /** Only a Claude thread runs mods; others never subscribe. */
  readonly enabled: boolean;
  /** The mods tab is the panel's visible surface. */
  readonly modsVisible: boolean;
}) {
  const { threadRef, enabled, modsVisible } = input;
  const loaded = useLoadedClaudeModUi(enabled ? threadRef : null);
  const state = loaded ?? EMPTY_CLAUDE_MOD_UI_STATE;
  const act = useAtomCommand(claudeModEnvironment.act, { reportFailure: false });
  const threadKey = threadRef === null ? null : scopedThreadKey(threadRef);
  const handledFocusRequest = useRef<{ threadKey: string | null; id: string | null }>({
    threadKey: null,
    id: null,
  });
  const acceptedFocus = useRef(false);
  const seenToastSeq = useRef<{ threadKey: string | null; seq: number | null }>({
    threadKey: null,
    seq: null,
  });

  const focusRequestedId = state.focusRequestedId;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- answers the CLI's focus request for a pane by showing it in the right panel
  useEffect(() => {
    if (threadRef === null || threadKey === null) return;
    const handled = handledFocusRequest.current;
    if (handled.threadKey === threadKey && handled.id === focusRequestedId) return;
    handledFocusRequest.current = { threadKey, id: focusRequestedId };
    if (focusRequestedId === null) return;
    useClaudeModPanePickStore.getState().pick(threadKey, focusRequestedId);
    useRightPanelStore.getState().open(threadRef, "mods");
    acceptedFocus.current = true;
    void act({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, action: { type: "focus", paneId: focusRequestedId } },
    });
  }, [act, focusRequestedId, threadKey, threadRef]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- tells the CLI the keyboard left a pane it focused once its panel closes
  useEffect(() => {
    if (modsVisible || !acceptedFocus.current || threadRef === null) return;
    acceptedFocus.current = false;
    void act({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, action: { type: "focus", paneId: null } },
    });
  }, [act, modsVisible, threadRef]);

  const toasts = loaded?.toasts ?? null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- shows each mod toast the server streams exactly once
  useEffect(() => {
    if (toasts === null) return;
    const seen = seenToastSeq.current;
    const result = takeUnseenClaudeModToasts(
      toasts,
      seen.threadKey === threadKey ? seen.seq : null,
    );
    seenToastSeq.current = { threadKey, seq: result.seenSeq };
    for (const toast of result.toasts) {
      toastManager.add(
        stackedThreadToast({
          type: "info",
          title: toast.plugin,
          description: toast.text,
          ...(toast.timeoutMs > 0 ? { timeout: toast.timeoutMs } : {}),
        }),
      );
    }
  }, [toasts, threadKey]);

  return {
    hasPanes: state.panes.length > 0,
    open: () => {
      if (threadRef !== null) useRightPanelStore.getState().open(threadRef, "mods");
    },
    toggle: () => {
      if (threadRef !== null) useRightPanelStore.getState().toggle(threadRef, "mods");
    },
  };
}
