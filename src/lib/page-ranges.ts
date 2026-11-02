export function parsePages(value: string, total: number) {
  const result = new Set<number>();
  for (const part of value.split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("Use page numbers such as 1, 3, 5-8.");
    const from = Number(match[1]),
      to = Number(match[2] || match[1]);
    if (from < 1 || to > total || from > to)
      throw new Error(`Pages must be between 1 and ${total}.`);
    for (let i = from; i <= to; i++) result.add(i - 1);
  }
  return [...result];
}
