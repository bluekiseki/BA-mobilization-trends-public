/**
 * A single hour segment (e.g., 305.) to element numbers.
 * @param timeStr String in the format "mm:ss" or "mm:ss.xxx"
 * @returns Total converted time in seconds or incorrect format null
 */
function parseTimeSegmentToSeconds(timeStr: string): number | null {
  // Regular expression: (minutes): (seconds). (milliseconds - optional)
  // Examples: "10:30", "01:05.123", "90:00"
  const match = timeStr.match(/^(\d+):(\d{2})(?:\.(\d+))?$/);

  if (!match) {
    return null;
  }

  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);

  // Subdecimal seconds (e.g. "0.123" -> 0.123)
  const fractions = match[3] ? parseFloat('0.' + match[3]) : 0;

  // Validation: seconds must be between 0-59
  if (seconds >= 60 || isNaN(minutes) || isNaN(seconds)) {
    return null;
  }

  return minutes * 60 + seconds + fractions;
}

/**
 * Parses and calculate the time calculation formula (for example, "10:30 + 01:15.5 - 00:05").
 * @param expression A time-calculated string containing spaces, +, - symbols
 * @returns Calculated total time in seconds or null if expression is not valid
 */
export function calculateTimeExpression(expression: string): number | null {
  // 1. Separate expressions by operator (+ or -).
  //    "10:30 + 01:15" -> ["10:30 ", "+", " 01:15"]
  const parts = expression.split(/([+-])/);

  // 2. Remove spaces on each part and filter empty strings.
  //    ["10:30 ", "+", " 01:15"] -> ["10:30", "+", "01:15"]
  const tokens = parts.map((p) => p.trim()).filter((p) => p.length > 0);

  if (tokens.length === 0) {
    return null;
  }
  // 3. The first token must be time.
  const firstValue = parseTimeSegmentToSeconds(tokens[0]);
  if (firstValue === null) {
    return null;
  }

  let totalSeconds = firstValue;
  // 4. Calculate by traversing the remaining [operator, time] pairs.
  for (let i = 1; i < tokens.length; i += 2) {
    const operator = tokens[i];
    const timeString = tokens[i + 1];
    // Make sure the [operator, time] pair is correct (for example, if it ends at 10:30 +)
    if (!timeString || (operator !== '+' && operator !== '-')) {
      return null;
    }

    const value = parseTimeSegmentToSeconds(timeString);
    if (value === null) {
      return null;
    }

    //Calculation
    if (operator === '+') {
      totalSeconds += value;
    } else {
      totalSeconds -= value;
    }
  }

  return totalSeconds;
}
