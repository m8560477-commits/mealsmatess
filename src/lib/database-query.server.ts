import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../../db/schema";
import { relationships } from "../../db/relations";

const tableColumns = new Map<string, Set<string>>();
for (const table of Object.values(schema)) {
  if (!is(table, PgTable)) continue;
  const config = getTableConfig(table);
  if (!config.name.startsWith("auth_")) tableColumns.set(config.name, new Set(config.columns.map(column => column.name)));
}

export class QueryValidationError extends Error {}

export function splitQueryParts(value: string): string[] {
  let depth = 0;
  let quoted = false;
  let start = 0;
  const parts: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === '"') quoted = !quoted;
    if (!quoted && (character === "(" || character === "{")) depth++;
    if (!quoted && (character === ")" || character === "}")) depth--;
    if (!quoted && character === "," && depth === 0) { parts.push(value.slice(start, index).trim()); start = index + 1; }
    if (depth < 0) throw new QueryValidationError("Invalid query expression");
  }
  if (depth !== 0 || quoted) throw new QueryValidationError("Invalid query expression");
  parts.push(value.slice(start).trim());
  return parts;
}

export function checkedTable(table: string) {
  if (!tableColumns.has(table)) throw new QueryValidationError("Unknown table");
  return `"${table}"`;
}

export function primaryConflict(table: string) {
  checkedTable(table);
  const config = getTableConfig((schema as unknown as Record<string, PgTable>)[table]!);
  return (config.primaryKeys[0]?.columns ?? config.columns.filter(column => column.primary)).map(column => column.name).join(",");
}

function checkedColumn(table: string, column: string) {
  if (!tableColumns.get(table)?.has(column)) throw new QueryValidationError("Unknown column");
  return `"${column}"`;
}

export function compileDataQuery(table: string, params: URLSearchParams, method: string, payload?: unknown) {
  checkedTable(table);
  const values: unknown[] = [];
  const parameter = (value: unknown) => { values.push(value); return `$${values.length}`; };
  const projection = (name: string, selection: string, alias: string, depth = 0): string => {
    if (depth > 3) throw new QueryValidationError("Query nesting is too deep");
    return splitQueryParts(selection).map(part => {
      if (part === "*") return `${alias}.*`;
      const nested = part.match(/^(\w+)\((.*)\)$/);
      if (!nested) return `${alias}.${checkedColumn(name, part)}`;
      const related = nested[1]!;
      checkedTable(related);
      const forward = relationships.find(relation => relation.from === name && relation.to === related);
      const backward = relationships.find(relation => relation.to === name && relation.from === related);
      if (!forward && !backward) throw new QueryValidationError("Unknown relationship");
      const inner = `nested_${depth}`;
      const selected = projection(related, nested[2]!, inner, depth + 1);
      const condition = forward
        ? `${inner}.${checkedColumn(related, forward.target)} = ${alias}.${checkedColumn(name, forward.column)}`
        : `${inner}.${checkedColumn(related, backward!.column)} = ${alias}.${checkedColumn(name, backward!.target)}`;
      const nestedQuery = `SELECT ${selected} FROM ${checkedTable(related)} ${inner} WHERE ${condition}`;
      return forward
        ? `(SELECT row_to_json(related_row) FROM (${nestedQuery} LIMIT 1) related_row) AS "${related}"`
        : `(SELECT COALESCE(json_agg(related_row), '[]'::json) FROM (${nestedQuery}) related_row) AS "${related}"`;
    }).join(", ");
  };
  const comparison = (column: string, expression: string): string => {
    let remaining = expression;
    let negate = false;
    if (remaining.startsWith("not.")) { negate = true; remaining = remaining.slice(4); }
    const separator = remaining.indexOf(".");
    if (separator < 0) throw new QueryValidationError("Invalid filter");
    const operator = remaining.slice(0, separator);
    const value = remaining.slice(separator + 1);
    const field = `root.${checkedColumn(table, column)}`;
    const operators: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "LIKE", ilike: "ILIKE" };
    let sql: string;
    if (operators[operator]) sql = `${field} ${operators[operator]} ${parameter(operator.endsWith("like") ? value.replaceAll("*", "%") : value)}`;
    else if (operator === "is" && ["null", "true", "false"].includes(value)) sql = `${field} IS ${value.toUpperCase()}`;
    else if (operator === "in" && value.startsWith("(") && value.endsWith(")")) {
      const items = value.slice(1, -1) ? splitQueryParts(value.slice(1, -1)).map(item => item.replace(/^"|"$/g, "")) : [];
      sql = items.length ? `${field} IN (${items.map(parameter).join(", ")})` : "false";
    } else if (operator === "cs" && value.startsWith("{") && value.endsWith("}")) sql = `${field} @> ${parameter(splitQueryParts(value.slice(1, -1)))}`;
    else throw new QueryValidationError("Unsupported filter");
    return negate ? `NOT (${sql})` : sql;
  };
  const logical = (expression: string, operator: string, depth = 0): string => {
    if (depth > 3) throw new QueryValidationError("Query nesting is too deep");
    if (!expression.startsWith("(") || !expression.endsWith(")")) throw new QueryValidationError("Invalid logical filter");
    const parts = splitQueryParts(expression.slice(1, -1)).map(part => {
      const group = part.match(/^(or|and)(\(.*\))$/);
      if (group) return logical(group[2]!, group[1]!, depth + 1);
      const separator = part.indexOf(".");
      return comparison(part.slice(0, separator), part.slice(separator + 1));
    });
    return `(${parts.join(operator === "or" ? " OR " : " AND ")})`;
  };
  const filters: string[] = [];
  const reserved = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
  for (const [column, expression] of params) {
    if (reserved.has(column)) continue;
    filters.push(column === "or" || column === "and" ? logical(expression, column) : comparison(column, expression));
  }
  const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
  const selection = params.get("select") ?? "*";
  const selected = projection(table, selection, "root");
  if (method === "GET" || method === "HEAD") {
    const order = params.get("order") ? ` ORDER BY ${splitQueryParts(params.get("order")!).map(part => {
      const [column, direction = "asc", nulls] = part.split(".");
      if (!["asc", "desc"].includes(direction) || (nulls && !["nullsfirst", "nullslast"].includes(nulls))) throw new QueryValidationError("Invalid ordering");
      return `root.${checkedColumn(table, column!)} ${direction.toUpperCase()}${nulls ? ` NULLS ${nulls === "nullsfirst" ? "FIRST" : "LAST"}` : ""}`;
    }).join(", ")}` : "";
    const limit = Number(params.get("limit") ?? 500);
    const offset = Number(params.get("offset") ?? 0);
    if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset) || limit < 0 || limit > 1000 || offset < 0) throw new QueryValidationError("Invalid pagination");
    return { sql: `SELECT ${selected} FROM ${checkedTable(table)} root${where}${order} LIMIT ${limit} OFFSET ${offset}`, countSql: `SELECT count(*)::int AS count FROM ${checkedTable(table)} root${where}`, values };
  }
  if (method === "DELETE") return { sql: `DELETE FROM ${checkedTable(table)} root${where} RETURNING ${selected}`, values };
  const rows = Array.isArray(payload) ? payload : [payload];
  if (!rows.length || rows.length > 100 || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw new QueryValidationError("Invalid record payload");
  const columns = [...new Set(rows.flatMap(row => Object.keys(row as object)))];
  if (!columns.length) throw new QueryValidationError("Empty record payload");
  columns.forEach(column => checkedColumn(table, column));
  const encoded = (row: Record<string, unknown>, column: string) => {
    const value = row[column];
    const columnConfig = getTableConfig((schema as unknown as Record<string, PgTable>)[table]!).columns.find(entry => entry.name === column)!;
    return ["json", "jsonb"].includes(columnConfig.getSQLType()) && value !== null ? JSON.stringify(value) : value;
  };
  if (method === "PATCH") {
    if (rows.length !== 1) throw new QueryValidationError("Updates need a single record");
    const updates = columns.map(column => `${checkedColumn(table, column)} = ${parameter(encoded(rows[0], column))}`);
    return { sql: `UPDATE ${checkedTable(table)} root SET ${updates.join(", ")}${where} RETURNING ${selected}`, values };
  }
  if (method !== "POST") throw new QueryValidationError("Unsupported method");
  const conflict = params.get("on_conflict");
  const conflictColumns = conflict ? splitQueryParts(conflict) : [];
  const inserts = rows.map(row => `(${columns.map(column => column in row ? parameter(encoded(row, column)) : "DEFAULT").join(", ")})`);
  return {
    sql: `INSERT INTO ${checkedTable(table)} AS root (${columns.map(column => checkedColumn(table, column)).join(", ")}) VALUES ${inserts.join(", ")}${conflict ? ` ON CONFLICT (${conflictColumns.map(column => checkedColumn(table, column)).join(", ")}) DO UPDATE SET ${columns.map(column => `${checkedColumn(table, column)} = EXCLUDED.${checkedColumn(table, column)}`).join(", ")}` : ""} RETURNING ${selected}`,
    values,
  };
}
