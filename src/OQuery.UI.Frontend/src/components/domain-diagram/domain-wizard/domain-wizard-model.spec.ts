import { describe, expect, it } from "vitest";
import { buildEditedGraph, type DatabaseRelationship, type DomainGraph, tableKey } from "./domain-wizard-model";
import type { DatabaseTableOption } from "../entity-definition/entity-definition";

const tables: DatabaseTableOption[] = [
  { schema: "dbo", name: "Departments", columns: [{ name: "Id", dataType: "int", isPrimaryKey: true }, { name: "Name", dataType: "nvarchar", isPrimaryKey: false }] },
  { schema: "dbo", name: "Employees", columns: [{ name: "Id", dataType: "int", isPrimaryKey: true }, { name: "DepartmentId", dataType: "int", isPrimaryKey: false }, { name: "Secret", dataType: "nvarchar", isPrimaryKey: false }] },
];

const relationships: DatabaseRelationship[] = [{
  name: "FK_Employees_Departments",
  sourceSchema: "dbo", sourceTable: "Employees", sourceColumns: ["DepartmentId"],
  targetSchema: "dbo", targetTable: "Departments", targetColumns: ["Id"],
}];

const base: DomainGraph = {
  entities: [
    { name: "Departments", schema: "dbo", dbTable: "Departments", rawSql: "Departments", fields: [{ name: "Id", dbColumn: "Id", dataType: "Number" }, { name: "Name", dbColumn: "Name", dataType: "String" }] },
    { name: "Employees", schema: "dbo", dbTable: "Employees", rawSql: "Employees", fields: [{ name: "Id", dbColumn: "Id", dataType: "Number" }, { name: "DepartmentId", dbColumn: "DepartmentId", dataType: "Number" }] },
    { name: "Notes", schema: null, dbTable: null, rawSql: "", fields: [] },
  ],
  relations: [{ sourceEntity: "Employees", sourceRelationName: "Department", sourceFields: ["DepartmentId"], targetEntity: "Departments", targetRelationName: "Employees", targetFields: ["Id"] }],
};

describe("buildEditedGraph", () => {
  it("removes a deselected table's entity and its relations, but keeps custom entities", () => {
    const selected = new Set([tableKey("dbo", "Departments")]);
    const graph = buildEditedGraph(base, tables, relationships, selected, {});
    expect(graph.entities.map((entity) => entity.name)).toEqual(["Departments", "Notes"]);
    expect(graph.relations).toEqual([]);
  });

  it("adds new tables without excluded columns and creates one FK relation", () => {
    const selected = new Set([tableKey("dbo", "Departments"), tableKey("dbo", "Employees")]);
    const design = { [tableKey("dbo", "Employees")]: { name: "Staff", excludedColumns: ["Secret"] } };
    const graph = buildEditedGraph({ entities: [], relations: [] }, tables, relationships, selected, design);
    const staff = graph.entities.find((entity) => entity.name === "Staff");
    expect(staff?.fields.map((field) => field.name)).toEqual(["Id", "DepartmentId"]);
    expect(graph.relations).toEqual([{
      sourceEntity: "Staff", sourceRelationName: "Department", sourceFields: ["DepartmentId"],
      targetEntity: "Departments", targetRelationName: "Staffs", targetFields: ["Id"],
    }]);
    const again = buildEditedGraph(graph, tables, relationships, selected, design);
    expect(again.relations).toHaveLength(1);
  });
});
