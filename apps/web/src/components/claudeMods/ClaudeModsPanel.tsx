import { useAtomValue } from "@effect/atom-react";
import { selectClaudeModPane } from "@t3tools/client-runtime/state/claude-mods";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ClaudeModAction, ClaudeModUiState, ScopedThreadRef } from "@t3tools/contracts";
import { T, useGT } from "gt-react";
import { BlocksIcon, XIcon } from "lucide-react";

import { cn } from "~/lib/utils";

import {
  claudeModEnvironment,
  useClaudeModPanePickStore,
  useClaudeModUi,
} from "../../state/claudeMods";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { ClaudeModTree, type ClaudeModTreeAction } from "./ClaudeModTree";

export function ClaudeModsPanel(props: { readonly threadRef: ScopedThreadRef }) {
  const state = useClaudeModUi(props.threadRef);
  const canAct = useAtomValue(
    claudeModEnvironment.act.permissionAtom(props.threadRef.environmentId),
  );
  const act = useAtomCommand(claudeModEnvironment.act, "claude mod action");
  return (
    <ClaudeModsPanelView
      threadKey={scopedThreadKey(props.threadRef)}
      state={state}
      canAct={canAct}
      onAction={(action) => {
        void act({
          environmentId: props.threadRef.environmentId,
          input: { threadId: props.threadRef.threadId, action },
        });
      }}
    />
  );
}

/** The panel without its subscription, so tests can drive it with a state. */
export function ClaudeModsPanelView(props: {
  readonly threadKey: string;
  readonly state: ClaudeModUiState;
  readonly canAct: boolean;
  readonly onAction: (action: ClaudeModAction) => void;
}) {
  const gt = useGT();
  const pickedId = useClaudeModPanePickStore((store) => store.byThreadKey[props.threadKey] ?? null);
  const { state, canAct, onAction } = props;
  const pane = selectClaudeModPane(state, pickedId);

  if (pane === null) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BlocksIcon />
          </EmptyMedia>
          <EmptyTitle>
            <T>No mod panes open in this thread</T>
          </EmptyTitle>
          <EmptyDescription>
            <T>Mods open panes when they run. Enable mods in Settings → Providers → Claude.</T>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const tree = state.trees[pane.id] ?? null;
  const onTreeAction = (action: ClaudeModTreeAction) =>
    onAction({ ...action, paneId: pane.id } as ClaudeModAction);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-claude-mods-panel>
      <div
        role="tablist"
        aria-label={gt("Mod panes")}
        className="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-2 py-1"
      >
        {state.panes.map((entry) => {
          const selected = entry.id === pane.id;
          return (
            <div
              key={entry.id}
              className={cn(
                "flex shrink-0 items-center gap-0.5 rounded-md pr-0.5",
                selected ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                className="cursor-pointer truncate px-2 py-1 text-xs hover:text-foreground"
                onClick={() => {
                  useClaudeModPanePickStore.getState().pick(props.threadKey, entry.id);
                  if (canAct) onAction({ type: "show", paneId: entry.id });
                }}
              >
                {entry.title}
              </button>
              <Button
                size="icon-micro"
                variant="ghost-muted"
                disabled={!canAct}
                aria-label={gt("Close {title}", { title: entry.title })}
                onClick={() => onAction({ type: "close", paneId: entry.id })}
              >
                <XIcon />
              </Button>
            </div>
          );
        })}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-auto p-3">
        {tree === null ? (
          <p className="text-muted-foreground text-xs">
            <T>This pane has nothing to show yet.</T>
          </p>
        ) : (
          <ClaudeModTree key={pane.id} tree={tree} canAct={canAct} onAction={onTreeAction} />
        )}
      </div>
      {state.statuses.length > 0 ? (
        <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 border-t px-3 py-1 text-muted-foreground text-xs">
          {state.statuses.map((status) => (
            <span key={status.plugin} className="truncate">
              {status.text}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
