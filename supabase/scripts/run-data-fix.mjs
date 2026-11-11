import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runDataFix() {
  console.log('Starting tea shop data fix (v2 - per-site payment tracking)...\n');

  try {
    // Step 1: Initialize amount_paid on all allocations to 0
    console.log('Step 1: Initializing allocation payment tracking...');

    const { error: initError } = await supabase
      .from('tea_shop_entry_allocations')
      .update({ amount_paid: 0, is_fully_paid: false })
      .gte('id', '00000000-0000-0000-0000-000000000000'); // Update all

    if (initError) {
      console.error('Error initializing allocations:', initError);
    } else {
      console.log('Initialized all allocation payment tracking to 0');
    }

    // Step 2: Reset all entry payment status
    console.log('\nStep 2: Resetting entry payment status...');

    const { error: resetError } = await supabase
      .from('tea_shop_entries')
      .update({ amount_paid: 0, is_fully_paid: false })
      .gte('id', '00000000-0000-0000-0000-000000000000');

    if (resetError) {
      console.error('Error resetting entries:', resetError);
    } else {
      console.log('Reset all entry payment status');
    }

    // Step 3: Recalculate allocations for all group entries (ensure they're correct)
    console.log('\nStep 3: Recalculating group entry allocations based on attendance...');

    const { data: groupEntries, error: entriesError } = await supabase
      .from('tea_shop_entries')
      .select('id, date, total_amount, tea_shop_id, site_group_id')
      .eq('is_group_entry', true)
      .not('site_group_id', 'is', null)
      .order('date');

    if (entriesError) {
      console.error('Error fetching group entries:', entriesError);
      return;
    }

    console.log(`Found ${groupEntries?.length || 0} group entries to process`);

    for (const entry of groupEntries || []) {
      const { data: sites } = await supabase
        .from('sites')
        .select('id, name')
        .eq('site_group_id', entry.site_group_id)
        .eq('status', 'active');

      if (!sites || sites.length === 0) continue;

      let totalUnits = 0;
      const siteData = [];

      for (const site of sites) {
        const { data: namedAtt } = await supabase
          .from('daily_attendance')
          .select('day_units')
          .eq('site_id', site.id)
          .eq('date', entry.date)
          .eq('is_deleted', false);

        const namedUnits = namedAtt?.reduce((sum, a) => sum + (a.day_units || 1), 0) || 0;
        const namedCount = namedAtt?.length || 0;

        const { data: marketAtt } = await supabase
          .from('market_laborer_attendance')
          .select('count')
          .eq('site_id', site.id)
          .eq('date', entry.date);

        const marketUnits = marketAtt?.reduce((sum, m) => sum + (m.count || 0), 0) || 0;

        const siteUnits = namedUnits + marketUnits;
        totalUnits += siteUnits;

        siteData.push({
          siteId: site.id,
          siteName: site.name,
          totalUnits: siteUnits,
          workerCount: namedCount + marketUnits,
        });
      }

      let totalAllocated = 0;
      for (let i = 0; i < siteData.length; i++) {
        const site = siteData[i];
        let percentage, allocatedAmount;

        if (totalUnits > 0) {
          percentage = Math.round((site.totalUnits / totalUnits) * 100);
          allocatedAmount = i === siteData.length - 1
            ? entry.total_amount - totalAllocated
            : Math.round((site.totalUnits / totalUnits) * entry.total_amount);
        } else {
          percentage = 0;
          allocatedAmount = 0;
        }

        totalAllocated += allocatedAmount;

        const { error: allocError } = await supabase
          .from('tea_shop_entry_allocations')
          .upsert({
            entry_id: entry.id,
            site_id: site.siteId,
            day_units_sum: site.totalUnits,
            worker_count: site.workerCount,
            allocation_percentage: percentage,
            allocated_amount: allocatedAmount,
            amount_paid: 0,
            is_fully_paid: false,
            is_manual_override: false,
          }, {
            onConflict: 'entry_id,site_id',
          });

        if (allocError) {
          console.error(`Error upserting allocation for entry ${entry.id}, site ${site.siteId}:`, allocError);
        }
      }
    }

    console.log('Allocation recalculation complete.');

    // Step 4: Rebuild waterfall for all tea shops PER SITE
    console.log('\nStep 4: Rebuilding waterfall per site...');

    // Get all site groups that have tea shop data
    const { data: siteGroups } = await supabase
      .from('tea_shop_entries')
      .select('tea_shop_id, site_group_id')
      .eq('is_group_entry', true)
      .not('site_group_id', 'is', null);

    const processedCombos = new Set();

    for (const entry of siteGroups || []) {
      const key = `${entry.tea_shop_id}:${entry.site_group_id}`;
      if (processedCombos.has(key)) continue;
      processedCombos.add(key);

      // Get all sites in the group
      const { data: sites } = await supabase
        .from('sites')
        .select('id, name')
        .eq('site_group_id', entry.site_group_id)
        .eq('status', 'active');

      console.log(`\nRebuilding waterfall for tea shop ${entry.tea_shop_id}:`);

      for (const site of sites || []) {
        console.log(`  - Site: ${site.name}`);

        const { error } = await supabase.rpc('rebuild_tea_shop_waterfall', {
          p_tea_shop_id: entry.tea_shop_id,
          p_site_id: site.id,
        });

        if (error) {
          console.error(`    Error: ${error.message}`);
        } else {
          console.log(`    Success`);
        }
      }
    }

    // Also handle individual site entries (non-group)
    const { data: individualShops } = await supabase
      .from('tea_shop_entries')
      .select('tea_shop_id, site_id')
      .eq('is_group_entry', false)
      .not('site_id', 'is', null);

    const processedIndiv = new Set();
    for (const entry of individualShops || []) {
      const key = `${entry.tea_shop_id}:${entry.site_id}`;
      if (processedIndiv.has(key) || processedCombos.has(key)) continue;
      processedIndiv.add(key);

      console.log(`\nRebuilding waterfall for individual site entries: ${entry.tea_shop_id}/${entry.site_id}`);

      const { error } = await supabase.rpc('rebuild_tea_shop_waterfall', {
        p_tea_shop_id: entry.tea_shop_id,
        p_site_id: entry.site_id,
      });

      if (error) {
        console.error(`  Error: ${error.message}`);
      }
    }

    console.log(`\nRebuilt waterfall for ${processedCombos.size} group combinations and ${processedIndiv.size} individual sites.`);

    // Step 5: Verify per-site FIFO
    console.log('\n=== Step 5: Verifying per-site FIFO ===');

    // Get Padmavathy specifically
    const { data: padmavathy } = await supabase
      .from('sites')
      .select('id, name, site_group_id')
      .ilike('name', '%padma%')
      .single();

    if (padmavathy) {
      console.log(`\nPadmavathy allocation payment status:`);
      console.log('Date       | Alloc  | Paid   | Fully?');
      console.log('-----------|--------|--------|-------');

      const { data: allocStatus } = await supabase
        .from('tea_shop_entry_allocations')
        .select('allocated_amount, amount_paid, is_fully_paid, tea_shop_entries!inner(date)')
        .eq('site_id', padmavathy.id)
        .order('tea_shop_entries(date)', { ascending: true });

      for (const alloc of allocStatus || []) {
        const paidStatus = alloc.is_fully_paid ? 'Yes' : 'No';
        console.log(`${alloc.tea_shop_entries?.date} | Rs${alloc.allocated_amount?.toString().padStart(4)} | Rs${(alloc.amount_paid || 0).toString().padStart(4)} | ${paidStatus}`);
      }

      // Check for FIFO violations at allocation level
      let lastPaidDate = null;
      let violations = 0;

      for (const alloc of allocStatus || []) {
        if (alloc.is_fully_paid) {
          lastPaidDate = alloc.tea_shop_entries?.date;
        } else if (lastPaidDate && alloc.tea_shop_entries?.date < lastPaidDate && alloc.allocated_amount > 0) {
          violations++;
          if (violations <= 3) {
            console.log(`  FIFO VIOLATION: ${alloc.tea_shop_entries?.date} unpaid but ${lastPaidDate} is paid`);
          }
        }
      }

      if (violations > 0) {
        console.log(`\nFound ${violations} FIFO violations at allocation level`);
      } else {
        console.log('\nNo FIFO violations at allocation level - waterfall is correct!');
      }
    }

    // Summary
    const { count: totalAllocations } = await supabase
      .from('tea_shop_entry_allocations')
      .select('*', { count: 'exact', head: true });

    const { count: paidAllocations } = await supabase
      .from('tea_shop_entry_allocations')
      .select('*', { count: 'exact', head: true })
      .eq('is_fully_paid', true);

    const { count: zeroAllocations } = await supabase
      .from('tea_shop_entry_allocations')
      .select('*', { count: 'exact', head: true })
      .eq('allocated_amount', 0);

    console.log('\n=== Summary ===');
    console.log(`Total allocations: ${totalAllocations}`);
    console.log(`Fully paid allocations: ${paidAllocations}`);
    console.log(`Zero allocations (unfilled dates): ${zeroAllocations}`);
    console.log('\nData fix complete!');

  } catch (err) {
    console.error('Error during data fix:', err);
  }
}

runDataFix();
