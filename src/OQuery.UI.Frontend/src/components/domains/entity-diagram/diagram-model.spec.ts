import { describe, expect, it } from "vitest";
import type { MetadataEntity } from "../domain-model";
import type { DatabaseTableOption } from "../entity-definition/entity-definition";
import { dbSchemaChangedEntityNames, toDiagramTables } from "./diagram-model";

const databaseTables: DatabaseTableOption[] = [
  { schema: "sa", name: "Orders", columns: [{ name: "Id" }, { name: "CustomerId" }] },
];

const entity = (overrides: Partial<MetadataEntity>): MetadataEntity => ({
  name: "Orders",
  schema: "sa",
  dbTable: "Orders",
  rawSql: "Orders",
  fields: [{ name: "Id", dbColumn: "Id", dataType: "Number", isRawSql: false }],
  ...overrides,
});

describe("dbSchemaChangedEntityNames", () => {
  it("flags an entity whose name differs from its physical table", () => {
    expect([...dbSchemaChangedEntityNames([entity({ name: "Order" })], databaseTables)]).toEqual(["Order"]);
  });

  it("flags an entity whose field name differs from its column or whose column is missing", () => {
    const renamedField = entity({ fields: [{ name: "OrderId", dbColumn: "Id", dataType: "Number", isRawSql: false }] });
    const missingColumn = entity({ fields: [{ name: "Total", dbColumn: "Amount", dataType: "Number", isRawSql: false }] });
    expect(dbSchemaChangedEntityNames([renamedField], databaseTables).has("Orders")).toBe(true);
    expect(dbSchemaChangedEntityNames([missingColumn], databaseTables).has("Orders")).toBe(true);
  });

  it("passes the raw SQL flag through to the diagram card", () => {
    const [table] = toDiagramTables([entity({ name: "Customers", dbTable: "Users", isRawSql: false }), entity({ name: "Summary", dbTable: null, isRawSql: true })]);
    expect(table.isRawSql).toBe(false);
    expect(toDiagramTables([entity({ isRawSql: true })])[0].isRawSql).toBe(true);
  });

  it("matches the entity schema to the table schema case-insensitively", () => {
    expect(dbSchemaChangedEntityNames([entity({ name: "Order", schema: "SA" })], databaseTables).has("Order")).toBe(true);
    expect(dbSchemaChangedEntityNames([entity({ schema: "SA" })], databaseTables).size).toBe(0);
  });

  it("does not flag an entity that matches its table, or one with no loaded table", () => {
    const rawSql = entity({ name: "Summary", dbTable: "SELECT 1", rawSql: "SELECT 1" });
    expect(dbSchemaChangedEntityNames([entity({})], databaseTables).size).toBe(0);
    expect(dbSchemaChangedEntityNames([rawSql], databaseTables).size).toBe(0);
  });
});
