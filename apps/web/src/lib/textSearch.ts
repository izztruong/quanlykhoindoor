/** Bỏ dấu để gõ "phieu nhap" vẫn ra "Phiếu nhập kho". "đ" không tách dấu được nên đổi tay. */
export function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d");
}

/** Mọi từ gõ vào (đã bỏ dấu) đều phải nằm trong `haystack` — thứ tự từ không quan trọng. */
export function matchesAllTerms(haystack: string, query: string) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  return terms.every((term) => haystack.includes(term));
}
