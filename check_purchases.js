const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPurchases() {
  const materialId = '3c7c1d28-6e8d-40a5-9f98-2d0f669233a0';
  const groupId = '0ecc1c2f-e198-4918-bee2-b56128523b01';

  console.log('=== Checking Material Purchase Expenses ===');
  const { data: purchases, error: purchaseError } = await supabase
    .from('material_purchase_expenses')
    .select('*, items:material_purchase_expense_items(*)')
    .eq('site_group_id', groupId)
    .eq('purchase_type', 'group_stock')
    .order('created_at');

  if (purchaseError) {
    console.error('Purchase query error:', purchaseError);
  } else {
    console.log('Found', purchases.length, 'group stock purchases:');
    purchases.forEach((p, i) => {
      console.log(`\n${i + 1}. ${p.ref_code} - ${p.purchase_date}`);
      console.log('   Site:', p.site_id);
      console.log('   Total Amount:', p.total_amount);
      console.log('   Created:', p.created_at);
      console.log('   Items:');
      p.items.forEach(item => {
        if (item.material_id === materialId) {
          console.log('     - Material:', materialId, 'Qty:', item.quantity, 'Unit Price:', item.unit_price);
        }
      });
    });
  }

  console.log('\n=== Checking Group Stock Inventory ===');
  const { data: inventoryList, error: invListError } = await supabase
    .from('group_stock_inventory')
    .select('*')
    .eq('site_group_id', groupId);

  if (invListError) {
    console.error('Inventory list error:', invListError);
  } else {
    console.log('Found', inventoryList.length, 'inventory records in this group:');
    inventoryList.forEach((inv, i) => {
      console.log(`\n${i + 1}. Material ID: ${inv.material_id}`);
      console.log('   Current Qty:', inv.current_qty);
      console.log('   Available Qty:', inv.available_qty);
      console.log('   Avg Unit Cost:', inv.avg_unit_cost);
      console.log('   Created:', inv.created_at);
      console.log('   Updated:', inv.updated_at);
    });
  }
}

checkPurchases().then(() => process.exit(0)).catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
