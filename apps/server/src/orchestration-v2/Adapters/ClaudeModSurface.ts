import {
  ClaudeModNode,
  ClaudeModRequestError,
  EMPTY_CLAUDE_MOD_UI_STATE,
  type ClaudeModAction,
  type ClaudeModPane,
  type ClaudeModToast,
  type ClaudeModUiState,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";

import { field } from "../unknownField.ts";
import type { ClaudeAgentSdkQueryRunnerError } from "./ClaudeAdapterV2.ts";

// T3 attaches to Claude Code's remote-UI channel as one `desktop` surface per CLI process
// and draws every pane in the roster docked beside the chat.
const SURFACE = "desktop";
const CLIENT_ID = "t3";
const BODY_COLUMNS = 60;
const BODY_ROWS = 200;
const MAX_TOASTS = 5;
const UI_SURFACE_CAPABILITY = "ui_surface_v1";

export type ClaudeUiRequest = { readonly subtype: `ui_${string}`; readonly [key: string]: unknown };

export interface ClaudeModSurfaceOptions {
  /** Sends one ui_* control request and resolves to the CLI's response body. */
  readonly request:
    | ((request: ClaudeUiRequest) => Effect.Effect<unknown, ClaudeAgentSdkQueryRunnerError>)
    | undefined;
  readonly publish: (state: ClaudeModUiState) => Effect.Effect<void>;
  /** False once another process replaced this one; a replaced surface never publishes. */
  readonly isCurrent: Effect.Effect<boolean>;
  readonly scope: Scope.Scope;
}

export interface ClaudeModSurface {
  readonly isAttached: () => boolean;
  /** Attaches in the background after the CLI's init; an unsupported CLI leaves it off. */
  readonly start: (capabilities: ReadonlyArray<string> | undefined) => Effect.Effect<void>;
  /** Applies a ui_* system frame without waiting on the CLI. */
  readonly handleFrame: (message: unknown) => Effect.Effect<void>;
  readonly act: (action: ClaudeModAction) => Effect.Effect<void, ClaudeModRequestError>;
  /** Publishes the empty state for a process that ended. */
  readonly clear: Effect.Effect<void>;
}

const decodeNode = Schema.decodeUnknownOption(ClaudeModNode);

const stringField = (value: unknown, key: string): string | undefined => {
  const found = field(value, key);
  return typeof found === "string" ? found : undefined;
};
const nullableId = (value: unknown, key: string): string | null => {
  const found = stringField(value, key);
  return found === undefined || found.length === 0 ? null : found;
};

function readPanes(value: unknown): ReadonlyArray<ClaudeModPane> {
  const panes = field(value, "panes");
  if (!Array.isArray(panes)) return [];
  return panes.flatMap((pane) => {
    const id = stringField(pane, "id");
    if (id === undefined || id.length === 0) return [];
    const plugin = stringField(pane, "plugin") ?? id;
    return [{ id, title: stringField(pane, "title") ?? plugin, plugin }];
  });
}

/** The CLI's own text, unwrapped from the SDK runner error that carries it. */
function claudeUiErrorText(cause: unknown): string {
  let current = cause;
  for (let depth = 0; depth < 4; depth++) {
    if (
      current instanceof Error &&
      !Predicate.isTagged(current, "ClaudeAgentSdkQueryRunnerError")
    ) {
      return current.message;
    }
    const inner = field(current, "cause");
    if (inner === undefined) break;
    current = inner;
  }
  return typeof current === "string" ? current : "Claude Code refused the mod request.";
}

function isUnsupportedUiError(cause: unknown): boolean {
  let current = cause;
  for (let depth = 0; depth < 4 && current !== undefined; depth++) {
    if (field(current, "errorCode") === "unsupported_request") return true;
    current = field(current, "cause");
  }
  return /Unsupported control request subtype|does not handle control_request subtype|is not supported in this context/.test(
    claudeUiErrorText(cause),
  );
}

export function makeClaudeModSurface(options: ClaudeModSurfaceOptions): ClaudeModSurface {
  let attached = false;
  let started = false;
  let panes: ReadonlyArray<ClaudeModPane> = [];
  let shownId: string | null = null;
  let focusRequestedId: string | null = null;
  // The JSON is kept to drop redraws that changed nothing.
  const trees = new Map<string, { readonly node: ClaudeModNode | null; readonly json: string }>();
  const statuses = new Map<string, string>();
  let toasts: ReadonlyArray<ClaudeModToast> = [];
  let lastToastSeq = 0;
  let published: ClaudeModUiState = EMPTY_CLAUDE_MOD_UI_STATE;
  let dirty = false;
  // A pane being drawn queues at most one more draw; the latest invalidate wins.
  const rendering = new Map<string, { again: boolean }>();

  const snapshot = (): ClaudeModUiState => ({
    panes,
    shownId,
    focusRequestedId,
    trees: Object.fromEntries(panes.map((pane) => [pane.id, trees.get(pane.id)?.node ?? null])),
    statuses: [...statuses].map(([plugin, text]) => ({ plugin, text })),
    toasts,
  });

  const flush = Effect.gen(function* () {
    if (!dirty || !(yield* options.isCurrent)) return;
    dirty = false;
    published = snapshot();
    yield* options.publish(published);
  });

  const renderBody = (paneId: string) => {
    const pane = panes.find((candidate) => candidate.id === paneId);
    return {
      surface: SURFACE,
      client_id: CLIENT_ID,
      component: "Pane",
      instance_id: paneId,
      props: {
        title: pane?.title ?? paneId,
        isFocused: false,
        bodyColumns: BODY_COLUMNS,
        placement: "dock",
        scroll: { offset: 0, bodyRows: BODY_ROWS },
        view: {},
      },
    };
  };

  const applyDrawn = (paneId: string, drawn: unknown) => {
    if (!panes.some((pane) => pane.id === paneId)) return;
    const tree = field(drawn, "tree");
    const node =
      field(drawn, "hooked") === false || field(tree, "type") === "engine"
        ? null
        : Option.getOrNull(decodeNode(tree));
    const json = node === null ? "null" : JSON.stringify(node);
    if (trees.get(paneId)?.json === json) return;
    trees.set(paneId, { node, json });
    dirty = true;
  };

  // `start` and `act` never reach a request without a channel.
  const request = options.request ?? (() => Effect.die("Claude session has no mod UI channel."));

  // Untraced: draws follow every invalidate, and a span per draw would only add noise.
  const renderLoop = Effect.fnUntraced(function* (paneId: string, slot: { again: boolean }) {
    do {
      slot.again = false;
      if (!panes.some((pane) => pane.id === paneId)) return;
      const drawn = yield* request({ subtype: "ui_render", ...renderBody(paneId) }).pipe(
        Effect.catch((cause) =>
          Effect.logDebug("orchestration-v2.claude-mod-render-failed", { paneId, cause }).pipe(
            Effect.as(undefined),
          ),
        ),
      );
      if (drawn !== undefined) applyDrawn(paneId, drawn);
      yield* flush;
    } while (slot.again);
  });

  const render = (paneId: string) =>
    Effect.suspend(() => {
      const running = rendering.get(paneId);
      if (running !== undefined) {
        running.again = true;
        return Effect.void;
      }
      const slot = { again: false };
      rendering.set(paneId, slot);
      return renderLoop(paneId, slot).pipe(
        Effect.ensuring(Effect.sync(() => rendering.delete(paneId))),
        Effect.forkIn(options.scope),
        Effect.asVoid,
      );
    });

  const applyRoster = (roster: unknown) => {
    const previous = new Map(panes.map((pane) => [pane.id, pane]));
    const next = readPanes(roster);
    const nextShown = nullableId(roster, "shown_id");
    const nextFocusRequested = nullableId(roster, "focus_requested_id");
    const rosterChanged =
      next.length !== panes.length ||
      next.some((pane, index) => {
        const current = panes[index];
        return (
          current === undefined ||
          current.id !== pane.id ||
          current.title !== pane.title ||
          current.plugin !== pane.plugin
        );
      });
    if (rosterChanged || nextShown !== shownId || nextFocusRequested !== focusRequestedId) {
      dirty = true;
    }
    panes = rosterChanged ? next : panes;
    shownId = nextShown;
    focusRequestedId = nextFocusRequested;
    for (const paneId of trees.keys()) {
      if (!panes.some((pane) => pane.id === paneId)) trees.delete(paneId);
    }
    // New panes, and panes whose title (a render prop) changed, need a drawing.
    return panes
      .filter((pane) => previous.get(pane.id)?.title !== pane.title)
      .map((pane) => pane.id);
  };

  const renderAll = (paneIds: ReadonlyArray<string>) =>
    attached ? Effect.forEach(paneIds, render, { discard: true }) : Effect.void;

  const handleFrame = (message: unknown) =>
    Effect.suspend(() => {
      if (field(message, "type") !== "system") return Effect.void;
      switch (field(message, "subtype")) {
        case "ui_panes": {
          const changed = applyRoster(message);
          return renderAll(changed).pipe(Effect.andThen(flush));
        }
        case "ui_invalidate": {
          const instances = field(message, "instances");
          const named = Array.isArray(instances)
            ? instances.flatMap((instance) =>
                field(instance, "component") === "Pane"
                  ? [stringField(instance, "instance_id") ?? ""]
                  : [],
              )
            : panes.map((pane) => pane.id);
          return renderAll(named.filter((id) => panes.some((pane) => pane.id === id)));
        }
        case "ui_toast": {
          const plugin = stringField(message, "plugin");
          const text = stringField(message, "text");
          if (plugin === undefined || text === undefined) return Effect.void;
          const timeout = field(message, "timeout_ms");
          return Clock.currentTimeMillis.pipe(
            Effect.flatMap((now) => {
              // Clock-based, so a toast from a replacement process never reuses a seq.
              lastToastSeq = Math.max(lastToastSeq + 1, Math.floor(now));
              toasts = [
                ...toasts,
                {
                  seq: lastToastSeq,
                  plugin,
                  text,
                  timeoutMs:
                    typeof timeout === "number" && Number.isInteger(timeout) ? timeout : 4000,
                },
              ].slice(-MAX_TOASTS);
              dirty = true;
              return flush;
            }),
          );
        }
        case "ui_status": {
          const plugin = stringField(message, "plugin");
          if (plugin === undefined) return Effect.void;
          const text = stringField(message, "text");
          if (text === undefined ? !statuses.has(plugin) : statuses.get(plugin) === text) {
            return Effect.void;
          }
          if (text === undefined) statuses.delete(plugin);
          else statuses.set(plugin, text);
          dirty = true;
          return flush;
        }
        default:
          return Effect.void;
      }
    });

  const attach = Effect.gen(function* () {
    const attachResult = yield* request({
      subtype: "ui_attach",
      surface: SURFACE,
      client_id: CLIENT_ID,
      viewport: { columns: BODY_COLUMNS, rows: 40, isFullscreen: true },
      answers: [],
      draws: ["Input", "Select", "Progress"],
    }).pipe(Effect.result);
    if (attachResult._tag === "Failure") {
      if (!isUnsupportedUiError(attachResult.failure)) {
        yield* Effect.logWarning("orchestration-v2.claude-mod-attach-failed", {
          cause: attachResult.failure,
        });
      }
      return;
    }
    attached = true;
    const roster = yield* request({ subtype: "ui_panes", client_id: CLIENT_ID }).pipe(
      Effect.catch((cause) =>
        Effect.logWarning("orchestration-v2.claude-mod-roster-failed", { cause }).pipe(
          Effect.as(undefined),
        ),
      ),
    );
    if (roster !== undefined) applyRoster(roster);
    yield* renderAll(panes.map((pane) => pane.id));
    yield* flush;
  });

  const fail = (cause: unknown) =>
    new ClaudeModRequestError({
      reason: "request-failed",
      detail: claudeUiErrorText(cause),
      cause,
    });

  // Untraced: the adapter's `claudeMods.act` span covers it.
  const act = Effect.fnUntraced(function* (action: ClaudeModAction) {
    if (!attached) {
      return yield* new ClaudeModRequestError({
        reason: "request-failed",
        detail: "This Claude Code session does not serve mod panes.",
      });
    }
    const send = (body: ClaudeUiRequest) => request(body).pipe(Effect.mapError(fail));
    switch (action.type) {
      case "press": {
        const reply = yield* send({
          subtype: "ui_press",
          plugin: action.press.plugin,
          handle: action.press.handle,
          ...(action.key === undefined ? {} : { key: action.key }),
          ...(action.href === undefined ? {} : { href: action.href }),
          surface: SURFACE,
          client_id: CLIENT_ID,
          render: renderBody(action.paneId),
        });
        const drawn = field(reply, "drawn");
        if (drawn !== undefined) applyDrawn(action.paneId, drawn);
        // A stale handle ran nothing; redraw so the next press uses a live one.
        if (field(reply, "handled") === false) yield* render(action.paneId);
        return yield* flush;
      }
      case "input":
      case "select":
        yield* send({
          subtype: action.type === "input" ? "ui_input" : "ui_select",
          plugin: action.press.plugin,
          handle: action.press.handle,
          ...(action.type === "input" ? { kind: action.kind } : {}),
          value: action.value,
          ...(action.key === undefined ? {} : { key: action.key }),
          component: "Pane",
          instance_id: action.paneId,
          surface: SURFACE,
          client_id: CLIENT_ID,
        });
        return;
      case "show": {
        const reply = yield* send({
          subtype: "ui_pane_show",
          id: action.paneId,
          surface: SURFACE,
          client_id: CLIENT_ID,
        });
        const nextShown = nullableId(reply, "shown_id");
        if (nextShown !== shownId) {
          shownId = nextShown;
          dirty = true;
        }
        return yield* flush;
      }
      case "close":
        yield* send({ subtype: "ui_close", id: action.paneId, client_id: CLIENT_ID });
        return;
      case "focus":
        yield* send({
          subtype: "ui_pane_focus",
          id: action.paneId,
          surface: SURFACE,
          client_id: CLIENT_ID,
        });
        return;
    }
  });

  return {
    isAttached: () => attached,
    start: (capabilities) =>
      Effect.suspend(() => {
        if (
          started ||
          options.request === undefined ||
          (capabilities !== undefined && !capabilities.includes(UI_SURFACE_CAPABILITY))
        ) {
          return Effect.void;
        }
        started = true;
        return attach.pipe(Effect.forkIn(options.scope), Effect.asVoid);
      }),
    handleFrame,
    act,
    clear: Effect.suspend(() =>
      published === EMPTY_CLAUDE_MOD_UI_STATE
        ? Effect.void
        : Effect.sync(() => {
            published = EMPTY_CLAUDE_MOD_UI_STATE;
          }).pipe(Effect.andThen(options.publish(EMPTY_CLAUDE_MOD_UI_STATE))),
    ),
  };
}
