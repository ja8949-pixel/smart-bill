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
  // 다운로드 타입을 관리하기 위한 상태 추가
  const [downloadType, setDownloadType] = useState<'JPG' | 'XLSX' | null>(null);

  const printRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalAmount = items.reduce((acc, cur) => acc + (cur.price * cur.count), 0);

  // 엑셀 스타일 정의
  const style = {
    title: { font: { sz: 24, bold: true }, alignment: { vertical: "center", horizontal: "center" } },
    header: { fill: { fgColor: { rgb: "F1F5F9" } }, font: { bold: true, sz: 10 }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }, alignment: { vertical: "center", horizontal: "center" } },
    cell: { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }, alignment: { vertical: "center", horizontal: "center" }, font: { sz: 10 } },
    cellLeft: { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }, alignment: { vertical: "center", horizontal: "left" }, font: { sz: 10, bold: true } },
    cellRight: { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }, alignment: { vertical: "center", horizontal: "right" }, font: { sz: 10 } },
    summary: { fill: { fgColor: { rgb: "F8FAFC" } }, font: { bold: true, color: { rgb: "1E40AF" } }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }, alignment: { vertical: "center", horizontal: "right" } }
  };

    const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([[]]);

    // 1. 병합 정보를 담을 배열을 따로 만듭니다. (타입 에러 방지 핵심)
    const merges: XLSX.Range[] = [];

    // 2. 제목 (A1)
    ws["A1"] = { v: "견 적 서", s: style.title };
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } });

    // 3. 좌측 정보
    ws["A3"] = { v: `일자: ${info.date.replace(/-/g, '. ')}`, s: { font: { sz: 10, color: { rgb: "64748B" } } } };
    ws["A4"] = { v: `${info.customer || ""} 귀하`, s: { font: { sz: 16, bold: true }, border: { bottom: { style: "medium" } } } };
    ws["A5"] = { v: "아래와 같이 견적합니다.", s: { font: { sz: 10 } } };
    ws["A6"] = { v: `합계금액: ₩${totalAmount.toLocaleString()}`, s: { font: { sz: 14, bold: true } } };

    // 4. 우측 공급자 테이블
    const providerRows = [
      ["공급자", "등록번호", info.bizNumber, "", ""],
      ["", "상호", info.provider, "서명", "(인)"],
      ["", "주소", info.address, "", ""],
      ["", "업태", info.category, "종목", info.sector]
    ];

    providerRows.forEach((row, idx) => {
      const r = 2 + idx;
      if (idx === 0) {
        ws[XLSX.utils.encode_cell({ r, c: 3 })] = { v: "공\n급\n자", s: style.header };
        merges.push({ s: { r: 2, c: 3 }, e: { r: 5, c: 3 } });
      }
      ws[XLSX.utils.encode_cell({ r, c: 4 })] = { v: row[1], s: style.header };
      ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: row[2], s: style.cell };
      
      if (idx === 0) merges.push({ s: { r: 2, c: 5 }, e: { r: 2, c: 6 } });
      if (idx === 2) merges.push({ s: { r: 4, c: 5 }, e: { r: 4, c: 6 } });
      
      if (row[3]) {
        ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: row[2], s: style.cell };
        ws[XLSX.utils.encode_cell({ r, c: 6 })] = { v: row[4] || "", s: style.cell };
      }
    });

    ws["F4"] = { v: info.provider, s: style.cell };
    ws["G4"] = { v: "(인)", s: style.cell };
    ws["F6"] = { v: info.category, s: style.cell };
    ws["G6"] = { v: info.sector, s: style.cell };
    ws["G3"] = { v: "", s: style.cell }; 

    // 5. 품목 테이블 헤더
    const headerLabels = ["NO", "품 명 / 규 격", "", "", "수 량", "단 가", "금 액"];
    headerLabels.forEach((label, c) => {
      ws[XLSX.utils.encode_cell({ r: 7, c })] = { v: label, s: style.header };
    });
    merges.push({ s: { r: 7, c: 1 }, e: { r: 7, c: 3 } });

    // 6. 품목 데이터
    items.forEach((item, i) => {
      const r = 8 + i;
      ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: i + 1, s: style.cell };
      ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: `${item.name} ${item.spec ? `(${item.spec})` : ""}`, s: style.cellLeft };
      ws[XLSX.utils.encode_cell({ r, c: 4 })] = { v: item.count, s: style.cell };
      ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: item.price, s: style.cellRight };
      ws[XLSX.utils.encode_cell({ r, c: 6 })] = { v: item.count * item.price, s: style.cellRight };
      
      merges.push({ s: { r, c: 1 }, e: { r, c: 3 } });
      ws[XLSX.utils.encode_cell({ r, c: 2 })] = { s: style.cell };
      ws[XLSX.utils.encode_cell({ r, c: 3 })] = { s: style.cell };
    });

    // 7. 합계행
    const lastR = 8 + items.length;
    ws[XLSX.utils.encode_cell({ r: lastR, c: 0 })] = { v: "합 계 (TOTAL)", s: style.header };
    merges.push({ s: { r: lastR, c: 0 }, e: { r: lastR, c: 3 } });
    ws[XLSX.utils.encode_cell({ r: lastR, c: 4 })] = { v: items.reduce((a, b) => a + b.count, 0), s: style.header };
    ws[XLSX.utils.encode_cell({ r: lastR, c: 5 })] = { v: "", s: style.header };
    ws[XLSX.utils.encode_cell({ r: lastR, c: 6 })] = { v: `₩${totalAmount.toLocaleString()}`, s: style.summary };

    // 8. 비고
    const remarkR = lastR + 2;
    ws[XLSX.utils.encode_cell({ r: remarkR, c: 0 })] = { v: "※ 비고 및 특약사항", s: { font: { bold: true, underline: true } } };
    ws[XLSX.utils.encode_cell({ r: remarkR + 1, c: 0 })] = { v: info.remark || "특이사항 없음", s: { alignment: { wrapText: true, vertical: "top" } } };
    merges.push({ s: { r: remarkR + 1, c: 0 }, e: { r: remarkR + 3, c: 6 } });

    // 9. 만든 병합 정보들을 시트에 할당
    ws["!merges"] = merges;

    // 10. 컬럼 너비 및 범위 설정
    ws["!cols"] = [{ wch: 5 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 15 }];
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: remarkR + 4, c: 6 } });

    XLSX.utils.book_append_sheet(wb, ws, "견적서");
    XLSX.writeFile(wb, `견적서_${info.customer || "미지정"}.xlsx`);
  };

  const saveToLocalStorage = () => {
    const data = { info, items, stampImage };
    localStorage.setItem('billData', JSON.stringify(data));
    alert('임시 저장되었습니다.');
  };

  const loadFromLocalStorage = () => {
    const savedData = localStorage.getItem('billData');
    if (savedData) {
      const data = JSON.parse(savedData);
      setInfo(data.info);
      setItems(data.items);
      setStampImage(data.stampImage);
      alert('임시 저장된 데이터를 불러왔습니다.');
    } else {
      alert('저장된 데이터가 없습니다.');
    }
  };

  const resetData = () => {
    setInfo({
      provider: '', bizNumber: '', address: '', category: '', sector: '', customer: '',
      date: new Date().toISOString().split('T')[0], remark: ''
    });
    setItems([{ id: Date.now(), name: '', spec: '', count: 1, price: 0 }]);
    setStampImage(null);
    localStorage.removeItem('billData');
    alert('데이터가 초기화되었습니다.');
  };

  // JPG 다운로드 클릭 시 실행
  const handleDownloadClick = () => {
    setDownloadType('JPG');
    setShowAdModal(true);
  };

  // 엑셀 다운로드 클릭 시 실행
  const handleExcelClick = () => {
    setDownloadType('XLSX');
    setShowAdModal(true);
  };

  // 광고 확인 버튼 클릭 시 실제 다운로드 실행 로직
  const handleAdConfirm = () => {
    if (downloadType === 'JPG') {
      executeDownload();
    } else if (downloadType === 'XLSX') {
      exportToExcel();
      setShowAdModal(false);
      setDownloadType(null);
    }
  };

  const executeDownload = () => {
    if (printRef.current === null) return;
    toJpeg(printRef.current, { quality: 0.95, backgroundColor: '#ffffff' })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `견적서_${info.customer || "미지정"}.jpg`;
        link.href = dataUrl;
        link.click();
        setShowAdModal(false); 
        setDownloadType(null);
      })
      .catch((err) => console.error('JPG 저장 실패:', err));
  };

  const addItem = () => {
    setItems([...items, { id: Date.now(), name: '', spec: '', count: 1, price: 0 }]);
  };

  const updateItem = (id: number, key: keyof BillItem, value: any) => {
    setItems(items.map(i => i.id === id ? { ...i, [key]: value } : i));
  };

  const coupangDynamicUrl = "https://ads-partners.coupang.com/widgets.html?id=963189&template=carousel&trackingCode=AF4084126&subId=&width=360&height=180&tsource=";

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-slate-900 pb-10 text-left">
      <div className="no-print">
        <header className="bg-white border-b px-4 py-3 sticky top-0 z-20 flex justify-between items-center shadow-sm">
          <div>
            <h1 className="text-lg font-black text-blue-600 tracking-tighter italic leading-none">SMART BILL</h1>
            <p className="text-[10px] text-black font-medium mt-1 ml-0.5 uppercase tracking-tighter">made by 진아 ʕ  ̳• ⩊ • ̳ʔ</p>
          </div>
          <button onClick={() => setShowPreview(true)} className="bg-blue-600 text-white px-5 py-2 rounded-full font-bold text-sm shadow-lg hover:bg-blue-700 transition">
            미리보기/다운로드
          </button>
        </header>

        <main className="max-w-7xl mx-auto p-4 flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-6">
            <section className="flex justify-center bg-white rounded-2xl p-2 shadow-sm border border-zinc-200 overflow-hidden">
              <iframe src={coupangDynamicUrl} width="360" height="180" frameBorder="0" scrolling="no" referrerPolicy="unsafe-url"></iframe>
            </section>

            {/* 요청하신 메디콕 광고 시작 (TSX 변환 버전) */}
          <div style={{ display: 'inline-block', width: '100%', textAlign: 'center' }}>
            <a href="https://iryan.kr/t8f69fuddg" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              <div style={{ display: 'inline-block' }}>
                <div style={{ margin: '10px', background: '#fff', border: '1px solid #dae2e3', borderRadius: '3px', boxShadow: '1px 1px 1px rgba(0,0,0,0.15)' }}>
                  <div style={{ width: '100%', maxWidth: '420px' }}>
                    <img 
                      src="http://img.tenping.kr/Content/Upload/Images/2025111715060001_Dis_20251117151015.jpg" 
                      style={{ width: '100%', height: 'auto', borderRadius: '0', display: 'block' }} 
                      alt="광고 이미지" 
                    />
                  </div>
                  <div style={{ margin: '10px' }}>
                    <div style={{ 
                      margin: '5px 0', 
                      color: '#333', 
                      fontSize: '18px', 
                      lineHeight: '1.4em', 
                      height: '2.6em', 
                      display: '-webkit-box', 
                      textOverflow: 'ellipsis', 
                      WebkitLineClamp: 2, 
                      WebkitBoxOrient: 'vertical', 
                      wordWrap: 'break-word', 
                      fontWeight: 300, 
                      textAlign: 'left', 
                      overflow: 'hidden', 
                      maxWidth: '400px' 
                    }}>
                      의사가 설계한 맞춤형 건강기능식품 메디콕!
                    </div>
                  </div>
                </div>
              </div>
            </a>
          </div>
          {/* 요청하신 메디콕 광고 끝 */}

            <section className="bg-white rounded-2xl p-5 shadow-sm space-y-4 border border-zinc-200">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">사업자 정보</h2>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="사업자명" value={info.provider} className="input-style" onChange={e => setInfo({...info, provider: e.target.value})} />
                <input type="text" placeholder="사업자등록번호" value={info.bizNumber} className="input-style" onChange={e => setInfo({...info, bizNumber: e.target.value})} />
                <input type="date" className="input-style" value={info.date} onChange={e => setInfo({...info, date: e.target.value})} />
                <input type="text" placeholder="받는분(귀하)" value={info.customer} className="input-style" onChange={e => setInfo({...info, customer: e.target.value})} />
                <input type="text" placeholder="업태" value={info.category} className="input-style" onChange={e => setInfo({...info, category: e.target.value})} />
                <input type="text" placeholder="종목" value={info.sector} className="input-style" onChange={e => setInfo({...info, sector: e.target.value})} />
                <input type="text" placeholder="주소" value={info.address} className="input-style col-span-2" onChange={e => setInfo({...info, address: e.target.value})} />
              </div>
              <div className="pt-2 flex justify-between gap-2">
                <button onClick={saveToLocalStorage} className="flex-1 text-xs bg-gray-50 border border-gray-300 py-3 rounded-xl font-bold hover:bg-gray-100 transition text-gray-500">임시 저장</button>
                <button onClick={loadFromLocalStorage} className="flex-1 text-xs bg-gray-50 border border-gray-300 py-3 rounded-xl font-bold hover:bg-gray-100 transition text-gray-500">불러오기</button>
                <button onClick={resetData} className="flex-1 text-xs bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600 transition">초기화</button>
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
                <button onClick={() => fileInputRef.current?.click()} className="w-full text-xs bg-gray-50 border border-dashed border-gray-300 py-3 rounded-xl font-bold hover:bg-gray-100 transition text-gray-500">
                  {stampImage ? "도장 교체하기" : "도장파일 업로드"}
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
                  <input type="text" placeholder="품명" className="border-b text-sm outline-none pb-1 focus:border-blue-500 font-medium" onChange={e => updateItem(item.id, 'name', e.target.value)} />
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" placeholder="규격" className="border-b text-xs outline-none pb-1" onChange={e => updateItem(item.id, 'spec', e.target.value)} />
                    <input type="number" placeholder="수량" className="border-b text-xs outline-none pb-1" onChange={e => updateItem(item.id, 'count', Number(e.target.value))} />
                    <input type="number" placeholder="단가" className="border-b text-xs outline-none pb-1" onChange={e => updateItem(item.id, 'price', Number(e.target.value))} />
                  </div>
                </div>
              ))}
            </section>
          </div>
        </main>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-start overflow-y-auto pt-4 pb-20 px-2">
          <div className="w-full max-w-[800px] flex justify-end mb-2 no-print">
            <button onClick={() => setShowPreview(false)} className="bg-white/20 text-white w-10 h-10 rounded-full text-xl hover:bg-white/40 transition">✕</button>
          </div>
          
          <div className="preview-container bg-white shadow-2xl origin-top">
            <div ref={printRef} className="p-10 md:p-14 bg-white">
              <h1 className="text-4xl md:text-5xl text-center font-bold tracking-[1.5rem] md:tracking-[2.5rem] mb-12 border-b-4 border-double border-black pb-4">견 적 서</h1>
              
              <div className="flex justify-between items-start gap-8 mb-10">
                <div className="flex-1 flex flex-col py-1">
                  <p className="text-[12px] text-slate-500 mb-2 font-medium">일자: {info.date.replace(/-/g, '. ')}</p>
                  <div className="mb-6">
                    <p className="text-2xl font-bold border-b-2 border-black pb-1 inline-block min-w-[200px]">
                      {info.customer || '            '} <span className="text-lg font-normal">귀하</span>
                    </p>
                    <p className="text-sm mt-3 text-slate-600 font-medium tracking-tight">아래와 같이 견적합니다.</p>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-baseline gap-2 inline-flex pr-4">
                      <span className="text-2xl font-black tracking-tight text-slate-900">합계금액:</span>
                      <span className="text-2xl font-black tracking-tight text-slate-900">₩{totalAmount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="w-[400px] min-w-[400px] shrink-0">
                  <table className="border-collapse border-2 border-black w-full text-[11px] table-fixed">
                    <colgroup>
                      <col style={{ width: '30px' }} />
                      <col style={{ width: '70px' }} />
                      <col style={{ width: 'auto' }} />
                      <col style={{ width: '70px' }} />
                      <col style={{ width: '70px' }} />
                    </colgroup>

                    <tbody>
                      <tr className="h-12">
                        <td className="border border-black p-1 text-center bg-slate-100 font-bold" rowSpan={4}>공<br/>급<br/>자</td>
                        <td className="border border-black p-2 bg-slate-100 font-bold text-center">사업자<br/>등록번호</td>
                        <td className="border border-black p-2 font-bold text-[12px]" colSpan={3}>{info.bizNumber}</td>
                      </tr>

                      <tr className="h-14">
                        <td className="border border-black p-2 bg-slate-100 font-bold text-center">상호</td>
                        <td className="border border-black p-2 font-bold text-[13px]" colSpan={1}>{info.provider}</td>
                        <td className="border border-black p-2 bg-slate-100 font-bold text-center">서명</td>
                        <td className="border border-black p-0 text-right relative min-w-[60px]">
                          <div className="pr-3 py-4 font-bold text-[13px]">(인)</div>
                          {stampImage && (
                            <img src={stampImage} alt="인감" className="absolute top-1/2 -translate-y-1/2 right-0.5 w-12 h-12 object-contain mix-blend-multiply" />
                          )}
                        </td>
                      </tr>

                      <tr className="h-12">
                        <td className="border border-black p-2 bg-slate-100 font-bold text-center">주소</td>
                        <td className="border border-black p-2 text-[10px] leading-tight" colSpan={3}>{info.address}</td>
                      </tr>

                      <tr className="h-12">
                        <td className="border border-black p-2 bg-slate-100 font-bold text-center">업태</td>
                        <td className="border border-black p-2 text-center">{info.category}</td>
                        <td className="border border-black p-2 bg-slate-100 font-bold text-center">종목</td>
                        <td className="border border-black p-2 text-center" colSpan={1}>{info.sector}</td>
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
                    <td className="border border-black" colSpan={2}>합 계 (TOTAL)</td>
                    <td className="border border-black">{items.reduce((a, b) => a + b.count, 0)}</td>
                    <td className="border border-black"></td>
                    <td className="border border-black text-right px-2 text-blue-800 text-[14px]">₩{totalAmount.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>

              <div className="border-2 border-black p-5 text-[11px] leading-relaxed bg-slate-50/50">
                <p className="font-bold text-slate-900 mb-3 underline underline-offset-4 tracking-wider">※ 비고 및 특약사항</p>
                <div className="flex flex-col gap-1 text-slate-700 font-semibold mb-3">
                  <div>• 이 견적서는 검인받지 않고 사용할 수 있음.</div>
                  <div>• 공사 절충 합의 견적 / 부가세 별도 첨부</div>
                </div>
                <div className="border-t border-slate-300 pt-3 text-slate-600 font-medium whitespace-pre-wrap min-h-[40px]">
                  {info.remark ? `• 추가사항: ${info.remark}` : "- 추가 특이사항 없음"}
                </div>
              </div>
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900/90 backdrop-blur grid grid-cols-3 gap-3 no-print z-[60]">
            <button onClick={handleDownloadClick} className="bg-white text-slate-900 py-4 rounded-xl font-bold text-sm shadow-lg active:scale-95 transition">이미지(JPG)<br/>다운로드</button>
            <button 
              onClick={handleExcelClick} 
              className="bg-green-600 text-white py-4 rounded-xl font-bold text-sm md:text-sm shadow-lg active:scale-95 transition">엑셀(Excel)<br/>다운로드</button>
            <button onClick={() => window.print()} className="bg-blue-600 text-white py-4 rounded-xl font-bold text-sm shadow-lg active:scale-95 transition">PDF 출력 / 인쇄</button>
          </div>
        </div>
      )}

      {showAdModal && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md text-center space-y-4 shadow-2xl">
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900">다운로드 준비 완료!</h3>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">아래 광고를 클릭해주시면<br/>무료 {downloadType === 'JPG' ? '이미지' : '엑셀'} 다운로드가 시작됩니다. ʕ •ᴥ•ʔ</p>
            </div>
            
            {/* 요청하신 메디콕 광고 시작 */}
            <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto', fontSize: '14px', textAlign: 'left' }}>
              <div style={{ marginBottom: '5px', padding: '6px', display: 'block', background: '#ffffff', border: '1px solid #dae2e3', overflow: 'hidden', borderRadius: '12px' }}>
                <div style={{ float: 'left', width: '80px', height: '80px', lineHeight: '0', marginRight: '10px', display: 'block' }}>
                  <a href="https://iryan.kr/t8f69fuddg" target="_blank" rel="noreferrer">
                    <img src="http://img.tenping.kr/Content/Upload/Images/2025111715060001_Squa_20251117151015.jpg?RS=170x170" alt="" width="80" height="80" style={{ borderRadius: '8px' }} />
                  </a>
                </div>
                <div>
                  <div style={{ height: '5rem', lineHeight: '1.6', margin: '0', padding: '0', display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
                    <strong>
                      <a href="https://iryan.kr/t8f69fuddg" target="_blank" rel="noreferrer" style={{ color: '#333333', fontSize: '17px', fontWeight: 'bold', fontFamily: 'Malgun Gothic, sans-serif', textDecoration: 'none' }}>
                        의사가 설계한 맞춤형 건강기능식품 메디콕!
                      </a>
                    </strong>
                  </div>
                </div>
              </div>
            </div>
            {/* 요청하신 메디콕 광고 끝 */}

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setShowAdModal(false); setDownloadType(null); }} className="py-4 rounded-2xl text-sm font-bold text-slate-400 bg-gray-100">취소</button>
              <button onClick={handleAdConfirm} className="py-4 rounded-2xl text-sm font-bold text-white bg-blue-600 shadow-lg shadow-blue-200">광고 확인 및 저장</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .input-style { width: 100%; padding: 0.75rem; background-color: #f8fafc; border-radius: 0.75rem; font-size: 0.85rem; outline: none; border: 1px solid #e2e8f0; }
        .input-style:focus { border-color: #3b82f6; background-color: #fff; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); }
        .preview-container { width: 800px; min-width: 800px; background: white; }
        @media (max-width: 800px) { .preview-container { transform: scale(${typeof window !== 'undefined' ? (window.innerWidth - 32) / 800 : 1}); } }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          .fixed { position: static !important; }
          .preview-container { transform: scale(0.98) !important; width: 100% !important; margin: 0 !important; box-shadow: none !important; border: none !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}