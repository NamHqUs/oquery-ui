export const functionArgumentDataTypes = ["String", "Number", "Datetime", "Boolean"] as const;
export type FunctionArgumentDataType = typeof functionArgumentDataTypes[number];
export const functionResultDataTypes = functionArgumentDataTypes;
export type FunctionResultDataType = typeof functionResultDataTypes[number];

export type FunctionDatabaseType = string;

export const functionApplyForValues = [
  { value: 1, label: "DataSet" },
  { value: 2, label: "Text" },
  { value: 4, label: "Number" },
  { value: 8, label: "DateTime" },
  { value: 16, label: "Boolean" },
] as const;
export type FunctionApplyFor = number;
export type BuiltinFunctionEntry = {
  name: string;
  category: string;
  returns: string;
  signature: string;
  sqlServerTemplate: string;
  description: string;
  example: { oquery: string; explanation: string };
};
export const allScalarApplyFor = 2 | 4 | 8 | 16;

export type FunctionArgumentDefinition = {
  name: string;
  dataType: FunctionArgumentDataType;
  defaultValue: unknown;
};

export type FunctionDefinition = {
  name: string;
  arguments: FunctionArgumentDefinition[];
  resultType: FunctionResultDataType;
  canDelete?: boolean;
  isBuiltin?: boolean;
  isAggregate: boolean;
  applyFor: FunctionApplyFor;
  description: string;
  sqlTemplates: Record<string, string>;
};

export type EditableFunctionArgument = FunctionArgumentDefinition & {
  id: string;
  defaultValueText: string;
};

export type EditableFunctionTemplate = {
  id: string;
  databaseType: FunctionDatabaseType;
  rawSqlTemplate: string;
};

export type FunctionDefinitionPayload = Omit<FunctionDefinition, "isAggregate">;

export type EditableFunctionDefinition = Omit<FunctionDefinition, "arguments" | "sqlTemplates" | "isAggregate"> & {
  arguments: EditableFunctionArgument[];
  sqlTemplates: Record<string, string>;
  sqlTemplateRows: EditableFunctionTemplate[];
};

let nextArgumentId = 1;
let nextTemplateId = 1;

export const emptyFunctionArgument = (): EditableFunctionArgument => ({
  id: `argument-${nextArgumentId++}`,
  name: "",
  dataType: "String",
  defaultValue: null,
  defaultValueText: "",
});

export const emptyFunctionTemplate = (databaseType: FunctionDatabaseType): EditableFunctionTemplate => ({
  id: `template-${nextTemplateId++}`,
  databaseType,
  rawSqlTemplate: "",
});

export const emptyFunction = (providers: string[]): EditableFunctionDefinition => ({
  name: "",
  arguments: [emptyFunctionArgument()],
  resultType: "String",
  applyFor: 2 | 4 | 8 | 16,
  description: "",
  sqlTemplates: {},
  sqlTemplateRows: [
    ...providers.map(emptyFunctionTemplate),
  ],
});

export function toEditableFunction(definition: FunctionDefinition): EditableFunctionDefinition {
  const templateRows = Object.entries(definition.sqlTemplates)
    .filter(([databaseType]) => isFunctionDatabaseType(databaseType))
    .map(([databaseType, rawSqlTemplate]) => ({
      ...emptyFunctionTemplate(databaseType as FunctionDatabaseType),
      rawSqlTemplate,
    }));

  return {
    ...definition,
    applyFor: definition.applyFor ?? (definition.isAggregate ? 1 : allScalarApplyFor),
    arguments: definition.arguments.map((argument) => ({
      ...argument,
      id: `argument-${nextArgumentId++}`,
      defaultValueText: argument.defaultValue == null
        ? ""
        : typeof argument.defaultValue === "string"
          ? argument.defaultValue
          : String(argument.defaultValue),
    })),
    sqlTemplates: { ...definition.sqlTemplates },
    sqlTemplateRows: templateRows,
  };
}

function isFunctionDatabaseType(databaseType: string): databaseType is FunctionDatabaseType {
  return databaseType.length > 0;
}
