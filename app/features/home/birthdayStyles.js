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
export function loadBirthdayPortraits(url, sheetUrl) {
  const sheet = /** @type {HTMLStyleElement | null} */ (document.getElementById('birthday-portraits'))?.sheet;
  if (!sheet || sheet.cssRules.length) return;
  // Reserve the sheet so hydration does not start a second request.
  sheet.insertRule(':root{}', 0);
  void fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error('Birthday portraits unavailable');
      return /** @type {Promise<{ cell: number[], columns: number, size: number[], items: Record<string, number[]> }>} */ (response.json());
    })
    .then(({ cell, columns, size, items }) => {
      if (!/^[^"\\\s)]+$/.test(sheetUrl)) throw new Error('Invalid sprite sheet url');
      const rows = size[1] / cell[1];
      // Sprite sheet: percent background-position is relative to (sheet - element), so any element size works.
      for (const [id, [x, y]] of Object.entries(items)) {
        if (!/^\d+$/.test(id)) continue;
        const px = size[0] === cell[0] ? 0 : (x / (size[0] - cell[0])) * 100;
        const py = size[1] === cell[1] ? 0 : (y / (size[1] - cell[1])) * 100;
        sheet.insertRule(
          `[data-birthday-portrait="${id}"]{background-image:url("${sheetUrl}");background-repeat:no-repeat;background-size:${columns * 100}% ${rows * 100}%;background-position:${px}% ${py}%}`,
          sheet.cssRules.length,
        );
      }
    })
    .catch(() => {
      while (sheet.cssRules.length) sheet.deleteRule(0);
    });
}
