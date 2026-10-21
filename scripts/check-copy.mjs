import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { ESLint } from 'eslint';

const root = fileURLToPath(new URL('..', import.meta.url));
const flatten = (value, prefix = '', result = {}) => {
  if (typeof value === 'string') result[prefix] = value;
  else if (Array.isArray(value)) value.forEach((item, index) => flatten(item, `${prefix}.${index}`, result));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) flatten(item, prefix ? `${prefix}.${key}` : key, result);
  else result[prefix] = null;
  return result;
};
const placeholders = value => [...(value?.matchAll(/{{\s*([^{}]+?)\s*}}/g) ?? [])].map(match => match[1]).sort().join(',');
const semanticKey = key => key.replace(/_(?:zero|one|two|few|many|other)$/, '');

function catalogShapes(value, prefix = '', result = {}) {
  result[semanticKey(prefix)] = Array.isArray(value) ? 'array' : value !== null && typeof value === 'object' ? 'object' : typeof value;
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) catalogShapes(child, prefix ? `${prefix}.${key}` : key, result);
  return result;
}

export function validateCatalogs(catalogs) {
  const errors = [];
  const entries = Object.entries(catalogs).map(([locale, data]) => [locale, flatten(data)]);
  const baseline = entries[0]?.[1] ?? {};
  const baselineShapes = catalogShapes(Object.values(catalogs)[0]);
  const pluralFamilies = new Set(Object.values(catalogs).flatMap(catalog => Object.keys(flatten(catalog)).filter(key => semanticKey(key) !== key).map(semanticKey)));
  const baselineKeys = new Set(Object.keys(baseline).map(semanticKey));
  for (const [locale, messages] of entries) {
    const keys = new Set(Object.keys(messages).map(semanticKey));
    const shapes = catalogShapes(catalogs[locale]);
    for (const [key, shape] of Object.entries(baselineShapes)) if (shapes[key] !== shape) errors.push(`${locale}: shape mismatch ${key}`);
    for (const family of pluralFamilies) {
      if (Object.hasOwn(messages,family)) errors.push(`${locale}: plural family cannot be unsuffixed ${family}`);
      for (const category of new Intl.PluralRules(locale).resolvedOptions().pluralCategories) if (typeof messages[`${family}_${category}`] !== 'string') errors.push(`${locale}: missing plural ${family}_${category}`);
    }
    for (const key of baselineKeys) if (!keys.has(key)) errors.push(`${locale}: missing ${key}`);
    for (const key of keys) if (!baselineKeys.has(key)) errors.push(`${locale}: extra ${key}`);
    for (const [key, value] of Object.entries(messages)) {
      if (typeof value !== 'string' || !value.trim()) { errors.push(`${locale}: invalid value ${key}`); continue; }
      const base = semanticKey(key);
      const reference = baseline[base] ?? baseline[`${base}_other`];
      if (reference !== undefined && placeholders(reference) !== placeholders(value)) errors.push(`${locale}: placeholders ${key}`);
      if (key !== base) for (const category of new Intl.PluralRules(locale).resolvedOptions().pluralCategories) {
        if (typeof messages[`${base}_${category}`] !== 'string') errors.push(`${locale}: missing plural ${base}_${category}`);
      }
    }
  }
  return [...new Set(errors)];
}

export function validateLocaleRegistration(supported, registered, catalogGroups) {
  const expected = [...supported].sort().join(",");
  const errors = [];
  for (const [name, languages] of Object.entries({ registered, ...catalogGroups })) {
    if ([...languages].sort().join(",") !== expected) errors.push(`${name}: locales must match supported registry`);
  }
  return errors;
}

export function validateCopyReferences(files, catalogs) {
  const errors = [];
  const messages = flatten(Object.values(catalogs)[0] ?? {});
  const has = key => Object.hasOwn(messages, key) || Object.hasOwn(messages, `${key}_other`) || Object.hasOwn(messages, `${key}.0`);
  for (const file of files) {
    const ast = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = node => {
      if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'defaultValue') errors.push(`${file.path}: inline defaultValue`);
      if (ts.isCallExpression(node) && /^(?:t|i18n\.t|uiCopy|mockCopy|translateShared)$/.test(node.expression.getText(ast))) {
        const key = node.arguments[node.expression.getText(ast) === 'translateShared' ? 1 : 0];
        // Generic formatter boundaries forward keys; all product call sites are validated here.
        const genericBoundary = /(?:^|\/)i18n\/copy\.ts$|packages\/contract\/src\/copy\.ts$/.test(file.path);
        if (key && ts.isStringLiteral(key)) { if (!has(key.text)) errors.push(`${file.path}: unknown key ${key.text}`); }
        else if (key && ts.isTemplateExpression(key) && key.head.text === 'countries.' && key.templateSpans.length === 1 && key.templateSpans[0].literal.text === '') {
          // Country codes are the finite origin registry, checked against each catalog below.
          for (const country of ['BR','ES','PE','CL','MX','ZA','MA','CR','IT','US','NZ','IN','EG','CO']) if (!has(`countries.${country}`)) errors.push(`${file.path}: unknown country ${country}`);
        } else if (!genericBoundary) errors.push(`${file.path}: translation key must be statically declared`);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  return errors;
}

export async function lintCopySource(text) {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'eslint.config.mjs') });
  const result = await eslint.lintText(text, { filePath: 'apps/web/src/__copy_fixture.tsx' });
  return result.flatMap(file => file.messages.map(message => message.message));
}

function walk(directory) {
  return fs.readdirSync(directory, {withFileTypes:true}).flatMap(entry => entry.isDirectory() ? walk(path.join(directory,entry.name)) : [path.join(directory,entry.name)]);
}
async function main() {
  const read = file => JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  const loadCatalogs = directory => Object.fromEntries(fs.readdirSync(path.join(root,directory)).filter(file => file.endsWith('.json')).map(file => [file === 'en.json' ? 'en-GB' : file.slice(0,-5), read(`${directory}/${file}`)]));
  const web = loadCatalogs('apps/web/src/i18n/locales');
  const shared = loadCatalogs('packages/contract/src/locales');
  const source = [...walk(path.join(root,'apps/web/src')), ...walk(path.join(root,'packages/contract/src')), path.join(root,'apps/proxy/src/document.ts'), path.join(root,'apps/proxy/src/verifier/verify-response.ts')]
    .filter(file => /\.tsx?$/.test(file) && !file.endsWith('.d.ts'))
    .map(file => ({path:path.relative(root,file),text:fs.readFileSync(file,'utf8')}));
  // Web callers may request shared metadata only through translateShared. Keys are unique across these namespaces.
  const merged = Object.fromEntries(Object.keys(web).map(locale => [locale,{...web[locale], countries:shared[locale].countries, metadata:shared[locale].metadata, verifier:shared[locale].verifier, copy:{...web[locale].copy,...shared[locale].copy}}]));
  const localeSource = ts.createSourceFile('locale.ts',fs.readFileSync(path.join(root,'packages/contract/src/locale.ts'),'utf8'),ts.ScriptTarget.Latest,true);
  let supported = [];
  const readRegistry = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(localeSource) === 'SUPPORTED_LOCALES') {
      const array = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (ts.isArrayLiteralExpression(array)) supported = array.elements.map(item => item.text);
    }
    ts.forEachChild(node,readRegistry);
  };
  readRegistry(localeSource);
  const webSource = ts.createSourceFile('index.ts',fs.readFileSync(path.join(root,'apps/web/src/i18n/index.ts'),'utf8'),ts.ScriptTarget.Latest,true);
  let registered = [];
  const readResources = node => {
    if (ts.isPropertyAssignment(node) && node.name.getText(webSource) === 'resources' && ts.isObjectLiteralExpression(node.initializer)) registered = node.initializer.properties.map(property => property.name.text);
    ts.forEachChild(node,readResources);
  };
  readResources(webSource);
  const errors = [...validateLocaleRegistration(supported,registered,{web:Object.keys(web),shared:Object.keys(shared)}),...validateCatalogs(web),...validateCatalogs(shared),...validateCopyReferences(source,merged)];
  const html = fs.readFileSync(path.join(root,'apps/web/index.html'),'utf8');
  if (!/<title>%POMONA_TITLE%<\/title>/.test(html) || !html.includes('content="%POMONA_DESCRIPTION%"')) errors.push('HTML metadata must use catalog build tokens');
  const manifest = read('apps/web/public/manifest.json');
  if (manifest.name !== web['en-GB'].app.name || manifest.short_name !== web['en-GB'].app.name || manifest.description) errors.push('Manifest must use the invariant catalog brand; descriptive copy requires catalog generation');
  if (fs.existsSync(path.join(root,'apps/web/public/offline.html'))) errors.push('Offline HTML must be generated from the catalog-backed shell');
  for (const error of errors) console.error(error);
  if (errors.length) process.exitCode=1; else console.log('Copy catalogs and references passed.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
