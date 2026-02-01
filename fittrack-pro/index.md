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

## [Database](./fittrack-pro/database/index.md)

## [Payment](./fittrack-pro/payment/index.md)

## [Hosting](./fittrack-pro/hosting/index.md)

## 🤖 Created with Google AI Studio, GitHub, GitHub Pages and Supabase

The coding for this project was entirely done using Google AI Studio.
See the end result at the [GitHub page](https://dedied.github.io/fittrack-pro/).
