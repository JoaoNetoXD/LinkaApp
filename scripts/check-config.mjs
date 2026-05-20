import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const isProductionCheck = process.argv.includes('--production');
const siteUrl = (process.env.FRONTEND_URL || process.env.URL || '').replace(/\/$/, '');

if (siteUrl) {
  process.env.DERIVED_WEBHOOK_URL = `${siteUrl}/api/webhook`;
  process.env.DERIVED_MP_REDIRECT_URI = `${siteUrl}/api/mercadopago/oauth/callback`;
}

const groups = [
  {
    label: 'Supabase client',
    required: true,
    keys: ['VITE_SUPABASE_URL', 'SUPABASE_URL'],
  },
  {
    label: 'Supabase anon key',
    required: true,
    keys: ['VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY'],
  },
  {
    label: 'Mercado Pago access token',
    required: true,
    keys: ['MP_ACCESS_TOKEN'],
  },
  {
    label: 'Mercado Pago OAuth client id',
    required: isProductionCheck,
    keys: ['MP_CLIENT_ID'],
  },
  {
    label: 'Mercado Pago OAuth client secret',
    required: isProductionCheck,
    keys: ['MP_CLIENT_SECRET'],
  },
  {
    label: 'Frontend URL',
    required: true,
    keys: ['FRONTEND_URL', 'URL'],
  },
  {
    label: 'Supabase service role key',
    required: isProductionCheck,
    keys: ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'],
  },
  {
    label: 'Mercado Pago webhook URL',
    required: isProductionCheck,
    keys: ['WEBHOOK_URL', 'DERIVED_WEBHOOK_URL'],
  },
  {
    label: 'Mercado Pago OAuth redirect URL',
    required: isProductionCheck,
    keys: ['MP_REDIRECT_URI', 'DERIVED_MP_REDIRECT_URI'],
  },
];

function readValue(keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return { key, value };
  }
  return null;
}

function looksLikePlaceholder(value) {
  return /cole_|sua-|seu-|example|localhost-placeholder|000000000/i.test(value);
}

let hasError = false;

console.log(`Config check (${isProductionCheck ? 'production' : 'local'})`);

for (const group of groups) {
  const found = readValue(group.keys);
  const label = group.keys.join(' or ');

  if (!found) {
    if (group.required) {
      hasError = true;
      console.error(`[missing] ${group.label}: ${label}`);
    } else {
      console.warn(`[warn] ${group.label}: ${label}`);
    }
    continue;
  }

  if (looksLikePlaceholder(found.value)) {
    if (group.required) {
      hasError = true;
      console.error(`[placeholder] ${group.label}: ${found.key}`);
    } else {
      console.warn(`[warn] ${group.label}: ${found.key} looks like a placeholder`);
    }
    continue;
  }

  console.log(`[ok] ${group.label}: ${found.key}`);
}

if (hasError) {
  process.exitCode = 1;
} else {
  console.log('[ok] configuration check finished');
}
