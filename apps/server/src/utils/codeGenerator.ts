let counter = 0;

/**
 * Generates a short, human-readable, unique-enough code such as PN2607011234.
 * Not a strict sequence — fine for a single-instance dev/small-business deployment.
 */
export function generateCode(prefix: string): string {
  const now = new Date();
  const datePart = [now.getFullYear().toString().slice(2), now.getMonth() + 1, now.getDate()]
    .map((n) => n.toString().padStart(2, "0"))
    .join("");
  counter = (counter + 1) % 10000;
  const suffix = (Date.now() % 100000).toString().padStart(5, "0") + counter.toString().padStart(4, "0");
  return `${prefix}${datePart}${suffix}`;
}
