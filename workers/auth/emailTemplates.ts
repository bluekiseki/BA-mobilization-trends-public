import enJson from '~/locales/en/auth.json';
import koJson from '~/locales/ko/auth.json';
import jaJson from '~/locales/ja/auth.json';
import zhHantJson from '~/locales/zh_Hant/auth.json';

const localeMap = {
  en: enJson,
  ko: koJson,
  ja: jaJson,
  'zh-Hant': zhHantJson,
} as const;

type Locale = keyof typeof localeMap;

interface EmailStrings {
  subject: string;
  heading: string;
  body: string;
  button: string;
  urlFallback: string;
  ignore: string;
  spam: string;
}

function buildEmailHtml(locale: string, url: string, s: EmailStrings): string {
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${s.subject}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 24px;">
    <tr>
      <td>
        <table width="100%" style="max-width:480px;" cellpadding="0" cellspacing="0">

          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0 0 6px;font-size:12px;color:#a3a3a3;">Yuzu Trends</p>
              <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#171717;">${s.heading}</p>
              <p style="margin:0 0 20px;font-size:14px;color:#525252;line-height:1.6;">${s.body}</p>

              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#77e0ff;">
                    <a href="${url}" style="display:inline-block;padding:10px 24px;font-size:14px;font-weight:700;color:#171717;text-decoration:none;">
                      ${s.button}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:16px 0 0;font-size:11px;color:#a3a3a3;">
                ${s.urlFallback}<br/>
                <a href="${url}" style="color:#525252;word-break:break-all;text-decoration:none;">${url}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid #e5e5e5;padding-top:16px;">
              <p style="margin:0;font-size:11px;color:#a3a3a3;">${s.ignore} ${s.spam} — <a href="https://yuzutrends.app" style="color:#a3a3a3;text-decoration:none;">Yuzu Trends</a></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function getMagicLinkEmail(url: string, locale?: string): { subject: string; html: string } {
  const resolvedLocale = locale && locale in localeMap ? (locale as Locale) : 'en';
  const t = localeMap[resolvedLocale];
  const s: EmailStrings = { ...t.magicLink };
  return { subject: s.subject, html: buildEmailHtml(resolvedLocale, url, s) };
}

export function getVerifyEmailTemplate(url: string, locale?: string): { subject: string; html: string } {
  const resolvedLocale = locale && locale in localeMap ? (locale as Locale) : 'en';
  const t = localeMap[resolvedLocale];
  const s: EmailStrings = {
    ...t.emailVerification,
    urlFallback: t.magicLink.urlFallback,
    ignore: t.magicLink.ignore,
    spam: t.magicLink.spam,
  };
  return { subject: s.subject, html: buildEmailHtml(resolvedLocale, url, s) };
}
