import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as pg from "pg";
import type { ConnectionOptions, IDbResource } from "./types";

export class DbConnection extends Context.Tag("DbConnection")<
  DbConnection,
  NodePgDatabase<Record<string, unknown>>
>() {}

export class DatabaseResourceError extends Data.TaggedError("DatabaseResource")<{
  readonly error: unknown;
}> {
  toString() {
    return `DatabaseResourceError: ${String(this.error)}`;
  }
}

export const acquire = Effect.fn("acquire")(function* <TSchema extends Record<string, unknown> = Record<string, never>>(
  schema: TSchema,
  opts: ConnectionOptions
) {
  {
    const sql = new pg.Pool({
      connectionString: Redacted.value(opts.url),
      ssl: opts.ssl,
      idleTimeoutMillis: 0,
      connectionTimeoutMillis: 0,
    });

    yield* Effect.logDebug("[Database] connected established ✅");

    const drizzle_client = drizzle(sql, { schema });

    return {
      client: drizzle_client,
      handler: sql,
      async close() {
        await sql.end();
      },
    } satisfies IDbResource<TSchema>;
  }
});
export const release = Effect.fn("release")(
  function* <TSchema extends Record<string, unknown> = Record<string, never>>(res: IDbResource<TSchema>) {
    return yield* Effect.promise(() => res.close());
  },
  Effect.tap(Effect.logDebug("[Database] connection closed 🚫"))
);

export const DatabaseResource = <TSchema extends Record<string, unknown> = Record<string, never>>(
  schema: TSchema,
  opts: ConnectionOptions
) => Effect.acquireRelease(acquire(schema, opts), release);
