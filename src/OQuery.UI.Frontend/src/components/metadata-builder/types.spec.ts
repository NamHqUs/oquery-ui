import { describe, expect, it } from "vitest";
import type { FullDomain, SubDomainConfig } from "../../services/project-service";
import { findSubDomainProblem, setEntityExposed, toSubDomainPayload } from "./types";

const fullDomain: FullDomain = {
  entities: [
    {
      name: "Clients",
      dbSchema: "dbo",
      dbTable: "Customers",
      fields: [
        { name: "Id", dbColumn: "Id", dataType: "Number" },
        { name: "Name", dbColumn: "Name", dataType: "String" },
        { name: "Email", dbColumn: "Email", dataType: "String" },
      ],
    },
    {
      name: "Orders",
      dbSchema: "dbo",
      dbTable: "Orders",
      fields: [
        { name: "Id", dbColumn: "Id", dataType: "Number" },
        { name: "ClientId", dbColumn: "ClientId", dataType: "Number" },
      ],
    },
  ],
  relations: [
    {
      sourceEntity: "Clients",
      sourceRelationName: "Orders",
      sourceFields: ["Id"],
      targetEntity: "Orders",
      targetRelationName: "Client",
      targetFields: ["ClientId"],
    },
  ],
};

const config = (entities: SubDomainConfig["entities"]): SubDomainConfig => ({
  id: "sales",
  name: "Sales",
  description: "",
  entities,
});

describe("sub-domain rules", () => {
  it("rejects a renamed field that collides with another field after exclusions", () => {
    const draft = config([
      {
        entity: "Clients",
        entityName: null,
        fieldNames: [{ field: "Email", fieldName: "Name" }],
        excludedFields: ["Name"],
        relationNames: [],
      },
    ]);
    expect(findSubDomainProblem(draft, fullDomain)).toBeNull();

    const clash = config([
      {
        entity: "Clients",
        entityName: null,
        fieldNames: [{ field: "Email", fieldName: "Name" }],
        excludedFields: [],
        relationNames: [],
      },
    ]);
    expect(findSubDomainProblem(clash, fullDomain)).toContain("duplicate field names");
  });

  it("requires a relation name only when the other side is exposed", () => {
    const blank = config([
      {
        entity: "Clients",
        entityName: null,
        fieldNames: [],
        excludedFields: [],
        relationNames: [],
      },
      {
        entity: "Orders",
        entityName: null,
        fieldNames: [],
        excludedFields: [],
        relationNames: [{ relation: "Client", relationName: "  " }],
      },
    ]);
    expect(findSubDomainProblem(blank, fullDomain)).toContain("needs a name");

    const unexposedPartner = config([
      {
        entity: "Orders",
        entityName: null,
        fieldNames: [],
        excludedFields: [],
        relationNames: [{ relation: "Client", relationName: "" }],
      },
    ]);
    expect(findSubDomainProblem(unexposedPartner, fullDomain)).toBeNull();
  });

  it("drops no-op and excluded overrides from the payload", () => {
    const payload = toSubDomainPayload(config([
      {
        entity: "Clients",
        entityName: "  ",
        fieldNames: [
          { field: "Name", fieldName: "Name" },
          { field: "Email", fieldName: " Mail " },
          { field: "Id", fieldName: "Key" },
        ],
        excludedFields: ["Id"],
        relationNames: [{ relation: "Orders", relationName: "Orders" }],
      },
    ]));
    expect(payload.entities).toEqual([
      {
        entity: "Clients",
        entityName: null,
        fieldNames: [{ field: "Email", fieldName: "Mail" }],
        excludedFields: ["Id"],
        relationNames: [],
      },
    ]);
  });

  it("exposes an entity once and removes it when hidden", () => {
    const exposed = setEntityExposed(config([]), "Clients", true);
    expect(setEntityExposed(exposed, "Clients", true).entities).toHaveLength(1);
    expect(setEntityExposed(exposed, "Clients", false).entities).toEqual([]);
  });
});
