const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

function vietnamDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  };
}

export function vietnamTodayDate() {
  const { year, month, day } = vietnamDateParts();
  return new Date(Date.UTC(year, month - 1, day));
}

export function vietnamTodayString() {
  const { year, month, day } = vietnamDateParts();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function dateOnlyString(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function vietnamWeek(offset = 0) {
  const today = vietnamTodayDate();
  const day = today.getUTCDay() || 7;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - day + 1 + offset * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const result = new Date(monday);
    result.setUTCDate(monday.getUTCDate() + index);
    return result;
  });
}
