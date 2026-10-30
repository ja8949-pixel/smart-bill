/** 견적서 공통 유틸 — 한글 금액, 날짜, 견적번호, 인앱 브라우저 감지, 파일 공유 */

const DIGITS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const SMALL = ['', '십', '백', '천'];
const BIG = ['', '만', '억', '조'];

/** 2933000 → "이백구십삼만삼천" (공문서식: 일십·일백도 '일'을 붙인다) */
export function numToKorean(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return '영';
  const groups: string[] = [];
  let gi = 0;
  while (n > 0) {
    const g = n % 10000;
    if (g) {
      let s = '';
      for (let i = 3; i >= 0; i--) {
        const d = Math.floor(g / 10 ** i) % 10;
        if (d) s += DIGITS[d] + SMALL[i];
      }
      groups.unshift(s + BIG[gi]);
    }
    n = Math.floor(n / 10000);
    gi++;
  }
  return groups.join('');
}

/** "2026-10-30" + 30일 → "2026. 11. 29" */
export function addDaysLabel(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`;
}

/** 견적번호: 20261030-01 (그날 몇 번째인지) */
export function makeQuoteNo(iso: string, seq: number): string {
  return `${iso.replace(/-/g, '')}-${String(seq).padStart(2, '0')}`;
}

export type InApp = 'kakao' | 'naver' | 'other' | null;
/** 카톡·네이버·인스타 등 앱 안 브라우저 — 파일 저장·공유가 막히는 경우가 많다 */
export function detectInApp(ua: string): InApp {
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  if (/NAVER\(inapp|NaverSearch|whale/i.test(ua) && !/Whale\//.test(ua)) return 'naver';
  if (/Instagram|FBAN|FBAV|Line\/|DaumApps|SamsungBrowser\/[0-9.]+ Mobile.*wv|; wv\)/i.test(ua)) return 'other';
  return null;
}
export const kakaoExternalUrl = (url: string) => `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;

export const dataUrlToBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();

/** 폰의 공유창(카톡·문자 등)으로 파일 보내기. 지원 안 하면 false */
export async function shareFile(file: File, title: string): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share || !nav.canShare || !nav.canShare({ files: [file] })) return false;
  try {
    await nav.share({ files: [file], title });
    return true;
  } catch (e: any) {
    if (e && e.name === 'AbortError') return true;   // 사용자가 공유창을 닫은 것 — 실패 아님
    return false;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 794×1123 JPG dataURL → A4 PDF Blob (jsPDF 는 필요할 때만 불러온다) */
export async function jpgToPdfBlob(jpgDataUrl: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  pdf.addImage(jpgDataUrl, 'JPEG', 0, 0, 210, 297);
  return pdf.output('blob');
}
