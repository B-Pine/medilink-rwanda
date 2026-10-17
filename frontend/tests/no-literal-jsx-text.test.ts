import { RuleTester } from "eslint";
import { describe, it } from "vitest";

// @ts-expect-error -- plain JS ESLint rule
import rule from "../packages/config/eslint-rules/no-literal-jsx-text.js";

/** Contract check F3: the lint rule that keeps user-facing text out of JSX. */

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2023,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

tester.run("no-literal-jsx-text", rule as never, {
  valid: [
    { code: "const a = <p>{t('home.title')}</p>;" },
    { code: "const a = <p>{' '}·{' '}—</p>;" },
    { code: "const a = <p>2026</p>;" },
    { code: "const a = <img alt={t('logo.alt')} />;" },
    { code: "const a = <div className='flex gap-2' id='main' />;" },
    { code: "const a = <input autoComplete='username' type='email' />;" },
    { code: "const a = <p>MediLink</p>;", options: [{ allow: ["MediLink"] }] },
  ],
  invalid: [
    { code: "const a = <p>Hello</p>;", errors: [{ messageId: "text" }] },
    { code: "const a = <p>Muraho neza</p>;", errors: [{ messageId: "text" }] },
    { code: "const a = <p>{'Hello'}</p>;", errors: [{ messageId: "text" }] },
    { code: "const a = <p>{`Hello`}</p>;", errors: [{ messageId: "text" }] },
    { code: "const a = <img alt='A doctor' />;", errors: [{ messageId: "attribute" }] },
    { code: "const a = <button aria-label='Close' />;", errors: [{ messageId: "attribute" }] },
    { code: "const a = <input placeholder={'Search'} />;", errors: [{ messageId: "attribute" }] },
    { code: "const a = <TextField label='Email' />;", errors: [{ messageId: "attribute" }] },
  ],
});
