import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSettlements() {
  console.log('=== Checking Settlements Structure ===\n');

  // Get site IDs
  const { data: padmavathy } = await supabase
    .from('sites')
    .select('id, name, site_group_id')
    .ilike('name', '%padma%')
    .single();

  const { data: srinivasan } = await supabase
    .from('sites')
    .select('id, name')
    .ilike('name', '%sriniva%')
    .single();

  console.log('Padmavathy:', padmavathy?.name, padmavathy?.id);
  console.log('Srinivasan:', srinivasan?.name, srinivasan?.id);
  console.log('Site Group ID:', padmavathy?.site_group_id);

  // Get tea shop for this group
  const { data: teaShops } = await supabase
    .from('tea_shops')
    .select('id, name');

  console.log('\nTea Shops:');
  teaShops?.forEach(ts => console.log(`  - ${ts.name} (${ts.id})`));

  // Get settlements
  const { data: settlements } = await supabase
    .from('tea_shop_settlements')
    .select('id, payment_date, amount_paid, site_id, site_group_id, notes, tea_shop_id')
    .order('payment_date', { ascending: false })
    .limit(15);

  console.log('\n=== Recent Settlements ===');
  console.log('Date       | Amount  | Site                | Tea Shop');
  console.log('-----------|---------|---------------------|----------');

  for (const s of settlements || []) {
    let siteLabel = 'Group/NULL';
    if (s.site_id === padmavathy?.id) siteLabel = 'Padmavathy';
    else if (s.site_id === srinivasan?.id) siteLabel = 'Srinivasan';
    else if (s.site_id) siteLabel = s.site_id.substring(0, 8);

    const teaShop = teaShops?.find(ts => ts.id === s.tea_shop_id);
    console.log(`${s.payment_date} | Rs${s.amount_paid?.toString().padStart(5)} | ${siteLabel.padEnd(19)} | ${teaShop?.name || 'N/A'}`);
  }

  // Get settlement allocations linked to entries
  console.log('\n=== Settlement -> Entry Allocations ===');

  const { data: settleAllocs } = await supabase
    .from('tea_shop_settlement_allocations')
    .select(`
      id,
      allocated_amount,
      settlement_id,
      entry_id,
      tea_shop_settlements!inner(payment_date, amount_paid, site_id),
      tea_shop_entries!inner(date, total_amount, is_group_entry, site_id)
    `)
    .order('allocated_amount', { ascending: false })
    .limit(30);

  console.log('Settlement Date | Entry Date | Alloc Amt | Entry Type | Entry Site');
  console.log('----------------|------------|-----------|------------|------------');

  for (const a of settleAllocs || []) {
    const settlementSite = a.tea_shop_settlements?.site_id === padmavathy?.id ? 'Padmavathy' :
                           a.tea_shop_settlements?.site_id === srinivasan?.id ? 'Srinivasan' : 'Group/NULL';
    const entryType = a.tea_shop_entries?.is_group_entry ? 'Group' : 'Individual';
    const entrySite = a.tea_shop_entries?.site_id === padmavathy?.id ? 'Padmavathy' :
                      a.tea_shop_entries?.site_id === srinivasan?.id ? 'Srinivasan' :
                      a.tea_shop_entries?.site_id ? 'Other' : 'NULL (Group)';

    console.log(`${a.tea_shop_settlements?.payment_date} | ${a.tea_shop_entries?.date} | Rs${a.allocated_amount?.toString().padStart(6)} | ${entryType.padEnd(10)} | ${entrySite}`);
  }

  // Check entries for Dec 23-30 specifically
  console.log('\n=== Dec 23-30 Entries Detail ===');

  const { data: decEntries } = await supabase
    .from('tea_shop_entries')
    .select('id, date, total_amount, amount_paid, is_fully_paid, is_group_entry, site_id')
    .gte('date', '2025-12-23')
    .lte('date', '2025-12-30')
    .order('date');

  console.log('Date       | Total  | Paid   | Fully? | Type  | Site');
  console.log('-----------|--------|--------|--------|-------|------');

  for (const e of decEntries || []) {
    const entryType = e.is_group_entry ? 'Group' : 'Indiv';
    const siteLabel = e.site_id === padmavathy?.id ? 'Padma' :
                      e.site_id === srinivasan?.id ? 'Srini' :
                      e.site_id ? 'Other' : 'NULL';
    const paidStatus = e.is_fully_paid ? 'Yes' : 'No';

    console.log(`${e.date} | Rs${e.total_amount?.toString().padStart(4)} | Rs${(e.amount_paid || 0).toString().padStart(4)} | ${paidStatus.padEnd(6)} | ${entryType.padEnd(5)} | ${siteLabel}`);

    // Get allocations for this entry
    if (e.is_group_entry) {
      const { data: entryAllocs } = await supabase
        .from('tea_shop_entry_allocations')
        .select('site_id, allocated_amount, day_units_sum')
        .eq('entry_id', e.id);

      for (const alloc of entryAllocs || []) {
        const allocSite = alloc.site_id === padmavathy?.id ? 'Padmavathy' :
                          alloc.site_id === srinivasan?.id ? 'Srinivasan' : 'Other';
        console.log(`           -> ${allocSite}: Rs${alloc.allocated_amount} (${alloc.day_units_sum} WD)`);
      }
    }
  }
}

checkSettlements();
