import type { ClaudeModInfo, EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import { T, useGT } from "gt-react";

import { claudeModEnvironment } from "../../state/claudeMods";
import { useEnvironmentQuery } from "../../state/query";
import { Switch } from "../ui/switch";
import { SettingsRow } from "./settingsLayout";

/** Read the enabled mod folders out of a Claude instance's untyped config. */
export function readClaudeMods(config: unknown): ReadonlyArray<string> {
  if (config === null || typeof config !== "object") return [];
  const mods = (config as { mods?: unknown }).mods;
  return Array.isArray(mods)
    ? mods.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function ClaudeModsSection(props: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly enabledPaths: ReadonlyArray<string>;
  readonly readOnly: boolean;
  readonly onChange: (paths: ReadonlyArray<string>) => void;
}) {
  const gt = useGT();
  const query = useEnvironmentQuery(
    claudeModEnvironment.list({
      environmentId: props.environmentId,
      input: { instanceId: props.instanceId },
    }),
  );
  return (
    <SettingsRow
      title={gt("Mods")}
      description={gt(
        "Claude Code mods can draw panes beside the chat. Changes apply to new Claude sessions.",
      )}
    >
      <ClaudeModsList
        mods={query.data?.mods ?? null}
        error={query.error}
        enabledPaths={props.enabledPaths}
        readOnly={props.readOnly}
        onChange={props.onChange}
      />
    </SettingsRow>
  );
}

function ClaudeModsList(props: {
  /** Null while the list loads. */
  readonly mods: ReadonlyArray<ClaudeModInfo> | null;
  readonly error: string | null;
  readonly enabledPaths: ReadonlyArray<string>;
  readonly readOnly: boolean;
  readonly onChange: (paths: ReadonlyArray<string>) => void;
}) {
  const gt = useGT();
  if (props.error !== null) {
    return <p className="mt-2 text-destructive-foreground text-xs">{props.error}</p>;
  }
  if (props.mods === null) return null;
  if (props.mods.length === 0) {
    return (
      <p className="mt-2 text-muted-foreground text-xs">
        <T>No mods found in ~/.claude/mods or ~/.claude/dev-mods.</T>
      </p>
    );
  }
  const enabled = new Set(props.enabledPaths);
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {props.mods.map((mod) => (
        <li key={mod.path} className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-sm">
              {mod.name}
              {mod.version ? (
                <span className="ml-1.5 font-normal text-muted-foreground text-xs">
                  {mod.version}
                </span>
              ) : null}
            </span>
            {mod.description ? (
              <span className="text-muted-foreground text-xs">{mod.description}</span>
            ) : null}
            <span className="break-all font-mono text-2xs text-muted-foreground">{mod.path}</span>
          </div>
          <Switch
            size="sm"
            checked={enabled.has(mod.path)}
            disabled={props.readOnly}
            aria-label={gt("Enable {name}", { name: mod.name })}
            onCheckedChange={(checked) =>
              props.onChange(
                checked
                  ? [...props.enabledPaths.filter((path) => path !== mod.path), mod.path]
                  : props.enabledPaths.filter((path) => path !== mod.path),
              )
            }
          />
        </li>
      ))}
    </ul>
  );
}
