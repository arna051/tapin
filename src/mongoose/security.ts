export function assertMongoIdentifier(
  value: unknown,
  name: string,
  maximumLength = 256,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maximumLength ||
    value.includes('\0')
  )
    throw new TypeError(`${name} must be a non-empty plain string`);
}
