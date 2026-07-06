// Stub types for @convex/_generated/* — replaced by real generated types once `npx convex dev` runs.
// These allow the web app to type-check before Convex has been initialised.

declare module "@convex/_generated/api" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const api: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const internal: any;
}


declare module "@convex/_generated/dataModel" {
  export type Id<_TableName extends string> = string & { __tableName: _TableName };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Doc<_TableName extends string> = any;
}

declare module "@convex/_generated/server" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const query: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const mutation: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const action: any;
}
