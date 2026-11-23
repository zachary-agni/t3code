import type { ClaudeModInfo } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

const decodePluginManifest = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({
      name: Schema.optional(Schema.String),
      version: Schema.optional(Schema.String),
      description: Schema.optional(Schema.String),
    }),
  ),
);

interface FoundMod {
  readonly info: ClaudeModInfo;
  readonly installed: boolean;
  readonly modifiedAt: number;
}

/**
 * Mods in `<home>/mods/*` and the authoring copies in `<home>/dev-mods/<group>/*`. A mod is a
 * plugin folder with a hooks module. One per name: the installed copy, else the newest dev copy.
 */
export const discoverClaudeMods = Effect.fn("discoverClaudeMods")(function* (
  claudeHome: string,
): Effect.fn.Return<ReadonlyArray<ClaudeModInfo>, never, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const children = (directory: string) =>
    fileSystem.readDirectory(directory).pipe(
      Effect.map((names) => names.map((name) => path.join(directory, name))),
      Effect.orElseSucceed((): ReadonlyArray<string> => []),
    );

  // Untraced: one per folder, inside discoverClaudeMods' span.
  const readMod = Effect.fnUntraced(function* (folder: string, installed: boolean) {
    const manifestPath = path.join(folder, ".claude-plugin", "plugin.json");
    const hasHooks = yield* fileSystem
      .exists(path.join(folder, "hooks", "hooks.json"))
      .pipe(Effect.orElseSucceed(() => false));
    if (!hasHooks) return undefined;
    const manifest = yield* fileSystem
      .readFileString(manifestPath)
      .pipe(Effect.flatMap(decodePluginManifest), Effect.option);
    if (Option.isNone(manifest)) return undefined;
    const name = manifest.value.name?.trim() || path.basename(folder);
    const modifiedAt = yield* fileSystem.stat(manifestPath).pipe(
      Effect.map((info) => Option.getOrUndefined(info.mtime)?.getTime() ?? 0),
      Effect.orElseSucceed(() => 0),
    );
    const { version, description } = manifest.value;
    return {
      info: {
        name,
        ...(version === undefined ? {} : { version }),
        ...(description === undefined ? {} : { description }),
        path: path.resolve(folder),
      },
      installed,
      modifiedAt,
    } satisfies FoundMod;
  });

  const installedFolders = yield* children(path.join(claudeHome, "mods"));
  const devFolders = (yield* Effect.forEach(
    yield* children(path.join(claudeHome, "dev-mods")),
    children,
  )).flat();
  const found = yield* Effect.forEach(
    [
      ...installedFolders.map((folder) => [folder, true] as const),
      ...devFolders.map((folder) => [folder, false] as const),
    ],
    ([folder, installed]) => readMod(folder, installed),
    { concurrency: 8 },
  );

  const byName = new Map<string, FoundMod>();
  for (const mod of found) {
    if (mod === undefined) continue;
    const current = byName.get(mod.info.name);
    const wins =
      current === undefined ||
      (mod.installed !== current.installed
        ? mod.installed
        : !mod.installed && mod.modifiedAt > current.modifiedAt);
    if (wins) byName.set(mod.info.name, mod);
  }
  return [...byName.values()]
    .map((mod) => mod.info)
    .toSorted((left, right) => left.name.localeCompare(right.name));
});
