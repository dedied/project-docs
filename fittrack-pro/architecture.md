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
    participant WH as Stripe Webhook
    participant SW as Supabase Edge Function<br/>stripe-webhook
    participant DB as Supabase Database

    U->>C: Click "Proceed with Payment"
    C->>EF: POST /create-stripe-checkout
    EF->>ST: Create Checkout Session
    ST-->>EF: Session URL
    EF-->>C: Return redirect URL
    C->>U: Redirect to Stripe Checkout

    U->>ST: Completes payment
    ST->>WH: Sends payment_intent.succeeded event
    WH->>SW: POST /stripe-webhook

    SW->>DB: Update user premium=true
    SW-->>WH: 200 OK
```

## Edge Function: create-stripe-checkout

```mermaid
flowchart TD

A[Client calls create-stripe-checkout] --> B[Validate user auth]
B --> C{User authenticated?}
C -->|No| D[Return 401 Unauthorized]
C -->|Yes| E[Create Stripe Checkout Session]

E --> F[Attach user ID as metadata]
F --> G[Return session.url to client]
```

## Edge Function: stripe-webhook

```mermaid
flowchart TD

A[Stripe sends webhook event] --> B[Verify Stripe signature]
B --> C{Signature valid?}
C -->|No| D[Return 400 Invalid Signature]
C -->|Yes| E[Parse event type]

E --> F{event.type == payment_intent.succeeded?}
F -->|No| G[Ignore or log event]
F -->|Yes| H[Extract user ID from metadata]

H --> I[Update Supabase DB: premium=true]
I --> J[Return 200 OK]
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
