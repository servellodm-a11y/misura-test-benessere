# NEXTWAY — Release verification checklist

Status: prepared, not executed  
Prepared: 18 November 2026  
Related change: PR #58 — workspace-scoped Knowledge Base context and IT/EN localization

This checklist is a release gate. It does not authorize a production deployment, database changes, workspace activation, real customer tests or AI requests.

## 1. Visual verification — real browsers

### Required environments

| Environment | Viewport / device | Browser |
|---|---:|---|
| Desktop wide | 1440 × 900 | Chrome current stable |
| Desktop compact | 1280 × 800 | Chrome current stable |
| Mobile standard | 390 × 844 | Safari on iPhone or equivalent real device |
| Mobile compact | 360 × 800 | Chrome on Android or equivalent real device |

Use actual browser rendering. Automated DOM simulation and static HTML checks do not count as visual verification.

### Pages in scope

- `nextway-ai.html` — main CRM / lead archive
- `nextway-admin.html` — platform administration and Knowledge Base
- `nextway-dashboard.html` — dashboard
- `nextway-analisi.html` — analysis
- `nextway-ricerca.html` — prospect search
- `nextway-motore-ricerca.html` — multi-search
- `nextway-reset-password.html` — password recovery

### Checks for each page

- [ ] No horizontal overflow, clipped controls or overlapping sections.
- [ ] Navigation, forms, dialogs and primary actions remain usable at each viewport.
- [ ] Italian is the default language.
- [ ] Switching to English translates visible UI labels, placeholders, titles and known dialogs.
- [ ] Language preference persists after reload and navigation.
- [ ] Switching back to Italian restores Italian labels.
- [ ] Dynamic content inserted after page load is translated where a dictionary entry exists.
- [ ] Long labels and translated text do not break cards, tables or mobile layouts.
- [ ] Keyboard focus remains visible and controls retain accessible names.
- [ ] Browser console contains no new uncaught errors.

Record browser/version, viewport, page, result, issue and screenshot reference. Do not mark a page verified without a real rendered-browser inspection.

## 2. Non-AI end-to-end checks — after authorized release

These tests must use a dedicated test workspace and synthetic records. Do not use real prospect/customer data.

### Authentication and workspace isolation

- [ ] Sign in with the authorized test administrator.
- [ ] Confirm workspace membership and role before accessing workspace data.
- [ ] Confirm a user without membership cannot read another workspace's Knowledge Base.
- [ ] Confirm an unauthenticated request is rejected by protected upload/ingest functions.

### Knowledge Base lifecycle

- [ ] Upload a small synthetic Italian document; confirm it is created as pending.
- [ ] Upload a small synthetic English document; confirm it is created as pending.
- [ ] Confirm unsupported language codes are rejected.
- [ ] Confirm an unapproved document is not returned by search.
- [ ] Approve the synthetic documents using the authorized admin workflow.
- [ ] Search in Italian and confirm only eligible Italian chunks are returned.
- [ ] Search in English and confirm only eligible English chunks are returned.
- [ ] Confirm workspace, module, audience, approval and validity filters are enforced.
- [ ] Confirm duplicate uploads are handled idempotently and do not publish partial content.
- [ ] Confirm revoking/withdrawing a document removes it from eligible search results.

### AI-free restriction

- [ ] Use mocked/fixed responses for any Setter UI integration test.
- [ ] Do not invoke OpenAI, the live AI Setter generation path or any paid model.
- [ ] Do not run generation tests unless the user separately authorizes token use.
- [ ] Record explicitly that no AI credits/tokens were consumed.

### Evidence and rollback

- [ ] Keep all test records clearly marked as synthetic.
- [ ] Capture request/response status and relevant audit entries without exposing secrets or personal data.
- [ ] Delete test records only through the approved test cleanup procedure.
- [ ] Confirm no production customer, prospect, conversion or partner records were changed.

## 3. Release controls

- PR #58 must remain open and draft until review is complete.
- Do not merge if merging could trigger the Netlify production deployment.
- No Netlify production deployment before 4 December 2026 unless separately authorized.
- No production end-to-end tests or real-user/conversion tests before the release is authorized.
- No workspace creation or activation is authorized by this checklist.
- No AI generation or paid token use is authorized by this checklist.

## 4. Completion criteria

Visual verification is complete only when all required pages have been inspected in real desktop and mobile browsers and evidence is recorded.

Non-AI end-to-end verification is complete only when the synthetic workspace lifecycle and isolation checks pass in the authorized environment.

AI generation, production rollout and business activation remain separate approval gates.
