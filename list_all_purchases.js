const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function listAll() {
  console.log('=== ALL Material Purchases ===');
  const { data: allPurchases, error } = await supabase
    .from('material_purchase_expenses')
    .select('ref_code, purchase_date, purchase_type, site_group_id, total_amount')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Found ${allPurchases.length} recent purchases:`);
    allPurchases.forEach((p, i) => {
      console.log(`${i + 1}. ${p.ref_code} (${p.purchase_type}) - ${p.purchase_date} - ₹${p.total_amount}`);
      if (p.site_group_id) console.log(`   Group ID: ${p.site_group_id}`);
    });
  }
}

listAll().then(() => process.exit(0)).catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
