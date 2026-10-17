import type { AxeMatchers } from "vitest-axe/matchers";

// vitest-axe 0.1 still augments the legacy `Vi` namespace; register its matcher on Vitest's types.
declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any
  interface Assertion<T = any> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
