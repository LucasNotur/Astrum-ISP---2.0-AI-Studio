import { Client } from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.log('DATABASE_URL is missing in .env');
  process.exit(1);
}

const client = new Client({
  connectionString: dbUrl,
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL');
    
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase-migrations.sql'), 'utf-8');
    
    console.log('Executing migrations...');
    await client.query(sql);
    
    console.log('Migrations executed successfully.');
  } catch (err) {
    console.error('Error executing migrations:', err);
  } finally {
    await client.end();
  }
}

run();
