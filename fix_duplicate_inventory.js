const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixDuplicateInventory() {
  const materialId = '3c7c1d28-6e8d-40a5-9f98-2d0f669233a0';
  const groupId = '0ecc1e2f-e198-4918-bee2-b56128523b01';

  console.log('=== Step 1: List ALL inventory records for this material and group ===');
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

  console.log(`\nFound ${inventoryList.length} inventory records:`);
  inventoryList.forEach((inv, i) => {
    console.log(`\n${i + 1}. ID: ${inv.id}`);
    console.log('   Current Qty:', inv.current_qty);
    console.log('   Available Qty:', inv.available_qty);
    console.log('   Reserved Qty:', inv.reserved_qty);
    console.log('   Avg Unit Cost:', inv.avg_unit_cost);
    console.log('   Brand ID:', inv.brand_id);
    console.log('   Created:', inv.created_at);
    console.log('   Updated:', inv.updated_at);
  });

  if (inventoryList.length <= 1) {
    console.log('\n✅ Only one or zero records found, no duplicates to delete.');
    return;
  }

  console.log('\n=== Step 2: Identify records to keep vs delete ===');

  // Keep the most recently created record (assuming it's the correct one from reset script)
  // Delete older records
  const sortedByDate = [...inventoryList].sort((a, b) =>
    new Date(b.created_at) - new Date(a.created_at)
  );

  const recordToKeep = sortedByDate[0];
  const recordsToDelete = sortedByDate.slice(1);

  console.log('\n✅ KEEPING this record (most recent):');
  console.log('   ID:', recordToKeep.id);
  console.log('   Current Qty:', recordToKeep.current_qty);
  console.log('   Created:', recordToKeep.created_at);

  console.log('\n❌ DELETING these records (older):');
  recordsToDelete.forEach((rec, i) => {
    console.log(`\n   ${i + 1}. ID: ${rec.id}`);
    console.log('      Current Qty:', rec.current_qty);
    console.log('      Created:', rec.created_at);
  });

  console.log('\n=== Step 3: Delete old records ===');
  for (const record of recordsToDelete) {
    console.log(`\nDeleting record ID: ${record.id} (qty: ${record.current_qty})`);

    // First, delete any transactions associated with this inventory record
    const { data: deletedTx, error: txDeleteError } = await supabase
      .from('group_stock_transactions')
      .delete()
      .eq('inventory_id', record.id)
      .select();

    if (txDeleteError) {
      console.error('   ❌ Transaction delete error:', txDeleteError);
    } else {
      console.log(`   ✅ Deleted ${deletedTx?.length || 0} associated transactions`);
    }

    // Now delete the inventory record
    const { error: deleteError } = await supabase
      .from('group_stock_inventory')
      .delete()
      .eq('id', record.id);

    if (deleteError) {
      console.error('   ❌ Inventory delete error:', deleteError);
    } else {
      console.log('   ✅ Inventory record deleted successfully');
    }
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
    console.log(`\n✅ Final inventory count: ${finalInventory.length}`);
    if (finalInventory.length > 0) {
      finalInventory.forEach((inv, i) => {
        console.log(`\n${i + 1}. ID: ${inv.id}`);
        console.log('   Current Qty: ${inv.current_qty}, Available: ${inv.available_qty}');
        console.log('   Created: ${inv.created_at}');
      });
    }
  }

  console.log('\n✅ Done! Please refresh your browser (Ctrl+Shift+R) to clear cache and see the changes.');
  console.log('   Then try submitting the weekly usage report again.');
}

fixDuplicateInventory().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
