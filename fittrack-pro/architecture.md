# FitTrack Pro - System Architecture Diagram

## Setup & Infrastructure Overview

```mermaid
graph TD
    A["📱 FitTrack Pro App<br/>React + Vite + Tailwind CSS"] -->|Reads/Writes| B["💾 Local Storage<br/>Offline-First PWA"]
    
    A -->|When Online| C["☁️ Vercel<br/>Hosting & Deployment"]
    C -->|Serves| A
    
    D["🔐 GitHub<br/>Version Control"] -->|Push to| C
    D -->|Triggers| E["⚙️ Vercel Build<br/>npm run build → dist/"]
    E -->|Deploys| C
    
    A -->|Auth & Sync| F["🔑 Supabase<br/>Backend & Database"]
    F -->|Profiles Table| G["👤 User Profiles<br/>Premium Status<br/>Stripe Customer ID"]
    F -->|Workouts Table| H["🏋️ Workout Logs<br/>Cloud Storage"]
    
    H -->|Cloud-Wins<br/>Conflict Resolution| B
    B -->|Syncs with| H
    
    A -->|Payment Intent| I["💳 Stripe<br/>Premium Payments"]
    I -->|Updates| G
    
    F -->|Edge Functions| J["⚡ Supabase Edge Functions<br/>create-stripe-checkout<br/>stripe-webhook"]
    J -->|Communicates with| I
    
    A -->|Testing| K["🧪 Checkly<br/>Cloud Tests"]
    K -->|Monitors| C
    
    L["🌐 Domain<br/>.app"]
    L -->|Points to| C
    
    M["🔒 Security<br/>RLS Policies<br/>PIN Lock<br/>Biometric Auth"] -->|Protects| B
    M -->|Protects| F
    
    style A fill:#4CAF50,color:#fff
    style B fill:#2196F3,color:#fff
    style C fill:#FF6D00,color:#fff
    style F fill:#9C27B0,color:#fff
    style G fill:#9C27B0,color:#fff
    style H fill:#9C27B0,color:#fff
    style I fill:#FBC02D,color:#000
    style J fill:#9C27B0,color:#fff
    style K fill:#00BCD4,color:#fff
    style M fill:#F44336,color:#fff
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
