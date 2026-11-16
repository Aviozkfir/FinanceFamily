// True inside the Android app (Capacitor), where there is no local server:
// data lives on the device.
export const isNative = (): boolean =>
  Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
