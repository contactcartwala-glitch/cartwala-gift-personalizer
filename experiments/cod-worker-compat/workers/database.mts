import pg from 'pg';
import { requestContext } from './request-context';
import type { NativeCodDatabase } from '../../../app/lib/native-cod-checkout.server';

/** One lazy connection per request. No cross-request pool, migrations, or schema changes. */
export function openDatabase(connectionString?: string, hyperdrive?: {connectionString:string}) {
  let client: pg.Client | undefined;
  let connecting: Promise<void> | undefined;
  const database: NativeCodDatabase = {
    async query<T>(sql: string, parameters: unknown[]): Promise<T[]> {
      if (!connectionString && !hyperdrive) throw new Error('Database connection not configured');
      if (!client) {
        const url = new URL(hyperdrive?.connectionString ?? connectionString!);
        if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
            !hyperdrive && (url.searchParams.has('sslmode') || url.searchParams.has('ssl'))) {
          throw new Error('Use a PostgreSQL URL without TLS overrides');
        }
        // A Hyperdrive binding is a runtime-provided tunnel, not a public plaintext
        // database connection. Hyperdrive validates origin TLS and owns its pool.
        // Never accept this binding or a connection URL from an HTTP payload.
        client = new pg.Client({connectionString:hyperdrive?.connectionString ?? connectionString,
          ...(!hyperdrive ? {ssl: {rejectUnauthorized: true}} : {}),
          connectionTimeoutMillis: 5000, statement_timeout: 15000,
          application_name: 'cartwala-cod-worker-pilot'});
        connecting = client.connect();
      }
      await connecting;
      return (await client.query(sql, parameters)).rows as T[];
    },
  };
  return {database, async close() {if (client) await client.end();}};
}

/** Build-time replacement for the Node/Prisma singleton, for COD routes only. */
export default {
  $queryRawUnsafe<T>(sql: string, ...parameters: unknown[]): Promise<T> {
    return requestContext().database.query(sql, parameters) as Promise<T>;
  },
};
