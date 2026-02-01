# FitTrack Pro

FitTrack Pro is an offline-first Progressive Web App (PWA) designed to help you monitor your progress across an unlimited number of exercises.

Built using Google AI Studio with React, Vite, and Tailwind CSS, it offers a seamless native-like experience on mobile devices.

## Features

- **📊 Interactive Charts:** Visualize your progress over daily, weekly, monthly, and yearly timeframes.
- **🤸 Unlimited Exercises:** Track as many different workouts as you want, for free.
- **🔒 Privacy First & Secure:** Works completely offline. Includes a built-in PIN lock and Biometric authentication (FaceID/TouchID) to protect your data.
- **☁️ Premium Cloud Sync:** **(Premium)** Sync your data across devices.
- **📱 PWA Support:** Installable on iOS and Android.
- **💾 Data Control:** **(Premium)** Export and import your workout logs via CSV.
- **🔮 Prediction Tool:** Predicative 1 Rep Max & future growth tool

## 🔄 Sync Strategy

FitTrack Pro uses an **Offline-First** approach with a "Cloud-Wins" conflict resolution strategy to ensure data integrity across devices for premium users.

1.  **Local Storage:** The app always reads from and writes to the device's local storage for instant performance.
2.  **Cloud Synchronization:** When online and authenticated as a premium user, the app performs a sync:
    - **Downloads** all logs from the database.
    - **Uploads** any local logs that don't exist in the cloud (new entries).
    - **Claims Ownership:** Any logs created while in "Guest Mode" are automatically assigned to the user upon login and sync.
3.  **Conflict Resolution:**
    - If a specific log ID exists in both Local Storage and the Cloud, **the Cloud version is treated as the source of truth** and overwrites the local version.
    - This prevents stale local data on one device from overwriting edits made on another device.
    - There is one specific exception to "Cloud-Wins" to prevent data loss when a user first signs up or syncs a device with existing data against an empty cloud account. In this scenario the user is asked whether which way they want to sync.

## Dependancies
- [Database](./database/index.md)
- [Hosting](./hosting/index.md)
- [Payment](./payment/index.md)
- [Testing](./testing/index.md)

## Useful links
- [Fittrack Pro](https://fittrack-pro.app/)
- [Github](https://github.com/)
- [Google AI Studio](https://aistudio.google.com/)
- [Stripe](https://dashboard.stripe.com/)
- [Supabase](https://supabase.com/)
- [Vercel](https://vercel.com/)
