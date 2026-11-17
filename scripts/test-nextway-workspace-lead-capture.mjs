import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cloud = readFileSync('nextway-cloud.js', 'utf8');
const search = readFileSync('nextway-motore-ricerca.html', 'utf8');

assert.match(search, /getLocalSearchArchiveIndex\(s\.user\.id,\s*searchWorkspaceId\)/,
  'local archive duplicate checks must be scoped to the selected workspace');
assert.match(search, /addSearchLeadToLocalArchive\(s\.user\.id,\s*\{workspace_id:\s*searchWorkspaceId/,
  'manual prospect capture must preserve the selected workspace ID');
assert.match(cloud, /function getLocalSearchArchiveIndex\(userId,workspaceId=''/,
  'local archive index must accept an optional workspace scope');
assert.match(cloud, /if\(workspaceId&&lead\.workspace_id!==workspaceId\)continue/,
  'local prospect matching must not leak duplicate matches across workspaces');
assert.match(cloud, /Workspace non valido: acquisizione sospesa/ ,
  'capture must reject an invalid workspace ID instead of silently falling back to personal scope');
assert.match(cloud, /workspace_id:workspaceId\|\|null/,
  'locally captured prospects must retain their workspace association');
assert.match(cloud, /workspace_id:r\.workspace_id\|\|null/,
  'cloud hydration must preserve workspace association');
assert.match(cloud, /Workspace del Lead non valido: sincronizzazione sospesa/ ,
  'CRM sync must reject invalid workspace IDs');
assert.match(cloud, /payload\.workspace_id=x\.workspace_id/,
  'CRM payload must persist a valid workspace ID');
assert.match(cloud, /duplicateQuery=payload\.workspace_id\?duplicateQuery\.eq\('workspace_id',payload\.workspace_id\):duplicateQuery\.is\('workspace_id',null\)/,
  'CRM duplicate reconciliation must match within the same workspace');
assert.match(cloud, /matchQuery=payload\.workspace_id\?matchQuery\.eq\('workspace_id',payload\.workspace_id\):matchQuery\.is\('workspace_id',null\)/,
  'unique-conflict reconciliation must match within the same workspace');
console.log('NEXTWAY workspace-aware prospect capture and CRM sync: 9 contract assertions passed.');