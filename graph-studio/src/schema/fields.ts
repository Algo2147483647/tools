import type { AppearanceFieldDefinition } from "./definition";
export interface SchemaField {
  definition?: AppearanceFieldDefinition;
  supported?: boolean;
  path: string;
  type: string;
  requirement: "Required" | "Optional";
  description: string;
  defaultValue?: string;
}

export function schemaField(
  path: string,
  type: string,
  requirement: SchemaField["requirement"],
  description: string,
  defaultValue?: string,
): SchemaField {
  return { path, type, requirement, description, defaultValue };
}

/** Stable preorder keeps each parent's descendants together across schema extensions. */
export function orderSchemaFields(fields: SchemaField[]): SchemaField[] {
  interface Branch {
    field?: SchemaField;
    children: Map<string, Branch>;
  }
  const root: Branch = { children: new Map() };
  for (const field of fields) {
    let branch = root;
    for (const key of field.path.match(/[^.[\]]+|\[[^\]]*\]/g) ?? []) {
      if (!branch.children.has(key)) branch.children.set(key, { children: new Map() });
      branch = branch.children.get(key)!;
    }
    if (branch.field) throw new Error(`Duplicate schema field: ${field.path}`);
    branch.field = field;
  }
  const walk = (branch: Branch): SchemaField[] => [
    ...(branch.field ? [branch.field] : []),
    ...[...branch.children.values()].flatMap(walk),
  ];
  return walk(root);
}
