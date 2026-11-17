import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync('docs/companies/zinzino/commercial-base.v1.json', 'utf8'));
const root = config.compensation;
const partner = config.partner.compensation_plan;
assert.equal(root.calculations_enabled, false);
assert.equal(partner.calculations_enabled, false);
assert.equal(root.rules_status, 'phase_1_structured_reference');
assert.equal(partner.rules_status, 'phase_1_structured_reference');
assert.ok(Array.isArray(root.rules) && root.rules.length >= 18);
assert.deepEqual(root.rules, partner.rules);
const byId = new Map(root.rules.map(rule => [rule.id, rule]));
for (const id of ['customer_activity_and_points','credits_balance_and_banking','credit_accelerators','partner_activation_and_grace_period','customer_career_titles','customer_cash_bonus','customer_recurring_rewards','partner_team_titles','team_commission','volume_commission','customer_acquisition_bonus','mentor_matching_bonus','partner_one_time_title_bonuses','zphone_and_zcar','income_centers_and_pay_points','zinzino4free_partner','fast_start_operational_rule_user_confirmed']) {
  assert.ok(byId.has(id), 'Missing compensation rule: ' + id);
  assert.equal(byId.get(id).source_url, root.source_url);
}
assert.equal(byId.get('fast_start_operational_rule_user_confirmed').status, 'confirmed_by_project_owner_for_nextway');
assert.equal(byId.get('credit_accelerators').accelerators.ECBx.multiplier, null);
assert.equal(byId.get('customer_one_time_and_fast_start_bonuses').one_time_bonuses[0].campaign_rules_required, true);
assert.ok(root.rule_coverage.remaining.length > 0);
assert.equal(byId.get('partner_team_titles').higher_titles.length, 8, 'Senior Partner titles and star progression must be structured');
assert.equal(byId.get('partner_one_time_title_bonuses').rows.length, 14, 'Complete OTB title table must be structured');
assert.equal(byId.get('partner_one_time_title_bonuses').rows[5].time_limit, 'no_time_limit');
assert.ok(fs.readFileSync('docs/companies/zinzino/knowledge/compensation-plan-eu-2025-structured-rules.md','utf8').includes('calculations_enabled=false'));
console.log('Zinzino EU 2025 compensation rule registry: PASS');
