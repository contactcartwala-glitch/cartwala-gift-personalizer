import pg from 'pg';
import { requestContext } from './request-context';
import type { NativeCodDatabase } from '../../../app/lib/native-cod-checkout.server';

/** One lazy connection per request. No cross-request pool, migrations, or schema changes. */
export function openDatabase(connectionString?: string) {
  let client: pg.Client | undefined;
  let connecting: Promise<void> | undefined;
  const database: NativeCodDatabase = {
    async query<T>(sql: string, parameters: unknown[]): Promise<T[]> {
      if (!connectionString) throw new Error('Database connection not configured');
      if (!client) {
        const url = new URL(connectionString);
        if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
            url.searchParams.has('sslmode') || url.searchParams.has('ssl')) {
          throw new Error('Use a PostgreSQL URL without TLS overrides');
        }
        client = new pg.Client({connectionString, ssl: {rejectUnauthorized: true},
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
