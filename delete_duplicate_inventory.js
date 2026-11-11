const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteDuplicate() {
  const materialId = '3c7c1d28-6e8d-40a5-9f98-2d0f669233a0';
  const groupId = '0ecc1c2f-e198-4918-bee2-b56128523b01';

  console.log('=== Step 1: List all inventory records for Fly Ash Bricks ===');
  const { data: inventoryList, error: listError } = await supabase
    .from('group_stock_inventory')
    .select('*')
    .eq('material_id', materialId)
    .eq('site_group_id', groupId)
    .order('created_at');

  if (listError) {
    console.error('List error:', listError);
    return;
  }

  console.log(`Found ${inventoryList.length} inventory records:`);
  inventoryList.forEach((inv, i) => {
    console.log(`\n${i + 1}. ID: ${inv.id}`);
    console.log('   Current Qty:', inv.current_qty);
    console.log('   Available Qty:', inv.available_qty);
    console.log('   Avg Unit Cost:', inv.avg_unit_cost);
    console.log('   Created:', inv.created_at);
    console.log('   Updated:', inv.updated_at);
  });

  if (inventoryList.length <= 1) {
    console.log('\n✅ Only one record found, no duplicates to delete.');
    return;
  }

  // Find the record with 3000 quantity (the stale one)
  const staleRecord = inventoryList.find(inv => inv.current_qty === 3000);

  if (!staleRecord) {
    console.log('\n⚠️  No record with 3000 quantity found. Please check manually.');
    return;
  }

  console.log(`\n=== Step 2: Delete stale record (3000 quantity) ===`);
  console.log('Deleting record ID:', staleRecord.id);

  const { error: deleteError } = await supabase
    .from('group_stock_inventory')
    .delete()
    .eq('id', staleRecord.id);

  if (deleteError) {
    console.error('Delete error:', deleteError);
    return;
  }

  console.log('✅ Stale record deleted successfully!');

  // Also delete any transactions associated with this inventory record
  console.log('\n=== Step 3: Delete associated transactions ===');
  const { data: deletedTx, error: txDeleteError } = await supabase
    .from('group_stock_transactions')
    .delete()
    .eq('inventory_id', staleRecord.id)
    .select();

  if (txDeleteError) {
    console.error('Transaction delete error:', txDeleteError);
  } else {
    console.log(`Deleted ${deletedTx?.length || 0} associated transactions`);
  }

  console.log('\n=== Step 4: Verify final state ===');
  const { data: finalInventory, error: finalError } = await supabase
    .from('group_stock_inventory')
    .select('*')
    .eq('material_id', materialId)
    .eq('site_group_id', groupId);

  if (finalError) {
    console.error('Verification error:', finalError);
  } else {
    console.log(`\nFinal inventory count: ${finalInventory.length}`);
    finalInventory.forEach((inv, i) => {
      console.log(`${i + 1}. Current Qty: ${inv.current_qty}, Available: ${inv.available_qty}`);
    });
  }

  console.log('\n✅ Done! Please refresh your browser (Ctrl+Shift+R) to see the changes.');
}

deleteDuplicate().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
