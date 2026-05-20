import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:5173').replace(/\/$/, '');
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL || `${FRONTEND_URL}/api/webhook`;
const MP_CLIENT_ID = process.env.MP_CLIENT_ID;
const MP_CLIENT_SECRET = process.env.MP_CLIENT_SECRET;
const CANONICAL_MP_REDIRECT_URI = `${FRONTEND_URL}/api/mercadopago/oauth/callback`;
const RAW_MP_REDIRECT_URI = process.env.MP_REDIRECT_URI || '';
function getValidatedMercadoPagoRedirectUri(rawRedirectUri) {
  if (!rawRedirectUri) return CANONICAL_MP_REDIRECT_URI;
  try {
    const raw = new URL(rawRedirectUri);
    const canonical = new URL(CANONICAL_MP_REDIRECT_URI);
    if (raw.origin === canonical.origin && raw.pathname === canonical.pathname) {
      return raw.toString();
    }
  } catch {
    // Fall through to canonical callback.
  }
  return CANONICAL_MP_REDIRECT_URI;
}
const MP_REDIRECT_URI = getValidatedMercadoPagoRedirectUri(RAW_MP_REDIRECT_URI);
const MP_REDIRECT_URI_OVERRIDDEN = Boolean(RAW_MP_REDIRECT_URI && RAW_MP_REDIRECT_URI !== MP_REDIRECT_URI);
const MP_AUTHORIZATION_URL = process.env.MP_AUTHORIZATION_URL || 'https://auth.mercadopago.com/authorization';

const configStatus = {
  mpConfigured: !!MP_ACCESS_TOKEN,
  mpOAuthConfigured: !!MP_CLIENT_ID && !!MP_CLIENT_SECRET && !!MP_REDIRECT_URI,
  supabaseConfigured: !!SUPABASE_URL && !!SUPABASE_ANON_KEY,
  serviceRoleConfigured: !!SUPABASE_SERVICE_ROLE_KEY,
  webhookConfigured: !!WEBHOOK_URL,
};

function getMissingProductionConfig() {
  return [
    !configStatus.mpConfigured && 'MP_ACCESS_TOKEN',
    !configStatus.mpOAuthConfigured && 'MP_CLIENT_ID/MP_CLIENT_SECRET/MP_REDIRECT_URI',
    !configStatus.supabaseConfigured && 'VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY',
    !configStatus.serviceRoleConfigured && 'SUPABASE_SERVICE_ROLE_KEY',
    !configStatus.webhookConfigured && 'WEBHOOK_URL',
  ].filter(Boolean);
}

function makeHttpError(message, statusCode = 500, code = 'SERVER_ERROR') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function isDatabaseSchemaError(error) {
  return ['PGRST205', '42703', '42P01', '42883'].includes(error?.code);
}

function getDatabaseSetupError() {
  return makeHttpError(
    'Banco de pagamentos incompleto. Rode scripts/seller-mp-migration.sql no SQL Editor do Supabase.',
    503,
    'PAYMENT_SCHEMA_MISSING'
  );
}

function formatReadinessError(error) {
  return [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
  ].filter(Boolean).join(' - ') || 'erro sem detalhes retornado pelo Supabase';
}

const allowedOrigins = new Set(
  [FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173']
    .filter(Boolean)
    .map((origin) => origin.trim())
);

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origem nao permitida'));
  },
}));
app.use(express.json({ limit: '1mb' }));

if (!MP_ACCESS_TOKEN) {
  console.warn('AVISO: MP_ACCESS_TOKEN nao encontrado no .env.');
}

if (!MP_CLIENT_ID || !MP_CLIENT_SECRET) {
  console.warn('AVISO: MP_CLIENT_ID/MP_CLIENT_SECRET nao configurados. Vendedores nao conseguem conectar Mercado Pago via OAuth.');
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('AVISO: Supabase nao configurado no backend.');
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('AVISO: SUPABASE_SERVICE_ROLE_KEY nao configurada. Webhooks nao conseguem emitir cupons em background.');
}

if (!WEBHOOK_URL) {
  console.warn('AVISO: WEBHOOK_URL nao configurada. Mercado Pago nao chamara o webhook automaticamente.');
}

const mpClient = new MercadoPagoConfig({
  accessToken: MP_ACCESS_TOKEN || 'TEST-dummy-token',
  options: { timeout: 5000 },
});
const mpPayment = new Payment(mpClient);

function createMercadoPagoClients(accessToken) {
  const client = new MercadoPagoConfig({
    accessToken,
    options: { timeout: 5000 },
  });
  return {
    payment: new Payment(client),
    preference: new Preference(client),
  };
}

function requireSupabaseAdmin() {
  if (!supabaseAdmin) {
    throw new Error('Supabase service role nao configurada.');
  }
  return supabaseAdmin;
}

function requireMercadoPagoOAuthConfig() {
  if (!MP_CLIENT_ID || !MP_CLIENT_SECRET || !MP_REDIRECT_URI) {
    throw new Error('Configure MP_CLIENT_ID, MP_CLIENT_SECRET e MP_REDIRECT_URI no .env.');
  }
}

function buildMercadoPagoAuthorizationUrl(state) {
  const params = new URLSearchParams({
    client_id: MP_CLIENT_ID,
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: MP_REDIRECT_URI,
  });

  return `${MP_AUTHORIZATION_URL}?${params.toString()}`;
}

async function requestMercadoPagoToken(body) {
  const form = new URLSearchParams();
  Object.entries(body).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.set(key, String(value));
  });
  const response = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error_description || 'Nao foi possivel autorizar Mercado Pago.');
  }
  return data;
}

async function saveSellerPaymentAccount(sellerId, tokenData) {
  const admin = requireSupabaseAdmin();
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
    : null;

  const { data, error } = await admin
    .from('seller_payment_accounts')
    .upsert({
      seller_id: sellerId,
      provider: 'mercado_pago',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      token_type: tokenData.token_type || null,
      scope: tokenData.scope || null,
      collector_id: tokenData.user_id?.toString?.() || tokenData.collector_id?.toString?.() || null,
      public_key: tokenData.public_key || null,
      live_mode: Boolean(tokenData.live_mode),
      expires_at: expiresAt,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'seller_id' })
    .select('seller_id, collector_id, public_key, live_mode, expires_at, connected_at, updated_at')
    .single();

  if (error) throw error;
  return data;
}

async function getSellerPaymentAccount(sellerId, { refresh = true } = {}) {
  if (!sellerId) return null;
  const admin = requireSupabaseAdmin();
  const { data, error } = await admin
    .from('seller_payment_accounts')
    .select('*')
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (error) {
    if (isDatabaseSchemaError(error)) throw getDatabaseSetupError();
    throw error;
  }
  if (!data) return null;

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  const shouldRefresh = refresh && data.refresh_token && expiresAt && expiresAt - Date.now() < 10 * 60 * 1000;
  if (!shouldRefresh) return data;

  requireMercadoPagoOAuthConfig();
  const tokenData = await requestMercadoPagoToken({
    client_id: MP_CLIENT_ID,
    client_secret: MP_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: data.refresh_token,
  });
  await saveSellerPaymentAccount(sellerId, tokenData);
  return getSellerPaymentAccount(sellerId, { refresh: false });
}

async function requireSellerPaymentAccount(sellerId) {
  const account = await getSellerPaymentAccount(sellerId);
  if (!account?.access_token) {
    throw makeHttpError('Vendedor ainda nao conectou o Mercado Pago. Este produto nao pode receber pagamento ainda.', 409, 'SELLER_MP_NOT_CONNECTED');
  }
  return account;
}

function createUserClient(token) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

async function getAuthContext(req, res) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: 'Nao autenticado' });
    return null;
  }

  const client = createUserClient(token);
  if (!client) {
    res.status(500).json({ success: false, error: 'Supabase nao configurado' });
    return null;
  }

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    res.status(401).json({ success: false, error: 'Sessao invalida' });
    return null;
  }

  const profile = await getProfile(client, data.user.id);
  return { user: data.user, profile, client };
}

async function getProfile(client, userId) {
  const { data, error } = await client
    .from('profiles')
    .select('id, name, email, whatsapp, avatar, role, course, semester, verified, institution_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) return null;
  return data || null;
}

app.post('/api/profile/become-seller', async (req, res) => {
  try {
    const auth = await getAuthContext(req, res);
    if (!auth) return;

    const admin = requireSupabaseAdmin();
    const currentRole = auth.profile?.role || auth.user.user_metadata?.role || 'buyer';
    if (currentRole === 'admin') {
      return res.json({ success: true, profile: auth.profile });
    }

    const { data, error } = await admin
      .from('profiles')
      .update({ role: 'seller' })
      .eq('id', auth.user.id)
      .select('id, name, email, whatsapp, avatar, role, course, semester, verified, institution_id')
      .single();

    if (error) throw error;
    res.json({ success: true, profile: data });
  } catch (error) {
    console.error('Erro ao ativar vendedor:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao ativar modo vendedor' });
  }
});

app.get('/api/mercadopago/status', async (req, res) => {
  try {
    const auth = await getAuthContext(req, res);
    if (!auth) return;

    const account = await getSellerPaymentAccount(auth.user.id, { refresh: false });
    res.json({
      success: true,
      connected: Boolean(account),
      account: account ? {
        collectorId: account.collector_id,
        liveMode: Boolean(account.live_mode),
        connectedAt: account.connected_at,
        expiresAt: account.expires_at,
      } : null,
      oauthConfigured: configStatus.mpOAuthConfigured,
      redirectUri: MP_REDIRECT_URI,
      expectedRedirectUri: CANONICAL_MP_REDIRECT_URI,
      redirectUriOverridden: MP_REDIRECT_URI_OVERRIDDEN,
    });
  } catch (error) {
    console.error('Erro ao consultar Mercado Pago:', error);
    res.status(error.statusCode || 500).json({ success: false, code: error.code || 'MP_STATUS_ERROR', error: error.message || 'Erro ao consultar Mercado Pago' });
  }
});

app.post('/api/mercadopago/oauth/start', async (req, res) => {
  try {
    const auth = await getAuthContext(req, res);
    if (!auth) return;
    requireMercadoPagoOAuthConfig();
    const admin = requireSupabaseAdmin();
    if (!['seller', 'admin'].includes(auth.profile?.role || auth.user.user_metadata?.role || 'buyer')) {
      return res.status(403).json({ success: false, error: 'Apenas vendedores podem conectar Mercado Pago.' });
    }

    const state = randomUUID();
    const redirectTo = `${FRONTEND_URL}/#/seller?mp=connected`;
    const { error } = await admin.from('payment_oauth_states').insert({
      seller_id: auth.user.id,
      provider: 'mercado_pago',
      state,
      redirect_to: redirectTo,
    });
    if (error) throw error;

    const authorizationUrl = buildMercadoPagoAuthorizationUrl(state);

    res.json({
      success: true,
      url: authorizationUrl,
      redirectUri: MP_REDIRECT_URI,
      expectedRedirectUri: CANONICAL_MP_REDIRECT_URI,
      redirectUriOverridden: MP_REDIRECT_URI_OVERRIDDEN,
    });
  } catch (error) {
    console.error('Erro ao iniciar OAuth Mercado Pago:', error);
    res.status(error.statusCode || 500).json({ success: false, code: error.code || 'MP_OAUTH_START_ERROR', error: error.message || 'Erro ao conectar Mercado Pago' });
  }
});

app.get('/api/mercadopago/oauth/callback', async (req, res) => {
  const failUrl = `${FRONTEND_URL}/#/seller?mp=error`;
  try {
    requireMercadoPagoOAuthConfig();
    const admin = requireSupabaseAdmin();
    const { code, state, error: oauthError } = req.query || {};
    if (oauthError) {
      return res.redirect(`${failUrl}&reason=${encodeURIComponent(String(oauthError))}`);
    }
    if (!code || !state) {
      return res.redirect(`${failUrl}&reason=missing_params`);
    }

    const { data: savedState, error: stateError } = await admin
      .from('payment_oauth_states')
      .select('*')
      .eq('state', String(state))
      .maybeSingle();

    if (stateError) throw stateError;
    if (!savedState || savedState.used_at || new Date(savedState.expires_at) < new Date()) {
      return res.redirect(`${failUrl}&reason=invalid_state`);
    }

    const tokenData = await requestMercadoPagoToken({
      client_id: MP_CLIENT_ID,
      client_secret: MP_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: MP_REDIRECT_URI,
    });

    await saveSellerPaymentAccount(savedState.seller_id, tokenData);
    await admin
      .from('payment_oauth_states')
      .update({ used_at: new Date().toISOString() })
      .eq('id', savedState.id);

    res.redirect(savedState.redirect_to || `${FRONTEND_URL}/#/seller?mp=connected`);
  } catch (error) {
    console.error('Erro no callback Mercado Pago:', error);
    res.redirect(`${failUrl}&reason=${encodeURIComponent(error.message || 'oauth_failed')}`);
  }
});

async function loadProduct(client, productId) {
  const { data, error } = await client
    .from('products')
    .select(`
      id,
      title,
      description,
      category_id,
      original_price,
      discount,
      discount_price,
      images,
      slots_total,
      slots_used,
      status,
      rejection_reason,
      expires_at,
      seller_id,
      seller:profiles!seller_id (
        id,
        name,
        email,
        whatsapp,
        avatar,
        course,
        semester,
        verified
      )
    `)
    .eq('id', productId)
    .single();

  if (error || !data) throw new Error('Produto nao encontrado');
  if (data.status !== 'active') throw new Error('Produto indisponivel');
  if ((data.slots_used || 0) >= (data.slots_total || 5)) throw new Error('Produto esgotado');
  return data;
}

function mapPaymentRow(row) {
  if (!row) return null;
  return {
    id: row.mercado_pago_id || row.id,
    paymentRowId: row.id,
    mpId: row.mercado_pago_id || null,
    preferenceId: row.preference_id || null,
    status: row.status,
    amount: Number(row.amount || 0),
    originalAmount: Number(row.product_snapshot?.original_price || row.amount || 0),
    discount: Number(row.product_snapshot?.discount || 0),
    platformFee: Number(row.platform_fee || 0),
    sellerAmount: Number(row.seller_amount || 0),
    productId: row.product_id,
    productTitle: row.product_title || row.product_snapshot?.title || 'Produto',
    buyerId: row.buyer_id,
    buyerName: row.buyer_name || 'Comprador',
    sellerId: row.seller_id,
    couponCode: row.coupon_code || null,
    pixCode: row.qr_code_string || null,
    method: row.method,
    externalReference: row.external_reference,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    expiresAt: row.expires_at,
    couponId: row.coupon_id || null,
  };
}

function getPaymentClient(client) {
  return client || null;
}

async function checkDatabaseReadiness() {
  if (!supabaseAdmin) {
    return {
      schemaReady: false,
      missingDatabaseObjects: ['SUPABASE_SERVICE_ROLE_KEY'],
    };
  }

  const checks = [
    {
      name: 'seller_payment_accounts',
      run: () => supabaseAdmin.from('seller_payment_accounts').select('seller_id').limit(1),
    },
    {
      name: 'payment_oauth_states',
      run: () => supabaseAdmin.from('payment_oauth_states').select('id,state,seller_id').limit(1),
    },
    {
      name: 'payments marketplace columns',
      run: () => supabaseAdmin
        .from('payments')
        .select('seller_id,product_title,buyer_name,mercado_pago_id,preference_id,coupon_id,coupon_code,platform_fee,seller_amount,product_snapshot,paid_at')
        .limit(1),
    },
  ];

  const missingDatabaseObjects = [];
  for (const check of checks) {
    try {
      const { error } = await check.run();
      if (error) missingDatabaseObjects.push(`${check.name}: ${formatReadinessError(error)}`);
    } catch (error) {
      missingDatabaseObjects.push(`${check.name}: ${formatReadinessError(error)}`);
    }
  }

  return {
    schemaReady: missingDatabaseObjects.length === 0,
    missingDatabaseObjects,
  };
}

async function getProductPaymentReadiness(productId, { requireActive = true } = {}) {
  const admin = requireSupabaseAdmin();
  const { data: product, error } = await admin
    .from('products')
    .select('id,title,status,seller_id,slots_total,slots_used')
    .eq('id', productId)
    .maybeSingle();

  if (error) throw error;
  if (!product) {
    return { ready: false, code: 'PRODUCT_NOT_FOUND', message: 'Produto nao encontrado.' };
  }
  if (requireActive && product.status !== 'active') {
    return { ready: false, code: 'PRODUCT_NOT_ACTIVE', message: 'Produto ainda nao esta ativo para venda.' };
  }
  if ((product.slots_used || 0) >= (product.slots_total || 5)) {
    return { ready: false, code: 'PRODUCT_SOLD_OUT', message: 'Produto esgotado.' };
  }

  try {
    const account = await getSellerPaymentAccount(product.seller_id, { refresh: false });
    if (!account?.access_token) {
      return {
        ready: false,
        code: 'SELLER_MP_NOT_CONNECTED',
        message: 'O vendedor ainda precisa conectar o Mercado Pago antes de receber pagamentos.',
      };
    }
  } catch (error) {
    if (error.code === 'PAYMENT_SCHEMA_MISSING' || isDatabaseSchemaError(error)) {
      return {
        ready: false,
        code: 'PAYMENT_SCHEMA_MISSING',
        message: 'Banco de pagamentos incompleto. Rode scripts/seller-mp-migration.sql no Supabase.',
      };
    }
    throw error;
  }

  return { ready: true, code: 'READY', message: 'Produto pronto para pagamento.' };
}

async function registerPaymentIntent(client, payload) {
  const { data, error } = await client.rpc('register_payment_intent', payload);
  if (error) throw error;
  return data;
}

async function issueCouponForPayment(client, paymentId) {
  const { data, error } = await client.rpc('issue_coupon_for_payment', {
    p_payment_id: paymentId,
  });
  if (error) throw error;
  return data;
}

function generateCouponCode() {
  return `LK${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function issueCouponFromPaymentRow(client, paymentRow) {
  if (!client || !paymentRow) return null;

  const { data: existingCoupon, error: existingError } = await client
    .from('coupons')
    .select('*')
    .eq('payment_id', paymentRow.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existingCoupon) {
    await client.from('payments').update({
      coupon_id: existingCoupon.id,
      coupon_code: existingCoupon.code,
    }).eq('id', paymentRow.id);
    return existingCoupon;
  }

  const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  let coupon = null;
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCouponCode();
    const { data, error } = await client
      .from('coupons')
      .insert({
        code,
        product_id: paymentRow.product_id,
        buyer_id: paymentRow.buyer_id,
        seller_id: paymentRow.seller_id,
        payment_id: paymentRow.id,
        status: 'active',
        valid_until: validUntil,
      })
      .select('*')
      .single();

    if (!error) {
      coupon = data;
      break;
    }

    lastError = error;
    if (error.code !== '23505') break;
  }

  if (!coupon) throw lastError || new Error('Nao foi possivel emitir cupom');

  await client.from('payments').update({
    coupon_id: coupon.id,
    coupon_code: coupon.code,
  }).eq('id', paymentRow.id);

  try {
    await client.rpc('increment_slots', { product_id: paymentRow.product_id });
  } catch (err) {
    console.warn('Nao foi possivel atualizar slots do produto:', err.message);
  }

  return coupon;
}

async function syncPaymentByReference(client, paymentRef) {
  const { data: localPayment } = await client
    .from('payments')
    .select('*')
    .or(`mercado_pago_id.eq.${paymentRef},preference_id.eq.${paymentRef},external_reference.eq.${paymentRef}`)
    .maybeSingle();

  let mpData = null;
  try {
    if (localPayment?.seller_id) {
      const sellerAccount = await getSellerPaymentAccount(localPayment.seller_id);
      if (sellerAccount?.access_token) {
        mpData = await createMercadoPagoClients(sellerAccount.access_token).payment.get({ id: paymentRef });
      }
    } else {
      mpData = await mpPayment.get({ id: paymentRef });
    }
  } catch {
    mpData = null;
  }

  if (!localPayment && !mpData) {
    throw new Error('Pagamento nao encontrado');
  }

  let paymentRow = localPayment;
  if (!paymentRow && mpData?.external_reference) {
    const { data: byReference } = await client
      .from('payments')
      .select('*')
      .eq('external_reference', mpData.external_reference)
      .maybeSingle();
    paymentRow = byReference || null;
  }

  const status = mpData?.status || paymentRow?.status || 'pending';
  const updates = {
    status: status === 'approved' ? 'paid' : status === 'cancelled' || status === 'rejected' || status === 'expired' ? 'expired' : 'pending',
    paid_at: status === 'approved' ? new Date().toISOString() : paymentRow?.paid_at || null,
  };

  if (mpData) {
    updates.mercado_pago_id = mpData.id?.toString?.() || paymentRef;
    updates.external_reference = mpData.external_reference || paymentRow?.external_reference || null;
    updates.qr_code_string = mpData.point_of_interaction?.transaction_data?.qr_code || paymentRow?.qr_code_string || null;
    updates.method = mpData.payment_method_id === 'pix' ? 'pix' : paymentRow?.method || 'credit_card';
  }

  if (paymentRow) {
    const { error } = await client
      .from('payments')
      .update(updates)
      .eq('id', paymentRow.id);
    if (error) throw error;
  }

  const { data: refreshed } = await client
    .from('payments')
    .select('*')
    .or(`mercado_pago_id.eq.${paymentRef},preference_id.eq.${paymentRef},external_reference.eq.${paymentRef}`)
    .maybeSingle();

  if (refreshed?.status === 'paid' && refreshed?.buyer_id) {
    try {
      await issueCouponForPayment(client, refreshed.id);
    } catch (error) {
      console.warn('Nao foi possivel emitir cupom:', error.message);
    }
  }

  return mapPaymentRow(refreshed || paymentRow);
}

app.post('/api/pix', async (req, res) => {
  try {
    const auth = await getAuthContext(req, res);
    if (!auth) return;

    const { productId, couponCode } = req.body || {};
    if (!productId) {
      return res.status(400).json({ success: false, error: 'Produto obrigatorio' });
    }

    const product = await loadProduct(auth.client, productId);
    const sellerAccount = await requireSellerPaymentAccount(product.seller_id);
    const sellerMp = createMercadoPagoClients(sellerAccount.access_token);
    const amount = Number(product.discount_price);
    const externalReference = `linka_${product.id}_${auth.user.id}_${Date.now()}`;

    const response = await sellerMp.payment.create({
      body: {
        transaction_amount: amount,
        description: `Compra no Linka: ${product.title}`,
        payment_method_id: 'pix',
        payer: {
          email: auth.user.email,
          first_name: auth.profile?.name?.split(' ')[0] || auth.user.user_metadata?.full_name || 'Comprador',
        },
        notification_url: WEBHOOK_URL || undefined,
        external_reference: externalReference,
      },
      requestOptions: { idempotencyKey: externalReference },
    });

    const qrData = response.point_of_interaction?.transaction_data;
    if (!qrData) throw new Error('Nao foi possivel gerar os dados do Pix');

    const paymentRow = await registerPaymentIntent(auth.client, {
      p_product_id: product.id,
      p_method: 'pix',
      p_coupon_code: couponCode || null,
      p_mercado_pago_id: response.id?.toString?.() || null,
      p_qr_code_string: qrData.qr_code || null,
      p_external_reference: externalReference,
    });

    res.json({
      success: true,
      payment: {
        ...mapPaymentRow(paymentRow),
        qrCodeBase64: qrData.qr_code_base64,
        pixCode: qrData.qr_code,
        status: 'pending',
      },
    });
  } catch (error) {
    console.error('Erro ao criar Pix:', error);
    res.status(error.statusCode || 500).json({ success: false, code: error.code || 'PIX_ERROR', error: error.message || 'Erro ao gerar Pix' });
  }
});

app.get('/api/products/:productId/payment-ready', async (req, res) => {
  try {
    const readiness = await getProductPaymentReadiness(req.params.productId, { requireActive: true });
    res.json({ success: true, ...readiness });
  } catch (error) {
    console.error('Erro ao verificar prontidao de pagamento:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      ready: false,
      code: error.code || 'PAYMENT_READY_ERROR',
      message: error.message || 'Nao foi possivel verificar o pagamento.',
    });
  }
});

app.get('/api/payment/:id', async (req, res) => {
  try {
    const auth = await getAuthContext(req, res);
    if (!auth) return;

    const paymentRef = req.params.id;
    const syncClient = supabaseAdmin || auth.client;
    const synced = await syncPaymentByReference(syncClient, paymentRef);
    if (!synced) {
      return res.status(404).json({ success: false, error: 'Pagamento nao encontrado' });
    }

    const canViewPayment = auth.profile?.role === 'admin'
      || synced.buyerId === auth.user.id
      || synced.sellerId === auth.user.id;
    if (!canViewPayment) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    if (synced.status === 'paid') {
      try {
        await issueCouponForPayment(auth.client, synced.paymentRowId);
      } catch (error) {
        console.warn('Cupom nao emitido no polling:', error.message);
      }
    }

    const { data: updated } = await auth.client
      .from('payments')
      .select('*')
      .eq('id', synced.paymentRowId)
      .maybeSingle();

    res.json({
      success: true,
      payment: mapPaymentRow(updated || synced),
    });
  } catch (error) {
    console.error('Erro ao verificar pagamento:', error);
    res.status(error.statusCode || 500).json({ success: false, code: error.code || 'PAYMENT_STATUS_ERROR', error: error.message || 'Erro ao verificar pagamento' });
  }
});

app.post('/api/preference', async (req, res) => {
  try {
    const auth = await getAuthContext(req, res);
    if (!auth) return;

    const { productId, couponCode } = req.body || {};
    if (!productId) {
      return res.status(400).json({ success: false, error: 'Produto obrigatorio' });
    }

    const product = await loadProduct(auth.client, productId);
    const sellerAccount = await requireSellerPaymentAccount(product.seller_id);
    const sellerMp = createMercadoPagoClients(sellerAccount.access_token);
    const amount = Number(product.discount_price);

    const externalReference = `linka_${product.id}_${auth.user.id}_${Date.now()}`;

    const response = await sellerMp.preference.create({
      body: {
        items: [
          {
            id: product.id.toString(),
            title: product.title,
            quantity: 1,
            unit_price: amount,
            currency_id: 'BRL',
            description: `Cupom: ${couponCode || ''}`,
          },
        ],
        payer: {
          name: auth.profile?.name || auth.user.user_metadata?.full_name || 'Comprador',
          email: auth.user.email,
        },
        back_urls: {
          success: `${FRONTEND_URL}/#/buyer/coupons`,
          failure: `${FRONTEND_URL}/#/buyer`,
          pending: `${FRONTEND_URL}/#/buyer`,
        },
        auto_return: 'approved',
        notification_url: WEBHOOK_URL || undefined,
        external_reference: externalReference,
      },
    });

    const paymentRow = await registerPaymentIntent(auth.client, {
      p_product_id: product.id,
      p_method: 'credit_card',
      p_coupon_code: couponCode || null,
      p_preference_id: response.id?.toString?.() || null,
      p_external_reference: externalReference,
    });

    res.json({
      success: true,
      initPoint: response.init_point,
      payment: mapPaymentRow(paymentRow),
    });
  } catch (error) {
    console.error('Erro ao criar preferencia:', error);
    res.status(error.statusCode || 500).json({ success: false, code: error.code || 'CHECKOUT_ERROR', error: error.message || 'Erro ao gerar checkout' });
  }
});

app.post('/api/webhook', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.sendStatus(200);
    }

    const { type, data } = req.body || {};
    if (type !== 'payment' || !data?.id) {
      return res.sendStatus(200);
    }

    const mpId = data.id.toString();
    let paymentRow = null;
    let mpData = null;

    const { data: paymentById } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('mercado_pago_id', mpId)
      .maybeSingle();

    paymentRow = paymentById || null;

    if (paymentRow?.seller_id) {
      const sellerAccount = await getSellerPaymentAccount(paymentRow.seller_id);
      if (sellerAccount?.access_token) {
        mpData = await createMercadoPagoClients(sellerAccount.access_token).payment.get({ id: mpId });
      }
    }

    if (!mpData) {
      const { data: accounts } = await supabaseAdmin
        .from('seller_payment_accounts')
        .select('seller_id, access_token');
      for (const account of accounts || []) {
        try {
          mpData = await createMercadoPagoClients(account.access_token).payment.get({ id: mpId });
          if (mpData) break;
        } catch {
          mpData = null;
        }
      }
    }

    const reference = mpData?.external_reference || null;
    if (!paymentRow && reference) {
      const { data: byReference } = await supabaseAdmin
        .from('payments')
        .select('*')
        .or(`mercado_pago_id.eq.${mpId},external_reference.eq.${reference},preference_id.eq.${mpId}`)
        .maybeSingle();
      paymentRow = byReference || null;
    }

    if (!paymentRow) {
      return res.sendStatus(200);
    }

    if (!mpData) {
      return res.sendStatus(200);
    }

    const updates = {
      mercado_pago_id: mpId,
      status: mpData.status === 'approved' ? 'paid' : mpData.status === 'cancelled' || mpData.status === 'rejected' ? 'expired' : 'pending',
      paid_at: mpData.status === 'approved' ? new Date().toISOString() : paymentRow.paid_at || null,
    };

    await supabaseAdmin.from('payments').update(updates).eq('id', paymentRow.id);
    if (mpData.status === 'approved') {
      try {
        await issueCouponFromPaymentRow(supabaseAdmin, {
          ...paymentRow,
          status: 'paid',
          paid_at: updates.paid_at,
        });
      } catch (error) {
        console.warn('Nao foi possivel emitir cupom no webhook:', error.message);
      }
    }
    return res.sendStatus(200);
  } catch (error) {
    console.error('Erro no webhook:', error);
    return res.sendStatus(200);
  }
});

app.get('/api/seller/:sellerId/payments', async (req, res) => {
  try {
    const auth = await getAuthContext(req, res);
    if (!auth) return;

    const { sellerId } = req.params;
    if (auth.profile?.role !== 'admin' && auth.user.id !== sellerId) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    const { data, error } = await auth.client
      .from('payments')
      .select('*')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      payments: (data || []).map(mapPaymentRow),
    });
  } catch (error) {
    console.error('Erro ao carregar vendas:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao carregar vendas' });
  }
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    const auth = await getAuthContext(req, res);
    if (!auth) return;
    if (auth.profile?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    const [paymentsRes, paidRes, pendingRes] = await Promise.all([
      auth.client.from('payments').select('id', { count: 'exact', head: true }),
      auth.client.from('payments').select('amount, platform_fee, status'),
      auth.client.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    const payments = paidRes.data || [];
    const paid = payments.filter((p) => p.status === 'paid');
    const totalRevenue = paid.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalFees = paid.reduce((sum, p) => sum + Number(p.platform_fee || 0), 0);

    res.json({
      success: true,
      stats: {
        totalPayments: paymentsRes.count || 0,
        paidPayments: paid.length,
        pendingPayments: pendingRes.count || 0,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalFees: Math.round(totalFees * 100) / 100,
      },
    });
  } catch (error) {
    console.error('Erro ao carregar stats:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao carregar stats' });
  }
});

app.post('/api/admin/products/:productId/approve', async (req, res) => {
  try {
    const auth = await getAuthContext(req, res);
    if (!auth) return;
    if (auth.profile?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Acesso restrito a administradores.' });
    }

    const readiness = await getProductPaymentReadiness(req.params.productId, { requireActive: false });
    if (!readiness.ready) {
      return res.status(409).json({
        success: false,
        code: readiness.code,
        error: readiness.message,
      });
    }

    const admin = requireSupabaseAdmin();
    const { data, error } = await admin
      .from('products')
      .update({ status: 'active', rejection_reason: null })
      .eq('id', req.params.productId)
      .select('*')
      .single();

    if (error) throw error;
    res.json({ success: true, product: data });
  } catch (error) {
    console.error('Erro ao aprovar produto:', error);
    res.status(error.statusCode || 500).json({ success: false, code: error.code || 'ADMIN_APPROVE_ERROR', error: error.message || 'Erro ao aprovar produto' });
  }
});

app.get('/api/health', async (req, res) => {
  const missingProductionConfig = getMissingProductionConfig();
  const database = await checkDatabaseReadiness();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ...configStatus,
    ...database,
    frontendUrl: FRONTEND_URL,
    mercadoPagoRedirectUri: MP_REDIRECT_URI,
    expectedMercadoPagoRedirectUri: CANONICAL_MP_REDIRECT_URI,
    mercadoPagoRedirectUriOverridden: MP_REDIRECT_URI_OVERRIDDEN,
    missingProductionConfig,
    readyForProduction: missingProductionConfig.length === 0 && database.schemaReady,
  });
});

if (!process.env.NETLIFY) {
  app.listen(PORT, () => {
    console.log(`Backend Linka escutando na porta ${PORT}`);
  });
}

export default app;
