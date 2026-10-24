/**
 * Device detection utilities
 */

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  const mobilePatterns = [/android/, /webos/, /iphone/, /ipad/, /ipod/, /blackberry/, /windows phone/];

  return mobilePatterns.some((pattern) => pattern.test(userAgent));
}

export function isTablet(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  return /tablet|ipad|playbook|silk/.test(userAgent) || (window.innerWidth >= 768 && /android|iphone/.test(userAgent));
}

export function shouldAutoLoadModels(): boolean {
  // Auto-load on desktop, require manual action on mobile
  return !isMobileDevice();
}
