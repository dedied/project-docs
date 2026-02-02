# Database & Auth Setup

We're using [Supabase](https://supabase.com/).

To enable user accounts, set up a Supabase project and run the following SQL query in the **SQL Editor** to create the necessary tables and security policies.

```sql
-- ================================
-- Secure migration script (public)
-- Run as DB owner / service_role
-- ================================

-- 0. TEAR DOWN
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS workouts_set_updated_at ON public.workouts;

DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.update_timestamp();
DROP FUNCTION IF EXISTS public.delete_user();

DROP TABLE IF EXISTS public.workouts;
DROP TABLE IF EXISTS public.profiles;


-- ================================
-- 1. PROFILES TABLE
-- ================================

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_customer_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT own profile
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND auth.uid() = id);

-- INSERT own profile
CREATE POLICY profiles_insert_own
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = id);

-- UPDATE own profile (column‑restricted via privileges)
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL AND auth.uid() = id)
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = id);

-- Prevent DELETE by authenticated users
CREATE POLICY profiles_no_delete_for_users
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (false);

-- ================================
-- 2. WORKOUTS TABLE
-- ================================

CREATE TABLE public.workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL,
  reps DOUBLE PRECISION NOT NULL,
  weight DOUBLE PRECISION,
  owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;

-- SELECT own workouts
CREATE POLICY workouts_select_owner
  ON public.workouts
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND auth.uid() = owner_id);

-- INSERT own workouts
CREATE POLICY workouts_insert_owner
  ON public.workouts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = owner_id);

-- UPDATE own workouts
CREATE POLICY workouts_update_owner
  ON public.workouts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL AND auth.uid() = owner_id)
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = owner_id);

-- DELETE own workouts
CREATE POLICY workouts_delete_owner
  ON public.workouts
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL AND auth.uid() = owner_id);

-- ================================
-- 3. AUTO‑UPDATE TIMESTAMPS
-- ================================

CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER workouts_set_updated_at
  BEFORE UPDATE ON public.workouts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_timestamp();

REVOKE ALL ON FUNCTION public.update_timestamp() FROM PUBLIC;

-- ================================
-- 4. USER CREATION TRIGGER
-- ================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $function$
BEGIN
  INSERT INTO public.profiles (id, is_premium, updated_at)
  VALUES (NEW.id, FALSE, NOW())
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- ================================
-- 5. SECURE DELETE USER FUNCTION
-- ================================

CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $function$
DECLARE
  uid UUID;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM auth.users WHERE id = uid;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;

-- ================================
-- 6. INDEXES
-- ================================

CREATE INDEX IF NOT EXISTS idx_workouts_owner_id ON public.workouts (owner_id);
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles (id);

-- ================================
-- 7. PRIVILEGE HARDENING
-- ================================

-- Remove all implicit access
REVOKE ALL ON TABLE public.workouts FROM PUBLIC;
REVOKE ALL ON TABLE public.profiles FROM PUBLIC;

-- Workouts: full CRUD for owners (RLS enforced)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workouts TO authenticated;

-- Profiles: users can read + insert + update *only allowed columns*
GRANT SELECT, INSERT ON public.profiles TO authenticated;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (updated_at) ON public.profiles TO authenticated;

-- =========================================
-- Stripe webhook idempotency & audit table
-- Full teardown and rebuild
-- =========================================

-- Drop existing table (safe during early development)
DROP TABLE IF EXISTS public.stripe_events;

-- Recreate table with full schema
CREATE TABLE public.stripe_events (
  id TEXT PRIMARY KEY,                         -- Stripe event ID (evt_*)
  type TEXT NOT NULL,                          -- Event type (checkout.session.completed, etc)
  stripe_customer_id TEXT,                     -- cus_* (nullable for non-customer events)
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'received',     -- received | processed | failed
  last_error TEXT
);

-- Enable Row Level Security
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- Explicitly deny all access to authenticated users
CREATE POLICY stripe_events_no_user_access
  ON public.stripe_events
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Defense-in-depth privilege hardening
REVOKE ALL ON TABLE public.stripe_events FROM PUBLIC;
REVOKE ALL ON TABLE public.stripe_events FROM authenticated;

-- Service role is the only actor allowed to interact
GRANT SELECT, INSERT, UPDATE ON TABLE public.stripe_events TO service_role;

-- Optional but recommended: index for customer-based lookups
CREATE INDEX idx_stripe_events_customer
  ON public.stripe_events (stripe_customer_id);



```

## Client-Side Setup (Important for Authentication)

Before running the application, you must configure your Supabase credentials in `App.tsx`. An incorrect configuration is the most common cause of authentication (401) errors.

1.  Open the `App.tsx` file.
2.  Find the following constants at the top of the file:
    ```typescript
    const SUPABASE_URL = 'https://infdrucgfquyujuqtajr.supabase.co';
    const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_PUBLISHABLE_KEY_REPLACE_ME';
    ```
3.  Ensure the `SUPABASE_URL` matches your project's URL.
4.  Replace the placeholder `SUPABASE_ANON_KEY` with your project's **anon (public) key**. You can find this in your Supabase Dashboard under **Project Settings > API > Project API Keys**. It typically starts with `sb_publishable_...`.


## Edge Functions
- create-stripe-checkout

```ts
// supabase/functions/create-stripe-checkout/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@10.17.0?target=deno'

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

const SUPABASE_URL = requireEnv('SUPABASE_URL')
const SUPABASE_ANON_KEY = requireEnv('SUPABASE_ANON_KEY')
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

const STRIPE_SECRET_KEY = requireEnv('STRIPE_SECRET_KEY')
const STRIPE_PRICE_ID = requireEnv('STRIPE_PRICE_ID')

/**
 * Canonical production origin (no trailing slash).
 */
const SITE_URL = 'https://fittrack-pro.app'

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) return false

  // Allow canonical production domain
  if (origin === SITE_URL) return true

  try {
    const url = new URL(origin)

    // Only FitTrack previews from your Vercel project
    return (
      url.protocol === 'https:' &&
      url.hostname.startsWith('fittrack-') &&
      url.hostname.endsWith('peppery-projects.vercel.app')
    )
  } catch {
    return false
  }
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin')

  // 1) Handle CORS preflight
  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(origin)) return new Response('forbidden', { status: 403 })
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  // 2) Only allow POST
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  // 3) Enforce origin allowlist
  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: 'Forbidden origin' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // 4) USER CLIENT (anon key + JWT)
    const userSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: req.headers.get('Authorization') ?? '' },
      },
    })

    const { data: { user }, error: authError } = await userSupabase.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      })
    }

    const { data: profile, error: profileError } = await userSupabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (profileError) throw profileError

    let customerId = profile?.stripe_customer_id ?? null

    // 5) ADMIN CLIENT (service role key)
    const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 6) Create Stripe customer if needed (race-safe)
    if (!customerId) {
      // Re-check with admin to reduce duplicates under concurrency
      const { data: freshProfile, error: freshError } = await adminSupabase
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', user.id)
        .single()

      if (freshError) throw freshError

      if (freshProfile?.stripe_customer_id) {
        customerId = freshProfile.stripe_customer_id
      } else {
        const customer = await stripe.customers.create({
          email: user.email ?? undefined,
        })
        customerId = customer.id

        const { error: updateError } = await adminSupabase
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', user.id)

        if (updateError) throw updateError
      }
    }

    // 7) Create Checkout Session (one-time payment)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      mode: 'payment',
      success_url: `${origin}?payment_success=true`,
      cancel_url: `${origin}?payment_canceled=true`,
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('create-stripe-checkout error:', err)

    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    })
  }
});

```

- stripe-webhook

```ts
// supabase/functions/stripe-webhook/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@10.17.0?target=deno'

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

const SUPABASE_URL = requireEnv('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

const STRIPE_SECRET_KEY = requireEnv('STRIPE_SECRET_KEY')
const STRIPE_WEBHOOK_SIGNING_SECRET = requireEnv('STRIPE_WEBHOOK_SIGNING_SECRET')
const STRIPE_PRICE_ID = requireEnv('STRIPE_PRICE_ID')

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const cryptoProvider = Stripe.createSubtleCryptoProvider()

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  const signature = req.headers.get('Stripe-Signature')
  if (!signature) {
    return new Response('missing signature', { status: 400 })
  }

  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      STRIPE_WEBHOOK_SIGNING_SECRET,
      undefined,
      cryptoProvider
    )
  } catch (err) {
    console.error('Stripe signature verification failed:', err)
    return new Response('invalid signature', { status: 400 })
  }

  const adminSupabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  )

  // Record receipt (idempotency with status)
  const { error: insertErr } = await adminSupabase
    .from('stripe_events')
    .insert({
      id: event.id,
      type: event.type,
      stripe_customer_id:
        typeof (event.data.object as any)?.customer === 'string'
          ? (event.data.object as any).customer
          : null,
      status: 'received',
    })

  if (insertErr) {
    const { data: existing, error: readErr } = await adminSupabase
      .from('stripe_events')
      .select('status')
      .eq('id', event.id)
      .single()

    if (readErr) {
      console.error('Failed reading existing stripe_events row:', readErr)
      return new Response('internal error', { status: 500 })
    }

    if (existing?.status === 'processed') {
      return new Response(JSON.stringify({ received: true }), { status: 200 })
    }
    // If status is received or failed, continue processing (retry can heal)
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session

      if (session.payment_status !== 'paid') {
        await adminSupabase
          .from('stripe_events')
          .update({
            status: 'failed',
            last_error: 'payment_status_not_paid',
          })
          .eq('id', event.id)

        return new Response(JSON.stringify({ received: true }), { status: 200 })
      }

      if (session.mode !== 'payment') {
        await adminSupabase
          .from('stripe_events')
          .update({
            status: 'failed',
            last_error: `unexpected_mode_${session.mode ?? 'null'}`,
          })
          .eq('id', event.id)

        return new Response(JSON.stringify({ received: true }), { status: 200 })
      }

      const lineItems = await stripe.checkout.sessions.listLineItems(
        session.id,
        { limit: 10 }
      )

      const hasExpectedPrice = lineItems.data.some(
        (item) => item.price?.id === STRIPE_PRICE_ID
      )

      if (!hasExpectedPrice) {
        await adminSupabase
          .from('stripe_events')
          .update({
            status: 'failed',
            last_error: 'unexpected_price',
          })
          .eq('id', event.id)

        return new Response(JSON.stringify({ received: true }), { status: 200 })
      }

      const customerId = session.customer
      if (typeof customerId !== 'string') {
        await adminSupabase
          .from('stripe_events')
          .update({
            status: 'failed',
            last_error: 'invalid_customer_id',
          })
          .eq('id', event.id)

        return new Response(JSON.stringify({ received: true }), { status: 200 })
      }

      const { data: updated, error: updateErr } = await adminSupabase
        .from('profiles')
        .update({ is_premium: true })
        .eq('stripe_customer_id', customerId)
        .select('id')

      if (updateErr) throw updateErr

      if (!updated || updated.length === 0) {
        await adminSupabase
          .from('stripe_events')
          .update({
            status: 'failed',
            last_error: 'no_profile_matched_customer_id',
          })
          .eq('id', event.id)

        return new Response(JSON.stringify({ received: true }), { status: 200 })
      }
    }

    // Mark processed only after successful handling
    const { error: markErr } = await adminSupabase
      .from('stripe_events')
      .update({
        status: 'processed',
        processed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', event.id)

    if (markErr) {
      console.error('Failed marking stripe event processed:', markErr)
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch (err) {
    console.error('Stripe webhook processing error:', err)

    await adminSupabase
      .from('stripe_events')
      .update({
        status: 'failed',
        last_error: (err as Error)?.message?.slice(0, 500) ?? 'unknown_error',
      })
      .eq('id', event.id)

    // Return 500 so Stripe retries
    return new Response('internal error', { status: 500 })
  }
})

```

- Edge function secrets needed:
  - the following should have been created automatically for you by the act of creating the functions in the previous step:
      - `SUPABASE_URL`
      - `SUPABASE_ANON_KEY`
      - `SUPABASE_SERVICE_ROLE_KEY`
      - `SUPABASE_DB_URL`
  - these need to be manually created:
    - `STRIPE_SECRET_KEY`
    - `STRIPE_PRICE_ID`
    - `STRIPE_WEBHOOK_SIGNING_SECRET`
    - `SITE_URL`
