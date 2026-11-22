import { describe, expect, it } from "vitest";
import type { MetadataEntity } from "../domain-model";
import type { DatabaseTableOption } from "../entity-definition/entity-definition";
import { applyWizardToGraph, seedWizardSelection, wizardChangeCounts, type DatabaseRelationship, type WizardApplyInput } from "./wizard-draft";

describe("wizardChangeCounts", () => {
  it("counts added, removed and kept entities against the selection", () => {
    expect(wizardChangeCounts(["dbo.Customers", "dbo.Orders"], new Set(["dbo.Orders", "dbo.Products"]))).toEqual({ added: 1, removed: 1, kept: 1 });
  });

  it("reports every existing entity as removed when nothing is selected", () => {
    expect(wizardChangeCounts(["dbo.Customers"], new Set())).toEqual({ added: 0, removed: 1, kept: 0 });
  });
});

const customers: DatabaseTableOption = {
  schema: "dbo",
  name: "Customers",
  columns: [{ name: "Id", dataType: "int", isPrimaryKey: true }, { name: "Name", dataType: "nvarchar", isPrimaryKey: false }],
};
const orders: DatabaseTableOption = {
  schema: "dbo",
  name: "Orders",
  columns: [{ name: "Id", dataType: "int", isPrimaryKey: true }, { name: "CustomerId", dataType: "int", isPrimaryKey: false }],
};
const tables = [customers, orders];

const foreignKey: DatabaseRelationship = {
  name: "FK_Orders_Customers",
  sourceSchema: "dbo",
  sourceTable: "Orders",
  sourceColumns: ["CustomerId"],
  targetSchema: "dbo",
  targetTable: "Customers",
  targetColumns: ["Id"],
};

const customerEntity: MetadataEntity = {
  name: "Customer",
  schema: "dbo",
  dbTable: "Customers",
  rawSql: "Customers",
  fields: [{ name: "Id", dbColumn: "Id" }, { name: "Name", dbColumn: "Name" }],
};
const orderEntity: MetadataEntity = {
  name: "Order",
  schema: "dbo",
  dbTable: "Orders",
  rawSql: "Orders",
  fields: [{ name: "Id", dbColumn: "Id" }, { name: "CustomerId", dbColumn: "CustomerId" }],
};

// Defaults: every table chosen, FK becomes Order.Customer <-> Customer.Orders, and names come from the table names.
function apply(overrides: Partial<WizardApplyInput>) {
  return applyWizardToGraph({
    graph: { entities: [customerEntity, orderEntity], relations: [] },
    tables,
    chosen: tables,
    relationships: [foreignKey],
    excludedColumns: {},
    entityName: (table) => table.name.replace(/s$/, ""),
    fieldName: (_table, column) => column,
    relationNames: () => ({ lookup: "Customer", collection: "Orders" }),
    ...overrides,
  });
}

describe("domain wizard edit mode", () => {
  it("seeds the selection from the domain in memory, keeping field names and excluding unmapped columns", () => {
    const seeded = seedWizardSelection([{ ...orderEntity, fields: [{ name: "OrderCustomer", dbColumn: "CustomerId" }] }], tables);

    expect([...seeded.selectedKeys]).toEqual(["dbo.Orders"]);
    expect(seeded.excludedColumns["dbo.Orders"]).toEqual(["Id"]);
    expect(seeded.fieldNames["dbo.Orders"]).toEqual({ CustomerId: "OrderCustomer" });
  });

  it("removes a deselected table's entity and relations, keeps unmanaged entities, and rejects duplicate names", () => {
    const manual: MetadataEntity = { name: "Notes", schema: null, dbTable: null, rawSql: "", fields: [] };
    const relation = {
      sourceEntity: "Order", sourceRelationName: "Customer", sourceFields: ["CustomerId"],
      targetEntity: "Customer", targetRelationName: "Orders", targetFields: ["Id"],
    };

    const removed = apply({
      graph: { entities: [customerEntity, orderEntity, manual], relations: [relation] },
      chosen: [customers],
      relationships: [],
    });
    expect("graph" in removed && removed.graph.entities.map((entity) => entity.name)).toEqual(["Customer", "Notes"]);
    expect("graph" in removed && removed.graph.relations).toEqual([]);

    expect(apply({ entityName: () => "Same" })).toEqual({ error: 'An entity named "Same" already exists in this domain.' });
  });

  it("generates a relation for a chosen foreign key once, and drops it when its column is excluded", () => {
    const generated = apply({ graph: { entities: [], relations: [] } });
    const expectedRelation = {
      sourceEntity: "Order", sourceRelationName: "Customer", sourceFields: ["CustomerId"],
      targetEntity: "Customer", targetRelationName: "Orders", targetFields: ["Id"],
    };
    expect("graph" in generated && generated.graph.relations).toEqual([expectedRelation]);

    const reapplied = apply({ graph: "graph" in generated ? generated.graph : { entities: [], relations: [] } });
    expect("graph" in reapplied && reapplied.graph.relations).toHaveLength(1);

    const excluded = apply({ excludedColumns: { "dbo.Orders": ["CustomerId"] } });
    expect("graph" in excluded && excluded.graph.relations).toEqual([]);
  });
});
