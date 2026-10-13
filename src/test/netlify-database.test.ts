import { describe, expect, it, vi } from "vitest";
import { compileDataQuery, primaryConflict, QueryValidationError, splitQueryParts } from "@/lib/database-query.server";
import { createDataClient } from "@/lib/data-client";

describe("Netlify database compatibility", () => {
  it("parameterizes untrusted filter values", () => {
    const query = compileDataQuery("recipes", new URLSearchParams({ name: "eq.'; DROP TABLE recipes; --" }), "GET");
    expect(query.sql).not.toContain("DROP TABLE");
    expect(query.values).toEqual(["'; DROP TABLE recipes; --"]);
  });
  it("rejects identifier injection and authentication tables", () => {
    expect(() => compileDataQuery("auth_user", new URLSearchParams(), "GET")).toThrow(QueryValidationError);
    expect(() => compileDataQuery("recipes", new URLSearchParams({ select: "name;DROP TABLE recipes" }), "GET")).toThrow(QueryValidationError);
    expect(() => compileDataQuery("recipes", new URLSearchParams({ order: "name.desc;drop" }), "GET")).toThrow(QueryValidationError);
  });
  it("preserves pantry filtering and numeric pagination", () => {
    const query = compileDataQuery("pantry_items", new URLSearchParams({ user_id: "eq.account-id", limit: "20", offset: "10", order: "created_at.desc" }), "GET");
    expect(query.sql).toContain('root."user_id" = $1');
    expect(query.sql).toContain("LIMIT 20 OFFSET 10");
    expect(query.values).toEqual(["account-id"]);
  });
  it("supports real foreign-key recipe embeddings", () => {
    const query = compileDataQuery("favorites", new URLSearchParams({ select: "recipe_id,recipes(id,name)" }), "GET");
    expect(query.sql).toContain('nested_0."id" = root."recipe_id"');
    expect(query.sql).toContain("row_to_json");
  });
  it("supports reverse restaurant branch embeddings", () => {
    const query = compileDataQuery("restaurants", new URLSearchParams({ select: "*,restaurant_locations(id,label)" }), "GET");
    expect(query.sql).toContain('nested_0."restaurant_id" = root."id"');
    expect(query.sql).toContain("json_agg");
  });
  it("splits arrays without breaking OR filters", () => {
    expect(splitQueryParts("name.eq.Rice,diet_tags.cs.{vegan,vegetarian}")).toEqual(["name.eq.Rice", "diet_tags.cs.{vegan,vegetarian}"]);
    const query = compileDataQuery("recipes", new URLSearchParams({ or: "(name.eq.Rice,diet_tags.cs.{vegan,vegetarian})" }), "GET");
    expect(query.sql).toContain(" OR ");
    expect(query.values).toEqual(["Rice", ["vegan", "vegetarian"]]);
  });
  it("serializes JSON without turning Postgres arrays into JSON strings", () => {
    const query = compileDataQuery("recipes", new URLSearchParams(), "POST", { ingredients: [{ name: "rice" }], diet_tags: ["vegan"], name: "Rice", slug: "rice" });
    expect(query.values).toContain(JSON.stringify([{ name: "rice" }]));
    expect(query.values).toContainEqual(["vegan"]);
  });
  it("uses actual primary keys for cache upserts", () => {
    expect(primaryConflict("image_search_cache")).toBe("cache_key");
    expect(primaryConflict("profiles")).toBe("id");
  });
  it("keeps reads and writes on the Netlify data endpoint", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
    const client = createDataClient(transport, "https://example.test");
    await client.from("pantry_items").select("*");
    expect(String(transport.mock.calls[0]?.[0])).toMatch(/^https:\/\/example.test\/api\/data\/pantry_items/);
  });
});
