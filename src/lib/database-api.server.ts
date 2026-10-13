import { compileDataQuery, primaryConflict, QueryValidationError } from "./database-query.server";
import { withDatabasePrincipal, type DatabasePrincipal } from "./database-context.server";

const rpcArguments: Record<string, string[]> = {
  my_ai_usage: [],
  check_rate_limit: ["_bucket", "_identifier", "_max_per_minute"],
  consume_ai_credit: ["_user_id"],
  consume_image_credit: ["_user_id"],
  increment_dish_search: ["_name"],
  is_premium: ["_user_id"],
  recalc_recipe_rating: ["_recipe_id"],
};

export async function handleDataRequest(request: Request, principal: DatabasePrincipal): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname.slice("/api/data/".length).split("/");
  const jsonHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  try {
    if (!["GET", "HEAD", "POST", "PATCH", "DELETE"].includes(request.method)) return new Response(null, { status: 405 });
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 1024 * 1024) return new Response(null, { status: 413 });
    const body = ["POST", "PATCH"].includes(request.method) ? await request.text() : "";
    if (body.length > 1024 * 1024) return new Response(null, { status: 413 });
    const payload = body ? JSON.parse(body) : undefined;
    if (route[0] === "rpc") {
      const name = route[1]!;
      const keys = rpcArguments[name];
      if (!keys || (!principal.trusted && name !== "my_ai_usage")) return Response.json({ message: "Forbidden RPC" }, { status: 403 });
      if (!principal.trusted && !principal.userId) return Response.json({ message: "Sign in required" }, { status: 401 });
      const args = request.method === "GET" ? Object.fromEntries(url.searchParams) : payload ?? {};
      if (Object.keys(args).some(key => !keys.includes(key)) || keys.some(key => !(key in args))) throw new QueryValidationError("Invalid RPC arguments");
      const result = await withDatabasePrincipal(principal, async client => {
        const query = `SELECT public."${name}"(${keys.map((key, index) => `"${key}" => $${index + 1}`).join(", ")}) AS result`;
        const response = await client.query(query, keys.map(key => args[key]));
        return response.rows[0]?.result ?? null;
      });
      return new Response(JSON.stringify(result), { headers: jsonHeaders });
    }
    if (route.length !== 1) throw new QueryValidationError("Invalid data path");
    if (!principal.trusted && !principal.userId && !["GET", "HEAD"].includes(request.method)) return Response.json({ message: "Sign in required" }, { status: 401 });
    const params = new URLSearchParams(url.searchParams);
    const prefer = request.headers.get("prefer") ?? "";
    if (request.method === "POST" && prefer.includes("resolution=merge-duplicates") && !params.has("on_conflict")) params.set("on_conflict", primaryConflict(route[0]!));
    const plan = compileDataQuery(route[0]!, params, request.method, payload);
    const result = await withDatabasePrincipal(principal, async client => {
      const count = "countSql" in plan && prefer.includes("count=exact") ? (await client.query(plan.countSql, plan.values)).rows[0].count as number : null;
      const rows = request.method === "HEAD" ? [] : (await client.query(`WITH result AS (${plan.sql}) SELECT COALESCE(json_agg(result), '[]'::json) AS data FROM result`, plan.values)).rows[0].data as unknown[];
      return { rows, count };
    });
    const headers = new Headers(jsonHeaders);
    if (result.count !== null) headers.set("Content-Range", `0-${Math.max(0, result.rows.length - 1)}/${result.count}`);
    if (request.method === "HEAD") return new Response(null, { headers });
    const singular = request.headers.get("accept")?.includes("application/vnd.pgrst.object+json");
    if (singular && result.rows.length !== 1) return Response.json({ code: "PGRST116", message: "Expected one record", details: `The result contains ${result.rows.length} rows` }, { status: 406 });
    return new Response(JSON.stringify(singular ? result.rows[0] : result.rows), { headers });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (error instanceof QueryValidationError || error instanceof SyntaxError) return Response.json({ code: "INVALID_QUERY", message: error.message }, { status: 400 });
    console.error("Database operation failed", code ?? "unknown");
    return Response.json({ code: code ?? "DATABASE_UNAVAILABLE", message: code === "42501" ? "Permission denied" : "Database operation failed" }, { status: code === "42501" ? 403 : 503 });
  }
}
