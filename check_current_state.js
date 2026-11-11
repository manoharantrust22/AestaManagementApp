const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCurrentState() {
  const materialId = '3c7c1d28-6e8d-40a5-9f98-2d0f669233a0';
  const groupId = '0ecc1e2f-e198-4918-bee2-b56128523b01';

  console.log('=== Current Inventory State ===');
  const { data: inventory, error: invError } = await supabase
    .from('group_stock_inventory')
    .select('*')
    .eq('material_id', materialId)
    .eq('site_group_id', groupId)
    .single();

  if (invError) {
    console.error('Inventory error:', invError);
  } else {
    console.log('Inventory:');
    console.log('  Current Qty:', inventory.current_qty);
    console.log('  Available Qty:', inventory.available_qty);
    console.log('  Reserved Qty:', inventory.reserved_qty);
    console.log('  Avg Unit Cost:', inventory.avg_unit_cost);
    console.log('  Last Used:', inventory.last_used_date);
  }

  console.log('\n=== All Transactions ===');
  const { data: transactions, error: txError } = await supabase
    .from('group_stock_transactions')
    .select('*')
    .eq('material_id', materialId)
    .eq('site_group_id', groupId)
    .order('created_at');

  if (txError) {
    console.error('Transaction error:', txError);
  } else {
    console.log(`Found ${transactions.length} transactions:`);
    transactions.forEach((tx, i) => {
      console.log(`\n${i + 1}. Type: ${tx.transaction_type}`);
      console.log('   Date:', tx.transaction_date);
      console.log('   Quantity:', tx.quantity);
      console.log('   Unit Cost:', tx.unit_cost);
      console.log('   Total Cost:', tx.total_cost);
      console.log('   Usage Site:', tx.usage_site_id);
      console.log('   Reference:', tx.reference_type);
      console.log('   Created:', tx.created_at);
    });
  }

  console.log('\n=== Batch Usage Records ===');
  const { data: usageRecords, error: usageError } = await supabase
    .from('batch_usage_records')
    .select('*')
    .eq('batch_ref_code', 'MAT-260121-55EC');

  if (usageError) {
    console.error('Usage records error:', usageError);
  } else {
    console.log(`Found ${usageRecords?.length || 0} usage records:`);
    usageRecords?.forEach((rec, i) => {
      console.log(`\n${i + 1}. Site: ${rec.site_id}`);
      console.log('   Material:', rec.material_id);
      console.log('   Quantity:', rec.quantity);
      console.log('   Work:', rec.work_description);
      console.log('   Created:', rec.created_at);
    });
  }

  console.log('\n=== Summary ===');
  const totalUsage = transactions
    .filter(tx => tx.transaction_type === 'usage')
    .reduce((sum, tx) => sum + Math.abs(tx.quantity), 0);

  console.log('Total purchased:', 1500);
  console.log('Total used:', totalUsage);
  console.log('Should remain:', 1500 - totalUsage);
  console.log('Actually remaining:', inventory?.current_qty);
  console.log('Match:', (1500 - totalUsage) === inventory?.current_qty ? '✅ YES' : '❌ NO');
}

checkCurrentState().then(() => process.exit(0)).catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
