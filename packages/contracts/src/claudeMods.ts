import * as Schema from "effect/Schema";

import { ProviderInstanceId } from "./providerInstance.ts";
import { ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

// Claude Code mods draw through the CLI's remote-UI channel (ui_attach, ui_render,
// ui_press). T3 attaches as a `desktop` surface; trees are the CLI's own wire shape.

/** A handler on a drawn element. Handles change on every redraw. */
export const ClaudeModPress = Schema.Struct({
  plugin: Schema.String,
  handle: Schema.Int,
});
export type ClaudeModPress = typeof ClaudeModPress.Type;

export interface ClaudeModNode {
  readonly type: string;
  readonly props?: { readonly [key: string]: unknown } | undefined;
  readonly press?: ClaudeModPress | undefined;
  readonly children?: ReadonlyArray<string | ClaudeModNode> | undefined;
}

export const ClaudeModNode = Schema.Struct({
  type: Schema.String,
  props: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  press: Schema.optional(ClaudeModPress),
  children: Schema.optional(
    Schema.Array(
      Schema.Union([
        Schema.String,
        Schema.suspend((): Schema.Codec<ClaudeModNode> => ClaudeModNode),
      ]),
    ),
  ),
});

export const ClaudeModPane = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  plugin: Schema.String,
});
export type ClaudeModPane = typeof ClaudeModPane.Type;

export const ClaudeModToast = Schema.Struct({
  /** Increases per thread; a client shows each seq once. */
  seq: Schema.Int,
  plugin: Schema.String,
  text: Schema.String,
  timeoutMs: Schema.Int,
});
export type ClaudeModToast = typeof ClaudeModToast.Type;

export const ClaudeModStatus = Schema.Struct({
  plugin: Schema.String,
  text: Schema.String,
});
export type ClaudeModStatus = typeof ClaudeModStatus.Type;

/** Unpersisted mod UI of a thread's live Claude session. */
export const ClaudeModUiState = Schema.Struct({
  panes: Schema.Array(ClaudeModPane),
  shownId: Schema.NullOr(Schema.String),
  /** A mod asked for its pane to be brought forward (`$.ui.open({ focus: true })`). */
  focusRequestedId: Schema.NullOr(Schema.String),
  /** Latest drawing of each pane; null until drawn or when the mod draws nothing. */
  trees: Schema.Record(Schema.String, Schema.NullOr(ClaudeModNode)),
  statuses: Schema.Array(ClaudeModStatus),
  /** Most recent toasts only; older ones drop off. */
  toasts: Schema.Array(ClaudeModToast),
});
export type ClaudeModUiState = typeof ClaudeModUiState.Type;

export const EMPTY_CLAUDE_MOD_UI_STATE: ClaudeModUiState = {
  panes: [],
  shownId: null,
  focusRequestedId: null,
  trees: {},
  statuses: [],
  toasts: [],
};

export const ClaudeModSubscribeInput = Schema.Struct({
  threadId: ThreadId,
});
export type ClaudeModSubscribeInput = typeof ClaudeModSubscribeInput.Type;

export const ClaudeModAction = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("press"),
    paneId: Schema.String,
    press: ClaudeModPress,
    key: Schema.optional(Schema.String),
    /** A link pressed inside a Markdown element. */
    href: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("input"),
    paneId: Schema.String,
    press: ClaudeModPress,
    key: Schema.optional(Schema.String),
    kind: Schema.Literals(["change", "submit"]),
    value: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("select"),
    paneId: Schema.String,
    press: ClaudeModPress,
    key: Schema.optional(Schema.String),
    value: Schema.String,
  }),
  Schema.Struct({ type: Schema.Literal("show"), paneId: Schema.String }),
  Schema.Struct({ type: Schema.Literal("close"), paneId: Schema.String }),
  /** Accept (paneId) or refuse (null) the standing focus request. */
  Schema.Struct({ type: Schema.Literal("focus"), paneId: Schema.NullOr(Schema.String) }),
]);
export type ClaudeModAction = typeof ClaudeModAction.Type;

export const ClaudeModActInput = Schema.Struct({
  threadId: ThreadId,
  action: ClaudeModAction,
});
export type ClaudeModActInput = typeof ClaudeModActInput.Type;

export const ClaudeModRequestErrorReason = Schema.Literals([
  "provider-unsupported",
  "session-stopped",
  "request-failed",
]);
export type ClaudeModRequestErrorReason = typeof ClaudeModRequestErrorReason.Type;

export class ClaudeModRequestError extends Schema.TaggedError<ClaudeModRequestError>()(
  "ClaudeModRequestError",
  {
    reason: ClaudeModRequestErrorReason,
    detail: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    switch (this.reason) {
      case "provider-unsupported":
        return "This thread's provider does not run Claude Code mods.";
      case "session-stopped":
        return "The thread's Claude session is not running. Send a message to start it.";
      case "request-failed":
        return this.detail ?? "Claude Code refused the mod request.";
    }
  }
}

/** A mod folder found on the server's machine. */
export const ClaudeModInfo = Schema.Struct({
  name: TrimmedNonEmptyString,
  version: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  /** Absolute folder path; this is what `ClaudeSettings.mods` stores. */
  path: TrimmedNonEmptyString,
});
export type ClaudeModInfo = typeof ClaudeModInfo.Type;

export const ClaudeModListInput = Schema.Struct({
  instanceId: ProviderInstanceId,
});
export type ClaudeModListInput = typeof ClaudeModListInput.Type;

export const ClaudeModListResult = Schema.Struct({
  mods: Schema.Array(ClaudeModInfo),
});
export type ClaudeModListResult = typeof ClaudeModListResult.Type;
