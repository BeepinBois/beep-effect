import type { UnsafeTypes } from "@beep/types";
import * as Effect from "effect/Effect";
import * as S from "effect/Schema";
import { Group } from "./Group";
import { createRunner, prepare } from "./prepare";
import type { RootOrGroup } from "./types";
/**
 * Run the rules engine against a value.
 * @export
 * @param {RootOrRuleGroup} group
 * @param {*} value
 * @return {*}  {boolean}
 */
export const run = Effect.fn("run")(
  function* (group: RootOrGroup, value: UnsafeTypes.UnsafeAny) {
    // Root groups: reuse prepare() for validation, normalization, and cached runner.
    if (group.node === "root") {
      const runner = yield* prepare(group);
      return runner(value);
    }

    // Nested groups: validate once per call, then compile and run.
    const validated = yield* Effect.flatMap(S.encode(Group)(group), S.decode(Group));
    const runner = createRunner(validated);
    return yield* Effect.succeed(runner(value));
  },
  (effect, group, value) =>
    effect.pipe(Effect.withSpan("run", { attributes: { group, value } }), Effect.annotateLogs({ group, value }))
);
