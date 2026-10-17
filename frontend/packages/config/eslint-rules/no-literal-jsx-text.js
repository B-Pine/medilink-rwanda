/**
 * ESLint rule: no hard-coded user-facing text in JSX.
 *
 * Every string a user can read must come from the i18n resource files (rw / en / fr),
 * see docs/design/research/10-accessibility-and-localization.md §3 and CONTRIBUTING.md.
 *
 * Reports:
 *  - JSX text children that contain a letter (`<p>Hello</p>`)
 *  - string literals rendered as children (`<p>{"Hello"}</p>`, `<p>{`Hello`}</p>`)
 *  - string literals in text-bearing attributes (`alt`, `aria-label`, `title`, `placeholder`, `label`, ...)
 *
 * Punctuation, numbers and symbols are allowed (`·`, `—`, `/`, `2026`).
 */

const LETTER = /\p{L}/u;

const DEFAULT_ATTRIBUTES = [
  "alt",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "title",
  "placeholder",
  "label",
  "hint",
  "description",
];

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow hard-coded user-facing text in JSX; use i18next `t()` instead.",
    },
    schema: [
      {
        type: "object",
        properties: {
          attributes: { type: "array", items: { type: "string" } },
          allow: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      text: 'Hard-coded text "{{text}}" in JSX. Move it to the i18n resource files and use t().',
      attribute:
        'Hard-coded text "{{text}}" in the "{{name}}" attribute. Move it to the i18n resource files and use t().',
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const attributes = new Set(options.attributes ?? DEFAULT_ATTRIBUTES);
    const allow = new Set(options.allow ?? []);

    const isUserText = (value) => {
      const text = value.trim();
      return text.length > 0 && LETTER.test(text) && !allow.has(text);
    };
    const short = (value) => {
      const text = value.trim().replace(/\s+/g, " ");
      return text.length > 40 ? `${text.slice(0, 37)}...` : text;
    };
    const literalText = (node) => {
      if (!node) return null;
      if (node.type === "Literal" && typeof node.value === "string") return node.value;
      if (node.type === "TemplateLiteral")
        return node.quasis.map((q) => q.value.cooked ?? "").join("");
      return null;
    };
    const isJsxChild = (node) =>
      node.parent && (node.parent.type === "JSXElement" || node.parent.type === "JSXFragment");

    return {
      JSXText(node) {
        if (isUserText(node.value)) {
          context.report({ node, messageId: "text", data: { text: short(node.value) } });
        }
      },
      JSXExpressionContainer(node) {
        if (!isJsxChild(node)) return;
        const text = literalText(node.expression);
        if (text !== null && isUserText(text)) {
          context.report({ node, messageId: "text", data: { text: short(text) } });
        }
      },
      JSXAttribute(node) {
        const name =
          node.name.type === "JSXNamespacedName"
            ? `${node.name.namespace.name}:${node.name.name.name}`
            : node.name.name;
        if (!attributes.has(name) || !node.value) return;
        const value =
          node.value.type === "JSXExpressionContainer"
            ? literalText(node.value.expression)
            : literalText(node.value);
        if (value !== null && isUserText(value)) {
          context.report({ node, messageId: "attribute", data: { text: short(value), name } });
        }
      },
    };
  },
};

export default rule;
