'use client';

import { useState, useRef } from 'react';
import { toJpeg } from 'html-to-image';
import * as XLSX from 'xlsx-js-style';

interface BillItem {
  id: number;
  name: string;
  spec: string;
  count: number;
  price: number;
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

  const [items, setItems] = useState<BillItem[]>([{ id: Date.now(), name: '', spec: '', count: 1, price: 0 }]);
  const [stampImage, setStampImage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showAdModal, setShowAdModal] = useState(false); 
  const [downloadType, setDownloadType] = useState<'JPG' | 'XLSX' | null>(null);

  const printRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalAmount = items.reduce((acc, cur) => acc + (cur.price * cur.count), 0);

  // 사업자번호 10자리 제한 로직
  const handleBizNumberChange = (val: string) => {
    const onlyNum = val.replace(/[^0-9]/g, '');
    if (onlyNum.length <= 10) {
      setInfo({ ...info, bizNumber: onlyNum });
    }
  };

  const thinBorder = { style: "thin", color: { rgb: "000000" } };
  const style = {
    title: { font: { sz: 24, bold: true }, alignment: { vertical: "center", horizontal: "center" } },
    header: { fill: { fgColor: { rgb: "F1F5F9" } }, font: { bold: true, sz: 10 }, border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }, alignment: { vertical: "center", horizontal: "center" } },
    cell: { border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }, alignment: { vertical: "center", horizontal: "center" }, font: { sz: 10 } },
    cellLeft: { border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }, alignment: { vertical: "center", horizontal: "left" }, font: { sz: 10, bold: true } },
    cellRight: { border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }, alignment: { vertical: "center", horizontal: "right" }, font: { sz: 10 } },
    summary: { fill: { fgColor: { rgb: "F8FAFC" } }, font: { bold: true, color: { rgb: "1E40AF" } }, border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }, alignment: { vertical: "center", horizontal: "right" } }
  };

  /**
   * [수정] 엑셀 다운로드 - 서명(인), 종목 셀 추가 및 도장 영역 확보
   */
  const exportToExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([[]]);
      const merges: XLSX.Range[] = [];

      ws["A1"] = { v: "견 적 서", s: style.title };
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } });

      ws["A3"] = { v: `일자: ${info.date.replace(/-/g, '. ')}`, s: { font: { sz: 10 } } };
      ws["A4"] = { v: `${info.customer || ""} 귀하`, s: { font: { sz: 16, bold: true } } };
      ws["A5"] = { v: "아래와 같이 견적합니다.", s: { font: { sz: 10 } } };
      ws["A6"] = { v: `합계금액: ₩${totalAmount.toLocaleString()}`, s: { font: { sz: 14, bold: true } } };

      // 공급자 테이블 (서명, 종목 셀 추가 수정)
      ws["D3"] = { v: "공\n급\n자", s: style.header };
      merges.push({ s: { r: 2, c: 3 }, e: { r: 5, c: 3 } });

      ws["E3"] = { v: "등록번호", s: style.header };
      ws["F3"] = { v: info.bizNumber, s: style.cell };
      merges.push({ s: { r: 2, c: 5 }, e: { r: 2, c: 6 } });
      ws["G3"] = { v: "", s: style.cell }; 

      ws["E4"] = { v: "상호", s: style.header };
      ws["F4"] = { v: info.provider, s: style.cell };
      ws["G4"] = { v: stampImage ? "(인) 済" : "(인)", s: style.cell }; // 서명(인) 셀 추가 및 도장 여부 표시

      ws["E5"] = { v: "주소", s: style.header };
      ws["F5"] = { v: info.address, s: style.cell };
      merges.push({ s: { r: 4, c: 5 }, e: { r: 4, c: 6 } });
      ws["G5"] = { v: "", s: style.cell };

      ws["E6"] = { v: "업태", s: style.header };
      ws["F6"] = { v: info.category, s: style.cell };
      ws["G6"] = { v: info.sector, s: style.cell }; // 종목 셀 추가

      const headers = ["NO", "품 명 / 규 격", "", "", "수 량", "단 가", "금 액"];
      headers.forEach((label, i) => {
        ws[XLSX.utils.encode_cell({ r: 7, c: i })] = { v: label, s: style.header };
      });
      merges.push({ s: { r: 7, c: 1 }, e: { r: 7, c: 3 } });

      items.forEach((item, i) => {
        const r = 8 + i;
        ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: i + 1, s: style.cell };
        ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: `${item.name} ${item.spec ? `(${item.spec})` : ""}`, s: style.cellLeft };
        ws[XLSX.utils.encode_cell({ r, c: 2 })] = { s: style.cell }; 
        ws[XLSX.utils.encode_cell({ r, c: 3 })] = { s: style.cell };
        ws[XLSX.utils.encode_cell({ r, c: 4 })] = { v: item.count, s: style.cell };
        ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: item.price, s: style.cellRight };
        ws[XLSX.utils.encode_cell({ r, c: 6 })] = { v: item.count * item.price, s: style.cellRight };
        merges.push({ s: { r, c: 1 }, e: { r, c: 3 } });
      });

      const totalR = 8 + items.length;
      ws[XLSX.utils.encode_cell({ r: totalR, c: 0 })] = { v: "합 계 (TOTAL)", s: style.header };
      merges.push({ s: { r: totalR, c: 0 }, e: { r: totalR, c: 3 } });
      ws[XLSX.utils.encode_cell({ r: totalR, c: 4 })] = { v: items.reduce((a, b) => a + b.count, 0), s: style.header };
      ws[XLSX.utils.encode_cell({ r: totalR, c: 5 })] = { v: "", s: style.header };
      ws[XLSX.utils.encode_cell({ r: totalR, c: 6 })] = { v: `₩${totalAmount.toLocaleString()}`, s: style.summary };

      ws["!merges"] = merges;
      ws["!cols"] = [{ wch: 5 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 15 }];
      ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalR + 5, c: 6 } });

      XLSX.utils.book_append_sheet(wb, ws, "견적서");
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `견적서_${info.customer || "미지정"}.xlsx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 500);
    } catch (err) { alert("엑셀 생성 실패"); }
  };

  const executeDownload = () => {
    if (!printRef.current) return;
    toJpeg(printRef.current, { quality: 0.95, backgroundColor: '#ffffff' })
      .then((dataUrl) => {
        fetch(dataUrl).then(res => res.blob()).then(blob => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `견적서_${info.customer || "미지정"}.jpg`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); setShowAdModal(false); setDownloadType(null); }, 500);
        });
      });
  };

  const handleAdConfirm = () => {
    if (downloadType === 'JPG') executeDownload();
    else if (downloadType === 'XLSX') { exportToExcel(); setShowAdModal(false); setDownloadType(null); }
  };

  const saveToLocalStorage = () => {
    localStorage.setItem('billData', JSON.stringify({ info, items, stampImage }));
    alert('임시 저장되었습니다.');
  };

  const loadFromLocalStorage = () => {
    const saved = localStorage.getItem('billData');
    if (saved) {
      const data = JSON.parse(saved);
      setInfo(data.info); setItems(data.items); setStampImage(data.stampImage);
      alert('데이터를 불러왔습니다.');
    } else alert('저장된 데이터가 없습니다.');
  };

  const addItem = () => setItems([...items, { id: Date.now(), name: '', spec: '', count: 1, price: 0 }]);
  const updateItem = (id: number, key: keyof BillItem, value: any) => setItems(items.map(i => i.id === id ? { ...i, [key]: value } : i));

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-slate-900 pb-10 text-left">
      <div className="no-print">
        <header className="bg-white border-b px-4 py-3 sticky top-0 z-20 flex justify-between items-center shadow-sm">
          <div>
            <img src="/images/smart_bill_logo.jpg" alt="로고" className="h-14 w-14" />
          </div>
          <button onClick={() => setShowPreview(true)} className="bg-blue-600 text-white px-5 py-2 rounded-full font-bold text-sm shadow-lg hover:bg-blue-700 transition">
            미리보기/다운로드
          </button>
        </header>

        <main className="max-w-7xl mx-auto p-4 flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-6">
            <section className="flex justify-center bg-white rounded-2xl p-2 shadow-sm border border-zinc-200" style={{ minHeight: '180px' }}>
              <iframe 
                src="https://ads-partners.coupang.com/widgets.html?id=963189&template=carousel&trackingCode=AF4084126&subId=&width=360&height=180&tsource=" 
                width="360" 
                height="180" 
                frameBorder="0" 
                scrolling="no" 
                referrerPolicy="unsafe-url"
                loading="lazy"
                style={{ display: 'block', maxWidth: '100%' }}
              ></iframe>
            </section>

            <div className="text-center w-full">
              <a href="https://iryan.kr/t8f69fuddg" target="_blank" rel="noreferrer" className="inline-block no-underline">
                <div className="bg-white border border-zinc-200 rounded-lg shadow-sm overflow-hidden max-w-[420px] mx-auto">
                  <img src="http://img.tenping.kr/Content/Upload/Images/2025111715060001_Dis_20251117151015.jpg" className="w-full h-auto" />
                  <div className="p-3 text-left text-lg text-zinc-800 font-light">의사가 설계한 맞춤형 건강기능식품 메디콕!</div>
                </div>
              </a>
            </div>

            <section className="bg-white rounded-2xl p-5 shadow-sm space-y-4 border border-zinc-200">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">사업자 정보</h2>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="사업자명" value={info.provider} className="input-style" onChange={e => setInfo({...info, provider: e.target.value})} />
                <input type="text" placeholder="사업자등록번호" value={info.bizNumber} className="input-style" onChange={e => handleBizNumberChange(e.target.value)} />
                <div className="relative">
                  <input type="date" className="input-style pr-1 pl-2 text-[12px]" value={info.date} onChange={e => setInfo({...info, date: e.target.value})} />
                </div>
                <input type="text" placeholder="받는분(귀하)" value={info.customer} className="input-style" onChange={e => setInfo({...info, customer: e.target.value})} />
                <input type="text" placeholder="업태(ex,페인트)" value={info.category} className="input-style" onChange={e => setInfo({...info, category: e.target.value})} />
                <input type="text" placeholder="종목(ex,제조업)" value={info.sector} className="input-style" onChange={e => setInfo({...info, sector: e.target.value})} />
                <input type="text" placeholder="주소" value={info.address} className="input-style col-span-2" onChange={e => setInfo({...info, address: e.target.value})} />
              </div>

              <div className="pt-2 flex flex-wrap gap-2">
                <button onClick={saveToLocalStorage} className="flex-1 min-w-[80px] text-xs bg-gray-50 border border-gray-300 py-3 rounded-xl font-bold text-gray-500">임시 저장</button>
                <button onClick={loadFromLocalStorage} className="flex-1 min-w-[80px] text-xs bg-gray-50 border border-gray-300 py-3 rounded-xl font-bold text-gray-500">불러오기</button>
                <button onClick={() => setInfo({provider:'',bizNumber:'',address:'',category:'',sector:'',customer:'',date:new Date().toISOString().split('T')[0],remark:''})} className="flex-1 min-w-[80px] text-xs bg-red-500 text-white py-3 rounded-xl font-bold">모두 지우기</button>
              </div>
              <div className="pt-2">
                <input type="file" accept="image/*" ref={fileInputRef} hidden onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setStampImage(reader.result as string);
                    reader.readAsDataURL(file);
                  }
                }} />
                <button onClick={() => fileInputRef.current?.click()} className="w-full text-xs bg-gray-50 border border-dashed border-gray-300 py-3 rounded-xl font-bold text-gray-500">
                  {stampImage ? "도장 교체하기" : "도장파일 업로드 (투명배경 권장)"}
                </button>
              </div>
            </section>
            
            <section className="space-y-3">
              <div className="flex justify-between items-center px-2">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">견적 내역</h2>
                <button onClick={addItem} className="text-blue-600 font-bold text-xs">+ 항목 추가</button>
              </div>
              {items.map((item) => (
                <div key={item.id} className="bg-white rounded-xl p-4 shadow-sm border border-zinc-200 flex flex-col gap-3">
                  <input type="text" placeholder="품명" className="border-b text-sm outline-none pb-1 font-medium" onChange={e => updateItem(item.id, 'name', e.target.value)} />
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" placeholder="규격" className="border-b text-xs outline-none pb-1" onChange={e => updateItem(item.id, 'spec', e.target.value)} />
                    <input type="number" placeholder="수량" className="border-b text-xs outline-none pb-1" onChange={e => updateItem(item.id, 'count', Number(e.target.value))} />
                    <input type="number" placeholder="단가" className="border-b text-xs outline-none pb-1" onChange={e => updateItem(item.id, 'price', Number(e.target.value))} />
                  </div>
                </div>
              ))}

              <div className="w-full mt-6 mb-4 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm flex flex-col items-center">
                <div className="w-full flex justify-center py-2 overflow-x-auto">
                  <iframe 
                    src="https://ads-partners.coupang.com/widgets.html?id=964078&template=carousel&trackingCode=AF4084126&subId=&width=800&height=140&tsource=" 
                    width="800" 
                    height="140" 
                    frameBorder="0" 
                    scrolling="no" 
                    referrerPolicy="unsafe-url"
                    style={{ minWidth: '800px' }} 
                  ></iframe>
                </div>
                <div className="w-full bg-gray-50 py-1 border-t border-zinc-100">
                  <p className="text-[10px] text-gray-400 text-center leading-tight">
                    이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-start overflow-y-auto pt-4 pb-20 px-2">
          <div className="w-full max-w-[800px] flex justify-end mb-2 no-print">
            <button onClick={() => setShowPreview(false)} className="bg-white/20 text-white w-10 h-10 rounded-full text-xl">✕</button>
          </div>
          
          <div className="preview-container bg-white shadow-2xl origin-top">
            <div ref={printRef} className="p-10 md:p-14 bg-white">
              <h1 className="text-4xl md:text-5xl text-center font-bold tracking-[1.5rem] md:tracking-[2.5rem] mb-12 border-b-4 border-double border-black pb-4">견 적 서</h1>
              
              <div className="flex justify-between items-start gap-8 mb-10 text-left">
                <div className="flex-1">
                  <p className="text-[12px] text-slate-500 mb-2 font-medium">일자: {info.date.replace(/-/g, '. ')}</p>
                  <p className="text-2xl font-bold border-b-2 border-black pb-1 inline-block min-w-[200px]">
                    {info.customer || '            '} <span className="text-lg font-normal">귀하</span>
                  </p>
                  <p className="text-sm mt-3 text-slate-600 font-medium">아래와 같이 견적합니다.</p>
                  <div className="mt-4 text-2xl font-black">합계금액: ₩{totalAmount.toLocaleString()}</div>
                </div>

                <div className="w-[400px] shrink-0">
                  <table className="border-collapse border-2 border-black w-full text-[11px] table-fixed">
                    <tbody>
                      <tr>
                        <td className="border border-black p-1 text-center bg-slate-100 font-bold w-10" rowSpan={4}>공<br/>급<br/>자</td>
                        <td className="border border-black p-2 bg-slate-100 font-bold text-center w-20">등록번호</td>
                        <td className="border border-black p-2 font-bold" colSpan={3}>{info.bizNumber}</td>
                      </tr>
                      <tr>
                        <td className="border border-black p-2 bg-slate-100 font-bold text-center">상호</td>
                        <td className="border border-black p-2 font-bold">{info.provider}</td>
                        <td className="border border-black p-2 bg-slate-100 font-bold text-center">서명</td>
                        <td className="border border-black p-0 text-center relative w-[80px] h-[60px]">
                          <div className="absolute inset-0 flex items-center justify-end pr-3 font-bold text-[13px] z-0">(인)</div>
                          {stampImage && <img src={stampImage} className="relative z-10 w-full h-full object-contain mix-blend-multiply" style={{ maxWidth: '100%', maxHeight: '100%', display: 'block', margin: '0 auto' }} />}
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

              <table className="w-full border-collapse border-2 border-black text-[12px] mb-8">
                <thead className="bg-slate-100 font-bold">
                  <tr className="h-10 text-center">
                    <td className="border border-black w-10">NO</td>
                    <td className="border border-black">품 명 / 규 격</td>
                    <td className="border border-black w-14">수 량</td>
                    <td className="border border-black w-28">단 가</td>
                    <td className="border border-black w-32">금 액</td>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={item.id} className="h-10 text-center">
                      <td className="border border-black text-slate-400">{i + 1}</td>
                      <td className="border border-black text-left px-3 font-bold">{item.name} {item.spec && <span className="font-normal text-slate-500 text-[10px] ml-1">({item.spec})</span>}</td>
                      <td className="border border-black">{item.count}</td>
                      <td className="border border-black text-right px-2">{item.price.toLocaleString()}</td>
                      <td className="border border-black text-right px-2 font-bold">{(item.count * item.price).toLocaleString()}</td>
                    </tr>
                  ))}
                  {[...Array(Math.max(0, 10 - items.length))].map((_, i) => (
                    <tr key={i} className="h-10"><td className="border border-black" colSpan={5}></td></tr>
                  ))}
                  <tr className="h-11 bg-slate-50 font-bold text-center">
                    <td className="border border-black" colSpan={2}>합 계</td>
                    <td className="border border-black">{items.reduce((a, b) => a + b.count, 0)}</td>
                    <td className="border border-black"></td>
                    <td className="border border-black text-right px-2 text-blue-800">₩{totalAmount.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
              <div className="border-2 border-black p-5 text-[11px] leading-relaxed bg-slate-50/50 text-left">
                <p className="font-bold underline mb-2">※ 비고 및 특약사항</p>
                <p>{info.remark || "특이사항 없음"}</p>
              </div>
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900/90 grid grid-cols-3 gap-3 no-print z-[60]">
            <button onClick={() => { setDownloadType('JPG'); setShowAdModal(true); }} className="bg-white py-4 rounded-xl font-bold text-sm">이미지 다운로드</button>
            <button onClick={() => { setDownloadType('XLSX'); setShowAdModal(true); }} className="bg-green-600 text-white py-4 rounded-xl font-bold text-sm">엑셀 다운로드</button>
            <button onClick={() => setTimeout(() => window.print(), 200)} className="bg-blue-600 text-white py-4 rounded-xl font-bold text-sm">PDF 인쇄</button>
          </div>
        </div>
      )}

      {showAdModal && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md text-center space-y-4 shadow-2xl">
            <h3 className="text-xl font-black">다운로드 준비 완료!</h3>
            <p className="text-sm text-slate-500">아래 광고를 클릭하시면 파일 저장이 시작됩니다.</p>
            
            <div onClick={() => { handleAdConfirm(); }} className="cursor-pointer border border-blue-100 rounded-2xl overflow-hidden hover:opacity-90 transition">
              <a href="https://iryan.kr/t8f69fuddg" target="_blank" rel="noreferrer" className="block">
                <img src="http://img.tenping.kr/Content/Upload/Images/2025111715060001_Dis_20251117151015.jpg" className="w-full h-auto" />
                <div className="p-3 bg-blue-50 text-blue-700 font-bold text-sm">의사가 설계한 맞춤형 건강기능식품 메디콕! (클릭 시 저장)</div>
              </a>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <button onClick={() => setShowAdModal(false)} className="py-4 rounded-2xl bg-gray-100 font-bold text-slate-400">취소</button>
              <button onClick={handleAdConfirm} className="py-4 rounded-2xl bg-blue-600 text-white font-bold">광고 확인 및 저장</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .input-style { width: 100%; padding: 0.75rem; background-color: #f8fafc; border-radius: 0.75rem; font-size: 0.85rem; outline: none; border: 1px solid #e2e8f0; }
        .preview-container { width: 800px; min-width: 800px; background: white; }
        @media (max-width: 800px) { .preview-container { transform: scale(${(typeof window !== 'undefined' ? window.innerWidth - 32 : 800) / 800}); } }
        input[type="date"]::-webkit-calendar-picker-indicator {
          margin-left: -10px;
          padding: 0;
        }
        @media print {
          .no-print { display: none !important; }
          .fixed { position: static !important; }
          .preview-container { transform: scale(1) !important; width: 100% !important; margin: 0 !important; }
        }
      `}</style>
    </div>
  );
}