import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCatalogs, validateCopyReferences, validateLocaleRegistration, lintCopySource } from "./check-copy.mjs";
const valid = { "en-GB": { greeting: "Hi {{name}}", count_one: "{{count}} item", count_other: "{{count}} items" }, "pt-BR": { greeting: "Oi {{name}}", count_one: "{{count}} item", count_other: "{{count}} itens", count_many: "{{count}} itens" } };
test("catalogs require semantic keys, matching shapes, placeholders and locale plural forms", () => {
 assert.deepEqual(validateCatalogs(valid), []);
 for (const change of [c => delete c["pt-BR"].greeting, c => c["pt-BR"].greeting = "Oi", c => c["pt-BR"].greeting = [], c => delete c["pt-BR"].count_many]) {
  const catalog = structuredClone(valid); change(catalog); assert.ok(validateCatalogs(catalog).length > 0);
 }
});
test("unknown keys and inline fallback text fail", () => {
 assert.deepEqual(validateCopyReferences([{path:"component.tsx",text:'t("greeting")'}], valid), []);
 assert.ok(validateCopyReferences([{path:"component.tsx",text:'t("missing")'}], valid).length > 0);
 assert.ok(validateCopyReferences([{path:"component.tsx",text:'t("greeting", {defaultValue:"Hello"})'}], valid).length > 0);
});
test("literal gate covers JSX, accessibility, helpers, label objects and templates", async () => {
 for (const text of ['const x = <p>Hello</p>;', 'const x = <p>HELLO</p>;', 'const TITLE = "Hello";', 'const RESULT = {label:"Hello"};', 'const x = <p>{"Hello"}</p>;', 'const x = <button aria-label="Close" />;', 'const label = "hello";', 'const x = {label:"Hello"};', 'const text = `Hi ${name}`;', 'uiCopy("copy.1stWinner3", {value1:"Not scored"});', 'uiCopy("copy.1stWinner3", {value1:`Not ${score}`});']) assert.ok((await lintCopySource(text)).length > 0, text);
 assert.deepEqual(await lintCopySource('const x = <p>{t("greeting")}</p>;'), []);
 assert.deepEqual(await lintCopySource('const x = {status:"insufficient_evidence", id:"c1"};'), []);
});

test("every supported and registered language has both catalogs", () => {
 assert.deepEqual(validateLocaleRegistration(["en-GB","pt-BR"], ["en-GB","pt-BR"], {web:["en-GB","pt-BR"],shared:["en-GB","pt-BR"]}), []);
 assert.ok(validateLocaleRegistration(["en-GB","pt-BR","es-ES"], ["en-GB","pt-BR"], {web:["en-GB","pt-BR"],shared:["en-GB","pt-BR"]}).length > 0);
});

test("plural families cannot be replaced by a generic unsuffixed message", () => {
 assert.ok(validateCatalogs({"en-GB":{count_one:"{{count}} item",count_other:"{{count}} items"},"pt-BR":{count:"{{count}} itens"}}).length > 0);
});
test("array catalog shapes cannot become numeric-keyed objects", () => {
 assert.ok(validateCatalogs({"en-GB":{tips:["Hello"]},"pt-BR":{tips:{"0":"Olá"}}}).length > 0);
});
