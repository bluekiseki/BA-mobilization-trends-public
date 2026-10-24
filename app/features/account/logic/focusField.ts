/** Moves focus to an element and scrolls it to the middle of the viewport. */
export function focusField(el: HTMLElement | null) {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
