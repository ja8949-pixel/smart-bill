'use client';

import { useState, useRef } from 'react';
import { toJpeg } from 'html-to-image';
import ExcelJS from 'exceljs';

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
  const [showPreview, setShowPreview] = useState(false);
  const [showAdModal, setShowAdModal] = useState(false); 
  const [downloadType, setDownloadType] = useState<'JPG' | 'XLSX' | null>(null);

  const printRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 합계 계산 (숫자가 아닐 경우 0 처리)
  const totalAmount = items.reduce((acc, cur) => {
    const c = typeof cur.count === 'string' ? parseInt(cur.count) || 0 : cur.count;
    const p = typeof cur.price === 'string' ? parseInt(cur.price) || 0 : cur.price;
    return acc + (c * p);
  }, 0);

  const handleBizNumberChange = (val: string) => {
    const onlyNum = val.replace(/[^0-9]/g, '');
    if (onlyNum.length <= 10) setInfo({ ...info, bizNumber: onlyNum });
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
      tot.value = `합계금액: ₩${totalAmount.toLocaleString()}`;
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

      // 6. 합계행
      const tr = startRow + 1 + items.length;
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
        <div className="bg-blue-700 text-white text-center py-2 px-4 font-bold text-sm md:text-base">
          📢 복잡한 견적서 작업 그만!<br/> 누구나 10초면 뚝딱 만드는 무료 견적서
        </div>
        <header className="bg-white border-b px-4 py-3 sticky top-0 z-20 flex justify-between items-center shadow-sm">
          <img src="/images/smart_bill_logo.jpg" alt="로고" className="h-14 w-14" />
          <button onClick={() => setShowPreview(true)} className="bg-blue-600 text-white px-5 py-2 rounded-full font-bold text-sm shadow-lg">미리보기/다운로드</button>
        </header>

        <main className="max-w-7xl mx-auto p-4 flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-6">
            <section className="flex justify-center bg-white rounded-2xl p-2 border border-zinc-200 shadow-sm">
              <iframe src="https://ads-partners.coupang.com/widgets.html?id=963189&template=carousel&trackingCode=AF4084126&width=360&height=180" width="360" height="180" frameBorder="0" scrolling="no" loading="lazy"></iframe>
            </section>

            <section className="bg-white rounded-2xl p-5 shadow-sm space-y-4 border border-zinc-200">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">사업자 정보</h2>
              
              {/* grid에 gap-3을 유지하면서 각 항목이 동일한 비율을 갖도록 설정 */}
              <div className="grid grid-cols-2 gap-3 w-full">
                <input type="text" placeholder="사업자명" value={info.provider} className="input-style" onChange={e => setInfo({...info, provider: e.target.value})} />
                <input type="text" placeholder="사업자번호" value={info.bizNumber} className="input-style" onChange={e => handleBizNumberChange(e.target.value)} />
                
                {/* 날짜 입력칸: min-w-0을 주어 부모 그리드를 벗어나지 않게 고정 */}
                <input 
                  type="date" 
                  className="input-style min-w-0 w-full" 
                  value={info.date} 
                  onChange={e => setInfo({...info, date: e.target.value})} 
                />
                
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
                  if (file) { 
                    const reader = new FileReader(); 
                    reader.onloadend = () => setStampImage(reader.result as string); 
                    reader.readAsDataURL(file); 
                  }
                }} 
              />
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="w-full text-xs bg-gray-50 border border-dashed py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition"
              >
                {stampImage ? "✅ 도장 등록됨 (교체하려면 클릭)" : "📸 도장/인감 사진 업로드"}
              </button>
            </div>
            
            <section className="space-y-3">
              <div className="flex justify-between items-center px-2">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">견적 내역</h2>
                <button onClick={addItem} className="text-blue-600 font-bold text-xs">+ 항목 추가</button>
              </div>
              {items.map((item) => (
                <div key={item.id} className="bg-white rounded-xl p-4 shadow-sm border border-zinc-200 flex flex-col gap-3">
                  <input type="text" placeholder="품명" value={item.name} className="border-b text-sm outline-none pb-1 font-medium" onChange={e => updateItem(item.id, 'name', e.target.value)} />
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" placeholder="규격" value={item.spec} className="border-b text-xs outline-none pb-1" onChange={e => updateItem(item.id, 'spec', e.target.value)} />
                    <input type="number" placeholder="수량" value={item.count} className="border-b text-xs outline-none pb-1" onChange={e => updateItem(item.id, 'count', e.target.value)} />
                    <input type="number" placeholder="단가" value={item.price} className="border-b text-xs outline-none pb-1" onChange={e => updateItem(item.id, 'price', e.target.value)} />
                  </div>
                </div>
              ))}
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
            <button onClick={() => setShowPreview(false)} className="bg-white/20 text-white w-10 h-10 rounded-full text-xl">✕</button>
          </div>
          
          <div className="preview-container bg-white shadow-2xl origin-top">
            <div ref={printRef} className="p-10 md:p-14 bg-white">
              <h1 className="text-4xl md:text-5xl text-center font-bold tracking-[1.5rem] md:tracking-[2.5rem] mb-12 border-b-4 border-double border-black pb-4">견 적 서</h1>
              <div className="flex justify-between items-start gap-8 mb-10 text-left">
                <div className="flex-1">
                  <p className="text-[12px] text-slate-500 mb-2 font-medium">일자: {info.date.replace(/-/g, '. ')}</p>
                  <p className="text-2xl font-bold border-b-2 border-black pb-1 inline-block min-w-[200px]">{info.customer || '            '} <span className="text-lg font-normal">귀하</span></p>
                  <p className="text-sm mt-3 text-slate-600 font-medium">아래와 같이 견적합니다.</p>
                  <div className="mt-4 text-2xl font-black">합계금액: ₩{totalAmount.toLocaleString()}</div>
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
                        {/* 1. (인) 표시: 약간 흐리게(opacity-40) 설정 */}
                        <div className="absolute inset-0 flex items-center justify-end pr-3 font-bold text-[13px] z-0 opacity-40">
                          (인)
                        </div>

                        {/* 2. 도장 이미지: flex를 사용해 강제로 우측 끝으로 정렬 */}
                        {stampImage && (
                          <div className="relative z-10 flex justify-end items-center h-full pr-1">
                            <img 
                              src={stampImage} 
                              className="w-12 h-12 object-contain mix-blend-multiply" 
                              alt="도장"
                            />
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

              <table className="w-full border-collapse border-2 border-black text-[12px] mb-8">
                <thead className="bg-slate-100 font-bold text-center h-10">
                  <tr>
                    <td className="border border-black w-10">NO</td><td className="border border-black">품 명 / 규 격</td>
                    <td className="border border-black w-14">수 량</td><td className="border border-black w-28">단 가</td><td className="border border-black w-32">금 액</td>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const c = Number(item.count) || 0;
                    const p = Number(item.price) || 0;
                    return (
                      <tr key={item.id} className="h-10 text-center">
                        <td className="border border-black text-slate-400">{i + 1}</td>
                        <td className="border border-black text-left px-3 font-bold">{item.name} {item.spec && <span className="font-normal text-slate-500 text-[10px] ml-1">({item.spec})</span>}</td>
                        <td className="border border-black">{item.count}</td>
                        <td className="border border-black text-right px-2">{p ? p.toLocaleString() : ''}</td>
                        <td className="border border-black text-right px-2 font-bold">{ (c * p) ? (c * p).toLocaleString() : ''}</td>
                      </tr>
                    );
                  })}
                  <tr className="h-11 bg-slate-50 font-bold text-center">
                    <td className="border border-black" colSpan={2}>합 계</td>
                    <td className="border border-black">{items.reduce((a, b) => a + (Number(b.count) || 0), 0) || ''}</td>
                    <td className="border border-black"></td>
                    <td className="border border-black text-right px-2 text-blue-800">₩{totalAmount.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
              <div className="border-2 border-black p-5 text-[11px] bg-slate-50/50 whitespace-pre-wrap text-left">
                <p className="font-bold underline mb-2">※ 비고 및 특약사항</p>
                <p>{info.remark || "특이사항 없음"}</p>
              </div>
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900/90 grid grid-cols-2 gap-2 no-print z-[60]">
            <button onClick={() => { setDownloadType('JPG'); setShowAdModal(true); }} className="bg-white py-4 rounded-xl font-bold text-sm">이미지 다운로드</button>
            {/* <button onClick={() => { setDownloadType('XLSX'); setShowAdModal(true); }} className="bg-green-600 text-white py-4 rounded-xl font-bold text-sm">엑셀 다운로드</button> */}
            <button onClick={() => setTimeout(() => window.print(), 200)} className="bg-blue-600 text-white py-4 rounded-xl font-bold text-sm">PDF 인쇄</button>
          </div>
        </div>
      )}

      {showAdModal && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md text-center space-y-4 shadow-2xl">
            <h3 className="text-xl font-black">다운로드 준비 완료!</h3>
            <p className="text-sm text-slate-500">아래 광고를 클릭하시면 파일 저장이 시작됩니다.</p>
            <div onClick={handleAdConfirm} className="cursor-pointer border border-blue-100 rounded-2xl overflow-hidden">
              <a href="https://iryan.kr/t8f69fuddg" target="_blank" rel="noreferrer" className="block">
                <img src="http://img.tenping.kr/Content/Upload/Images/2025111715060001_Dis_20251117151015.jpg" className="w-full" />
                <div className="p-3 bg-blue-50 text-blue-700 font-bold text-sm">맞춤형 건강기능식품 메디콕! (클릭 시 저장)</div>
              </a>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button onClick={() => setShowAdModal(false)} className="py-4 rounded-2xl bg-gray-100 font-bold text-slate-400">취소</button>
              <button onClick={handleAdConfirm} className="py-4 rounded-2xl bg-blue-600 text-white font-bold">광고 보고 저장하기</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .input-style { width: 100%; padding: 0.75rem; background-color: #f8fafc; border-radius: 0.75rem; font-size: 0.85rem; outline: none; border: 1px solid #e2e8f0; }
        .preview-container { width: 800px; min-width: 800px; background: white; }
        @media (max-width: 800px) { .preview-container { transform: scale(${(typeof window !== 'undefined' ? window.innerWidth - 32 : 800) / 800}); } }
        @media print { .no-print { display: none !important; } .fixed { position: static !important; } .preview-container { transform: scale(1) !important; width: 100% !important; margin: 0 !important; } }
      `}</style>
    </div>
  );
}