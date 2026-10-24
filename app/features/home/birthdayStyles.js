// These functions also run as inline scripts before hydration. Keep them self-contained.
export function updateBirthdayDates() {
  const sheet = /** @type {HTMLStyleElement | null} */ (document.getElementById('birthday-dates'))?.sheet;
  if (!sheet) return;
  while (sheet.cssRules.length) sheet.deleteRule(0);
  sheet.insertRule('[data-birthday-widget]{display:none}', 0);
  const now = new Date();
  for (let offset = -1; offset <= 6; offset++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const selector = `[data-birthday="${date.getMonth() + 1}/${date.getDate()}"]`;
    sheet.insertRule(`${selector}{display:flex;order:${offset + 1}}`, sheet.cssRules.length);
    sheet.insertRule(`[data-birthday-widget]:has(${selector}){display:block}`, sheet.cssRules.length);
    if (offset <= 1) {
      sheet.insertRule(`${selector} [data-day-label]{display:none}`, sheet.cssRules.length);
      sheet.insertRule(`${selector} [data-day-label="${offset}"]{display:inline}`, sheet.cssRules.length);
    }
    if (offset === 0) {
      sheet.insertRule(`${selector} [data-birthday-portrait]{border-color:#fbbf24}`, sheet.cssRules.length);
      sheet.insertRule(`${selector} [data-day-label]{font-weight:800}`, sheet.cssRules.length);
    }
  }
}

/** @param {string} url */
export function loadBirthdayPortraits(url) {
  const sheet = /** @type {HTMLStyleElement | null} */ (document.getElementById('birthday-portraits'))?.sheet;
  if (!sheet || sheet.cssRules.length) return;
  // Reserve the sheet so hydration does not start a second request.
  sheet.insertRule(':root{}', 0);
  void fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error('Birthday portraits unavailable');
      return /** @type {Promise<Record<string, string>>} */ (response.json());
    })
    .then((portraits) => {
      for (const [id, portrait] of Object.entries(portraits)) {
        if (!/^\d+$/.test(id) || !/^[A-Za-z0-9+/=]+$/.test(portrait)) continue;
        sheet.insertRule(`[data-birthday-portrait="${id}"]{background-image:url("data:image/webp;base64,${portrait}")}`, sheet.cssRules.length);
      }
    })
    .catch(() => {
      while (sheet.cssRules.length) sheet.deleteRule(0);
    });
}
