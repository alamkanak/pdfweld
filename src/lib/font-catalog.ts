import catalog from "./google-fonts.json" with { type: "json" };

export const DEFAULT_FONT = "helvetica";
export const googleFonts = catalog.fonts;
export type CatalogFont = (typeof googleFonts)[number];
export const findFont = (id: string) =>
  googleFonts.find((font) => font.id === id);
// A stable CSS alias is shared by browser FontFace and MuPDF's font loader.
export const fontAlias = (id: string) => `PDFWeldFont${id}`;
export const fontURL = (id: string) => {
  const font = findFont(id);
  if (!font) throw new Error("This font is not available in the font picker.");
  return `${import.meta.env.BASE_URL}fonts/google/${font.file}`;
};
export const fontFamilyCSS = (id = DEFAULT_FONT) =>
  `${id === DEFAULT_FONT ? "'PDFWeld Helvetica', Arial" : `'${fontAlias(id)}'`}, 'Noto Sans Bengali', sans-serif`;

// Language names remain searchable even when the catalog groups them by script.
export const fontLanguages: { id: string; label: string; search: string }[] = [
  {
    id: "latin",
    label: "English / Latin",
    search:
      "english french spanish german italian portuguese dutch swahili indonesian bahasa",
  },
  {
    id: "latin-ext",
    label: "Extended Latin",
    search: "polish turkish czech romanian hungarian",
  },
  {
    id: "arabic",
    label: "Arabic / العربية",
    search: "arabic persian farsi urdu العربية فارسی اردو",
  },
  { id: "armenian", label: "Armenian / Հայերեն", search: "armenian հայերեն" },
  {
    id: "bengali",
    label: "Bengali / বাংলা",
    search: "bengali bangla assamese বাংলা অসমীয়া",
  },
  {
    id: "chinese-simplified",
    label: "Chinese, Simplified / 简体中文",
    search: "chinese simplified mandarin 简体中文",
  },
  {
    id: "chinese-traditional",
    label: "Chinese, Traditional / 繁體中文",
    search: "chinese traditional mandarin 繁體中文",
  },
  {
    id: "cyrillic",
    label: "Cyrillic",
    search: "russian ukrainian bulgarian serbian русский українська",
  },
  {
    id: "devanagari",
    label: "Hindi / हिन्दी",
    search: "hindi marathi nepali sanskrit devanagari हिन्दी मराठी नेपाली",
  },
  {
    id: "ethiopic",
    label: "Amharic / አማርኛ",
    search: "amharic ethiopic tigrinya አማርኛ",
  },
  { id: "georgian", label: "Georgian / ქართული", search: "georgian ქართული" },
  { id: "greek", label: "Greek / Ελληνικά", search: "greek ελληνικά" },
  { id: "gujarati", label: "Gujarati / ગુજરાતી", search: "gujarati ગુજરાતી" },
  {
    id: "gurmukhi",
    label: "Punjabi / ਪੰਜਾਬੀ",
    search: "punjabi gurmukhi ਪੰਜਾਬੀ",
  },
  { id: "hebrew", label: "Hebrew / עברית", search: "hebrew עברית" },
  { id: "japanese", label: "Japanese / 日本語", search: "japanese 日本語" },
  { id: "kannada", label: "Kannada / ಕನ್ನಡ", search: "kannada ಕನ್ನಡ" },
  { id: "khmer", label: "Khmer / ខ្មែរ", search: "khmer cambodian ខ្មែរ" },
  { id: "korean", label: "Korean / 한국어", search: "korean 한국어" },
  { id: "lao", label: "Lao / ລາວ", search: "lao laotian ລາວ" },
  { id: "malayalam", label: "Malayalam / മലയാളം", search: "malayalam മലയാളം" },
  {
    id: "myanmar",
    label: "Burmese / မြန်မာ",
    search: "burmese myanmar မြန်မာ",
  },
  {
    id: "sinhala",
    label: "Sinhala / සිංහල",
    search: "sinhala sinhalese සිංහල",
  },
  { id: "tamil", label: "Tamil / தமிழ்", search: "tamil தமிழ்" },
  { id: "telugu", label: "Telugu / తెలుగు", search: "telugu తెలుగు" },
  { id: "thai", label: "Thai / ไทย", search: "thai ไทย" },
  {
    id: "vietnamese",
    label: "Vietnamese / Tiếng Việt",
    search: "vietnamese tiếng việt",
  },
];

const specimens: Record<string, { script: RegExp; text: string }> = {
  latin: { script: /\p{Script=Latin}/u, text: "The quick brown fox" },
  "latin-ext": { script: /[\u0100-\u024f]/u, text: "Zażółć gęślą jaźń" },
  arabic: { script: /\p{Script=Arabic}/u, text: "مرحبا بالعالم" },
  armenian: { script: /\p{Script=Armenian}/u, text: "Հայերեն տառատեսակ" },
  bengali: { script: /\p{Script=Bengali}/u, text: "বাংলা ভাষায় লিখুন" },
  "chinese-simplified": {
    script: /\p{Script=Han}/u,
    text: "用中文书写美好时光",
  },
  "chinese-traditional": {
    script: /\p{Script=Han}/u,
    text: "用中文書寫美好時光",
  },
  cyrillic: {
    script: /\p{Script=Cyrillic}/u,
    text: "Съешь ещё этих мягких булок",
  },
  devanagari: { script: /\p{Script=Devanagari}/u, text: "हिन्दी में लिखें" },
  ethiopic: { script: /\p{Script=Ethiopic}/u, text: "በአማርኛ ይጻፉ" },
  georgian: { script: /\p{Script=Georgian}/u, text: "დაწერეთ ქართულად" },
  greek: { script: /\p{Script=Greek}/u, text: "Γράψτε στα ελληνικά" },
  gujarati: { script: /\p{Script=Gujarati}/u, text: "ગુજરાતીમાં લખો" },
  gurmukhi: { script: /\p{Script=Gurmukhi}/u, text: "ਪੰਜਾਬੀ ਵਿੱਚ ਲਿਖੋ" },
  hebrew: { script: /\p{Script=Hebrew}/u, text: "שלום עולם" },
  japanese: {
    script: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
    text: "日本語で美しい文字を",
  },
  kannada: { script: /\p{Script=Kannada}/u, text: "ಕನ್ನಡದಲ್ಲಿ ಬರೆಯಿರಿ" },
  khmer: { script: /\p{Script=Khmer}/u, text: "សរសេរជាភាសាខ្មែរ" },
  korean: { script: /\p{Script=Hangul}/u, text: "한글로 아름다운 글쓰기" },
  lao: { script: /\p{Script=Lao}/u, text: "ຂຽນເປັນພາສາລາວ" },
  malayalam: { script: /\p{Script=Malayalam}/u, text: "മലയാളത്തിൽ എഴുതുക" },
  myanmar: { script: /\p{Script=Myanmar}/u, text: "မြန်မာဘာသာဖြင့် ရေးပါ" },
  sinhala: { script: /\p{Script=Sinhala}/u, text: "සිංහලෙන් ලියන්න" },
  tamil: { script: /\p{Script=Tamil}/u, text: "தமிழில் எழுதுங்கள்" },
  telugu: { script: /\p{Script=Telugu}/u, text: "తెలుగులో రాయండి" },
  thai: { script: /\p{Script=Thai}/u, text: "เขียนข้อความภาษาไทย" },
  vietnamese: {
    script: /[\u0102\u0103\u0110\u0111\u01a0-\u01b0\u1ea0-\u1eff]/u,
    text: "Viết bằng tiếng Việt",
  },
};

/** Keep document text when it matches the preview's script; otherwise show a
 * specimen in that script, without changing the document's actual contents. */
export function fontPreviewText(id: string, text: string, language = "") {
  const current = Array.from(text.trim()).slice(0, 100).join("");
  if (!language && id === DEFAULT_FONT) return current || specimens.latin.text;
  const cjk: Record<string, string> = {
    notosanssc: "chinese-simplified",
    notosanstc: "chinese-traditional",
    notosansjp: "japanese",
    notosanskr: "korean",
  };
  const script =
    language ||
    cjk[id] ||
    Object.keys(specimens).find((key) => id.includes(key)) ||
    "latin";
  const specimen = specimens[script] || specimens.latin;
  return current && specimen.script.test(current) ? current : specimen.text;
}

export function matchesFont(
  font: CatalogFont,
  query: string,
  language: string,
) {
  if (language && !font.subsets.includes(language)) return false;
  const names = fontLanguages
    .filter((entry) => font.subsets.includes(entry.id))
    .map((entry) => `${entry.label} ${entry.search}`)
    .join(" ");
  const haystack =
    `${font.family} ${font.category} ${names}`.toLocaleLowerCase();
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}
