const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTransactionFields() {
  const materialId = '3c7c1d28-6e8d-40a5-9f98-2d0f669233a0';
  const groupId = '0ecc1e2f-e198-4918-bee2-b56128523b01';

  console.log('=== Checking usage transaction fields ===');
  const { data: usageTransaction, error } = await supabase
    .from('group_stock_transactions')
    .select('*')
    .eq('material_id', materialId)
    .eq('site_group_id', groupId)
    .eq('transaction_type', 'usage')
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Usage transaction:');
  console.log('  ID:', usageTransaction.id);
  console.log('  Quantity:', usageTransaction.quantity);
  console.log('  Total Cost:', usageTransaction.total_cost);
  console.log('  Usage Site ID:', usageTransaction.usage_site_id);
  console.log('  Payment Source Site ID:', usageTransaction.payment_source_site_id);
  console.log('  Settlement ID:', usageTransaction.settlement_id);
  console.log('  Created:', usageTransaction.created_at);

  if (!usageTransaction.payment_source_site_id) {
    console.log('\n⚠️  payment_source_site_id is NULL!');
    console.log('This field is required for unsettled balances to work.');
    console.log('The unsettled balance query needs this to know who paid for the materials.');

    console.log('\n=== Finding the payment source site ===');
    const { data: purchase, error: purchaseError } = await supabase
      .from('material_purchase_expenses')
      .select('site_id, paying_site_id, ref_code')
      .eq('ref_code', 'MAT-260121-55EC')
      .single();

    if (purchaseError) {
      console.error('Purchase error:', purchaseError);
      return;
    }

    console.log('Purchase details:');
    console.log('  Site ID:', purchase.site_id);
    console.log('  Paying Site ID:', purchase.paying_site_id);
    console.log('  Ref Code:', purchase.ref_code);

    const paymentSourceSiteId = purchase.paying_site_id || purchase.site_id;
    console.log('\nPayment Source Site ID should be:', paymentSourceSiteId);

    console.log('\n=== Updating usage transaction ===');
    const { error: updateError } = await supabase
      .from('group_stock_transactions')
      .update({ payment_source_site_id: paymentSourceSiteId })
      .eq('id', usageTransaction.id);

    if (updateError) {
      console.error('Update error:', updateError);
      return;
    }

    console.log('✅ Updated payment_source_site_id to:', paymentSourceSiteId);
    console.log('\nNow refresh the browser and check Unsettled Balances tab!');
  } else {
    console.log('\n✅ payment_source_site_id is set correctly');
  }
}

checkTransactionFields().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
