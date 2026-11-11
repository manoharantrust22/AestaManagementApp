const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetInventory() {
  const materialId = '3c7c1d28-6e8d-40a5-9f98-2d0f669233a0';
  const groupId = '0ecc1c2f-e198-4918-bee2-b56128523b01';

  console.log('=== Step 1: Delete stale inventory ===');
  const { data: deleted, error: deleteError } = await supabase
    .from('group_stock_inventory')
    .delete()
    .eq('material_id', materialId)
    .eq('site_group_id', groupId)
    .select();

  if (deleteError) {
    console.error('Delete error:', deleteError);
  } else {
    console.log('Deleted', deleted?.length || 0, 'inventory records');
  }

  console.log('\n=== Step 2: Check current purchase (MAT-260121-55EC) ===');
  const { data: purchase, error: purchaseError } = await supabase
    .from('material_purchase_expenses')
    .select('*, items:material_purchase_expense_items(*)')
    .eq('ref_code', 'MAT-260121-55EC')
    .single();

  if (purchaseError) {
    console.error('Purchase not found:', purchaseError);
    return;
  }

  console.log('Purchase found:');
  console.log('  Ref Code:', purchase.ref_code);
  console.log('  Date:', purchase.purchase_date);
  console.log('  Total Amount:', purchase.total_amount);
  console.log('  Site Group ID:', purchase.site_group_id);

  const flyAshItem = purchase.items.find(i => i.material_id === materialId);
  if (!flyAshItem) {
    console.error('Fly Ash Bricks not found in this purchase');
    return;
  }

  console.log('\n  Fly Ash Bricks item:');
  console.log('    Quantity:', flyAshItem.quantity);
  console.log('    Unit Price:', flyAshItem.unit_price);

  console.log('\n=== Step 3: Create inventory record ===');
  const { data: inventory, error: invError } = await supabase
    .from('group_stock_inventory')
    .insert({
      site_group_id: purchase.site_group_id,
      material_id: flyAshItem.material_id,
      brand_id: flyAshItem.brand_id,
      current_qty: flyAshItem.quantity,
      reserved_qty: 0,
      avg_unit_cost: flyAshItem.unit_price
    })
    .select()
    .single();

  if (invError) {
    console.error('Inventory creation error:', invError);
    return;
  }

  console.log('Inventory created successfully!');
  console.log('  ID:', inventory.id);
  console.log('  Current Qty:', inventory.current_qty);
  console.log('  Available Qty:', inventory.available_qty);
  console.log('  Avg Unit Cost:', inventory.avg_unit_cost);

  console.log('\n=== Step 4: Create purchase transaction ===');
  const { data: transaction, error: txError } = await supabase
    .from('group_stock_transactions')
    .insert({
      site_group_id: purchase.site_group_id,
      inventory_id: inventory.id,
      material_id: flyAshItem.material_id,
      brand_id: flyAshItem.brand_id,
      transaction_type: 'purchase',
      transaction_date: purchase.purchase_date,
      quantity: flyAshItem.quantity,
      unit_cost: flyAshItem.unit_price,
      total_cost: flyAshItem.quantity * flyAshItem.unit_price,
      reference_type: 'group_purchase',
      reference_id: purchase.id,
      notes: `Initial purchase - ${purchase.ref_code}`
    })
    .select()
    .single();

  if (txError) {
    console.error('Transaction creation error:', txError);
    return;
  }

  console.log('Transaction created:', transaction.id);

  console.log('\n✅ Inventory reset complete!');
  console.log('Please refresh the page in your browser to clear the cache.');
}

resetInventory().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
