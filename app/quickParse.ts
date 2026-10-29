/**
 * 자유 형식 텍스트 → 견적서 항목/사업자 정보 자동 인식
 *
 * 지원하는 줄 형식 (공백·콜론·쉼표·원 표기는 있어도 없어도 됨)
 *   하도:1말67000×3=201000     → 품명 하도, 규격 1말, 단가 67,000, 수량 3
 *   신나:62000                 → 품명 신나, 단가 62,000, 수량 1
 *   조공1일200000×3=600000     → 품명 조공, 규격 1일, 단가 200,000, 수량 3
 *   기공 3일 × 350,000원       → 수량이 앞에 와도 됨 (큰 쪽을 단가로 봄)
 *   하도:67000=201000          → 합계만 있으면 수량을 역산 (3)
 *   공급자: 일광페인팅 / 사업자번호: 123-45-67890 / 받는분: 홍길동 / 주소: … / 업태: … / 종목: …
 *   홍길동 귀하                → 받는분
 *   TOTAL: 2752100 / 합계      → 무시 (계산 합계와 다르면 안내)
 *   그 외 줄 (예: 15평기준)    → 비고로 이동
 */

export interface ParsedItem {
  name: string;
  spec: string;
  count: number;
  price: number;
}

export interface ParsedInfo {
  provider?: string;
  bizNumber?: string;
  address?: string;
  category?: string;
  sector?: string;
  customer?: string;
  date?: string;
  remark?: string;
}

export interface ParsedQuote {
  items: ParsedItem[];
  info: ParsedInfo;
  notes: string[];        // 항목으로 못 읽은 줄 (비고로 넣음)
  statedTotal?: number;   // 글에 적힌 TOTAL/합계
}

const INFO_KEYS: [RegExp, keyof ParsedInfo][] = [
  [/^(공급자|상호명?|사업자명|회사명?|업체명?)$/, 'provider'],
  [/^(사업자\s*(?:등록)?\s*번호|등록번호)$/, 'bizNumber'],
  [/^(주소|소재지)$/, 'address'],
  [/^업태$/, 'category'],
  [/^종목$/, 'sector'],
  [/^(받는\s*분|받는\s*사람|고객명?|수신|거래처|현장명?|귀하)$/, 'customer'],
  [/^(일자|날짜|견적일)$/, 'date'],
  [/^(비고|특약\s*사항?|참고)$/, 'remark'],
];

const TOTAL_RE = /^(total|합\s*계|총\s*계|총\s*액|총\s*합|총\s*금액|계)\s*[:：]?\s*[\d,]+\s*원?\s*$/i;

// 품명 (:) [규격] 단가 [× 수량[단위]] [= 금액]   → [1]품명 [2]규격 [3]단가 [4]수량 [5]금액
const ITEM_RE =
  /^([^×=]+?)\s*[:：]?\s*(\d+(?:\.\d+)?[가-힣a-zA-Z]{1,4})?\s*(\d{1,3}(?:,\d{3})+|\d+)\s*원?\s*(?:×\s*(\d+(?:\.\d+)?)\s*[가-힣a-zA-Z]{0,3})?\s*(?:=\s*([\d,]+)\s*원?)?\s*$/;
// 품명 (:) 수량[단위] × 단가 [= 금액]            → [1]품명 [2]수량 [3]단위 [4]단가 [5]금액
const ITEM_RE2 =
  /^([^×=]+?)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*([가-힣a-zA-Z]{0,3})\s*×\s*(\d{1,3}(?:,\d{3})+|\d+)\s*원?\s*(?:=\s*([\d,]+)\s*원?)?\s*$/;

interface ItemMatch { name: string; spec: string; price: string; count?: string; total?: string }
function matchItem(line: string): ItemMatch | null {
  const a = line.match(ITEM_RE);
  if (a) return { name: a[1], spec: a[2] || '', price: a[3], count: a[4], total: a[5] };
  const b = line.match(ITEM_RE2);
  if (b) return { name: b[1], spec: b[3] ? `${b[2]}${b[3]}` : '', price: b[4], count: b[2], total: b[5] };
  return null;
}

const num = (s?: string) => (s ? Number(s.replace(/,/g, '')) : NaN);

function normalize(line: string): string {
  return line
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ':')
    .replace(/[＝]/g, '=')
    .replace(/[，]/g, ',')
    .replace(/(\d)\s*원?\s*[xX＊*]\s*(\d)/g, '$1×$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function toIsoDate(s: string): string | undefined {
  const m = s.match(/(\d{2,4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (!m) return undefined;
  let y = Number(m[1]);
  if (y < 100) y += 2000;
  const mm = String(Number(m[2])).padStart(2, '0');
  const dd = String(Number(m[3])).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

export function parseQuoteText(text: string): ParsedQuote {
  const items: ParsedItem[] = [];
  const info: ParsedInfo = {};
  const notes: string[] = [];
  let statedTotal: number | undefined;

  for (const raw of text.split(/\r?\n/)) {
    const line = normalize(raw);
    if (!line) continue;

    // 1) TOTAL / 합계 줄
    if (TOTAL_RE.test(line)) {
      statedTotal = num(line.match(/[\d,]+\s*원?\s*$/)![0].replace(/원/g, ''));
      continue;
    }

    // 2) 사업자/고객 정보 줄 ("키: 값" 또는 "키 값")
    const kv = line.match(/^([가-힣\s]{2,8})\s*[:：]\s*(.+)$/) ||
               line.match(/^([가-힣]{2,6})\s+(.+)$/);
    if (kv) {
      const key = kv[1].trim();
      const hit = INFO_KEYS.find(([re]) => re.test(key));
      if (hit) {
        const field = hit[1];
        const val = kv[2].trim();
        if (field === 'bizNumber') info.bizNumber = val.replace(/[^0-9]/g, '').slice(0, 10);
        else if (field === 'date') info.date = toIsoDate(val) ?? info.date;
        else if (field === 'remark') info.remark = info.remark ? `${info.remark}\n${val}` : val;
        else info[field] = val;
        continue;
      }
    }
    const honor = line.match(/^(.+?)\s*귀하$/);
    if (honor) { info.customer = honor[1].trim(); continue; }

    // 3) 항목 줄
    const m = matchItem(line);
    if (m) {
      const name = m.name.replace(/[:：\-–]+$/, '').trim();
      let price = num(m.price);
      let count = num(m.count);
      const total = num(m.total);

      // "3 × 67000" 처럼 수량·단가가 뒤바뀐 경우: 큰 쪽이 단가
      if (!isNaN(count) && count > price && count >= 1000) [price, count] = [count, price];
      // 수량이 없고 합계만 있으면 역산
      if (isNaN(count) && !isNaN(total) && price > 0 && total % price === 0) count = total / price;
      if (isNaN(count) || count <= 0) count = 1;

      if (name && price > 0) {
        items.push({ name, spec: m.spec.trim(), count, price });
        continue;
      }
    }

    // 4) 그 외 → 비고
    notes.push(line);
  }
  return { items, info, notes, statedTotal };
}
