'use client';

import { useState, useRef, useEffect } from 'react';
import { toJpeg } from 'html-to-image';
import ExcelJS from 'exceljs';
import { removeStampBackground, shrinkForStorage } from './stampCutout';
import { parseQuoteText } from './quickParse';

// 이 기기(브라우저)에 기억해 두는 공급자 정보 — 로그인 없이 다음에 바로 불러온다
interface SavedProfile {
  provider: string;
  bizNumber: string;
  address: string;
  category: string;
  sector: string;
  stamp: string | null;
  savedAt: number;
}
const PROFILES_KEY = 'smartbill.profiles.v1';
const LAST_PROFILE_KEY = 'smartbill.lastProfile.v1';

const QUICK_EXAMPLE = `공급자: 일광페인팅
홍길동 귀하
15평기준
하도:1말67000×3=201000
중도:1말66000×6=396000
신나:62000
조공1일200000×3=600000
식대및기타잡자재:300000`;

interface BillItem {
  id: number;
  name: string;
  spec: string;
  count: number | string; // 0대신 빈칸 허용을 위해 string 추가
  price: number | string;
}

interface MasterInfo {
  provider: string; 
  bizNumber: string; 
  address: string;
  category: string; 
  sector: string; 
  customer: string; 
  date: string;
  remark: string;
}

// GA 트래킹 공통함수
const trackEvent = (action: string, label: string) => {
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', action, {
      'event_category': 'Engagement',
      'event_label': label
    });
  }
};

export default function BillApp() {
  const [info, setInfo] = useState<MasterInfo>({
    provider: '', 
    bizNumber: '', 
    address: '', 
    category: '', 
    sector: '', 
    customer: '',
    date: new Date().toISOString().split('T')[0], 
    remark: ''
  });

  const [items, setItems] = useState<BillItem[]>([{ id: Date.now(), name: '', spec: '', count: '', price: '' }]);
  const [stampImage, setStampImage] = useState<string | null>(null);
  const [stampOriginal, setStampOriginal] = useState<string | null>(null); // 누끼 전 원본 (되돌리기용)
  const [stampBusy, setStampBusy] = useState(false);
  const [vatMode, setVatMode] = useState<'none' | 'include'>('none');
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [profileMsg, setProfileMsg] = useState('');
  const [quickText, setQuickText] = useState('');
  const [quickMsg, setQuickMsg] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showAdModal, setShowAdModal] = useState(false); 
  const [downloadType, setDownloadType] = useState<'JPG' | 'XLSX' | null>(null);

  const printRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 합계 계산 (숫자가 아닐 경우 0 처리)
  const supplyAmount = items.reduce((acc, cur) => {
    const c = typeof cur.count === 'string' ? parseInt(cur.count) || 0 : cur.count;
    const p = typeof cur.price === 'string' ? parseInt(cur.price) || 0 : cur.price;
    return acc + (c * p);
  }, 0);
  // 부가세 포함 계산: 단가를 공급가로 보고 10% 가산 (원 미만 절사)
  const withVat = vatMode === 'include';
  const vatAmount = withVat ? Math.floor(supplyAmount * 0.1) : 0;
  const totalAmount = supplyAmount + vatAmount;

  // 도장 배경 제거(누끼) — 배경 있는 사진이면 투명 PNG 로, 이미 투명하면 그대로
  const cutoutStamp = async (original: string) => {
    setStampBusy(true);
    try {
      const { result } = await removeStampBackground(original);
      setStampImage(result);
    } catch {
      setStampImage(original); // 처리 실패 시 원본 그대로 사용
    } finally {
      setStampBusy(false);
    }
  };

  const handleStampFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const original = reader.result as string;
      setStampOriginal(original);
      setStampImage(original);
      cutoutStamp(original);
    };
    reader.readAsDataURL(file);
  };

  // ── 공급자 정보·도장 기억하기 (localStorage) ──────────────────
  const readProfiles = (): SavedProfile[] => {
    try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]'); } catch { return []; }
  };
  const applyProfile = (p: SavedProfile) => {
    setInfo(prev => ({ ...prev, provider: p.provider, bizNumber: p.bizNumber, address: p.address, category: p.category, sector: p.sector }));
    if (p.stamp) { setStampImage(p.stamp); setStampOriginal(null); }   // 저장본은 이미 배경이 지워진 상태
  };
  useEffect(() => {
    const list = readProfiles();
    setProfiles(list);
    // 지난번에 쓴 사업자 정보를 자동으로 채워 둔다 (처음 들어온 빈 화면일 때만)
    const last = localStorage.getItem(LAST_PROFILE_KEY);
    const p = list.find(x => x.provider === last);
    if (p) { applyProfile(p); setProfileMsg(`지난번 정보(${p.provider})를 자동으로 불러왔어요.`); }
    if (!localStorage.getItem('smartbill.guideSeen')) setShowGuide(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveProfile = async (silent = false) => {
    const name = info.provider.trim();
    if (!name) { if (!silent) { alert('사업자명을 먼저 적어 주세요.'); document.getElementById('f-provider')?.focus(); } return; }
    try {
      const stamp = stampImage ? await shrinkForStorage(stampImage) : null;
      const p: SavedProfile = { provider: name, bizNumber: info.bizNumber, address: info.address, category: info.category, sector: info.sector, stamp, savedAt: Date.now() };
      const list = [p, ...readProfiles().filter(x => x.provider !== name)].slice(0, 10);
      localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
      localStorage.setItem(LAST_PROFILE_KEY, name);
      setProfiles(list);
      if (!silent) setProfileMsg(`'${name}' 정보${stamp ? '와 도장' : ''}을 이 기기에 저장했어요. 다음에 자동으로 불러와요.`);
    } catch {
      if (!silent) alert('저장 공간이 부족해 저장하지 못했어요. 도장 사진을 작은 것으로 바꿔 보세요.');
    }
  };
  const loadProfile = (name: string) => {
    const p = profiles.find(x => x.provider === name);
    if (!p) return;
    applyProfile(p);
    localStorage.setItem(LAST_PROFILE_KEY, name);
    setProfileMsg(`'${name}' 정보${p.stamp ? '와 도장' : ''}을 불러왔어요.`);
  };
  const deleteProfile = (name: string) => {
    if (!confirm(`'${name}' 저장 정보를 지울까요?`)) return;
    const list = readProfiles().filter(x => x.provider !== name);
    localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
    if (localStorage.getItem(LAST_PROFILE_KEY) === name) localStorage.removeItem(LAST_PROFILE_KEY);
    setProfiles(list);
    setProfileMsg(`'${name}' 저장 정보를 지웠어요.`);
  };

  // ── 텍스트 자동 입력 ─────────────────────────────────────────
  const applyQuickText = () => {
    const r = parseQuoteText(quickText);
    if (!r.items.length && !Object.keys(r.info).length) {
      alert('읽을 수 있는 줄이 없어요.\n예시처럼 "품명:단가×수량" 형식으로 한 줄에 하나씩 적어 주세요.');
      document.getElementById('quick-text')?.focus();
      return;
    }
    const hasExisting = items.some(i => i.name.trim());
    if (r.items.length && hasExisting && !confirm(`지금 적힌 견적 내역 ${items.filter(i => i.name.trim()).length}개를 지우고 새로 ${r.items.length}개로 바꿀까요?`)) return;

    if (r.items.length) setItems(r.items.map((it, i) => ({ id: Date.now() + i, name: it.name, spec: it.spec, count: it.count, price: it.price })));
    const { remark, ...rest } = r.info;
    const noteText = [remark, ...r.notes].filter(Boolean).join('\n');
    setInfo(prev => ({ ...prev, ...rest, remark: noteText ? (prev.remark ? `${prev.remark}\n${noteText}` : noteText) : prev.remark }));

    const calc = r.items.reduce((a, i) => a + i.count * i.price, 0);
    const parts = [];
    if (r.items.length) parts.push(`견적 항목 ${r.items.length}개`);
    if (rest.provider) parts.push(`공급자 '${rest.provider}'`);
    if (rest.customer) parts.push(`받는분 '${rest.customer}'`);
    let msg = `✅ ${parts.join(', ')}을(를) 넣었어요.`;
    if (r.notes.length) msg += ` 항목이 아닌 ${r.notes.length}줄(${r.notes[0]}${r.notes.length > 1 ? ' 외' : ''})은 비고에 넣었어요.`;
    if (r.statedTotal && r.statedTotal !== calc) msg += `\n⚠️ 적어 주신 TOTAL ${r.statedTotal.toLocaleString()}원과 계산 합계 ${calc.toLocaleString()}원이 달라요. 항목을 한 번 확인해 주세요.`;
    setQuickMsg(msg);
    trackEvent('quick_text_apply', `${r.items.length} items`);
    setTimeout(() => document.getElementById('items-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  // ── 결과 보기 전 검사: 품명이 있는 줄은 수량·단가가 꼭 있어야 한다 ──
  const validateBeforePreview = (): boolean => {
    const named = items.filter(i => i.name.trim());
    if (!named.length) {
      alert('견적 내역을 1개 이상 적어 주세요.\n(품명·수량·단가)');
      document.getElementById(`name-${items[0]?.id}`)?.focus();
      return false;
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.name.trim()) continue;
      const c = Number(it.count), p = Number(it.price);
      if (!(c > 0)) {
        alert(`'${it.name}'의 수량이 비어 있어요.\n수량을 적지 않으면 금액에 들어가지 않아요.`);
        document.getElementById(`count-${it.id}`)?.focus();
        return false;
      }
      if (!(p > 0)) {
        alert(`'${it.name}'의 단가가 비어 있어요.`);
        document.getElementById(`price-${it.id}`)?.focus();
        return false;
      }
    }
    return true;
  };

  const handleBizNumberChange = (val: string) => {
    const onlyNum = val.replace(/[^0-9]/g, '');
    if (onlyNum.length <= 10) setInfo({ ...info, bizNumber: onlyNum });
  };

  const resetAll = () => {
  if (confirm("입력하신 모든 정보가 삭제됩니다. 초기화할까요?")) {
    setInfo({
      provider: '', bizNumber: '', address: '', category: '', sector: '', customer: '',
      date: new Date().toISOString().split('T')[0], remark: ''
    });
    setItems([{ id: Date.now(), name: '', spec: '', count: '', price: '' }]);
    setStampImage(null);
    setStampOriginal(null);
    setVatMode('none');
  }
};

  /**
   * 엑셀 다운로드 (ExcelJS)
   */
const exportToExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('견적서', {
        pageSetup: { paperSize: 9, orientation: 'portrait' },
        views: [{ showGridLines: false }]
      });

      // 컬럼 너비 설정
      sheet.columns = [
        { width: 6 }, { width: 25 }, { width: 12 }, { width: 12 }, 
        { width: 10 }, { width: 15 }, { width: 18 }
      ];

      const thinBorder = { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const}, right: { style: 'thin' as const} };
      const headerStyle: any = { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }, font: { bold: true, size: 10 }, alignment: { vertical: 'middle', horizontal: 'center' }, border: thinBorder };
      const cellStyle: any = { font: { size: 10 }, alignment: { vertical: 'middle', horizontal: 'center' }, border: thinBorder };

      // 1. 타이틀
      sheet.mergeCells('A1:G1');
      const title = sheet.getCell('A1');
      title.value = '견 적 서';
      title.font = { size: 24, bold: true, underline: true };
      title.alignment = { vertical: 'middle', horizontal: 'center' };

      // 2. 상단 정보
      sheet.getCell('A3').value = `일자: ${info.date.replace(/-/g, '. ')}`;
      sheet.mergeCells('A4:C4');
      const cust = sheet.getCell('A4');
      cust.value = `${info.customer || "            "} 귀하`;
      cust.font = { size: 16, bold: true };
      sheet.getCell('A5').value = "아래와 같이 견적합니다.";
      sheet.mergeCells('A6:C6');
      const tot = sheet.getCell('A6');
      tot.value = `합계금액: ₩${totalAmount.toLocaleString()}${withVat ? ' (VAT 포함)' : ''}`;
      tot.font = { size: 14, bold: true };

      // 3. 공급자 정보 테이블
      sheet.mergeCells('D3:D6');
      const pLab = sheet.getCell('D3');
      pLab.value = "공\n급\n자";
      pLab.style = { ...headerStyle, alignment: { wrapText: true, vertical: 'middle', horizontal: 'center' } };

      const formattedBizNumber = info.bizNumber.length === 10 
      ? info.bizNumber.replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3')
      : info.bizNumber;

      sheet.getCell('E3').value = "등록번호"; 
      sheet.getCell('E3').style = headerStyle;

      sheet.mergeCells('F3:G3'); 
      sheet.getCell('F3').value = formattedBizNumber; // 하이픈이 포함된 번호 삽입
      sheet.getCell('F3').style = cellStyle;
      
      sheet.getCell('E4').value = "상호"; sheet.getCell('E4').style = headerStyle;
      sheet.getCell('F4').value = info.provider; sheet.getCell('F4').style = cellStyle;
      sheet.getCell('G4').value = "(인)"; sheet.getCell('G4').style = cellStyle;
      sheet.getCell('G4').alignment = { horizontal: 'right' };
      
      sheet.getCell('E5').value = "주소"; sheet.getCell('E5').style = headerStyle;
      sheet.mergeCells('F5:G5'); sheet.getCell('F5').value = info.address; sheet.getCell('F5').style = { ...cellStyle, alignment: { horizontal: 'left' } };
      
      sheet.getCell('E6').value = "업태"; sheet.getCell('E6').style = headerStyle;
      sheet.getCell('F6').value = info.category; sheet.getCell('F6').style = cellStyle;
      sheet.getCell('G6').value = info.sector; sheet.getCell('G6').style = cellStyle;

      if (stampImage) {
        const imageId = workbook.addImage({ base64: stampImage, extension: 'png' });
        sheet.addImage(imageId, { tl: { col: 6.2, row: 3.1 }, ext: { width: 45, height: 45 } });
      }

      // 4. 품목 헤더 (A8 ~ G8)
      const startRow = 8;
      const headers = ["NO", "품 명 / 규 격", "", "", "수 량", "단 가", "금 액"];
      headers.forEach((h, i) => {
        const cell = sheet.getCell(startRow, i + 1);
        cell.value = h;
        cell.style = headerStyle;
      });
      sheet.mergeCells(startRow, 2, startRow, 4);

      // 5. 품목 데이터 (테두리 전체 적용)
      items.forEach((item, i) => {
        const r = startRow + 1 + i;
        const count = Number(item.count) || 0;
        const price = Number(item.price) || 0;

        sheet.getCell(r, 1).value = i + 1;
        sheet.getCell(r, 2).value = `${item.name} ${item.spec ? `(${item.spec})` : ""}`;
        sheet.getCell(r, 5).value = count || '';
        sheet.getCell(r, 6).value = price || '';
        sheet.getCell(r, 7).value = count * price || '';

        // 모든 셀에 테두리 스타일 적용
        for (let col = 1; col <= 7; col++) {
          sheet.getCell(r, col).style = cellStyle;
        }
        sheet.mergeCells(r, 2, r, 4);
        sheet.getCell(r, 2).alignment = { horizontal: 'left', indent: 1 };
        sheet.getCell(r, 6).numFmt = '#,##0';
        sheet.getCell(r, 7).numFmt = '#,##0';
      });

      // 6. 공급가액·부가세 행 (부가세 포함 계산일 때만) + 합계행
      let tr = startRow + 1 + items.length;
      if (withVat) {
        [["공 급 가 액", supplyAmount], ["부 가 세 (10%)", vatAmount]].forEach(([label, val]) => {
          sheet.mergeCells(tr, 1, tr, 6);
          sheet.getCell(tr, 1).value = label;
          sheet.getCell(tr, 7).value = val;
          for (let col = 1; col <= 7; col++) sheet.getCell(tr, col).style = cellStyle;
          sheet.getCell(tr, 7).numFmt = '#,##0';
          sheet.getCell(tr, 7).alignment = { horizontal: 'right' };
          tr++;
        });
      }
      sheet.mergeCells(tr, 1, tr, 4);
      sheet.getCell(tr, 1).value = "합 계 (TOTAL)";
      sheet.getCell(tr, 5).value = items.reduce((a, b) => a + (Number(b.count) || 0), 0) || '';
      sheet.getCell(tr, 7).value = totalAmount;

      for (let col = 1; col <= 7; col++) {
        sheet.getCell(tr, col).style = headerStyle;
      }
      sheet.getCell(tr, 7).font = { bold: true, color: { argb: 'FF1E40AF' } };
      sheet.getCell(tr, 7).numFmt = '"₩"#,##0';

      // 7. 비고 및 특약사항 박스 추가
      const remarkRow = tr + 2;
      sheet.mergeCells(`A${remarkRow}:G${remarkRow + 4}`);
      const remarkCell = sheet.getCell(`A${remarkRow}`);
      remarkCell.value = `※ 비고 및 특약사항\n\n${info.remark || "특이사항 없음"}`;
      remarkCell.style = {
        font: { size: 10 },
        alignment: { vertical: 'top', horizontal: 'left', wrapText: true },
        border: thinBorder
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `견적서_${info.customer || "미지정"}.xlsx`;
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch (err) { alert("엑셀 저장 실패"); }
  };

  const executeDownload = () => {
    if (!printRef.current) return;
    toJpeg(printRef.current, { quality: 0.95, backgroundColor: '#ffffff' })
      .then((dataUrl) => {
        const a = document.createElement('a'); a.href = dataUrl;
        a.download = `견적서_${info.customer || "미지정"}.jpg`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setShowAdModal(false); setDownloadType(null);
      });
  };

  const handleAdConfirm = () => {
    if (downloadType === 'JPG') executeDownload();
    else if (downloadType === 'XLSX') { exportToExcel(); setShowAdModal(false); setDownloadType(null); }
  };

  const addItem = () => setItems([...items, { id: Date.now(), name: '', spec: '', count: '', price: '' }]);
  const updateItem = (id: number, key: keyof BillItem, value: any) => setItems(items.map(i => i.id === id ? { ...i, [key]: value } : i));

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-slate-900 pb-10">
      <div className="no-print">
        {/* 최상단 홍보 문구 라인 */}
        <div className="bg-orange-500 text-white py-4 px-6 shadow-md text-center">
          <p className="text-xs md:text-sm font-medium opacity-90 mb-1">
            복잡한 견적서 작업은 이제 그만!
          </p>
          <h2 className="text-lg md:text-2xl font-extrabold tracking-tight">
            누구나 <span className="text-yellow-300">10초면 뚝딱</span> 만드는 무료 견적서 📝
          </h2>
        </div>
        <header className="bg-white border-b px-4 py-3 sticky top-0 z-20 flex justify-between items-center shadow-sm">
          <img src="/images/smart_bill_logo.jpg" alt="로고" className="h-14 w-14" />
          <div className="flex flex-col items-center gap-2">
          <button 
            id="btn_preview_open" 
            onClick={() => {
              trackEvent('click_preview', '미리보기 버튼 클릭');
              if (!validateBeforePreview()) return;
              saveProfile(true);          // 사업자 정보·도장은 조용히 기억해 둔다
              localStorage.setItem('smartbill.guideSeen', '1');   // 한 번 만들어 봤으면 다음엔 가이드 접기
              setShowPreview(true);
            }}
            className="bg-[#FF7E36] text-white px-8 py-4 rounded-2xl font-extrabold text-lg shadow-[0_4px_14px_0_rgba(255,126,54,0.39)] hover:scale-105 transition-transform animate-bounce-subtle"
          >
            🚀 10초 만에 결과물 확인하기
          </button>
          <span className="text-[11px] text-gray-500 font-medium">가입 없이 무료로 바로 다운로드</span>
        </div>
        </header>

        <main className="max-w-7xl mx-auto p-4 flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-6">
            {/* 사용 안내: 3단계 */}
            <section className="bg-white rounded-2xl border border-zinc-200 shadow-sm">
              <button onClick={() => { setShowGuide(v => !v); localStorage.setItem('smartbill.guideSeen', '1'); }}
                      className="w-full flex justify-between items-center px-5 py-3 text-left">
                <span className="text-sm font-black text-slate-700">📖 처음이세요? 3단계면 끝나요</span>
                <span className="text-slate-400 text-xs">{showGuide ? '접기 ▲' : '펼치기 ▼'}</span>
              </button>
              {showGuide && (
                <ol className="px-5 pb-4 space-y-2 text-sm text-slate-600 leading-relaxed">
                  <li><b className="text-blue-600">①</b> <b>사업자 정보</b>를 적고 도장 사진을 올려요. 한 번 적으면 다음부터 자동으로 채워져요.</li>
                  <li><b className="text-blue-600">②</b> <b>견적 내역</b>은 칸에 직접 적어도 되고, 문자처럼 쭉 적어서 <b>"자동으로 채우기"</b>를 눌러도 돼요.</li>
                  <li><b className="text-blue-600">③</b> 위의 주황색 <b>"결과물 확인하기"</b>를 누르면 견적서가 나와요. 이미지로 저장하거나 PDF로 인쇄하세요.</li>
                  <li className="text-xs text-slate-400 pt-1">입력한 내용은 내 기기에만 저장되고 어디에도 전송되지 않아요.</li>
                </ol>
              )}
            </section>

            <section className="flex justify-center bg-white rounded-2xl p-2 border border-zinc-200 shadow-sm">
              <iframe src="https://ads-partners.coupang.com/widgets.html?id=963189&template=carousel&trackingCode=AF4084126&width=360&height=180" width="360" height="180" frameBorder="0" scrolling="no" loading="lazy"></iframe>
            </section>

            <section className="bg-white rounded-2xl p-5 shadow-sm space-y-4 border border-zinc-200">
            {/* 헤더 부분: 제목과 버튼을 한 줄에 배치 */}
            <div className="flex justify-between items-center border-b border-gray-50 pb-2">
              <h2 className="text-sm font-black text-slate-700"><span className="text-blue-600 mr-1">①</span>사업자 정보</h2>
              <button
                onClick={resetAll}
                className="text-[10px] font-bold text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                모두 지우기
              </button>
            </div>

              {/* 저장된 사업자 불러오기 / 저장 */}
              <div className="flex flex-wrap items-center gap-2">
                {profiles.length > 0 && (
                  <select
                    id="profile-select"
                    className="input-style !w-auto flex-1 min-w-[160px] font-bold"
                    value=""
                    onChange={e => { if (e.target.value) loadProfile(e.target.value); e.target.value = ''; }}
                  >
                    <option value="">📂 저장된 사업자 불러오기 ({profiles.length})</option>
                    {profiles.map(p => <option key={p.provider} value={p.provider}>{p.provider}{p.stamp ? ' (도장 있음)' : ''}</option>)}
                  </select>
                )}
                <button id="btn-save-profile" onClick={() => saveProfile(false)}
                        className="text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 px-3 py-2 rounded-xl hover:bg-blue-100 transition">
                  💾 이 사업자 정보 저장
                </button>
                {info.provider && profiles.some(p => p.provider === info.provider.trim()) && (
                  <button onClick={() => deleteProfile(info.provider.trim())} className="text-xs text-gray-400 underline px-1">저장 삭제</button>
                )}
              </div>
              {profileMsg && <p id="profile-msg" className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">{profileMsg}</p>}

              {/* grid에 gap-3을 유지하면서 각 항목이 동일한 비율을 갖도록 설정 */}
              <div className="grid grid-cols-2 md:grid-cols-2 gap-4 w-full">
                <input id="f-provider" type="text" placeholder="사업자명 (예: 일광페인팅)" value={info.provider} className="input-style" onChange={e => setInfo({...info, provider: e.target.value})} />
                <input type="text" placeholder="사업자번호" value={info.bizNumber} className="input-style" onChange={e => handleBizNumberChange(e.target.value)} />
                
                {/* 날짜 입력칸: min-w-0을 주어 부모 그리드를 벗어나지 않게 고정 */}
                <div className="min-w-0 w-full flex items-center">
                  <input 
                    type="date" 
                    className="input-style w-full !px-1 text-[13px] md:text-sm appearance-none" 
                    style={{ minWidth: '0', display: 'block', boxSizing: 'border-box' }}
                    value={info.date} 
                    onChange={e => setInfo({...info, date: e.target.value})} 
                  />
                </div>
                
                <input type="text" placeholder="받는분(귀하)" value={info.customer} className="input-style min-w-0 w-full" onChange={e => setInfo({...info, customer: e.target.value})} />
                
                <input type="text" placeholder="업태 (ex,페인트)" value={info.category} className="input-style" onChange={e => setInfo({...info, category: e.target.value})} />
                <input type="text" placeholder="종목 (ex,제조업)" value={info.sector} className="input-style" onChange={e => setInfo({...info, sector: e.target.value})} />
                
                <input type="text" placeholder="주소" value={info.address} className="input-style col-span-2" onChange={e => setInfo({...info, address: e.target.value})} />
                <textarea placeholder="비고 및 특약사항" value={info.remark} className="input-style col-span-2 h-20" onChange={e => setInfo({...info, remark: e.target.value})} />
              </div>
            </section>

            {/* 도장 업로드 버튼 위치: 사업자 정보 입력칸들 바로 아래 */}
            <div className="pt-2">
              <input 
                type="file" 
                accept="image/*" 
                ref={fileInputRef} 
                hidden 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleStampFile(file);
                  e.target.value = ''; // 같은 파일 다시 올려도 동작하게
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full text-xs bg-gray-50 border border-dashed py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition"
              >
                {stampBusy ? "⏳ 도장 배경 지우는 중..." : stampImage ? "✅ 도장 등록됨 (바꾸려면 여기를 누르세요)" : "📸 도장 사진 올리기 — 종이에 찍어 폰으로 찍은 사진도 돼요 (배경 자동 제거)"}
              </button>
              {stampImage && !stampBusy && (
                <div className="mt-2 flex items-center gap-3 bg-white border border-zinc-200 rounded-xl p-2">
                  {/* 체크무늬 배경: 투명하게 지워졌는지 눈으로 확인 */}
                  <div className="w-14 h-14 rounded-lg shrink-0 flex items-center justify-center"
                       style={{ backgroundImage: 'conic-gradient(#e5e7eb 25%, #fff 0 50%, #e5e7eb 0 75%, #fff 0)', backgroundSize: '12px 12px' }}>
                    <img src={stampImage} alt="도장 미리보기" className="max-w-full max-h-full object-contain" />
                  </div>
                  <p className="flex-1 text-[11px] text-gray-500">
                    {!stampOriginal ? '저장해 둔 도장을 쓰고 있어요.' : stampImage !== stampOriginal ? '배경을 투명하게 지웠어요.' : '원본 이미지를 사용 중이에요.'}
                  </p>
                  {stampOriginal && (
                    <button
                      onClick={() => stampImage !== stampOriginal ? setStampImage(stampOriginal) : cutoutStamp(stampOriginal)}
                      className="text-[11px] font-bold text-blue-600 shrink-0 px-2"
                    >
                      {stampImage !== stampOriginal ? '원본으로 되돌리기' : '배경 지우기'}
                    </button>
                  )}
                </div>
              )}
            </div>
            
            {/* 텍스트로 한 번에 입력 */}
            <section className="bg-white rounded-2xl p-5 shadow-sm space-y-3 border border-zinc-200">
              <h2 className="text-sm font-black text-slate-700"><span className="text-blue-600 mr-1">②</span>견적 내용 적기 <span className="text-xs font-medium text-slate-400 ml-1">글로 적어 한 번에 넣기</span></h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                문자 보내듯 한 줄에 하나씩 적고 <b>자동으로 채우기</b>를 누르세요.
                <b className="text-slate-700"> 품명:단가×수량</b> 순서면 돼요. 공급자·받는분도 같이 적을 수 있어요.
              </p>
              <textarea
                id="quick-text"
                value={quickText}
                onChange={e => setQuickText(e.target.value)}
                placeholder={QUICK_EXAMPLE}
                className="input-style h-40 font-mono text-[13px] leading-relaxed"
              />
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button id="btn-quick-apply" onClick={applyQuickText}
                        className="bg-blue-600 text-white py-3 rounded-xl font-extrabold text-sm shadow hover:bg-blue-700 transition">
                  ✨ 자동으로 채우기
                </button>
                <button onClick={() => setQuickText(QUICK_EXAMPLE)} className="text-xs text-slate-500 px-3 border border-zinc-200 rounded-xl">예시 넣기</button>
              </div>
              {quickMsg && <p id="quick-msg" className="text-xs text-slate-700 bg-blue-50 rounded-lg px-3 py-2 whitespace-pre-line">{quickMsg}</p>}
            </section>

            <section id="items-section" className="space-y-3">
              <div className="flex justify-between items-center px-2">
                <h2 className="text-sm font-black text-slate-700"><span className="text-blue-600 mr-1">②</span>견적 내역 확인·수정 <span className="text-xs font-medium text-slate-400 ml-1">수량·단가는 꼭 적어 주세요</span></h2>
                <button onClick={addItem} className="text-blue-600 font-bold text-sm">+ 항목 추가</button>
              </div>
              {/* 부가세 계산 방식 — 둘 중 하나만 선택 */}
              <div className="grid grid-cols-2 gap-2">
                {([['none', '부가세 없이 계산'], ['include', '부가세 포함 계산 (10%)']] as const).map(([mode, label]) => (
                  <label
                    key={mode}
                    className={`flex items-center gap-2 rounded-xl p-3 text-xs font-bold cursor-pointer border transition ${
                      vatMode === mode ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-zinc-200 text-gray-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={vatMode === mode}
                      onChange={() => { setVatMode(mode); trackEvent('click_vat_mode', label); }}
                      className="w-4 h-4 accent-blue-600"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {items.map((item, idx) => {
                const named = !!item.name.trim();
                const needCount = named && !(Number(item.count) > 0);
                const needPrice = named && !(Number(item.price) > 0);
                const warn = 'border-red-400 bg-red-50 placeholder-red-400';
                return (
                <div key={item.id} className="bg-white rounded-xl p-4 shadow-sm border border-zinc-200 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-5">{idx + 1}.</span>
                    <input id={`name-${item.id}`} type="text" placeholder="품명 (예: 하도)" value={item.name} className="flex-1 border-b text-base outline-none pb-1 font-medium" onChange={e => updateItem(item.id, 'name', e.target.value)} />
                    {items.length > 1 && <button onClick={() => setItems(items.filter(i => i.id !== item.id))} className="text-slate-300 hover:text-red-500 text-lg px-1" aria-label="항목 삭제">✕</button>}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" placeholder="규격 (예: 1말)" value={item.spec} className="border-b text-sm outline-none pb-1" onChange={e => updateItem(item.id, 'spec', e.target.value)} />
                    <input id={`count-${item.id}`} type="number" min={1} placeholder="수량 *필수" value={item.count} className={`border-b text-sm outline-none pb-1 ${needCount ? warn : ''}`} onChange={e => updateItem(item.id, 'count', e.target.value)} />
                    <input id={`price-${item.id}`} type="number" min={0} placeholder="단가 *필수" value={item.price} className={`border-b text-sm outline-none pb-1 ${needPrice ? warn : ''}`} onChange={e => updateItem(item.id, 'price', e.target.value)} />
                  </div>
                  {(needCount || needPrice) && <p className="text-[11px] text-red-500">{needCount ? '수량' : '단가'}을(를) 적어야 금액에 들어가요.</p>}
                </div>
                );
              })}
              {/* 실시간 합계 */}
              <div className="bg-white rounded-xl p-4 border border-zinc-200 text-xs space-y-1">
                {withVat && (
                  <>
                    <div className="flex justify-between text-gray-500"><span>공급가액</span><span>₩{supplyAmount.toLocaleString()}</span></div>
                    <div className="flex justify-between text-gray-500"><span>부가세 (10%)</span><span>₩{vatAmount.toLocaleString()}</span></div>
                  </>
                )}
                <div className="flex justify-between font-black text-sm">
                  <span>합계금액{withVat ? ' (VAT 포함)' : ''}</span><span className="text-blue-700">₩{totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </section>

            <section className="flex justify-center bg-white rounded-2xl p-2 border border-zinc-200 shadow-sm">
              <iframe src="https://ads-partners.coupang.com/widgets.html?id=964078&template=carousel&trackingCode=AF4084126&width=360&height=180" width="360" height="180" frameBorder="0" scrolling="no" loading="lazy"></iframe>
            </section>
          </div>
        </main>
      </div>

      {showPreview && (
      <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-start overflow-y-auto pt-4 pb-20 px-2">
        <div className="w-full max-w-[800px] flex justify-end mb-2">
          <button id="btn_preview_close" onClick={() => setShowPreview(false)} className="bg-white/20 text-white w-10 h-10 rounded-full text-xl" aria-label="미리보기 닫기">✕</button>
        </div>
        
          <div className="preview-container bg-white shadow-2xl origin-top">
            {/* A4 규격 고정: 794px * 1123px */}
            <div ref={printRef} className="p-10 md:p-14 bg-white w-[794px] h-[1123px] flex flex-col justify-between overflow-hidden shrink-0">
              <div>
                <h1 className="text-4xl md:text-5xl text-center font-bold tracking-[1.5rem] md:tracking-[2.5rem] mb-12 border-b-4 border-double border-black pb-4">견 적 서</h1>
                
                <div className="flex justify-between items-start gap-8 mb-10 text-left">
                  <div className="flex-1">
                    <p className="text-[12px] text-slate-500 mb-2 font-medium">일자: {info.date.replace(/-/g, '. ')}</p>
                    <p className="text-2xl font-bold border-b-2 border-black pb-1 inline-block min-w-[200px]">{info.customer || '            '} <span className="text-lg font-normal">귀하</span></p>
                    <p className="text-sm mt-3 text-slate-600 font-medium">아래와 같이 견적합니다.</p>
                    <div className="mt-4 text-2xl font-black">
                      합계금액: ₩{totalAmount.toLocaleString()}
                      {withVat && <p className="mt-1 text-xs font-bold text-slate-500 whitespace-nowrap">(부가세 10% 포함)</p>}
                    </div>
                  </div>

                  <div className="w-[400px] shrink-0">
                    <table className="border-collapse border-2 border-black w-full text-[11px] table-fixed">
                      <tbody>
                        <tr>
                          <td className="border border-black p-1 text-center bg-slate-100 font-bold w-10" rowSpan={4}>공<br/>급<br/>자</td>
                          <td className="border border-black p-2 bg-slate-100 font-bold text-center w-20">등록번호</td>
                          <td className="border border-black p-2 font-bold" colSpan={3}>
                            {info.bizNumber.length === 10 
                              ? info.bizNumber.replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3') 
                              : info.bizNumber}
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-black p-2 bg-slate-100 font-bold text-center">상호</td>
                          <td className="border border-black p-2 font-bold">{info.provider}</td>
                          <td className="border border-black p-2 bg-slate-100 font-bold text-center">서명</td>
                          <td className="border border-black p-0 text-center relative w-[80px]">
                            <div className="absolute inset-0 flex items-center justify-end pr-3 font-bold text-[13px] z-0 opacity-40">(인)</div>
                            {stampImage && (
                              <div className="relative z-10 flex justify-end items-center h-full pr-1">
                                <img src={stampImage} className="w-12 h-12 object-contain mix-blend-multiply" alt="도장" />
                              </div>
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-black p-2 bg-slate-100 font-bold text-center">주소</td>
                          <td className="border border-black p-2 text-[10px]" colSpan={3}>{info.address}</td>
                        </tr>
                        <tr>
                          <td className="border border-black p-2 bg-slate-100 font-bold text-center">업태</td>
                          <td className="border border-black p-2 text-center">{info.category}</td>
                          <td className="border border-black p-2 bg-slate-100 font-bold text-center">종목</td>
                          <td className="border border-black p-2 text-center">{info.sector}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 품목 테이블: 최소 7줄 유지 */}
                <table className="w-full border-collapse border-2 border-black text-[12px] mb-8">
                  <thead className="bg-slate-100 font-bold text-center h-10">
                    <tr>
                      <td className="border border-black w-10">NO</td>
                      <td className="border border-black">품 명 / 규 격</td>
                      <td className="border border-black w-14">수 량</td>
                      <td className="border border-black w-28">단 가</td>
                      <td className="border border-black w-32">금 액</td>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 최소 7줄을 보장하기 위해 빈 배열 생성 후 맵핑 */}
                    {/* 부가세 행 2줄이 추가되면 빈 줄을 2줄 줄여 A4 높이를 유지 */}
                    {Array.from({ length: Math.max(withVat ? 8 : 10, items.length) }).map((_, i) => {
                      const item = items[i];
                      const c = item ? Number(item.count) || 0 : 0;
                      const p = item ? Number(item.price) || 0 : 0;
                      
                      return (
                        <tr key={item?.id || i} className="h-8 text-center">
                          <td className="border border-black text-slate-400">{i + 1}</td>
                          <td className="border border-black text-left px-3 font-bold">
                            {item ? `${item.name} ` : ''}
                            {item?.spec && <span className="font-normal text-slate-500 text-[10px] ml-1">({item.spec})</span>}
                          </td>
                          <td className="border border-black">{item?.count || ''}</td>
                          <td className="border border-black text-right px-2">{p ? p.toLocaleString() : ''}</td>
                          <td className="border border-black text-right px-2 font-bold">{(c * p) ? (c * p).toLocaleString() : ''}</td>
                        </tr>
                      );
                    })}
                    {withVat && (
                      <>
                        <tr className="h-8 text-center">
                          <td className="border border-black" colSpan={4}>공 급 가 액</td>
                          <td className="border border-black text-right px-2">{supplyAmount.toLocaleString()}</td>
                        </tr>
                        <tr className="h-8 text-center">
                          <td className="border border-black" colSpan={4}>부 가 세 (10%)</td>
                          <td className="border border-black text-right px-2">{vatAmount.toLocaleString()}</td>
                        </tr>
                      </>
                    )}
                    <tr className="h-11 bg-slate-50 font-bold text-center">
                      <td className="border border-black" colSpan={2}>합 계</td>
                      <td className="border border-black">{items.reduce((a, b) => a + (Number(b.count) || 0), 0) || ''}</td>
                      <td className="border border-black"></td>
                      <td className="border border-black text-right px-2 text-blue-800">₩{totalAmount.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 하단 고정 비고란 */}
              <div className="border-2 border-black p-5 flex-1 h-[300px] text-[11px] bg-slate-50/50 whitespace-pre-wrap text-left mt-auto">
                <p className="font-bold underline mb-2">※ 비고 및 특약사항</p>
                <p>{info.remark || "특이사항 없음"}</p>
              </div>
            </div>
          </div>

          {/* 하단 버튼 바 */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900/90 grid grid-cols-2 gap-2 no-print z-[60]">
            <button id="btn_download_jpg" onClick={() => { trackEvent('click_download_jpg', 'JPG 다운로드 시도'); setDownloadType('JPG'); setShowAdModal(true); }} className="bg-white py-4 rounded-xl font-bold text-sm">이미지 다운로드</button>
            <button id="btn_print_pdf" onClick={() => { trackEvent('click_print_pdf', 'PDF 인쇄 버튼 클릭'); setTimeout(() => window.print(), 200); }} className="bg-blue-600 text-white py-4 rounded-xl font-bold text-sm">PDF 인쇄</button>
          </div>
        </div>
      )}

      {showAdModal && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md text-center space-y-4 shadow-2xl">
            <h3 className="text-xl font-black">다운로드 준비 완료!</h3>
            <p className="text-sm text-slate-500">아래 광고를 클릭하시면 파일 저장이 시작됩니다.</p>
            <div onClick={handleAdConfirm} className="cursor-pointer border border-blue-100 rounded-2xl overflow-hidden">
              <a href="https://iryan.kr/t8f69fuddg" target="_blank" rel="noreferrer" id="btn_ad_medicok" onClick={() => trackEvent('click_ad_image', '메디콕 광고 이미지 클릭')} className="block"><img src="http://img.tenping.kr/Content/Upload/Images/2025111715060001_Dis_20251117151015.jpg" className="w-full" /><div className="p-3 bg-blue-50 text-blue-700 font-bold text-sm">맞춤형 건강기능식품 메디콕! (클릭 시 저장)</div></a>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button onClick={() => setShowAdModal(false)} className="py-4 rounded-2xl bg-gray-100 font-bold text-slate-400">취소</button>
              <button id="btn_ad_confirm_save" onClick={() => { trackEvent('click_ad_save_action', '광고 확인 후 최종 저장 클릭'); handleAdConfirm(); }} className="py-4 rounded-2xl bg-blue-600 text-white font-bold">광고 보고 저장하기</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .input-style { width: 100%; padding: 0.75rem; background-color: #f8fafc; border-radius: 0.75rem; font-size: 1rem; outline: none; border: 1px solid #e2e8f0; }
        .preview-container { width: 800px; min-width: 800px; background: white; }
        @media (max-width: 800px) { .preview-container { transform: scale(${(typeof window !== 'undefined' ? window.innerWidth - 32 : 800) / 800}); } }
        @media print { .no-print { display: none !important; } .fixed { position: static !important; } .preview-container { transform: scale(1) !important; width: 100% !important; margin: 0 !important; } }
      `}</style>
    </div>
  );
}