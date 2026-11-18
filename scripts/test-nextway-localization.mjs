import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const runtime = fs.readFileSync("nextway-i18n.js", "utf8");
const pages = [
  "nextway-ai.html",
  "nextway-admin.html",
  "nextway-dashboard.html",
  "nextway-analisi.html",
  "nextway-ricerca.html",
  "nextway-motore-ricerca.html",
  "nextway-reset-password.html",
];

assert.match(runtime, /const translations = \{/);
assert.match(runtime, /function applyLanguage\(language\)/);
assert.match(runtime, /document\.documentElement\.lang = currentLanguage/);
assert.match(runtime, /localStorage\.setItem\("nextway-language"/);
assert.match(runtime, /new MutationObserver/);
assert.match(runtime, /function translateValue\(value, language\)/);
assert.match(runtime, /placeholder/);
assert.match(runtime, /Switch to English/);
assert.match(runtime, /Switch to Italian/);
assert.match(runtime, /window\.alert = \(message\)/);
assert.match(runtime, /window\.confirm = \(message\)/);
assert.match(runtime, /window\.prompt = \(message, defaultValue\)/);
assert.match(runtime, /key\.endsWith\(":"\) \|\| key\.endsWith\(" "\)/);
assert.match(runtime, /"Gestione Lead": "Lead management"/);
assert.match(runtime, /"Criteri di qualificazione dei contatti": "Contact qualification criteria"/);
assert.match(runtime, /"Ricerca mirata dei profili": "Targeted profile search"/);
assert.match(runtime, /"Salva nuova password": "Save new password"/);
assert.doesNotMatch(runtime, /fetch\s*\(|XMLHttpRequest|openai|api\.openai\.com/i);
let confirmedMessage = "";
const sandboxWindow = { alert() {}, confirm(message) { confirmedMessage = message; return true; }, prompt(message) { return message; } };
const sandboxDocument = {
  readyState: "loading",
  documentElement: { lang: "it" },
  title: "NEXTWAY",
  body: { nodeType: 1, matches() { return false; }, hasAttribute() { return false; }, childNodes: [] },
  addEventListener() {},
  getElementById() { return null; },
};
vm.runInNewContext(runtime, { window: sandboxWindow, document: sandboxDocument, Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 }, MutationObserver: class {}, localStorage: { setItem() {} } });
sandboxWindow.NEXTWAY_I18N.setLanguage("en");
assert.equal(sandboxDocument.documentElement.lang, "en");
assert.equal(sandboxWindow.NEXTWAY_I18N.translate("Attivare il workspace Alpha?"), "Activate workspace Alpha?");
sandboxWindow.confirm("Approvare il documento Policy? Sarà disponibile alla ricerca nel workspace.");
assert.equal(confirmedMessage, "Approve document Policy? It will be available in workspace search.");
sandboxWindow.confirm("Confermi di creare l’account e inviare l’invito al partner? L’operazione non è reversibile dalla coda conversioni.");
assert.equal(confirmedMessage, "Confirm create the account and send the Partner invitation? This operation cannot be reversed from the conversion queue.");
sandboxWindow.NEXTWAY_I18N.setLanguage("it");
assert.equal(sandboxDocument.documentElement.lang, "it");
assert.equal(sandboxWindow.NEXTWAY_I18N.translate("Activate workspace Alpha?"), "Attivare il workspace Alpha?");

const dictionaryKeys = new Set([...runtime.matchAll(/^\s*"((?:[^"\\]|\\.)+)"\s*:/gm)].map((match) => match[1].replace(/\\"/g, '"')));
const dynamicMessageFiles = ["nextway-cloud.js", "nextway-admin.js", "nextway-setter.js"];
const dynamicPrefixes = [...dictionaryKeys].filter((key) => key.endsWith(":") || key.endsWith(" "));

for (const file of dynamicMessageFiles) {
  const source = fs.readFileSync(file, "utf8");
  const messages = [...source.matchAll(/(?:say|status|setStatus|alert|confirm|prompt)\s*\(\s*([\'"`])([\s\S]*?)\1/g)]
    .map((match) => match[2].replace(/\s+/g, " "));
  const missing = [...new Set(messages)].filter((message) =>
    message.trim() && !dictionaryKeys.has(message.trim()) && !dynamicPrefixes.some((prefix) => message.startsWith(prefix)),
  );
  assert.deepEqual(missing, [], file + " contains dynamic UI messages without a localization entry");
}

for (const page of pages) {
  const html = fs.readFileSync(page, "utf8");
  assert.match(html, /<html[^>]*lang=["']it["']/i, `${page} must keep Italian as the default language`);
  assert.match(html, /<script src=["']\/nextway-i18n\.js["']><\/script>/, `${page} must load the shared localization runtime`);
  const visibleHtml = html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");
  const visibleText = [...visibleHtml.matchAll(/>([^<>]{2,180})</g)].map((match) => match[1].trim()).filter((value) => /[A-Za-zÀ-ÿ]/.test(value));
  const missingVisibleText = [...new Set(visibleText)].filter((value) => !dictionaryKeys.has(value));
  assert.deepEqual(missingVisibleText, [], page + " contains visible copy without an English translation");
  const labels = [...html.matchAll(/\b(?:placeholder|title|aria-label)="([^"]+)"/gi)].map((match) => match[1]).filter((value) => /[A-Za-zÀ-ÿ]/.test(value) && !/^https?:\/\//i.test(value));
  const missingLabels = [...new Set(labels)].filter((value) => !dictionaryKeys.has(value));
  assert.deepEqual(missingLabels, [], page + " contains untranslated placeholders or accessibility labels");
}

console.log("NEXTWAY IT/EN localization contract: PASS");
console.log("All operational pages load the shared runtime; language preference, DOM updates and form labels are covered.");
