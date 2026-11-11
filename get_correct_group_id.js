const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ocutbpoaibjxtyjkrnda.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function getCorrectGroupId() {
  console.log('=== Getting purchase to find correct group_id ===');
  const { data: purchase, error } = await supabase
    .from('material_purchase_expenses')
    .select('*')
    .eq('ref_code', 'MAT-260121-55EC')
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Purchase found:');
  console.log('  Ref Code:', purchase.ref_code);
  console.log('  Site Group ID:', purchase.site_group_id);
  console.log('  Purchase Type:', purchase.purchase_type);

  if (!purchase.site_group_id) {
    console.log('\n⚠️  This purchase has no site_group_id!');
    console.log('Group stock purchases must have a site_group_id.');
    return;
  }

  console.log('\n=== Verifying group exists ===');
  const { data: group, error: groupError } = await supabase
    .from('site_groups')
    .select('*')
    .eq('id', purchase.site_group_id)
    .single();

  if (groupError) {
    console.error('Group error:', groupError);
    console.log('\n❌ Site group does not exist in database!');
    console.log('The purchase has an invalid site_group_id.');
    return;
  }

  console.log('Site group found:');
  console.log('  ID:', group.id);
  console.log('  Name:', group.name);
  console.log('  Created:', group.created_at);

  console.log('\n✅ Group ID is valid:', purchase.site_group_id);
}

getCorrectGroupId().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
