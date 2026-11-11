const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createBatchUsageRecord() {
  const materialId = '3c7c1d28-6e8d-40a5-9f98-2d0f669233a0';
  const batchRefCode = 'MAT-260121-55EC';
  const usageSiteId = 'ff893992-a276-47b7-8bd2-d2fe4f62f3b5'; // Padmavathy
  const quantity = 300;
  const unitCost = 6.5;
  const usageDate = '2026-01-25';

  console.log('=== Step 1: Get purchase to find group_id ===');
  const { data: purchase, error: purchaseError } = await supabase
    .from('material_purchase_expenses')
    .select('site_group_id')
    .eq('ref_code', batchRefCode)
    .single();

  if (purchaseError) {
    console.error('Purchase error:', purchaseError);
    return;
  }

  const groupId = purchase.site_group_id;
  console.log('Group ID from purchase:', groupId);

  console.log('\n=== Step 2: Get material unit ===');
  const { data: material, error: matError } = await supabase
    .from('materials')
    .select('unit')
    .eq('id', materialId)
    .single();

  if (matError) {
    console.error('Material error:', matError);
    return;
  }

  console.log('Material unit:', material.unit);

  console.log('\n=== Step 3: Creating batch_usage_record ===');

  const batchUsageRecord = {
    batch_ref_code: batchRefCode,
    site_group_id: groupId,
    usage_site_id: usageSiteId,
    material_id: materialId,
    brand_id: null,
    quantity: quantity,
    unit: material.unit,
    unit_cost: unitCost,
    // total_cost is a generated column (quantity * unit_cost)
    usage_date: usageDate,
    work_description: 'Usage from weekly report',
    settlement_status: 'pending',
    is_self_use: false,
  };

  console.log('Data to insert:', JSON.stringify(batchUsageRecord, null, 2));

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

  console.log('\n=== Next Steps ===');
  console.log('1. Refresh the page in your browser (Ctrl+R)');
  console.log('2. Go to Inter-Site Settlement page');
  console.log('3. Click on "Unsettled Balances" tab');
  console.log('4. You should now see: Padmavathy owes Srinivasan ₹1,950');
}

createBatchUsageRecord().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
