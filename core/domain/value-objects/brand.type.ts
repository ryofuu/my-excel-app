/**
 * TypeScript 上だけで異なる概念を区別する Nominal Marker。
 * Runtime では元の値なので、HTTP やDBの境界をそのまま Serialize できる。
 */
declare const brandSymbol: unique symbol;

export type Brand<Value, Name extends string> = Value & {
  readonly [brandSymbol]: Name;
};

export const brand = <Value, Name extends string>(value: Value): Brand<Value, Name> =>
  value as Brand<Value, Name>;
