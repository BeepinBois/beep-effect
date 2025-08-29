import { BS } from "@beep/schema";
import type { UnsafeTypes } from "@beep/types";
import { getAt } from "@beep/utils";
import * as A from "effect/Array";
import * as Bool from "effect/Boolean";
import * as Effect from "effect/Effect";
import * as F from "effect/Function";
import * as Match from "effect/Match";
import * as Num from "effect/Number";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import type { Group } from "./Group";
import { FingerPrint } from "./internal";
import { normalize } from "./normalize";
import type { RootGroup } from "./RootGroup";
import type { Rule } from "./Rule";
import {
  ArrayLengthRule,
  ArrayValueRule,
  BooleanRule,
  DateRule,
  HasEntryRule,
  HasKeyRule,
  HasValueRule,
  NumberRule,
  StringRule,
  TypeRule,
} from "./rules";
import type { RootOrGroup } from "./types";
import { validate } from "./validate";

export type Runner = (value: unknown) => boolean;

type CacheEntry = { runner: Runner; fp: string };
const cache = new WeakMap<RootGroup.Type, CacheEntry>();

// Explicit cache invalidation (belt & suspenders for callers that mutate trees)
export function invalidatePrepared(root: RootGroup.Type): void {
  cache.delete(root);
}

function compileRule(rule: Rule.Type): Runner {
  // Pre-resolve a fast field accessor (direct key access)
  const get = (obj: Record<string, UnsafeTypes.UnsafeAny>) => getAt(obj, rule.field);

  return Match.value(rule).pipe(
    Match.withReturnType<((v: UnsafeTypes.UnsafeAny) => boolean) | boolean>(),
    Match.discriminatorsExhaustive("type")({
      string: (r) => (v: UnsafeTypes.UnsafeAny) =>
        F.pipe(get(v), (resolved) => (Str.isString(resolved) ? StringRule.validate(r, resolved) : false)),
      number: (r) => (v: UnsafeTypes.UnsafeAny) =>
        F.pipe(get(v), (resolved) => (Num.isNumber(resolved) ? NumberRule.validate(r, resolved) : false)),
      boolean: (r) => (v: UnsafeTypes.UnsafeAny) =>
        F.pipe(get(v), (resolved) => (Bool.isBoolean(resolved) ? BooleanRule.validate(r, resolved) : false)),
      arrayValue: (r) => (v: UnsafeTypes.UnsafeAny) =>
        F.pipe(get(v), (resolved) =>
          S.is(S.Union(BS.NonEmptyJsonArray, BS.JsonArray, BS.Json)) ? ArrayValueRule.validate(r, resolved) : false
        ),
      arrayLength: (r) => (v: UnsafeTypes.UnsafeAny) =>
        F.pipe(get(v), (resolved) => (A.isArray(resolved) ? ArrayLengthRule.validate(r, resolved) : false)),
      hasKey: (r) => (v: UnsafeTypes.UnsafeAny) =>
        F.pipe(get(v), (resolved) =>
          S.is(
            S.Record({
              key: S.String,
              value: BS.Json,
            })
          )
            ? HasKeyRule.validate(r, resolved)
            : false
        ),
      hasValue: (r) => (v: UnsafeTypes.UnsafeAny) =>
        F.pipe(get(v), (resolved) =>
          S.is(
            S.Record({
              key: S.String,
              value: BS.Json,
            })
          )
            ? HasValueRule.validate(r, resolved)
            : false
        ),
      hasEntry: (r) => (v: UnsafeTypes.UnsafeAny) =>
        F.pipe(get(v), (resolved) =>
          S.is(
            S.Record({
              key: S.String,
              value: BS.Json,
            })
          )
            ? HasEntryRule.validate(r, resolved)
            : false
        ),
      typeRule: (r) => (v: UnsafeTypes.UnsafeAny) => F.pipe(get(v), (resolved) => TypeRule.validate(r, resolved)),
      date: (r) => (v: UnsafeTypes.UnsafeAny) => F.pipe(get(v), (resolved) => DateRule.validate(r, resolved)),
    })
  );
}

function compileGroup(u: RootOrGroup): Runner {
  const children = u.rules.map((child) => (child.node === "group" ? compileGroup(child) : compileRule(child)));

  if (children.length === 0) {
    return () => true;
  }

  if (u.logicalOp === "and") {
    return (v: UnsafeTypes.UnsafeAny) => {
      for (let i = 0; i < children.length; i++) {
        if (!children[i]?.(v)) return false;
      }
      return true;
    };
  }

  // logicalOp === "or"
  return (v: UnsafeTypes.UnsafeAny) => {
    for (let i = 0; i < children.length; i++) {
      if (children[i]?.(v)) return true;
    }
    return false;
  };
}
export const prepare = Effect.fn("prepare")(function* (root: RootGroup.Type) {
  const cached = cache.get(root);
  const currentFp = FingerPrint.make(root);
  if (cached && cached.fp === currentFp) return cached.runner;

  const v = yield* validate(root);
  if (!v.isValid) {
    return yield* Effect.fail(new Error(v.reason));
  }

  // Normalize once for predictable structure; mutates in place.
  normalize(root);

  const runner = compileGroup(root);
  const entry: CacheEntry = { runner, fp: FingerPrint.make(root) };
  cache.set(root, entry);
  return entry.runner;
});

export const runPrepared = Effect.fn("runPrepared")(
  function* (root: RootGroup.Type, value: unknown) {
    const prepared = yield* prepare(root);
    return prepared(value);
  },
  (effect, root, value) =>
    effect.pipe(Effect.withSpan("runPrepared", { attributes: { root, value } }), Effect.annotateLogs({ root, value }))
);

// Internal export for in-package use (e.g., run.ts) to compile groups without
// validation or caching. Not re-exported from index.ts to keep public API clean.
export function createRunner(u: Group.Type | RootGroup.Type): Runner {
  return compileGroup(u);
}
