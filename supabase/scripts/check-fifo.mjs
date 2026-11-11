import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkFifo() {
  console.log('=== Checking FIFO for Padmavathy ===\n');

  const { data: padmavathy } = await supabase
    .from('sites')
    .select('id, name')
    .ilike('name', '%padma%')
    .single();

  console.log('Site:', padmavathy?.name);

  // Get all allocations with entry details
  const { data: allocs } = await supabase
    .from('tea_shop_entry_allocations')
    .select(`
      allocated_amount,
      amount_paid,
      is_fully_paid,
      tea_shop_entries!inner(id, date, tea_shop_id, total_amount, amount_paid, is_fully_paid)
    `)
    .eq('site_id', padmavathy.id)
    .gt('allocated_amount', 0)  // Skip zero allocations
    .order('tea_shop_entries(date)', { ascending: true });

  console.log('\nDate       | Tea Shop ID (first 8)           | Alloc  | Paid   | Status');
  console.log('-----------|----------------------------------|--------|--------|--------');

  let lastPaidDate = null;
  let violations = [];

  for (const a of allocs || []) {
    const teaShopShort = a.tea_shop_entries?.tea_shop_id?.substring(0, 8);
    const status = a.is_fully_paid ? 'PAID' : (a.amount_paid > 0 ? 'PARTIAL' : 'PENDING');

    console.log(`${a.tea_shop_entries?.date} | ${teaShopShort}...                        | Rs${a.allocated_amount?.toString().padStart(4)} | Rs${(a.amount_paid || 0).toString().padStart(4)} | ${status}`);

    // Check FIFO violation
    if (a.is_fully_paid) {
      // This entry is paid, check if any earlier entries are unpaid
      for (const prev of allocs || []) {
        if (prev.tea_shop_entries?.date < a.tea_shop_entries?.date &&
            !prev.is_fully_paid &&
            prev.allocated_amount > 0 &&
            prev.tea_shop_entries?.tea_shop_id === a.tea_shop_entries?.tea_shop_id) {
          violations.push({
            paidDate: a.tea_shop_entries?.date,
            unpaidDate: prev.tea_shop_entries?.date,
            teaShopId: a.tea_shop_entries?.tea_shop_id
          });
        }
      }
    }
  }

  console.log('\n=== FIFO Violations (within same tea shop) ===');
  if (violations.length === 0) {
    console.log('No violations found!');
  } else {
    // Deduplicate
    const unique = [...new Set(violations.map(v => JSON.stringify(v)))].map(v => JSON.parse(v));
    for (const v of unique.slice(0, 10)) {
      console.log(`  ${v.paidDate} is PAID but ${v.unpaidDate} is UNPAID (tea shop: ${v.teaShopId?.substring(0, 8)}...)`);
    }
    if (unique.length > 10) {
      console.log(`  ... and ${unique.length - 10} more`);
    }
  }

  // Group entries by tea_shop_id
  console.log('\n=== Entries by Tea Shop ===');
  const byTeaShop = {};
  for (const a of allocs || []) {
    const tsId = a.tea_shop_entries?.tea_shop_id;
    if (!byTeaShop[tsId]) byTeaShop[tsId] = [];
    byTeaShop[tsId].push(a);
  }

  for (const [tsId, entries] of Object.entries(byTeaShop)) {
    console.log(`\nTea Shop ${tsId?.substring(0, 8)}...:`);
    console.log(`  Entries: ${entries.length}`);
    console.log(`  Paid: ${entries.filter(e => e.is_fully_paid).length}`);
    console.log(`  Unpaid: ${entries.filter(e => !e.is_fully_paid).length}`);
    console.log(`  Date range: ${entries[0]?.tea_shop_entries?.date} to ${entries[entries.length-1]?.tea_shop_entries?.date}`);
  }

  // Check settlements by tea shop
  console.log('\n=== Settlements by Tea Shop ===');
  const { data: settlements } = await supabase
    .from('tea_shop_settlements')
    .select('id, tea_shop_id, payment_date, amount_paid')
    .eq('is_cancelled', false)
    .order('payment_date', { ascending: true });

  const settlementsByTs = {};
  for (const s of settlements || []) {
    if (!settlementsByTs[s.tea_shop_id]) settlementsByTs[s.tea_shop_id] = { total: 0, count: 0 };
    settlementsByTs[s.tea_shop_id].total += s.amount_paid;
    settlementsByTs[s.tea_shop_id].count++;
  }

  for (const [tsId, data] of Object.entries(settlementsByTs)) {
    console.log(`  ${tsId?.substring(0, 8)}...: ${data.count} settlements, total Rs ${data.total}`);
  }
}

checkFifo();
