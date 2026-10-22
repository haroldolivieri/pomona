import parser from '@typescript-eslint/parser';
import i18next from 'eslint-plugin-i18next';

const displayRule = {
  meta: { type: 'problem', schema: [], messages: { literal: 'Display copy must come from a translation catalog.' } },
  create(context) {
    const translationPosition = node => {
      for (let current = node.parent; current; current = current.parent) {
        if (current.type !== 'CallExpression' || !/^(?:t|uiCopy|mockCopy|translateShared)$/.test(context.sourceCode.getText(current.callee))) continue;
        const keyIndex = context.sourceCode.getText(current.callee) === 'translateShared' ? 1 : 0;
        if (current.arguments[keyIndex] === node) return 'key';
        const options = current.arguments[keyIndex + 1];
        if (options && node.range[0] >= options.range[0] && node.range[1] <= options.range[1]) return 'interpolation';
      }
      return null;
    };
    return {
      JSXText(node) { if (/[A-Za-z]/.test(node.value)) context.report({node,messageId:'literal'}); },
      TemplateLiteral(node) {
        if (translationPosition(node) === 'interpolation' && node.quasis.some(part => /[A-Za-z]/.test(part.value.raw))) context.report({node,messageId:'literal'});
      },
      Literal(node) {
        if (typeof node.value !== 'string' || !/[A-Za-z]/.test(node.value) || translationPosition(node) === "key") return;
        const parent = node.parent;
        if (parent.type === 'Property' && parent.key === node && !parent.computed) return;
        if (parent.type === 'BinaryExpression' && ['===','!==','==','!='].includes(parent.operator)) return;
        const displayProperty = parent.type === 'Property' && /^(?:label|sub|title|headline|subtitle|eyebrow|tip|instruction|bannerText|flipHeadline|whereLabel|eatWithinLabel|displayName)$/.test(parent.key.name ?? parent.key.value);
        const displayAttribute = parent.type === 'JSXAttribute' && /^(?:aria-label|title|alt|placeholder)$/.test(parent.name.name);
        const uppercaseConstant = parent.type === 'VariableDeclarator' && /^[A-Z_]+$/.test(parent.id.name ?? '') && !/^(?:[A-Z]{2}|[a-z]+_[a-z_]+)$/.test(node.value);
        if (displayProperty || displayAttribute || uppercaseConstant || translationPosition(node) === "interpolation") context.report({node,messageId:'literal'});
      },
    };
  },
};

// Technical values are allowed by role. Display text must remain catalog-backed.
export default [{ ignores: ['**/node_modules/**', '**/dist/**', '**/worker-env.d.ts'] }, {
  files: ['apps/web/src/**/*.{ts,tsx}', 'packages/contract/src/ripeness-target.ts', 'packages/contract/src/seasonality.ts', 'apps/proxy/src/verifier/verify-response.ts'],
  languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
  plugins: { i18next, copy: { rules: { "catalog-only": displayRule } } },
  linterOptions: { reportUnusedDisableDirectives: 'error' },
  rules: { 'copy/catalog-only':'error', 'i18next/no-literal-string': ['error', {
    mode: 'all', 'should-validate-template': true,
    words: { exclude: ['^[0-9\\W_]+$', '^(?:[A-Z]{2}|GET|POST|OPTIONS|UTC|NFD|M|L|Z)$', '^(?:en-GB|pt-BR|dark|light|center|front|back|min|default|expanded|sheet|photo|root|all_underripe|all_already_ripe|no_match|ready_now|in_2_3_days|later_this_week|peak|in_season|off_season|imported_year_round|image/(?:jpeg|webp)|mock-device-id|errors\\.analysisFailed)$', '^#[0-9a-fA-F]{3,8}$', '^(?:rgba|rgb)\\([^)]*\\)$', '^data:image/.*$', '^\\d+(?:\\.\\d+)?s$'] },
    'jsx-components': { exclude: [] },
    'jsx-attributes': { exclude: ['^(?:className|style|type|key|id|width|height|data-testid|value|role|d|viewBox|fill|stroke|xmlns|accept|capture|tabIndex|aria-hidden|aria-live|aria-pressed|aria-expanded|aria-describedby|aria-labelledby|aria-controls)$'] },
    'object-properties': { exclude: ['^(?:type|phase|status|id|deviceId|winnerId|runnerUpId|targetCandidateId|delay|month|timeZone|mimeType|side|role|targetRole|targetWindow|targetRipeness|ripeness|mismatchReason|headlineKind|where|modelId|schemaVersion|promptVersion|abstentionReason|confidence|imageMimeType|method|credentials|headers|facingMode|ideal|position|display|flexDirection|justifyContent|alignItems|flexWrap|overflow|overflowX|overflowY|background|backgroundColor|backgroundImage|color|border|borderTop|borderBottom|borderLeft|borderRight|borderColor|borderStyle|borderRadius|fontFamily|fontWeight|fontSize|textAlign|textTransform|textDecoration|letterSpacing|whiteSpace|wordBreak|pointerEvents|cursor|userSelect|touchAction|WebkitUserSelect|WebkitTapHighlightColor|WebkitBackdropFilter|backdropFilter|boxShadow|textShadow|transform|transformOrigin|transition|animation|filter|opacity|width|height|minHeight|maxHeight|minWidth|maxWidth|padding|margin|objectFit|objectPosition|inset|top|left|right|bottom|gridTemplateColumns|gridTemplateRows|gap|boxSizing|backgroundSize|backgroundPosition|backgroundRepeat|strokeLinecap|strokeLinejoin|strokeDasharray|scrollbarWidth|origin|badgeBg|badgeFg|bg|fg|zone|origins|over|BR|EU|MED|NA|SOUTH|TROP)$'] },
    callees: { exclude: ['(?:t|uiCopy|mockCopy|translateShared|console\\.(?:log|warn|error)|telemetry\\.(?:capture|captureException)|addEventListener|removeEventListener|getElementById|querySelector|querySelectorAll|setAttribute|setItem|getItem|removeItem|has|get|set|delete|startsWith|endsWith|includes|indexOf|matchMedia|createElement|getContext|toDataURL|toBlob|register|DateTimeFormat|postMessage|errors\\.push|i18n\\.on|captureViewportCrop|resolveDisplayLocale|lookupProduceSeasonality|fetch|ApiClientError)$'] },
  }] },
}, {
  files: ['apps/web/src/lib/image-pipeline.ts'],
  rules: { 'i18next/no-literal-string': ['error', {mode:'all', callees:{exclude:['Error','fill','includes','startsWith','createElement','getContext','toDataURL','toBlob']}, words:{exclude:['^[0-9\\W_]+$','image/(?:jpeg|webp)','^data:.*$','^(?:rgba|rgb)\\([^)]*\\)$']}, 'object-properties':{exclude:['mimeType']}}] },
}];

// Canvas failures are diagnostics; all product failure screens use catalog-backed recovery text.
