import { createClaudeModEnvironmentAtoms } from "@t3tools/client-runtime/state/claude-mods";
import {
  type ClaudeModUiState,
  EMPTY_CLAUDE_MOD_UI_STATE,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { create } from "zustand";

import { connectionAtomRuntime } from "../connection/runtime";
import { useEnvironmentQuery } from "./query";

export const claudeModEnvironment = createClaudeModEnvironmentAtoms(connectionAtomRuntime);

/** The thread's mod panes, or null until the first state arrives; a null ref subscribes to nothing. */
export function useLoadedClaudeModUi(threadRef: ScopedThreadRef | null): ClaudeModUiState | null {
  return useEnvironmentQuery(
    threadRef === null
      ? null
      : claudeModEnvironment.ui({
          environmentId: threadRef.environmentId,
          input: { threadId: threadRef.threadId },
        }),
  ).data;
}

export function useClaudeModUi(threadRef: ScopedThreadRef | null): ClaudeModUiState {
  return useLoadedClaudeModUi(threadRef) ?? EMPTY_CLAUDE_MOD_UI_STATE;
}

/** The pane each thread's mods panel shows, picked here before the CLI echoes it back. */
export const useClaudeModPanePickStore = create<{
  readonly byThreadKey: Readonly<Record<string, string>>;
  readonly pick: (threadKey: string, paneId: string) => void;
}>((set) => ({
  byThreadKey: {},
  pick: (threadKey, paneId) =>
    set((state) =>
      state.byThreadKey[threadKey] === paneId
        ? state
        : { byThreadKey: { ...state.byThreadKey, [threadKey]: paneId } },
    ),
}));
