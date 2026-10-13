import { getDatabase } from "@netlify/database";

export type DatabasePrincipal = { userId?: string; trusted?: boolean };

export async function withDatabasePrincipal<Result>(
  principal: DatabasePrincipal,
  operation: (client: Awaited<ReturnType<ReturnType<typeof getDatabase>["pool"]["connect"]>>) => Promise<Result>,
): Promise<Result> {
  const client = await getDatabase().pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('mealmate.user_id', $1, true), set_config('mealmate.trusted', $2, true)", [principal.userId ?? "", principal.trusted ? "true" : "false"]);
    await client.query("SET LOCAL statement_timeout = '15000'");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
