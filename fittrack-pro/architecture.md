# FitTrack Pro - System Architecture Diagram

## User sign up and premium check flow

```mermaid
flowchart TD

A[User enters email for Cloud Sync] --> B[Supabase sends OTP code]
B --> C[User enters code and clicks Verify]

C --> D{Is OTP valid?}
D -->|No| E[Show error: invalid code]
D -->|Yes| F[Check if user exists in DB]

F --> G{User exists?}
G -->|No| H[Create user record in Supabase DB]
G -->|Yes| I[Load user record]

H --> J[Check premium status]
I --> J[Check premium status]

J --> K{Is user premium?}
K -->|Yes| L[Grant access to Cloud Sync]
K -->|No| M[Show Premium Required dialog]

M --> N[User clicks Proceed with Payment]
N --> O[Call Edge Function: create-stripe-checkout]
O --> P[Redirect user to Stripe Checkout]
```

## Stripe Checkout + Webhook Confirmation

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client App
    participant EF as Edge Function<br/>create-stripe-checkout
    participant ST as Stripe Checkout
    participant WH as Stripe Webhook Endpoint
    participant SW as Supabase Edge Function<br/>stripe-webhook
    participant DB as Supabase Database

    %% --- Checkout Session Creation ---
    U->>C: Click "Proceed with Payment"
    C->>EF: POST /create-stripe-checkout<br/>with Authorization: Bearer JWT

    EF->>EF: Create Supabase User Client (anon key + JWT)
    EF->>EF: auth.getUser() → fetch authenticated user
    EF->>DB: Fetch profile (stripe_customer_id)
    DB-->>EF: Return profile

    EF->>EF: Create Admin Supabase Client (service role)

    alt No stripe_customer_id
        EF->>ST: Create Stripe Customer (email)
        ST-->>EF: Return customerId
        EF->>DB: Update profile with stripe_customer_id
    else Existing customer
        EF->>EF: Use existing customerId
    end

    EF->>ST: Create Checkout Session<br/>line_items, success_url, cancel_url
    ST-->>EF: Return session.url

    EF-->>C: Return redirect URL
    C->>U: Redirect user to Stripe Checkout

    %% --- Payment + Webhook ---
    U->>ST: Completes payment

    ST->>WH: Send checkout.session.completed event

    WH->>SW: POST /stripe-webhook<br/>with raw body + signature

    SW->>SW: Verify Stripe signature
    SW->>SW: Parse event

    alt event.type == checkout.session.completed
        SW->>DB: Update profiles<br/>set is_premium = true<br/>where stripe_customer_id = session.customer
    else Other event types
        SW->>SW: Ignore event
    end

    SW-->>WH: 200 {received: true}

```

## Edge Function: create-stripe-checkout

```mermaid
flowchart TD

%% --- Request + CORS ---
A(Incoming Request) --> B{Is method OPTIONS?}
B -->|Yes| C(Return CORS preflight response)
B -->|No| D(Continue)

%% --- User Client Setup ---
D --> E(Create Supabase User Client (anon key + JWT))
E --> F(Get user via auth.getUser())
F --> G{User found?}
G -->|No| H(Throw error: User not found)
G -->|Yes| I(Fetch profile: stripe_customer_id)

%% --- Admin Client Setup ---
I --> J(Create Admin Supabase Client (service role key))

%% --- Stripe Customer Handling ---
J --> K{Has stripe_customer_id?}
K -->|Yes| L(Use existing customerId)
K -->|No| M(Create Stripe customer with user.email)
M --> N(Save new customerId to profiles table)

%% --- Determine Origin ---
L --> O(Determine origin header or SITE_URL)
N --> O

%% --- Create Checkout Session ---
O --> P(Create Stripe Checkout Session: payment_method_types card, line_items price ID, mode payment, success_url and cancel_url)

P --> Q(Return JSON with session.url)

%% --- Error Handling ---
H --> R(Return 500 JSON error)


```

## Edge Function: stripe-webhook

```mermaid
flowchart TD

%% --- Incoming Webhook ---
A["Stripe sends webhook request"] --> B["Extract Stripe-Signature header"]
B --> C["Read raw request body as text"]

%% --- Verify Signature ---
C --> D["Construct Stripe event using signing secret and crypto provider"]
D --> E{"Signature valid?"}
E -->|No| F["Return 400 Webhook Error"]
E -->|Yes| G["Process event"]

%% --- Event Handling ---
G --> H{"event.type == 'checkout.session.completed'?"}
H -->|No| I["Return 200 received: true"]
H -->|Yes| J["Extract session object"]

J --> K["Get customerId from session.customer"]

%% --- Update Database ---
K --> L["Create Admin Supabase Client using service role key"]
L --> M["Update profiles: set is_premium = true where stripe_customer_id matches customerId"]

%% --- Success Response ---
M --> N["Return 200 received: true"]


```










## Data Flow: Sync Strategy (Premium)

```mermaid
sequenceDiagram
    participant App as FitTrack App
    participant LocalDB as Local Storage
    participant Supabase as Supabase<br/>Database
    
    Note over App,Supabase: Offline Operation
    App->>LocalDB: User adds workout
    LocalDB-->>App: Display updated
    
    Note over App,Supabase: When Online & Authenticated
    App->>Supabase: Authenticate User
    Supabase-->>App: Token
    
    App->>Supabase: Download all workouts
    Supabase-->>App: Cloud workouts
    
    App->>LocalDB: Merge: Cloud overwrites local<br/>(Cloud-Wins Strategy)
    
    App->>Supabase: Upload new local entries
    Supabase-->>App: Confirm sync
    
    App->>LocalDB: Mark synced
```

## Payment Flow

```mermaid
graph LR
    A["User Clicks<br/>Upgrade to Premium"] -->|Triggers| B["create-stripe-checkout<br/>Edge Function"]
    B -->|Authenticate| C["Supabase Auth"]
    C -->|Get/Create| D["Stripe Customer ID"]
    D -->|From| E["User Profile"]
    B -->|Create Session| F["Stripe Checkout"]
    F -->|Redirect| G["Payment Page"]
    G -->|Success| H["Update Profile<br/>is_premium = true"]
    H -->|Store| E
    
    style A fill:#4CAF50,color:#fff
    style B fill:#9C27B0,color:#fff
    style C fill:#9C27B0,color:#fff
    style F fill:#FBC02D,color:#000
    style G fill:#FBC02D,color:#000
    style H fill:#2196F3,color:#fff
```

## Security & Authentication

```mermaid
graph TD
    A["🔐 Security Layers"] -->|1. Local| B["PIN Lock<br/>Biometric Auth<br/>FaceID/TouchID"]
    A -->|2. Database| C["Row Level Security<br/>RLS Policies"]
    A -->|3. Cloud| D["Supabase Auth<br/>JWT Tokens"]
    
    B -->|Protects| E["Local Storage Data"]
    C -->|Restricts| F["User can only access<br/>own workouts<br/>own profiles"]
    D -->|Authenticates| G["API Requests<br/>Edge Functions"]
    
    style A fill:#F44336,color:#fff
    style B fill:#FF6D00,color:#fff
    style C fill:#FF6D00,color:#fff
    style D fill:#FF6D00,color:#fff
```

## Deployment Pipeline

```mermaid
graph LR
    A["Developer"] -->|Push Code| B["GitHub Repo"]
    B -->|Webhook| C["Vercel"]
    C -->|Build| D["npm install<br/>npm run build"]
    D -->|Output| E["dist/ folder"]
    E -->|Deploy| F["Vercel CDN"]
    F -->|Serve| G["fittrack-pro.app"]
    G -->|SPA Routing| H["vercel.json<br/>Rewrite Rules"]
    
    style C fill:#FF6D00,color:#fff
    style G fill:#4CAF50,color:#fff
```

---

## Technologies & Services Summary

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Frontend** | React + Vite + Tailwind CSS | PWA interface |
| **Local Storage** | IndexedDB / LocalStorage | Offline-first data |
| **Hosting** | Vercel | Global CDN deployment |
| **Backend** | Supabase (PostgreSQL) | User data & sync |
| **Authentication** | Supabase Auth | User accounts & JWT |
| **Payments** | Stripe + Edge Functions | Premium subscriptions |
| **Testing** | Checkly | Cloud-based monitoring |
| **Version Control** | GitHub | Source code management |
| **Security** | RLS, PIN, Biometric | Data protection |
