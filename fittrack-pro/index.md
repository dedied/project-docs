# FitTrack Pro

FitTrack Pro is an offline-first Progressive Web App (PWA) designed to help you monitor your progress across an unlimited number of exercises.

Built with React, Vite, and Tailwind CSS, it offers a seamless native-like experience on mobile devices.

## Features

- **📊 Interactive Charts:** Visualize your progress over daily, weekly, monthly, and yearly timeframes.
- **🤸 Unlimited Exercises:** Track as many different workouts as you want, for free.
- **🔒 Privacy First & Secure:** Works completely offline. Includes a built-in PIN lock and Biometric authentication (FaceID/TouchID) to protect your data.
- **☁️ Premium Cloud Sync:** **(Premium)** Sync your data across devices using Supabase.
- **📱 PWA Support:** Installable on iOS and Android.
- **💾 Data Control:** **(Premium)** Export and import your workout logs via CSV.

## 🔄 Sync Strategy (Premium)

FitTrack Pro uses an **Offline-First** approach with a "Cloud-Wins" conflict resolution strategy to ensure data integrity across devices for premium users.

1.  **Local Storage:** The app always reads from and writes to the device's local storage for instant performance.
2.  **Cloud Synchronization:** When online and authenticated as a premium user, the app performs a sync:
    - **Downloads** all logs from the database.
    - **Uploads** any local logs that don't exist in the cloud (new entries).
    - **Claims Ownership:** Any logs created while in "Guest Mode" are automatically assigned to the user upon login and sync.
3.  **Conflict Resolution:**
    - If a specific log ID exists in both Local Storage and the Cloud, **the Cloud version is treated as the source of truth** and overwrites the local version.
    - This prevents stale local data on one device from overwriting edits made on another device.

## [Database](./database/index.md)


## Premium Subscription Setup (Stripe)

Follow these steps to enable premium subscriptions via Stripe.

### 1. Stripe Setup
- Go to your [Stripe Dashboard](https://dashboard.stripe.com/).
- Create a new product (e.g., "FitTrack Pro Premium").
- Add a price to it (e.g., $19.99, one-time payment). Note the **Price ID** (e.g., `price_...`).
- Go to **Developers > API keys** and copy your **Secret key**.

### 2. Supabase Environment Variables
- In your Supabase project, go to **Project Settings > Edge Functions**.
- Add the following secrets. The Edge Functions require these to authenticate users and interact with Stripe.
  - `SUPABASE_URL`: Your project's Supabase URL.
  - `SUPABASE_ANON_KEY`: Your project's anon (public) key.
  - `STRIPE_SECRET_KEY`: Your Stripe secret key (`sk_...`).
  - `STRIPE_PRICE_ID`: The Price ID from the product you created (`price_...`).
  - `SITE_URL`: The URL where your app is deployed (e.g., `https://your-github-username.github.io/fittrack-pro/`).

### 3. Create Supabase Edge Functions
- Create two new Edge Functions in your Supabase project.

**Function 1: `create-stripe-checkout`**
This function creates a Stripe Checkout session for the logged-in user.
**IMPORTANT:** This function includes CORS handling to prevent 500 errors on browser preflight requests.

```typescript
// supabase/functions/create-stripe-checkout/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@11.1.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verify environment variables are set
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!supabaseUrl || !supabaseAnonKey || !stripeSecretKey) {
      throw new Error('Missing required environment variables (Supabase URL/Key or Stripe Key).');
    }

    // 2. Initialize Stripe
    const stripe = Stripe(stripeSecretKey, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    // 3. Authenticate user using the token from the request
    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: req.headers.get('Authorization') } } }
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError; // Re-throw the specific auth error
    if (!user) throw new Error('User not found. Invalid authentication token.');

    // 4. Get or create a Stripe customer for the user
    const { data: profile, error: profileError } = await supabase.from('profiles').select('stripe_customer_id').eq('id', user.id).single();
    if (profileError) throw profileError;

    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      const { error: updateError } = await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
      if (updateError) throw updateError;
    }

    const origin = req.headers.get("origin") ?? Deno.env.get("SITE_URL");

    // 5. Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [{ price: Deno.env.get('STRIPE_PRICE_ID'), quantity: 1 }],
      mode: 'payment',
      success_url: `${origin}?payment_success=true`,
      cancel_url: `${Deno.env.get('SITE_URL')}?payment_canceled=true`,
    });
    
    if (!session.url) {
        throw new Error("Failed to create Stripe session URL.");
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    // Log the full error to the function logs for better debugging
    console.error('Checkout function error:', error);
    
    // Return a more informative error message to the client
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, // Using 400 for client-side correctable errors (like bad auth) or config errors
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

**Function 2: `stripe-webhook`**
This function listens for successful payments from Stripe and updates the user's profile.
```typescript
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
### 4. Deploy Functions & Webhook
- Deploy both functions using the Supabase CLI: `supabase functions deploy create-stripe-checkout` and `supabase functions deploy stripe-webhook`.
- Go to **Stripe Dashboard > Developers > Webhooks**.
- Create a new webhook endpoint. The URL is your Supabase webhook function URL.
- Select the event `checkout.session.completed`.
- Reveal and copy the **Signing secret** and add it as a new secret in Supabase Edge Functions: `STRIPE_WEBHOOK_SIGNING_SECRET`.


## 🤖 Created with Google AI Studio, GitHub, GitHub Pages and Supabase

The coding for this project was entirely done using Google AI Studio.
See the end result at the [GitHub page](https://dedied.github.io/fittrack-pro/).
