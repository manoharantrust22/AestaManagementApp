import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkData() {
  console.log('=== Checking Tea Shop Data ===\n');

  // Get Padmavathy site info
  const { data: padmavathy } = await supabase
    .from('sites')
    .select('id, name, site_group_id')
    .ilike('name', '%padma%')
    .single();

  if (!padmavathy) {
    console.log('Padmavathy site not found');
    return;
  }

  console.log('Padmavathy Site:', padmavathy.name, padmavathy.id);
  console.log('Site Group ID:', padmavathy.site_group_id);

  // Get all sites in the group
  const { data: groupSites } = await supabase
    .from('sites')
    .select('id, name')
    .eq('site_group_id', padmavathy.site_group_id);

  console.log('\nSites in group:');
  groupSites?.forEach(s => console.log(`  - ${s.name} (${s.id})`));

  // Get group entries for December
  const { data: entries } = await supabase
    .from('tea_shop_entries')
    .select('id, date, total_amount, amount_paid, is_fully_paid, is_group_entry, site_id')
    .eq('is_group_entry', true)
    .eq('site_group_id', padmavathy.site_group_id)
    .gte('date', '2024-12-20')
    .order('date', { ascending: true });

  console.log('\n=== Group Entries (Dec 20+) ===');
  console.log('Date       | Total  | Paid   | Fully Paid');
  console.log('-----------|--------|--------|----------');

  for (const entry of entries || []) {
    console.log(`${entry.date} | ₹${entry.total_amount?.toString().padStart(5)} | ₹${(entry.amount_paid || 0).toString().padStart(5)} | ${entry.is_fully_paid ? 'Yes' : 'No'}`);
  }

  // Get allocations for Padmavathy
  console.log('\n=== Padmavathy Allocations ===');
  console.log('Date       | Entry Total | Padmavathy Alloc | Day Units');
  console.log('-----------|-------------|------------------|----------');

  for (const entry of entries || []) {
    const { data: alloc } = await supabase
      .from('tea_shop_entry_allocations')
      .select('allocated_amount, day_units_sum, worker_count')
      .eq('entry_id', entry.id)
      .eq('site_id', padmavathy.id)
      .single();

    const allocAmount = alloc?.allocated_amount ?? 'N/A';
    const dayUnits = alloc?.day_units_sum ?? 'N/A';

    console.log(`${entry.date} | ₹${entry.total_amount?.toString().padStart(10)} | ₹${allocAmount?.toString().padStart(15)} | ${dayUnits}`);
  }

  // Check attendance for Padmavathy in December
  console.log('\n=== Padmavathy Attendance (Dec 20+) ===');

  const { data: attendance } = await supabase
    .from('daily_attendance')
    .select('date, day_units')
    .eq('site_id', padmavathy.id)
    .eq('is_deleted', false)
    .gte('date', '2024-12-20')
    .order('date', { ascending: true });

  // Group by date
  const attendanceByDate = new Map();
  attendance?.forEach(a => {
    const existing = attendanceByDate.get(a.date) || { count: 0, units: 0 };
    attendanceByDate.set(a.date, {
      count: existing.count + 1,
      units: existing.units + (a.day_units || 1)
    });
  });

  console.log('Date       | Laborers | Day Units');
  console.log('-----------|----------|----------');

  // Check each date from Dec 20 to Jan 5
  const startDate = new Date('2024-12-20');
  const endDate = new Date('2025-01-05');

  for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const att = attendanceByDate.get(dateStr);
    const laborers = att?.count || 0;
    const units = att?.units || 0;
    const status = laborers === 0 ? ' (UNFILLED/HOLIDAY)' : '';
    console.log(`${dateStr} | ${laborers.toString().padStart(8)} | ${units.toString().padStart(9)}${status}`);
  }

  // Check waterfall status for Padmavathy entries
  console.log('\n=== Waterfall Status (Padmavathy individual + group alloc) ===');

  // Get individual entries for Padmavathy
  const { data: indivEntries } = await supabase
    .from('tea_shop_entries')
    .select('id, date, total_amount, amount_paid, is_fully_paid')
    .eq('site_id', padmavathy.id)
    .eq('is_group_entry', false)
    .gte('date', '2024-12-20')
    .order('date', { ascending: true });

  console.log('\nIndividual entries for Padmavathy:');
  console.log('Date       | Total  | Paid   | Status');
  console.log('-----------|--------|--------|-------');

  for (const entry of indivEntries || []) {
    const status = entry.is_fully_paid ? '✓ PAID' : (entry.amount_paid > 0 ? 'PARTIAL' : 'PENDING');
    console.log(`${entry.date} | ₹${entry.total_amount?.toString().padStart(5)} | ₹${(entry.amount_paid || 0).toString().padStart(5)} | ${status}`);
  }

  console.log('\nGroup entry allocations for Padmavathy:');
  console.log('Date       | Alloc  | Entry Paid | Status');
  console.log('-----------|--------|------------|-------');

  for (const entry of entries || []) {
    const { data: alloc } = await supabase
      .from('tea_shop_entry_allocations')
      .select('allocated_amount')
      .eq('entry_id', entry.id)
      .eq('site_id', padmavathy.id)
      .single();

    const allocAmount = alloc?.allocated_amount || 0;
    const status = entry.is_fully_paid ? '✓ PAID' : (entry.amount_paid > 0 ? 'PARTIAL' : 'PENDING');
    console.log(`${entry.date} | ₹${allocAmount?.toString().padStart(5)} | ₹${(entry.amount_paid || 0).toString().padStart(9)} | ${status}`);
  }
}

checkData();
