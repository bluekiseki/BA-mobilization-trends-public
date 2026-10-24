// Reduces a raw User-Agent to "Browser / OS" for the device list. Order matters: Edge, Opera and Chrome all contain "Chrome",
// and iOS/Android UAs contain "Mac OS X"/"Linux".
export function describeUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;

  const browser = /Edg(?:e|A|iOS)?\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /SamsungBrowser\//.test(userAgent)
        ? 'Samsung Internet'
        : /Firefox\/|FxiOS\//.test(userAgent)
          ? 'Firefox'
          : /Chrome\/|CriOS\//.test(userAgent)
            ? 'Chrome'
            : /Safari\//.test(userAgent)
              ? 'Safari'
              : null;

  const os = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(userAgent)
      ? 'iOS'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /CrOS/.test(userAgent)
            ? 'ChromeOS'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : null;

  const parts = [browser, os].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' / ') : null;
}
