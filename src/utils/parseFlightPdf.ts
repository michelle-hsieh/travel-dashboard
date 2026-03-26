export interface ParsedFlight {
  airline: string;
  flightNo: string;
  departureAirport: string;
  departureTime: string;
  arrivalAirport: string;
  arrivalTime: string;
  confirmNo: string;
  amount?: number;
  currency?: string;
}

/** Extract text from first 2 pages of a PDF (lazy-loads pdfjs-dist) */
async function extractText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  const maxPages = Math.min(pdf.numPages, 2);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str).join(' ');
    pages.push(text);
  }

  return pages.join('\n');
}

// ─── Lookups ───
const AIRLINE_NAMES: Record<string, string> = {
  CI: '中華航空', BR: '長榮航空', JX: '星宇航空', IT: '台灣虎航',
  MM: '樂桃航空', JL: '日本航空', NH: '全日空', CX: '國泰航空',
  SQ: '新加坡航空', KE: '大韓航空', OZ: '韓亞航空', TR: '酷航',
  GK: '捷星日本', '7C': '濟州航空', TW: '德威航空', LJ: '真航空',
  B7: '立榮航空', AE: '華信航空',
};

const AIRPORT_CODES: Record<string, string> = {
  TPE: 'TPE 桃園', TSA: 'TSA 松山', KIX: 'KIX 關西', ITM: 'ITM 伊丹',
  NRT: 'NRT 成田', HND: 'HND 羽田', ICN: 'ICN 仁川', KHH: 'KHH 高雄',
  RMQ: 'RMQ 台中', OKA: 'OKA 沖繩', FUK: 'FUK 福岡', CTS: 'CTS 新千歲',
  NGO: 'NGO 名古屋',
};

const AIRPORT_FULLNAMES: [RegExp, string][] = [
  [/TAOYUAN|桃園/i, 'TPE'], [/SONGSHAN|松山/i, 'TSA'],
  [/KANSAI|關西/i, 'KIX'], [/ITAMI|伊丹/i, 'ITM'],
  [/NARITA|成田/i, 'NRT'], [/HANEDA|羽田/i, 'HND'],
  [/INCHEON|仁川/i, 'ICN'], [/KAOHSIUNG|高雄/i, 'KHH'],
  [/FUKUOKA|福岡/i, 'FUK'], [/CHITOSE|千歲/i, 'CTS'],
  [/CHUBU|CENTRAIR|名古屋/i, 'NGO'], [/NAHA|那霸|沖繩/i, 'OKA'],
];

function resolveAirport(raw: string): string {
  const t = raw.trim();
  if (/^[A-Z]{3}$/.test(t)) return AIRPORT_CODES[t] || t;
  for (const [re, code] of AIRPORT_FULLNAMES) {
    if (re.test(t)) return AIRPORT_CODES[code] || code;
  }
  return t;
}

// ─── Month helpers ───
const ZH_MONTHS: Record<string, string> = {
  '一月': '01', '二月': '02', '三月': '03', '四月': '04', '五月': '05', '六月': '06',
  '七月': '07', '八月': '08', '九月': '09', '十月': '10', '十一月': '11', '十二月': '12',
};
const EN_MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

function normalizeDate(raw: string): string {
  let m = raw.match(/(\d{1,2})\s*([A-Z][a-z]{2})\s*(\d{4})/);
  if (m && EN_MONTHS[m[2]]) return `${m[3]}-${EN_MONTHS[m[2]]}-${m[1].padStart(2, '0')}`;
  m = raw.match(/(\d{1,2})\s*([\u4e00-\u9fff]+月)\s*(\d{4})/);
  if (m && ZH_MONTHS[m[2]]) return `${m[3]}-${ZH_MONTHS[m[2]]}-${m[1].padStart(2, '0')}`;
  m = raw.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return raw;
}

// ─── Confirmation number ───
function extractConfirmNo(text: string): string {
  const patterns = [
    /訂位代號\s*[:：/]?\s*([A-Z0-9]{5,8})/i,
    /Booking\s*ref\s*[:：/]?\s*([A-Z0-9]{5,8})/i,
    /(?:Confirmation|PNR)\s*[:：\-]?\s*([A-Z0-9]{5,8})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return '';
}

// ─── Total amount ───
function extractTotalAmount(text: string): { amount?: number; currency?: string } {
  const patterns = [
    /(?:總計金額|總額|Total\s*Amount)\s*[:：/]?\s*([A-Z]{3})\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:總計金額|總額|Total\s*Amount)\s*[:：/]?\s*([\d,]+(?:\.\d{1,2})?)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      if (m[2]) return { amount: parseFloat(m[2].replace(/,/g, '')), currency: m[1] };
      return { amount: parseFloat(m[1].replace(/,/g, '')), currency: 'TWD' };
    }
  }
  return {};
}

// ─── Find all airports mentioned in text (in order) ───
function findAirports(text: string): string[] {
  const matches: { code: string; index: number }[] = [];

  // 3-letter codes next to Chinese chars or known
  for (const m of text.matchAll(/\b([A-Z]{3})\b/g)) {
    if (AIRPORT_CODES[m[1]]) {
      matches.push({ code: m[1], index: m.index! });
    }
  }

  // Full names
  for (const [re, code] of AIRPORT_FULLNAMES) {
    const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (const m of text.matchAll(globalRe)) {
      matches.push({ code, index: m.index! });
    }
  }

  // Sort by appearance order
  matches.sort((a, b) => a.index - b.index);

  const results: string[] = [];
  for (const m of matches) {
    if (!results.includes(m.code)) {
      results.push(m.code);
    }
  }
  return results;
}

// ─── Find all dates in text ───
function findDates(text: string): string[] {
  const results: string[] = [];
  // "13Jun2026" or "13 Jun 2026"
  for (const m of text.matchAll(/(\d{1,2})\s*([A-Z][a-z]{2})\s*(\d{4})/g)) {
    if (EN_MONTHS[m[2]]) results.push(normalizeDate(m[0]));
  }
  // "03 三月 2025"
  for (const m of text.matchAll(/(\d{1,2})\s*([\u4e00-\u9fff]+月)\s*(\d{4})/g)) {
    if (ZH_MONTHS[m[2]]) results.push(normalizeDate(m[0]));
  }
  // "2025/03/03"
  for (const m of text.matchAll(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/g)) {
    results.push(normalizeDate(m[0]));
  }
  return [...new Set(results)];
}

// ─── Find all times (HH:MM) in text ───
function findTimes(text: string): string[] {
  return [...text.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map(m => m[1]);
}


// ═══════════════════════════════════════════════
// Generic fallback
// ═══════════════════════════════════════════════
function parseGeneric(text: string): ParsedFlight[] {
  const confirmNo = extractConfirmNo(text);
  const { amount, currency } = extractTotalAmount(text);

  const SKIP = new Set(['AM', 'PM', 'NO', 'OK', 'RE', 'ID', 'TO', 'AT', 'IN', 'ON', 'BY', 'OR', 'IF', 'DO', 'GO', 'UP', 'SO', 'US', 'AN', 'AS', 'BE', 'IS', 'MY', 'OF', 'WE']);
  const seen = new Set<string>();
  const flightEntries: { code: string; fn: string; pos: number }[] = [];
  for (const m of text.matchAll(/\b([A-Z]{2})\s*(\d{2,4})\b/g)) {
    const code = m[1];
    if (SKIP.has(code) || !AIRLINE_NAMES[code]) continue;
    const fn = `${code}${m[2]}`;
    if (seen.has(fn)) continue;
    seen.add(fn);
    flightEntries.push({ code, fn, pos: m.index! });
  }

  const flights: ParsedFlight[] = [];
  for (let i = 0; i < flightEntries.length; i++) {
    const entry = flightEntries[i];
    
    const start = i === 0 
      ? Math.max(0, entry.pos - 400) 
      : Math.floor((flightEntries[i - 1].pos + entry.pos) / 2);
      
    const end = i === flightEntries.length - 1 
      ? Math.min(text.length, entry.pos + 400) 
      : Math.floor((entry.pos + flightEntries[i + 1].pos) / 2);

    const block = text.substring(start, end);

    const airports = findAirports(block);
    const times = findTimes(block);
    const dates = findDates(block);
    const date = dates[0] || '';

    let depAirport = airports[0] ? resolveAirport(airports[0]) : '';
    let arrAirport = airports[1] ? resolveAirport(airports[1]) : '';
    
    if (!depAirport && !arrAirport && flights.length > 0) {
      depAirport = flights[flights.length - 1].arrivalAirport;
      arrAirport = flights[flights.length - 1].departureAirport;
    }

    flights.push({
      airline: AIRLINE_NAMES[entry.code],
      flightNo: entry.fn,
      departureAirport: depAirport,
      departureTime: date && times[0] ? `${date} ${times[0]}` : date || times[0] || '',
      arrivalAirport: arrAirport,
      arrivalTime: date && times[1] ? `${date} ${times[1]}` : times[1] || '',
      confirmNo,
      amount: flights.length === 0 ? amount : undefined,
      currency: flights.length === 0 ? currency : undefined,
    });
  }

  return flights;
}

// ═══════════════════════════════════════════════
// Main entry
// ═══════════════════════════════════════════════
export async function parseFlightPdf(file: File): Promise<ParsedFlight[]> {
  try {
    const text = await extractText(file);
    console.log('[parseFlightPdf] extracted text:', text.substring(0, 2000));

    return parseGeneric(text);
  } catch (err) {
    console.error('Failed to parse flight PDF:', err);
    return [];
  }
}
