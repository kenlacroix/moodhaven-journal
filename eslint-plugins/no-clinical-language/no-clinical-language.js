'use strict';
// ESLint rule: no-clinical-language
// Reads banned words from wellness-language-banned.txt at the repo root.
// Allowlist: place // allow-clinical: <reason> on the line immediately above the offending line.

const fs = require('fs');
const path = require('path');

const bannedFile = path.resolve(__dirname, '../../wellness-language-banned.txt');

function loadPatterns() {
  let text;
  try {
    text = fs.readFileSync(bannedFile, 'utf8');
  } catch {
    return [];
  }
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      if (line.startsWith('regex:')) {
        return new RegExp(line.slice(6), 'i');
      }
      return new RegExp(`\\b${line}\\b`, 'i');
    });
}

const PATTERNS = loadPatterns();

function hasClinicalAllowComment(node, sourceCode) {
  const tokenBefore = sourceCode.getTokenBefore(node, { includeComments: true });
  const lineAbove = (node.loc.start.line) - 1;
  const comments = sourceCode.getAllComments();
  return comments.some(
    (c) => c.loc.end.line === lineAbove && c.value.trim().startsWith('allow-clinical:'),
  );
}

function checkValue(value, node, context) {
  for (const pattern of PATTERNS) {
    if (pattern.test(value)) {
      const src = context.getSourceCode();
      if (hasClinicalAllowComment(node, src)) return;
      context.report({
        node,
        message: `Banned wellness term matched by "${pattern}". Use somatic/activation framing instead. Add // allow-clinical: <reason> above this line to suppress.`,
      });
      return;
    }
  }
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow clinical/therapeutic language in StillHaven source files',
    },
    schema: [],
  },
  create(context) {
    if (PATTERNS.length === 0) return {};
    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          checkValue(node.value, node, context);
        }
      },
      TemplateLiteral(node) {
        for (const quasi of node.quasis) {
          checkValue(quasi.value.raw, quasi, context);
        }
      },
      Identifier(node) {
        checkValue(node.name, node, context);
      },
      JSXText(node) {
        checkValue(node.value, node, context);
      },
    };
  },
};
