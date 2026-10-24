export const getKSTResetTimestamps = (startTime: number, endTime: number) => {
  const resets: number[] = [];
  const oneHour = 60 * 60 * 1000;
  let current = new Date(startTime);
  while (current.getTime() <= endTime) {
    const kstHour = (current.getUTCHours() + 9) % 24;
    if (kstHour === 4) {
      current.setUTCMinutes(0, 0, 0);
      resets.push(current.getTime());
      current = new Date(current.getTime() + 23 * oneHour);
    }
    current = new Date(current.getTime() + oneHour);
  }
  return resets;
};
