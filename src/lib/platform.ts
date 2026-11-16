// True inside the Android app (Capacitor), where there is no local server:
// data lives on the device and the assistant talks to the Anthropic API directly.
export const isNative = (): boolean =>
  Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

export const API_KEY_STORAGE = 'finance-api-key';
