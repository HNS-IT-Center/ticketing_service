const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://vnhmqlrlaaddwdvxvwoh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuaG1xbHJsYWFkZHdkdnh2d29oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTEzNjA5MSwiZXhwIjoyMDk2NzEyMDkxfQ.V-RLpnx5SE7D2scdDmRqpjA19uT4mCwmHzP6TzvA9iQ' // From .env.local SUPABASE_SERVICE_ROLE_KEY
);

async function checkBucket() {
  const { data, error } = await supabase.storage.getBucket('attachments');
  if (error) {
    console.log('Bucket does not exist. Error:', error.message);
    
    // Create bucket
    const { data: createData, error: createError } = await supabase.storage.createBucket('attachments', { public: true });
    if (createError) {
      console.log('Failed to create bucket:', createError.message);
    } else {
      console.log('Bucket created successfully!');
    }
  } else {
    console.log('Bucket exists:', data.name);
  }
}

checkBucket();
