import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function consolidateTeaShop() {
  console.log('=== Consolidating Tea Shop IDs ===\n');

  // Get site group info
  const { data: padmavathy } = await supabase
    .from('sites')
    .select('id, name, site_group_id')
    .ilike('name', '%padma%')
    .single();

  console.log('Site Group ID:', padmavathy.site_group_id);

  // Get all unique tea_shop_ids used in entries for this group
  const { data: entries } = await supabase
    .from('tea_shop_entries')
    .select('tea_shop_id')
    .eq('site_group_id', padmavathy.site_group_id);

  const uniqueTeaShopIds = [...new Set(entries?.map(e => e.tea_shop_id).filter(id => id))];
  console.log('\nUnique tea_shop_ids in entries:', uniqueTeaShopIds);

  // Get tea shops info
  const { data: teaShops } = await supabase
    .from('tea_shops')
    .select('id, name')
    .in('id', uniqueTeaShopIds);

  console.log('\nTea shops found in DB:');
  teaShops?.forEach(ts => console.log(`  ${ts.id} - ${ts.name}`));

  // Find orphaned tea_shop_ids (not in tea_shops table)
  const validIds = teaShops?.map(ts => ts.id) || [];
  const orphanedIds = uniqueTeaShopIds.filter(id => !validIds.includes(id));
  console.log('\nOrphaned tea_shop_ids (not in tea_shops table):', orphanedIds);

  if (orphanedIds.length === 0 && uniqueTeaShopIds.length === 1) {
    console.log('\nNo consolidation needed - only one tea shop ID in use.');
    return;
  }

  // Pick the canonical tea_shop_id (prefer valid one, or first one)
  const canonicalId = validIds[0] || uniqueTeaShopIds[0];
  console.log('\nCanonical tea_shop_id:', canonicalId);

  // Get all other IDs to consolidate
  const idsToReplace = uniqueTeaShopIds.filter(id => id !== canonicalId);
  console.log('IDs to replace:', idsToReplace);

  if (idsToReplace.length === 0) {
    console.log('\nNo IDs to replace.');
    return;
  }

  // Count entries to update
  const { count: entryCount } = await supabase
    .from('tea_shop_entries')
    .select('*', { count: 'exact', head: true })
    .in('tea_shop_id', idsToReplace)
    .eq('site_group_id', padmavathy.site_group_id);

  console.log(`\nEntries to update: ${entryCount}`);

  // Count settlements to update
  const { count: settlementCount } = await supabase
    .from('tea_shop_settlements')
    .select('*', { count: 'exact', head: true })
    .in('tea_shop_id', idsToReplace);

  console.log(`Settlements to update: ${settlementCount}`);

  // Update entries
  console.log('\nUpdating entries...');
  for (const oldId of idsToReplace) {
    const { error: entryError, count } = await supabase
      .from('tea_shop_entries')
      .update({ tea_shop_id: canonicalId })
      .eq('tea_shop_id', oldId)
      .eq('site_group_id', padmavathy.site_group_id);

    if (entryError) {
      console.error(`Error updating entries for ${oldId}:`, entryError);
    } else {
      console.log(`  Updated entries from ${oldId} to ${canonicalId}`);
    }
  }

  // Update settlements
  console.log('\nUpdating settlements...');
  for (const oldId of idsToReplace) {
    const { error: settlementError } = await supabase
      .from('tea_shop_settlements')
      .update({ tea_shop_id: canonicalId })
      .eq('tea_shop_id', oldId);

    if (settlementError) {
      console.error(`Error updating settlements for ${oldId}:`, settlementError);
    } else {
      console.log(`  Updated settlements from ${oldId} to ${canonicalId}`);
    }
  }

  // Verify
  const { data: verifyEntries } = await supabase
    .from('tea_shop_entries')
    .select('tea_shop_id')
    .eq('site_group_id', padmavathy.site_group_id);

  const verifyUniqueIds = [...new Set(verifyEntries?.map(e => e.tea_shop_id).filter(id => id))];
  console.log('\nAfter consolidation, unique tea_shop_ids:', verifyUniqueIds);

  // Now rebuild waterfall
  console.log('\n=== Rebuilding Waterfall ===');

  // Reset all allocation payments
  const { error: resetAllocError } = await supabase
    .from('tea_shop_entry_allocations')
    .update({ amount_paid: 0, is_fully_paid: false })
    .gte('id', '00000000-0000-0000-0000-000000000000');

  if (resetAllocError) {
    console.error('Error resetting allocations:', resetAllocError);
  }

  // Reset all entry payments
  const { error: resetEntryError } = await supabase
    .from('tea_shop_entries')
    .update({ amount_paid: 0, is_fully_paid: false })
    .eq('tea_shop_id', canonicalId);

  if (resetEntryError) {
    console.error('Error resetting entries:', resetEntryError);
  }

  // Get all sites in the group
  const { data: sites } = await supabase
    .from('sites')
    .select('id, name')
    .eq('site_group_id', padmavathy.site_group_id)
    .eq('status', 'active');

  console.log(`\nRebuilding waterfall for ${sites?.length} sites...`);

  for (const site of sites || []) {
    console.log(`  - ${site.name}`);
    const { error } = await supabase.rpc('rebuild_tea_shop_waterfall', {
      p_tea_shop_id: canonicalId,
      p_site_id: site.id,
    });

    if (error) {
      console.error(`    Error: ${error.message}`);
    } else {
      console.log(`    Success`);
    }
  }

  // Verify FIFO
  console.log('\n=== Verifying Padmavathy FIFO ===');

  const { data: allocStatus } = await supabase
    .from('tea_shop_entry_allocations')
    .select('allocated_amount, amount_paid, is_fully_paid, tea_shop_entries!inner(date, tea_shop_id)')
    .eq('site_id', padmavathy.id)
    .gt('allocated_amount', 0)
    .order('tea_shop_entries(date)', { ascending: true });

  console.log('Date       | Alloc  | Paid   | Status');
  console.log('-----------|--------|--------|--------');

  let lastPaidDate = null;
  let violations = 0;

  for (const alloc of allocStatus || []) {
    const status = alloc.is_fully_paid ? 'PAID' : (alloc.amount_paid > 0 ? 'PARTIAL' : 'PENDING');
    console.log(`${alloc.tea_shop_entries?.date} | Rs${alloc.allocated_amount?.toString().padStart(4)} | Rs${(alloc.amount_paid || 0).toString().padStart(4)} | ${status}`);

    if (alloc.is_fully_paid) {
      lastPaidDate = alloc.tea_shop_entries?.date;
    } else if (lastPaidDate && alloc.tea_shop_entries?.date < lastPaidDate && alloc.allocated_amount > 0) {
      violations++;
    }
  }

  if (violations > 0) {
    console.log(`\nFIFO VIOLATIONS: ${violations}`);
  } else {
    console.log('\nNo FIFO violations - waterfall is correct!');
  }

  console.log('\nConsolidation complete!');
}

consolidateTeaShop();
