# Remote Controller for Home TV (Samsung) - Project Rules & Context

## Project Purpose
A secure, modular smart TV remote control system tailored for Samsung Smart TVs (Target device: Samsung TU8500 Series, Model `UE55TU8500UXTK`, Firmware `T-NKLDEUC-2740.1,BT-S`).

## Verified Target Device Information
- **Manufacturer**: Samsung
- **Model Code**: `UE55TU8500UXTK`
- **Firmware**: `T-NKLDEUC-2740.1,BT-S`
- **Tizen Version**: 5.5+
- **Control Interface**: Local Network (LAN) Secure WebSocket (`WSS` on port 8002)
- **Diagnostic Endpoint**: HTTP `http://<TV_IP>:8001/api/v2/`
- **Authorization**: Token-based authentication issued upon user confirmation on TV screen (`ms.channel.connect` event)

## Architectural Layers
1. **Device Management & Discovery**: Local network SSDP/HTTP scanning, multiple TV storage, active TV switching, custom naming.
2. **Command / Intent Layer**: Validates all incoming keys against the strict whitelist before dispatching.
3. **Samsung TV Controller**: Manages WebSocket lifecycle, auto-reconnect, and token storage.
4. **WebSocket Communication Layer**: Transmits framed `ms.remote.control` JSON packets over `wss://<TV_IP>:8002`.
5. **Modular Capability Layer**: Independent interfaces (e.g., `IAppLauncher` for YouTube) keeping core remote control decoupled.
6. **Future Voice & AI Layer**: Audio speech-to-text and AI intent mapping (to be integrated strictly through the whitelist validator in later phases).

## Security & Architectural Rules
1. **Never expose credentials or device serial numbers** in source code, logs, or UI displays.
2. **Strict Command Whitelist**: AI and UI must NEVER send arbitrary keycodes. Only approved `ValidRemoteKey` values pass through.
3. **LAN-first**: Direct communication with the TV over local Wi-Fi. No unnecessary backend dependencies.
4. **Token Security**: Tokens are masked (`••••••••3471`) in all logs and UI views.
5. **Modular Separation**: Keep remote control, app launcher, and device management decoupled.
6. **Real-Device Verification**: Always verify against real Samsung TV endpoints.
