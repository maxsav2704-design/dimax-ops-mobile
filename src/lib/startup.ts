export function isFontBootstrapReady(
  fontsLoaded: boolean,
  fontError: Error | null,
  fontLoadTimedOut: boolean
): boolean {
  return fontsLoaded || fontError !== null || fontLoadTimedOut;
}
