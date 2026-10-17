/** Group long numbers in narrative planning text without changing dates or existing separators. */
export function formatPlanningText(text: string): string {
  return text.replace(/(?<![\dA-Za-z_])\d{4,}(?:\.\d+)?(?![\dA-Za-z_])/g, (value, offset: number, source: string) => {
    if (offset > 0 && (source[offset - 1] === "," || source[offset - 1] === ".")) return value;
    const [integer, fraction] = value.split(".");
    const next = source.slice(offset + value.length);
    const isYear = /^\d{4}$/.test(integer) && Number(integer) >= 1900 && Number(integer) <= 2100;
    if (isYear && (next.startsWith("年") || /^[./-]\d{1,2}(?:[./-]|\b)/.test(next))) return value;
    return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction === undefined ? "" : `.${fraction}`}`;
  });
}
