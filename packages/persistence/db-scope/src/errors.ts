import chalk from "chalk";
import * as A from "effect/Array";
import * as F from "effect/Function";
import * as Match from "effect/Match";
import * as O from "effect/Option";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import * as Struct from "effect/Struct";
import * as pg from "pg";
import * as sqlFormatter from "sql-formatter";

export class DbConnectionLostError extends S.TaggedError<DbConnectionLostError>("DbConnectionLostError")(
  "DbConnectionLostError",
  {
    cause: S.Unknown,
    message: S.String,
  }
) {}

export const DbErrorType = S.Literal("unique_violation", "foreign_key_violation", "connection_error");

export const DbErrorCause = S.instanceOf(pg.DatabaseError);

export class DbError extends S.TaggedError<DbError>("DbError")("DbError", {
  type: DbErrorType,
  cause: DbErrorCause,
}) {
  public override toString() {
    return `DbError: ${this.cause.message}`;
  }

  public override get message() {
    return this.cause.message;
  }

  static readonly match = (error: unknown) => {
    if (S.is(DbErrorCause)(error)) {
      return matchPgError(error);
    }
    return null;
  };
}

export const matchPgError = Match.type<S.Schema.Type<typeof DbErrorCause>>().pipe(
  Match.when({ code: "23505" }, (m) => new DbError({ type: "unique_violation", cause: m })),
  Match.when({ code: "23503" }, (m) => new DbError({ type: "foreign_key_violation", cause: m })),
  Match.when({ code: "08000" }, (m) => new DbError({ type: "connection_error", cause: m })),
  Match.orElse(() => null)
);

export const filterNullable = <T>(value?: T | null | undefined): O.Option<T> =>
  O.fromNullable(value).pipe(
    O.filterMap((v) => {
      if (P.isNullable(v)) {
        return O.none<T>();
      }
      return O.some<T>(v);
    })
  );

const isOptionStr = (value: O.Option<unknown>): value is O.Option<string> =>
  F.pipe(
    value,
    O.match({
      onNone: () => false,
      onSome: (v) => Str.isString(v),
    })
  );

const formatSql = (v: O.Option<string>) =>
  F.pipe(
    v,
    O.match({
      onNone: () => "",
      onSome: (v) =>
        chalk.cyan(
          sqlFormatter
            .format(v, {
              language: "postgresql",
              tabWidth: 2,
              keywordCase: "upper",
              linesBetweenQueries: 2,
            })
            .split("\n")
            .map((line) => ` ${line}`)
            .join("\n")
        ),
    })
  );

class MessageName extends S.Option(
  S.Literal(
    "parseComplete",
    "bindComplete",
    "closeComplete",
    "noData",
    "portalSuspended",
    "replicationStart",
    "emptyQuery",
    "copyDone",
    "copyData",
    "rowDescription",
    "parameterDescription",
    "parameterStatus",
    "backendKeyData",
    "notification",
    "readyForQuery",
    "commandComplete",
    "dataRow",
    "copyInResponse",
    "copyOutResponse",
    "authenticationOk",
    "authenticationMD5Password",
    "authenticationCleartextPassword",
    "authenticationSASL",
    "authenticationSASLContinue",
    "authenticationSASLFinal",
    "error",
    "notice"
  )
) {
  static readonly is = (value: unknown): value is typeof MessageName.Type => S.is(MessageName)(value);
}

export class OptionNumber extends S.Option(S.Number) {
  static readonly is = (value: unknown): value is typeof OptionNumber.Type => S.is(OptionNumber)(value);
}

const fmtLine = (k: string, v: string) => `${Str.capitalize(k)}: ${v}`;

export const formatErr = (errValue: pg.DatabaseError) =>
  F.pipe(
    Struct.entries(errValue),
    A.map(([key, value]) =>
      Match.value([key, filterNullable(value)]).pipe(
        Match.when(["code", isOptionStr], ([k, v]) => fmtLine(k, formatSql(v))),
        Match.when(["name", MessageName.is], ([k, v]) =>
          fmtLine(
            k,
            O.getOrElse(v, () => "")
          )
        ),
        Match.when(["length", OptionNumber.is], ([k, v]) =>
          fmtLine(
            k,
            O.match({
              onNone: () => "",
              onSome: (v) => String(v),
            })(v)
          )
        ),
        Match.orElse(([k, v]) => fmtLine(k, O.match({ onNone: () => "", onSome: (v) => String(v) })(v)))
      )
    ),
    A.join("\n")
  );
