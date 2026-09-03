# Remote Controller for Home TV (Samsung) - React Native / Expo

This directory contains the **React Native / Expo** mobile application for controlling your Samsung Smart TV (`UE55TU8500UXTK`) over the local network (LAN) via Secure WebSocket (`wss://<TV_IP>:8002`).

## Architecture & Security
- **LAN-Only Direct Communication:** Communicates directly with the TV over your local Wi-Fi router.
- **Strict Command Whitelist:** Every key press is validated before being transmitted to prevent unauthorized arbitrary commands.
- **Token Protection:** Authorization tokens returned by the TV are stored locally via `AsyncStorage` and masked (`••••••••3471`) in all UI displays. Device serial numbers are never exposed.

## How to Run on Real Phone (iOS / Android)

### 1. Prerequisites
- Node.js 18+ installed on your computer.
- [Expo Go](https://expo.dev/go) app installed on your physical smartphone from Google Play Store or Apple App Store.
- **Crucial:** Your smartphone and your Samsung Smart TV must be connected to the **same Wi-Fi network**.

### 2. Setup
In this directory (`/mobile`):
```bash
npm install
```

### 3. Start Expo Development Server
```bash
npx expo start
```

### 4. Connect & Pair
1. Scan the displayed QR code with your iPhone camera or the Expo Go app on Android.
2. Open **TV Connection Settings** (gear icon in the top right).
3. Enter your TV's local IP address (e.g. `192.168.1.50`).
   - Find it on TV: **Settings → General → Network → Network Status → IP Settings**.
4. Tap **Connect / Pair TV**.
5. When connecting for the first time, look at your Samsung TV screen: a popup will ask to allow the mobile device. Click **"Allow"** with your physical remote.
6. The TV will issue a token, and the status dot will turn **Green (Connected)**.
7. You can now use the D-Pad, Volume, Channel, Home, Back, and Power buttons directly!
