const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function linkUsageToBatch() {
  const materialId = '3c7c1d28-6e8d-40a5-9f98-2d0f669233a0';
  const groupId = '0ecc1c2f-e198-4918-bee2-b56128523b01';
  const batchRefCode = 'MAT-260121-55EC';

  console.log('=== Step 1: Get all transactions ===');
  const { data: allTransactions, error: allTxError } = await supabase
    .from('group_stock_transactions')
    .select('*')
    .eq('material_id', materialId)
    .eq('site_group_id', groupId)
    .order('created_at');

  if (allTxError) {
    console.error('All transactions error:', allTxError);
    return;
  }

  console.log(`Found ${allTransactions.length} transactions:`);
  allTransactions.forEach((tx, i) => {
    console.log(`\n${i + 1}. Type: ${tx.transaction_type}, Qty: ${tx.quantity}, Cost: ${tx.total_cost}`);
  });

  const usageTransaction = allTransactions.find(tx => tx.transaction_type === 'usage');
  if (!usageTransaction) {
    console.error('No usage transaction found!');
    return;
  }

  console.log('Found usage transaction:');
  console.log('  ID:', usageTransaction.id);
  console.log('  Quantity:', usageTransaction.quantity);
  console.log('  Unit Cost:', usageTransaction.unit_cost);
  console.log('  Total Cost:', usageTransaction.total_cost);
  console.log('  Usage Site:', usageTransaction.usage_site_id);
  console.log('  Date:', usageTransaction.transaction_date);

  console.log('\n=== Step 2: Create batch_usage_record ===');
  const batchUsageRecord = {
    batch_ref_code: batchRefCode,
    site_group_id: groupId,
    usage_site_id: usageTransaction.usage_site_id,
    material_id: usageTransaction.material_id,
    brand_id: usageTransaction.brand_id,
    quantity: Math.abs(usageTransaction.quantity), // Make positive
    unit_cost: usageTransaction.unit_cost,
    total_cost: Math.abs(usageTransaction.total_cost), // Make positive
    usage_date: usageTransaction.transaction_date,
    work_description: usageTransaction.work_description,
    settlement_status: 'pending',
    is_self_use: false,
    transaction_id: usageTransaction.id,
  };

  console.log('Inserting batch usage record:', JSON.stringify(batchUsageRecord, null, 2));

  const { data: created, error: insertError } = await supabase
    .from('batch_usage_records')
    .insert(batchUsageRecord)
    .select()
    .single();

  if (insertError) {
    console.error('Insert error:', insertError);
    return;
  }

  console.log('\n✅ Batch usage record created successfully!');
  console.log('  ID:', created.id);
  console.log('  Batch:', created.batch_ref_code);
  console.log('  Site:', created.usage_site_id);
  console.log('  Quantity:', created.quantity);
  console.log('  Total Cost:', created.total_cost);
  console.log('  Settlement Status:', created.settlement_status);

  console.log('\n=== Step 3: Verify unsettled balances now show up ===');
  console.log('Refresh the page and check the Unsettled Balances tab');
  console.log('It should now show Padmavathy owes Srinivasan ₹1,950');
}

linkUsageToBatch().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
