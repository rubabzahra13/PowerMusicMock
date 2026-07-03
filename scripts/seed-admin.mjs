#!/usr/bin/env node
/**
 * Seeds the single admin account (Andrea) in Supabase Auth.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-admin.mjs
 *
 * Optional:
 *   ADMIN_EMAIL=andrea@powermusic.io
 *   ADMIN_PASSWORD=your-strong-password
 *   ADMIN_FULL_NAME=Andrea
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminEmail = process.env.ADMIN_EMAIL || 'andrea@powermusic.io';
const adminFullName = process.env.ADMIN_FULL_NAME || 'Andrea';
let adminPassword = process.env.ADMIN_PASSWORD;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

if (!adminPassword) {
  adminPassword = generatePassword();
  console.log('No ADMIN_PASSWORD provided — generated a strong password (save it now):');
  console.log(`\n  ${adminPassword}\n`);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function generatePassword() {
  const base = randomBytes(18).toString('base64url');
  return `Pm!${base}9`;
}

async function findExistingAdminProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('role', 'admin')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function main() {
  const existingAdmin = await findExistingAdminProfile();

  if (existingAdmin) {
    console.log(`Admin account already exists: ${existingAdmin.email} (${existingAdmin.id})`);
    console.log('To change the password, use the Supabase Dashboard or auth.admin.updateUserById.');
    return;
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    user_metadata: {
      full_name: adminFullName,
    },
  });

  if (createError) {
    throw createError;
  }

  const userId = created.user.id;

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      email: adminEmail,
      full_name: adminFullName,
      role: 'admin',
    });

  if (profileError) {
    throw profileError;
  }

  console.log('Admin account created successfully.');
  console.log(`  Email: ${adminEmail}`);
  console.log(`  Name:  ${adminFullName}`);
  console.log(`  ID:    ${userId}`);

  if (process.env.ADMIN_PASSWORD) {
    console.log('  Password: (from ADMIN_PASSWORD env var)');
  } else {
    console.log('  Password: (generated above — store securely before deploy)');
  }
}

main().catch((error) => {
  console.error('Failed to seed admin account:', error.message || error);
  process.exit(1);
});
