import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync('docs/companies/zinzino/commercial-base.v1.json', 'utf8'));
const root = config.compensation;
const partner = config.partner.compensation_plan;
assert.equal(root.calculations_enabled, false);
assert.equal(partner.calculations_enabled, false);
assert.equal(root.rules_status, 'phase_2_structured_reference');
assert.equal(partner.rules_status, 'phase_2_structured_reference');
assert.ok(Array.isArray(root.rules) && root.rules.length >= 20);
assert.deepEqual(root.rules, partner.rules);
const byId = new Map(root.rules.map(rule => [rule.id, rule]));
for (const id of ['customer_activity_and_points','credits_balance_and_banking','credit_accelerators','partner_activation_and_grace_period','customer_career_titles','customer_cash_bonus','customer_recurring_rewards','partner_team_titles','team_commission','volume_commission','customer_acquisition_bonus','mentor_matching_bonus','partner_one_time_title_bonuses','zphone_and_zcar','income_centers_and_pay_points','zinzino4free_partner','fast_start_operational_rule_user_confirmed']) {
  assert.ok(byId.has(id), 'Missing compensation rule: ' + id);
  assert.equal(byId.get(id).source_url, root.source_url);
}
assert.equal(byId.get('fast_start_operational_rule_user_confirmed').status, 'confirmed_by_project_owner_for_nextway');
const fastStart = byId.get('fast_start_operational_rule_user_confirmed');
assert.equal(fastStart.source_plan_sequence.steps.length, 4);
assert.equal(fastStart.source_plan_sequence.base_fast_start_pay_points_total, 1850);
assert.deepEqual(fastStart.source_plan_sequence.steps.map(x => x.fast_start_bonus_pay_points), [100,400,1200,150]);
assert.equal(fastStart.source_plan_sequence.steps[1].requirements.placement.left, 1);
assert.equal(fastStart.source_plan_sequence.steps[1].requirements.placement.right, 1);
assert.equal(fastStart.source_plan_sequence.post_fast_start_enrollment_bonus.required_enrollment_points, 12);
assert.equal(byId.get('credit_accelerators').ECBx.multiplier, null);
assert.equal(byId.get('customer_one_time_and_fast_start_bonuses').one_time_bonuses[0].campaign_rules_required, true);

// Numeric consistency checks for published tables only; these do not enable runtime calculations.
const credits = byId.get('credits_balance_and_banking');
assert.equal(credits.maximum_balance_ratio, '2:1');
assert.ok(Math.abs(credits.maximum_larger_team_share - 2 / 3) < 1e-9);
assert.ok(Math.abs(credits.minimum_smaller_team_share - 1 / 3) < 1e-9);
assert.equal(credits.maximum_banked_credits_weekly, 1000000);
assert.equal(credits.maximum_banked_credits_monthly, 1000000);

const teamCommission = byId.get('team_commission').table;
assert.equal(teamCommission.length, 13);
for (const row of teamCommission) {
  assert.equal(row.pay_points, row.balanced_credits * row.rate_percent / 100,
    'Team Commission table mismatch at ' + row.balanced_credits + ' balanced Credits');
}
assert.equal(teamCommission.at(-1).pay_points, 1500);

const cashBonus = byId.get('customer_cash_bonus').tiers;
assert.deepEqual(cashBonus.map(x => x.percent), [10, 20, 25, 30]);

const cab = byId.get('customer_acquisition_bonus');
assert.equal(cab.tiers.length, 9);
assert.deepEqual(cab.tiers.map(x => x.tier), ['Mini','Small','Medium','Large','XL','XXL','3XL','4XL','5XL']);
let previousCabTotal = 50;
for (const [index, tier] of cab.tiers.entries()) {
  assert.equal(tier.left_credits, tier.right_credits, 'CAB must have symmetric left/right thresholds');
  assert.equal(tier.total_pay_points, previousCabTotal + tier.cumulative_increment_pay_points,
    'CAB cumulative increment mismatch at ' + tier.tier);
  if (index === 0) assert.equal(tier.cumulative_increment_pay_points, 0);
  previousCabTotal = tier.total_pay_points;
}
assert.equal(cab.source_interpretation.status, 'structured_reference_not_executable');
assert.match(cab.source_interpretation.active_partner_requirement.small_through_5xl, /Partner attivo/);
assert.match(cab.source_interpretation.active_partner_requirement.mini, /non deve estendere automaticamente/);
assert.ok(cab.source_interpretation.calculation_guardrails.length >= 4);

const otb = byId.get('partner_one_time_title_bonuses').rows;
assert.equal(otb.length, 14);
for (const row of otb) {
  const bonus = row.first.pay_points;
  assert.equal(row.second.pay_points, bonus, 'OTB second bonus differs for ' + row.title);
  assert.equal(row.third.pay_points, bonus, 'OTB third bonus differs for ' + row.title);
  assert.equal(row.payment.pp_per_month * row.payment.months, bonus,
    'OTB installment total mismatch for ' + row.title);
  assert.equal(row.payment.total_if_all_three, bonus * 3,
    'OTB total for three bonuses mismatch for ' + row.title);
}
const volume = byId.get('volume_commission');
assert.equal(volume.tiers.length, 12);
assert.equal(volume.tiers.at(-2).weekly_cap_pay_points, 30000);
assert.equal(volume.tiers.at(-1).weekly_cap_pay_points, 40000);
assert.equal(byId.get('enrollment_incentive_program').per_new_personally_enrolled_partner.reduce((sum, x) => sum + x.pay_points, 0), 300);

assert.ok(root.rule_coverage.remaining.length > 0);
assert.equal(byId.get('partner_team_titles').higher_titles.length, 8, 'Senior Partner titles and star progression must be structured');
assert.equal(byId.get('partner_one_time_title_bonuses').rows.length, 14, 'Complete OTB title table must be structured');
assert.equal(byId.get('partner_one_time_title_bonuses').rows[5].time_limit, 'no_time_limit');
assert.equal(byId.get('enrollment_incentive_program').maximum_pay_points_per_partner, 300);
assert.equal(byId.get('lifetime_enrollment_awards_and_incentive_trips').lifetime_awards.length, 7);
assert.equal(byId.get('partner_team_titles').higher_titles.find(x => x.title === '2 Star Global President and above').rank_qualification.total_balanced_mcv_in_ic1, 3000000);
assert.ok(fs.readFileSync('docs/companies/zinzino/knowledge/compensation-plan-eu-2025-structured-rules.md','utf8').includes('calculations_enabled=false'));
console.log('Zinzino EU 2025 compensation rule registry: PASS');
