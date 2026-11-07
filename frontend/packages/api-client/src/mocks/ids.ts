/**
 * Stable mock ids. The mock stores are seeded in a fixed order when the worker starts, so a
 * counter gives every seeded record the same id on every page load: deep links, refreshes and
 * e2e tests can open a bill, visit or booking by its URL (they 404'd with random UUIDs). Ids are
 * valid v4-shaped UUIDs under one prefix that no fixture uses.
 */
let counter = 0;

export function mockId(): string {
  counter += 1;
  return `5eed0000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
}
