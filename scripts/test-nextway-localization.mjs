import assert from "node:assert/strict";
import fs from "node:fs";

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

for (const page of pages) {
  const html = fs.readFileSync(page, "utf8");
  assert.match(html, /<html[^>]*lang=["']it["']/i, `${page} must keep Italian as the default language`);
  assert.match(html, /<script src=["']\/nextway-i18n\.js["']><\/script>/, `${page} must load the shared localization runtime`);
}

console.log("NEXTWAY IT/EN localization contract: PASS");
console.log("All operational pages load the shared runtime; language preference, DOM updates and form labels are covered.");
