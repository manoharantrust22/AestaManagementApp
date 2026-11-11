import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugWaterfall() {
  console.log('=== Debugging Waterfall ===\n');

  // Get Padmavathy info
  const { data: padmavathy } = await supabase
    .from('sites')
    .select('id, name, site_group_id')
    .ilike('name', '%padma%')
    .single();

  console.log('Padmavathy:', padmavathy?.name, padmavathy?.id);
  console.log('Site Group ID:', padmavathy?.site_group_id);

  // Get tea shops associated with this group
  const { data: teaShops } = await supabase
    .from('tea_shops')
    .select('id, name');

  console.log('\nAll Tea Shops:');
  teaShops?.forEach(ts => console.log(`  ${ts.id} - ${ts.name}`));

  // Get entries for this site group
  const { data: entries } = await supabase
    .from('tea_shop_entries')
    .select('id, date, tea_shop_id, site_group_id, is_group_entry, total_amount')
    .eq('site_group_id', padmavathy.site_group_id)
    .eq('is_group_entry', true)
    .limit(5)
    .order('date', { ascending: false });

  console.log('\nRecent Group Entries:');
  for (const e of entries || []) {
    console.log(`  ${e.date} | Tea Shop: ${e.tea_shop_id} | Total: Rs${e.total_amount}`);
  }

  // Get settlements
  const { data: settlements } = await supabase
    .from('tea_shop_settlements')
    .select('id, payment_date, amount_paid, tea_shop_id, site_id, site_group_id, is_cancelled')
    .order('payment_date', { ascending: false })
    .limit(15);

  console.log('\n=== All Settlements ===');
  console.log('Date       | Amount | Tea Shop ID                          | Site ID                              | Group ID                             | Cancelled');
  console.log('-----------|--------|--------------------------------------|--------------------------------------|--------------------------------------|----------');

  for (const s of settlements || []) {
    console.log(`${s.payment_date} | Rs${(s.amount_paid || 0).toString().padStart(4)} | ${s.tea_shop_id || 'NULL'.padEnd(36)} | ${s.site_id || 'NULL'.padEnd(36)} | ${s.site_group_id || 'NULL'.padEnd(36)} | ${s.is_cancelled ? 'Yes' : 'No'}`);
  }

  // Find the tea shop ID from entries
  const teaShopId = entries?.[0]?.tea_shop_id;
  console.log('\nUsing Tea Shop ID from entries:', teaShopId);

  // Get settlements for this tea shop specifically
  const { data: shopSettlements } = await supabase
    .from('tea_shop_settlements')
    .select('*')
    .eq('tea_shop_id', teaShopId)
    .eq('is_cancelled', false);

  console.log(`\nSettlements for tea shop ${teaShopId}:`, shopSettlements?.length || 0);

  // Get settlements that might apply (site_id NULL but site_group_id matches)
  const { data: groupSettlements } = await supabase
    .from('tea_shop_settlements')
    .select('*')
    .is('site_id', null)
    .eq('site_group_id', padmavathy.site_group_id)
    .eq('is_cancelled', false);

  console.log(`Settlements with NULL site_id but matching group:`, groupSettlements?.length || 0);

  for (const s of groupSettlements || []) {
    console.log(`  ${s.payment_date} | Rs${s.amount_paid} | Tea Shop: ${s.tea_shop_id}`);
  }

  // Check if tea_shop_id on settlements matches tea_shop_id on entries
  console.log('\n=== Checking Tea Shop ID Matching ===');

  const entryTeaShopIds = new Set(entries?.map(e => e.tea_shop_id));
  const settlementTeaShopIds = new Set(settlements?.map(s => s.tea_shop_id).filter(id => id));

  console.log('Tea Shop IDs in entries:', [...entryTeaShopIds]);
  console.log('Tea Shop IDs in settlements:', [...settlementTeaShopIds]);

  const matches = [...entryTeaShopIds].filter(id => settlementTeaShopIds.has(id));
  console.log('Matching IDs:', matches.length > 0 ? matches : 'NONE - This is the problem!');

  // Get settlement allocations
  const { data: settlementAllocs } = await supabase
    .from('tea_shop_settlement_allocations')
    .select('*')
    .limit(10);

  console.log('\n=== Settlement Allocations (first 10) ===');
  console.log('Count:', settlementAllocs?.length || 0);
}

debugWaterfall();
