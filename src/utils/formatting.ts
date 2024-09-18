export function parseUnderscoreNumber(s: string): number {
  const cleanedStr = s.replace(/_/g, "");
  const num = Number(cleanedStr);

  if (isNaN(num)) {
    throw new Error(`Invalid number format: ${s}`);
  }

  return num;
}
