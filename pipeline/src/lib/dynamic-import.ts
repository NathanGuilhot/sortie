// eslint-disable-next-line @typescript-eslint/no-implied-eval
const _import = new Function('specifier', 'return import(specifier)') as <T = unknown>(
  specifier: string,
) => Promise<T>;

export function dynamicImport<T = unknown>(specifier: string): Promise<T> {
  return _import<T>(specifier);
}
