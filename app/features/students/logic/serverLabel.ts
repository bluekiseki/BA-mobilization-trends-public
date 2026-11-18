// Same wording as the calendar: the KR schedule drives both the Korean and the Global server
export function serverLabel(server: 'gl' | 'jp'): 'GL/KR' | 'JP' {
  return server === 'jp' ? 'JP' : 'GL/KR';
}
