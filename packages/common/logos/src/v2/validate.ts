import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import * as O from "effect/Option";
import * as ParseResult from "effect/ParseResult";
import * as S from "effect/Schema";
import { RootGroup } from "./RootGroup";
/**
 * Validates a root group before running it.
 * @export
 * @param {RootGroup} root
 * @return {*}  {({ isValid: true } | { isValid: false; reason: string })}
 */
export const validate = Effect.fn("validate")(
  function* (root: RootGroup.Type) {
    const validated = S.encodeEither(RootGroup)(root);
    if (Either.isLeft(validated)) {
      return {
        isValid: false,
        reason: Either.getLeft(validated).pipe((i) =>
          O.isSome(i) ? ParseResult.ArrayFormatter.formatErrorSync(i.value).join("\n") : "Unknown error"
        ),
      } as const;
    }

    return yield* Effect.succeed({ isValid: true } as const);
  },
  (effect, n) =>
    effect.pipe(Effect.withSpan("validate", { attributes: { params: n } }), Effect.annotateLogs({ params: n }))
);
