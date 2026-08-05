const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

function readThreeDigits(value: number, full = false) {
  const hundred = Math.floor(value / 100);
  const ten = Math.floor((value % 100) / 10);
  const unit = value % 10;
  const words: string[] = [];
  if (hundred > 0 || full) {
    words.push(`${DIGITS[hundred]} trăm`);
    if (ten === 0 && unit > 0) words.push("lẻ");
  }
  if (ten > 1) words.push(`${DIGITS[ten]} mươi`);
  else if (ten === 1) words.push("mười");
  if (unit > 0) {
    if (unit === 1 && ten > 1) words.push("mốt");
    else if (unit === 5 && ten > 0) words.push("lăm");
    else words.push(DIGITS[unit]);
  }
  return words.join(" ");
}

export function moneyToVietnameseWords(input: number) {
  const value = Math.max(0, Math.round(Number(input || 0)));
  if (value === 0) return "Không đồng";
  const units = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  const groups: number[] = [];
  let remaining = value;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }
  const parts: string[] = [];
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index];
    if (!group) continue;
    const full = index < groups.length - 1 && group < 100;
    parts.push(readThreeDigits(group, full));
    if (units[index]) parts.push(units[index]);
  }
  const sentence = parts.join(" ").replace(/\s+/g, " ").trim();
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} đồng`;
}
