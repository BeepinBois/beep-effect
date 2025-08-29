import type { DbError } from "@beep/db-scope/errors";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgDatabase, NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { Effect } from "effect";
import type * as Redacted from "effect/Redacted";
import type * as pg from "pg";
import type * as DbErrors from "./errors";

export type ConnectionOptions = {
  url: Redacted.Redacted;
  ssl: boolean;
};

export type TransactionClient<TFullSchema extends Record<string, unknown> = Record<string, never>> = PgTransaction<
  NodePgQueryResultHKT,
  TFullSchema,
  ExtractTablesWithRelations<TFullSchema>
>;

export type DbClient<TFullSchema extends Record<string, unknown> = Record<string, never>> =
  NodePgDatabase<TFullSchema> & {
    $client: pg.Pool;
  };

export type TransactionContextShape<TFullSchema extends Record<string, unknown>> = <U>(
  fn: (client: TransactionClient<TFullSchema>) => Promise<U>
) => Effect.Effect<U, DbError>;

export interface IDbResource<TSchema extends Record<string, unknown>> {
  readonly client: NodePgDatabase<TSchema> & {
    $client: pg.Pool;
  };
  readonly handler: pg.Pool;
  readonly close: () => Promise<void>;
}

export type ExecuteFn<TFullSchema extends Record<string, unknown>> = <T>(
  fn: (client: DbClient<TFullSchema> | TransactionClient<TFullSchema>) => Promise<T>
) => Effect.Effect<T, DbErrors.DbError>;
