/**
 * `%mm:%ss.sss form`
 * @param seconds
 * @returns
 */
export function formatTimeToTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  const milliseconds = Math.round(((Math.round(seconds * 30) % 30) * 100) / 3);  
  const pad = (num: number, digits: number) => String(num).padStart(digits, '0');

  return `${pad(minutes, 2)}:${pad(remainingSeconds, 2)}.${pad(milliseconds, 3)}`;
}
