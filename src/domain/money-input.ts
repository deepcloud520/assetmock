const wholeFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });

export function minorToYuan(value: string | undefined): string {
  const minor = BigInt(value || "0");
  const absolute = minor < 0n ? -minor : minor;
  const fraction = (absolute % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return `${minor < 0n ? "-" : ""}${wholeFormatter.format(absolute / 100n)}${fraction ? `.${fraction}` : ""}`;
}

export function yuanToMinor(value: unknown): string {
  const normalized = String(value ?? "0").trim().replace(/,/g, "") || "0";
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) throw new Error("金额最多保留两位小数");
  const [whole, decimal = ""] = normalized.split(".");
  return (BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"))).toString();
}

export function formatMoneyInput(value: string): string {
  const raw = value.trim().replace(/,/g, "");
  if (!raw) return "";
  return /^\d+(\.\d{0,2})?$/.test(raw) ? minorToYuan(yuanToMinor(raw)) : value;
}
