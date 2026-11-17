
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Helper to parse .env file
function parseEnv(filePath) {
    if (!fs.existsSync(filePath)) return {};
    const content = fs.readFileSync(filePath, 'utf8');
    const env = {};
    content.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2].trim();
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            env[key] = value;
        }
    });
    return env;
}

async function createBucket() {
    // Try .env.cloud.local first, then .env.local
    let env = parseEnv(path.join(process.cwd(), '.env.cloud.local'));

    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
        console.log('Service role key not found in .env.cloud.local, checking .env.local...');
        const localEnv = parseEnv(path.join(process.cwd(), '.env.local'));
        env = { ...env, ...localEnv };
    }

    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        console.error('Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        console.log('Found URL:', !!supabaseUrl);
        console.log('Found Key:', !!serviceRoleKey);
        process.exit(1);
    }

    console.log(`Connecting to Supabase at ${supabaseUrl}...`);
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log("Checking if 'documents' bucket exists...");
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
        console.error('Error listing buckets:', listError);
        process.exit(1);
    }

    const exists = buckets.find(b => b.id === 'documents');
    if (exists) {
        console.log("'documents' bucket already exists.");
        // Optionally update it to be public if needed
        if (!exists.public) {
            console.log("Updating bucket to be public...");
            const { error: updateError } = await supabase.storage.updateBucket('documents', {
                public: true
            });
            if (updateError) console.error("Error updating bucket:", updateError);
            else console.log("Bucket updated to public.");
        }
    } else {
        console.log("Creating 'documents' bucket...");
        const { data, error } = await supabase.storage.createBucket('documents', {
            public: true,
            fileSizeLimit: 52428800, // 50MB
            allowedMimeTypes: null // Allow all temporarily, or specify if needed
        });

        if (error) {
            console.error('Error creating bucket:', error);
            process.exit(1);
        }
        console.log("'documents' bucket created successfully:", data);
    }
}

createBucket().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
