# Hosting & Deployment

This document explains how FitTrack Pro is deployed using [Vercel](https://vercel.com/), how a Vite + React project is configured correctly, how a blank-screen deployment issue was resolved, and how Stripe and Supabase are integrated in a cloud-only workflow.

This setup assumes development happens entirely through **AI Studio → GitHub → Vercel**, without running a local development environment.


## 1. Vercel Build Settings (React + Vite)

Vercel must be configured with the correct build settings.

In **Vercel → Project → Settings → Build & Development Settings**:

| Setting | Value |
|-------|-------|
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

These settings ensure Vercel builds the Vite project correctly and deploys the generated output.

---

## 2. SPA Routing Configuration (vercel.json)

React Router (and any Vite SPA) requires a fallback so that all routes serve `index.html`.

Create a file at the project root:

    vercel.json

With the following contents:

    {
      "rewrites": [
        { "source": "/(.*)", "destination": "/" }
      ]
    }

This file must be committed to Git. Vercel reads it during deployment.

Without this rewrite rule, refreshing a route or opening a deep link can result in a blank screen or 404.

---

## 3. Resolving the Blank Screen Issue

The first Vercel deployment built successfully but rendered a blank screen.

The cause was a leftover GitHub Pages configuration in `vite.config.ts`:

    base: '/fittrack-pro/'

This caused Vite to generate asset URLs such as:

    /fittrack-pro/main.js

However, Vercel serves assets from the root:

    /main.js

Removing the `base` property resolved the issue.


## 4. Domain Configuration

FitTrack Pro uses a `.app` domain, which provides:

- Automatic HTTPS (HSTS preloaded)
- Automatic WHOIS privacy
- Clear consumer-app branding

Example domain:

    fittrack-pro.app

Vercel manages DNS, SSL certificates, and deployment automatically.










## 5. Stripe Checkout Redirect URLs

Stripe Checkout redirect URLs are **not** configured in the Stripe dashboard.
They are defined in the Supabase Edge Function that creates the Checkout Session.

Example:

    success_url: `${Deno.env.get('SITE_URL')}?payment_success=true`,
    cancel_url: `${Deno.env.get('SITE_URL')}?payment_canceled=true`,

This approach:

- Centralizes redirect control in one environment variable
- Avoids hard-coding preview URLs
- Works for both test and live Stripe modes
- Requires no local development environment

Recommended value:

    SITE_URL=https://fittrack-pro.app

Stripe test checkouts can safely redirect to the production domain.

---

## 7. Stripe Webhook Configuration

Stripe webhooks must point to a stable, permanent URL.

FitTrack Pro uses a Supabase Edge Function:

    supabase/functions/stripe-webhook/index.ts

In **Stripe Dashboard → Developers → Webhooks**, configure the endpoint as:

    https://<supabase-project-id>.functions.supabase.co/stripe-webhook

This endpoint:

- Never changes
- Works for both test and live modes
- Updates the user’s premium entitlement in Supabase

---

#
---

## 9. Deployment Workflow

FitTrack Pro follows a cloud-native deployment workflow:

1. AI Studio generates or updates code
2. Changes are pushed to GitHub
3. Vercel automatically builds a preview deployment
4. UI and Stripe Checkout flow are tested
5. Stripe redirects to the stable `SITE_URL`
6. Stripe webhook updates Supabase
7. Changes are merged to production
8. Vercel deploys to the `.app` domain

No local development environment is required.

---

## 10. Summary

FitTrack Pro is deployed using a modern, stable, cloud-native architecture:

- Vercel handles hosting, builds, previews, and production deployment
- Vite + React are configured correctly for root-based hosting
- SPA routing is handled via `vercel.json`
- Stripe Checkout redirects are controlled via a single environment variable
- Stripe webhooks are handled by Supabase Edge Functions
- GitHub Pages workflows are no longer needed
- Local development is optional, not required

This setup is robust, scalable, and well-suited to an AI-assisted development workflow.
