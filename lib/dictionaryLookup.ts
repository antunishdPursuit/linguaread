export function normalizeLookupWord(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/^[^a-z]+|[^a-z]+$/g, '');
}
