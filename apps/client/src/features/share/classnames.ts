export function cx(
  ...values: Array<
    | string
    | false
    | null
    | undefined
    | Record<string, boolean | null | undefined>
  >
): string {
  const classNames: string[] = [];

  for (const value of values) {
    if (!value) {
      continue;
    }

    if (typeof value === "string") {
      classNames.push(value);
      continue;
    }

    for (const [key, shouldInclude] of Object.entries(value)) {
      if (shouldInclude) {
        classNames.push(key);
      }
    }
  }

  return classNames.join(" ");
}
