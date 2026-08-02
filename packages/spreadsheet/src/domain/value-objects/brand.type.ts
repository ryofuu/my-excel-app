/**
 * A nominal marker used only by TypeScript. Branded values are represented by
 * their primitive value at runtime, which keeps them safe to serialize across
 * the HTTP and SQLite boundaries.
 */
export type Brand<Value, Name extends string> = Value & {
  readonly __brand: Name;
};

export const brand = <Value, Name extends string>(value: Value): Brand<Value, Name> =>
  value as Brand<Value, Name>;
