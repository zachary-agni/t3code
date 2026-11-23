import {
  ClaudeModRequestError,
  type ClaudeModActInput,
  type ClaudeModListInput,
  type ClaudeModListResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as ProviderSessionManager from "../orchestration-v2/ProviderSessionManager.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";

/** Acts on a thread's live Claude mod panes without starting a session. */
export class ClaudeModRequests extends Context.Service<
  ClaudeModRequests,
  {
    readonly act: (input: ClaudeModActInput) => Effect.Effect<void, ClaudeModRequestError>;
    readonly list: (
      input: ClaudeModListInput,
    ) => Effect.Effect<ClaudeModListResult, ClaudeModRequestError>;
  }
>()("t3/claudeMods/ClaudeModRequests") {}

const make = Effect.gen(function* () {
  const threadManagement = yield* ThreadManagementService.ThreadManagementService;
  const providerSessions = yield* ProviderSessionManager.ProviderSessionManagerV2;
  const providerInstances = yield* ProviderInstanceRegistry.ProviderInstanceRegistry;

  const requestFailed = (cause: unknown) =>
    new ClaudeModRequestError({ reason: "request-failed", cause });

  const act = Effect.fn("ClaudeModRequests.act")(function* (input: ClaudeModActInput) {
    yield* Effect.annotateCurrentSpan({ "orchestration_v2.thread_id": input.threadId });
    const projection = yield* threadManagement
      .getThreadRecords(input.threadId, ["providerThreads"])
      .pipe(Effect.mapError(requestFailed));
    const providerThread =
      projection.providerThreads.find(
        (candidate) => candidate.id === projection.thread.activeProviderThreadId,
      ) ?? projection.providerThreads.at(-1);
    if (providerThread?.providerSessionId == null) {
      return yield* new ClaudeModRequestError({ reason: "session-stopped" });
    }
    const runtime = Option.getOrUndefined(
      yield* providerSessions
        .get(providerThread.providerSessionId)
        .pipe(Effect.mapError(requestFailed)),
    );
    if (runtime === undefined) {
      return yield* new ClaudeModRequestError({ reason: "session-stopped" });
    }
    if (runtime.claudeMods === undefined) {
      return yield* new ClaudeModRequestError({ reason: "provider-unsupported" });
    }
    return yield* runtime.claudeMods.act({ providerThread, action: input.action });
  });

  const list = Effect.fn("ClaudeModRequests.list")(function* (input: ClaudeModListInput) {
    const instance = yield* providerInstances.getInstance(input.instanceId);
    if (instance?.listClaudeMods === undefined) {
      return yield* new ClaudeModRequestError({ reason: "provider-unsupported" });
    }
    return { mods: yield* instance.listClaudeMods };
  });

  return ClaudeModRequests.of({ act, list });
});

export const layer = Layer.effect(ClaudeModRequests, make);
