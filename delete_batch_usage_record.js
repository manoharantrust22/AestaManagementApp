const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteBatchUsageRecord() {
  const batchRefCode = 'MAT-260121-55EC';
  const usageSiteId = 'ff893992-a276-47b7-8bd2-d2fe4f62f3b5'; // Padmavathy

  console.log('=== Finding batch usage records ===');
  const { data: records, error: findError } = await supabase
    .from('batch_usage_records')
    .select('*')
    .eq('batch_ref_code', batchRefCode)
    .eq('usage_site_id', usageSiteId);

  if (findError) {
    console.error('Find error:', findError);
    return;
  }

  console.log(`Found ${records.length} batch usage records:`);
  records.forEach((record, i) => {
    console.log(`\n${i + 1}. ID: ${record.id}`);
    console.log(`   Quantity: ${record.quantity}`);
    console.log(`   Total Cost: ${record.total_cost}`);
    console.log(`   Settlement Status: ${record.settlement_status}`);
    console.log(`   Usage Date: ${record.usage_date}`);
  });

  if (records.length === 0) {
    console.log('\n✅ No batch usage records found - already deleted!');
    return;
  }

  console.log('\n=== Deleting all matching records ===');
  const { error: deleteError } = await supabase
    .from('batch_usage_records')
    .delete()
    .eq('batch_ref_code', batchRefCode)
    .eq('usage_site_id', usageSiteId);

  if (deleteError) {
    console.error('Delete error:', deleteError);
    return;
  }

  console.log(`\n✅ Deleted ${records.length} batch usage record(s)!`);
  console.log('\n=== Next Steps ===');
  console.log('1. Refresh the page in your browser (Ctrl+R)');
  console.log('2. Go to Batches tab');
  console.log('3. The "Usage by Site" section should now be empty');
  console.log('4. Remaining quantity should be 1500');
  console.log('5. Stock Usage should show "0% used"');
}

deleteBatchUsageRecord().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
