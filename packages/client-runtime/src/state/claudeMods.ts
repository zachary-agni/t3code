import {
  type ClaudeModPane,
  type ClaudeModToast,
  type ClaudeModUiState,
  WS_METHODS,
} from "@t3tools/contracts";
import type { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

export function createClaudeModEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    /** The open thread's mod panes; a thread without a live Claude session streams the empty state. */
    ui: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:claude-mods:ui",
      tag: WS_METHODS.claudeModsSubscribe,
      idleTtlMs: 0,
    }),
    act: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:claude-mods:act",
      tag: WS_METHODS.claudeModsAct,
    }),
    /** Read from Settings only, where mods are switched on; rescanning on each visit is cheap. */
    list: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:claude-mods:list",
      tag: WS_METHODS.claudeModsList,
      staleTimeMs: 0,
      idleTtlMs: 0,
    }),
  };
}

/** The pane a mods panel shows: the client's pick while it is still open, else the CLI's. */
export function selectClaudeModPane(
  state: ClaudeModUiState,
  pickedId: string | null,
): ClaudeModPane | null {
  return (
    state.panes.find((pane) => pane.id === pickedId) ??
    state.panes.find((pane) => pane.id === state.shownId) ??
    state.panes[0] ??
    null
  );
}

/**
 * Toasts to show and the seq to remember after showing them. A client that has seen nothing yet
 * (`null`) shows none of the toasts already there, so opening a thread does not replay old ones.
 */
export function takeUnseenClaudeModToasts(
  toasts: ClaudeModUiState["toasts"],
  seenSeq: number | null,
): { readonly toasts: ReadonlyArray<ClaudeModToast>; readonly seenSeq: number } {
  let latest = Number.NEGATIVE_INFINITY;
  for (const toast of toasts) latest = Math.max(latest, toast.seq);
  if (seenSeq === null) return { toasts: [], seenSeq: latest };
  return {
    toasts: toasts.filter((toast) => toast.seq > seenSeq).sort((a, b) => a.seq - b.seq),
    seenSeq: Math.max(seenSeq, latest),
  };
}
