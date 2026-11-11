const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBatchUsageRecords() {
  console.log('=== Checking batch_usage_records table ===');
  const { data: records, error } = await supabase
    .from('batch_usage_records')
    .select('*')
    .eq('batch_ref_code', 'MAT-260121-55EC');

  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Found ${records?.length || 0} batch usage records:`);
    records?.forEach((rec, i) => {
      console.log(`\n${i + 1}. ID: ${rec.id}`);
      console.log('   Batch:', rec.batch_ref_code);
      console.log('   Usage Site:', rec.usage_site_id);
      console.log('   Material:', rec.material_id);
      console.log('   Quantity:', rec.quantity);
      console.log('   Total Cost:', rec.total_cost);
      console.log('   Settlement Status:', rec.settlement_status);
      console.log('   Is Self Use:', rec.is_self_use);
      console.log('   Created:', rec.created_at);
    });
  }

  console.log('\n=== Checking what unsettled balances query expects ===');
  console.log('The query likely looks for batch_usage_records with:');
  console.log('  - settlement_status = "pending"');
  console.log('  - is_self_use = false');
  console.log('  - Groups by usage_site_id to show who owes whom');
}

checkBatchUsageRecords().then(() => process.exit(0)).catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
