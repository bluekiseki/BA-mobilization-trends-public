import type { EditHistory } from './history';

// Capture interactions before React updates stores, including non-native sliders.
export function watchHistoryInteractions(history: EditHistory, document: Document) {
  const window = document.defaultView;
  if (!window) return () => undefined;
  let target: Element | null = null;
  let pointerId: number | null = null;
  const element = (event: Event) => (event.target instanceof window.Element ? event.target : null);
  const slider = (node: Element | null) => node?.closest('.rc-slider, [role="slider"], input[type="range"]') ?? null;
  const editor = (node: Element | null) =>
    node?.closest(
      'textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]), [contenteditable="true"], button[data-history-repeat]',
    ) ?? null;
  const end = () => {
    history.endGroup();
    target = null;
    pointerId = null;
  };
  const begin = (node: Element) => {
    target = node;
    history.input(node);
  };
  const onPointerDown = (event: PointerEvent) => {
    const node = element(event);
    const control = slider(node);
    if (control) {
      end();
      begin(control);
      pointerId = event.pointerId;
    } else {
      const input = editor(node);
      if (input) begin(input);
      else end();
    }
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (pointerId === event.pointerId) end();
  };
  const onInput = (event: Event) => {
    const node = element(event);
    const control = slider(node) ?? editor(node);
    if (control) begin(control);
    else end();
  };
  const onBlur = (event: FocusEvent) => {
    const node = element(event);
    if (pointerId === null && target === (slider(node) ?? editor(node))) end();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.isComposing) {
      end();
      return;
    }
    // Custom number editors update directly on keydown without a native input event.
    const node = element(event);
    const control = slider(node) ?? editor(node);
    if (control && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) begin(control);
  };
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('change', onInput, true);
  document.addEventListener('blur', onBlur, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerEnd);
  window.addEventListener('blur', end);
  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('change', onInput, true);
    document.removeEventListener('blur', onBlur, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerup', onPointerEnd);
    window.removeEventListener('pointercancel', onPointerEnd);
    window.removeEventListener('blur', end);
    end();
  };
}
