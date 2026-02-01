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
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS public.workouts;
DROP TABLE IF EXISTS public.profiles;

-- 1. PROFILES TABLE
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_premium BOOLEAN DEFAULT FALSE,
  stripe_customer_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT own profile
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- INSERT own profile
CREATE POLICY profiles_insert_own
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- UPDATE own profile (but NOT is_premium or stripe_customer_id)
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND is_premium = (SELECT is_premium FROM public.profiles WHERE id = auth.uid())
    AND stripe_customer_id = (SELECT stripe_customer_id FROM public.profiles WHERE id = auth.uid())
  );

-- Prevent DELETE by authenticated users
CREATE POLICY profiles_no_delete_for_users
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (false);

-- 2. WORKOUTS TABLE
CREATE TABLE public.workouts (
  id TEXT PRIMARY KEY,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL,
  reps DOUBLE PRECISION NOT NULL,
  weight DOUBLE PRECISION,
  owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;

-- SELECT own workouts
CREATE POLICY workouts_select_owner
  ON public.workouts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

-- INSERT own workouts
CREATE POLICY workouts_insert_owner
  ON public.workouts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

-- UPDATE own workouts
CREATE POLICY workouts_update_owner
  ON public.workouts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- DELETE own workouts
CREATE POLICY workouts_delete_owner
  ON public.workouts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
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

-- 3. USER CREATION TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

-- 4. SECURE DELETE USER FUNCTION
CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $function$
DECLARE
  uid uuid;
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

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS idx_workouts_owner_id ON public.workouts (owner_id);
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles (id);

-- 6. PRIVILEGE HARDENING
REVOKE ALL ON TABLE public.workouts FROM PUBLIC;
REVOKE ALL ON TABLE public.profiles FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workouts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

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

```
// supabase/functions/create-stripe-checkout/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@11.1.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripe = Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  // 1. Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 2. USER CLIENT (anon key + JWT)
    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: req.headers.get('Authorization') } } }
    );

    const { data: { user } } = await userSupabase.auth.getUser();
    if (!user) throw new Error('User not found');

    const { data: profile } = await userSupabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    // 3. ADMIN CLIENT (service role key)
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    // 4. Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;

      await adminSupabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }
    const origin = req.headers.get("origin") ?? Deno.env.get("SITE_URL");


    // 5. Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [{ price: Deno.env.get('STRIPE_PRICE_ID'), quantity: 1 }],
      mode: 'payment',
      success_url: `${origin}?payment_success=true`,
      cancel_url: `${origin}?payment_canceled=true`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

- stripe-webhook

```
// supabase/functions/stripe-webhook/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@11.1.0?target=deno';

const stripe = Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature');
  const body = await req.text();
  
  try {
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET'),
      undefined,
      cryptoProvider
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const customerId = session.customer;

      const adminSupabase = createClient(
        Deno.env.get('SUPABASE_URL'),
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      );
      
      await adminSupabase.from('profiles')
        .update({ is_premium: true })
        .eq('stripe_customer_id', customerId);
    }
    
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }
});
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
