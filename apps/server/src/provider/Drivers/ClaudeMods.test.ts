import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { discoverClaudeMods } from "./ClaudeMods.ts";

const writeMod = Effect.fn(function* (
  folder: string,
  manifest: string,
  options?: { readonly hooks?: boolean; readonly modifiedAtSeconds?: number },
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(path.join(folder, ".claude-plugin"), { recursive: true });
  const manifestPath = path.join(folder, ".claude-plugin", "plugin.json");
  yield* fs.writeFileString(manifestPath, manifest);
  if (options?.hooks !== false) {
    yield* fs.makeDirectory(path.join(folder, "hooks"), { recursive: true });
    yield* fs.writeFileString(path.join(folder, "hooks", "hooks.json"), "{}");
  }
  if (options?.modifiedAtSeconds !== undefined) {
    yield* fs.utimes(manifestPath, options.modifiedAtSeconds, options.modifiedAtSeconds);
  }
});

it.layer(NodeServices.layer)("discoverClaudeMods", (it) => {
  it.effect("lists one copy per mod: installed first, else the newest dev copy", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: "t3-claude-mods-" });
      const installedUsage = path.join(home, "mods", "usage");
      yield* writeMod(installedUsage, '{"name":"usage","version":"1.0.0"}');
      yield* writeMod(path.join(home, "dev-mods", "me", "usage"), '{"name":"usage"}', {
        modifiedAtSeconds: 2_000_000_000,
      });
      const olderTheme = path.join(home, "dev-mods", "me", "theme");
      const newerTheme = path.join(home, "dev-mods", "team", "theme-next");
      yield* writeMod(olderTheme, '{"name":"theme","version":"0.1.0"}', {
        modifiedAtSeconds: 1_000_000_000,
      });
      yield* writeMod(newerTheme, '{"name":"theme","version":"0.2.0","description":"Dark"}', {
        modifiedAtSeconds: 1_500_000_000,
      });
      // A plugin without a hooks module is not a mod; a broken manifest is skipped.
      yield* writeMod(path.join(home, "mods", "skills-only"), '{"name":"skills-only"}', {
        hooks: false,
      });
      yield* writeMod(path.join(home, "mods", "broken"), "{not json");
      // No name falls back to the folder name.
      yield* writeMod(path.join(home, "mods", "anonymous"), "{}");

      const mods = yield* discoverClaudeMods(home);
      assert.deepEqual(mods, [
        { name: "anonymous", path: path.resolve(home, "mods", "anonymous") },
        { name: "theme", version: "0.2.0", description: "Dark", path: path.resolve(newerTheme) },
        { name: "usage", version: "1.0.0", path: path.resolve(installedUsage) },
      ]);
    }),
  );

  it.effect("lists nothing for a home without mods", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: "t3-claude-mods-empty-" });
      assert.deepEqual(yield* discoverClaudeMods(home), []);
    }),
  );
});
