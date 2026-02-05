'use client';

import { useState, useRef } from 'react';
import { toJpeg } from 'html-to-image';

interface BillItem {
  id: number;
  name: string;
  spec: string;
  count: number;
  price: number;
}

interface MasterInfo {
  provider: string; bizNumber: string; address: string;
  category: string; sector: string; customer: string; date: string;
  remark: string;
}

export default function BillApp() {
  const [info, setInfo] = useState<MasterInfo>({
    provider: '', bizNumber: '', address: '', category: '', sector: '', customer: '',
    date: new Date().toISOString().split('T')[0], remark: ''
  });
  const [items, setItems] = useState<BillItem[]>([{ id: Date.now(), name: '', spec: '', count: 1, price: 0 }]);
  const [stampImage, setStampImage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showAdModal, setShowAdModal] = useState(false); // [추가] 광고 팝업 상태
  
  const printRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalAmount = items.reduce((acc, cur) => acc + (cur.price * cur.count), 0);

  const trackEvent = (eventName: string, params?: object) => {
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', eventName, params);
      console.log(`GA4 Event: ${eventName}`, params);
    }
  };

  // [수정] 실제 다운로드 실행 로직
  const executeDownload = () => {
    trackEvent('click_download_confirm', { type: 'jpg', customer: info.customer });
    if (printRef.current === null) return;
    
    toJpeg(printRef.current, { quality: 0.95, backgroundColor: '#ffffff' })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `견적서_${info.customer || "미지정"}.jpg`;
        link.href = dataUrl;
        link.click();
        setShowAdModal(false); // 다운로드 시작 후 팝업 닫기
      })
      .catch((err) => console.error('JPG 저장 실패:', err));
  };

  const addItem = () => {
    trackEvent('bill_add_item');
    setItems([...items, { id: Date.now(), name: '', spec: '', count: 1, price: 0 }]);
  };

  const updateItem = (id: number, key: keyof BillItem, value: any) => {
    setItems(items.map(i => i.id === id ? { ...i, [key]: value } : i));
  };

  const coupangDynamicUrl = "https://ads-partners.coupang.com/widgets.html?id=963189&template=carousel&trackingCode=AF4084126&subId=&width=360&height=180&tsource=";

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-slate-900 pb-10">
      <div className="no-print">
        <header className="bg-white border-b px-4 py-3 sticky top-0 z-20 flex justify-between items-center shadow-sm">
          <div>
            <h1 className="text-lg font-black text-blue-600 tracking-tighter italic leading-none">SMART BILL</h1>
            <p className="text-[10px] text-black font-medium mt-1 ml-0.5 uppercase tracking-tighter">made by 진아 ʕ  ̳• ⩊ • ̳ʔ</p>
          </div>
          <button 
            onClick={() => {
              setShowPreview(true);
              trackEvent('click_preview_top');
            }} 
            className="bg-blue-600 text-white px-5 py-2 rounded-full font-bold text-sm shadow-lg hover:bg-blue-700 transition"
          >
            미리보기/다운로드
          </button>
        </header>

        {/* 상단 쿠팡 배너 */}
        <div 
          className="max-w-4xl mx-auto mt-4 px-4 flex flex-col items-center bg-white p-3 rounded-2xl border border-zinc-200 shadow-sm"
          onClick={() => trackEvent('ad_click', { location: 'top_banner' })}
        >
          <iframe 
            src={coupangDynamicUrl} 
            width="580" 
            height="180" 
            frameBorder="0" 
            scrolling="no" 
            referrerPolicy="unsafe-url"
          ></iframe>
          <p className="text-[9px] text-gray-400 mt-1">이 포스팅은 쿠팡 파트너스 활동의 일환으로 수수료를 제공받습니다.</p>
        </div>

        {/* 상단 텐핑 배너 */}
        <div 
          className="max-w-4xl mx-auto mt-4 px-4 flex flex-col items-center bg-white p-3 rounded-2xl border border-zinc-200 shadow-sm overflow-hidden cursor-pointer"
          onClick={() => trackEvent('ad_click_tenping', { location: 'top_banner_tenping' })}
        >
          <div className="w-full flex items-center bg-white h-[100px]">
            <div className="flex-shrink-0 w-[80px] h-[80px] ml-4 overflow-hidden rounded-xl border border-gray-100">
              <a href="https://iryan.kr/t8f69fuddg" target="_blank" rel="noopener noreferrer">
                <img 
                  src="http://img.tenping.kr/Content/Upload/Images/2025111715060001_Squa_20251117151015.jpg?RS=170x170" 
                  alt="메디콕" 
                  className="w-full h-full object-cover"
                />
              </a>
            </div>
            <div className="flex-1 px-4 text-left">
              <p className="text-blue-500 text-[10px] font-bold">광고 클릭 한번이 무료 서비스 운영에 큰 힘이 됩니다 ♡</p>
              <h3 className="text-sm md:text-lg font-black text-slate-800 leading-tight">
                의사가 설계한 맞춤형 건강기능식품 메디콕!
              </h3>
            </div>
          </div>
          <p className="text-[9px] text-gray-400 mt-1">이 광고는 서비스 운영을 위한 후원을 포함하고 있습니다.</p>
        </div>

        <main className="max-w-7xl mx-auto p-4 flex flex-col lg:flex-row gap-6">
          <aside className="hidden xl:flex w-[180px] flex-col items-center gap-4">
            <div 
              className="sticky top-24 w-full flex flex-col items-center bg-white p-2 rounded-2xl border border-zinc-200"
              onClick={() => trackEvent('ad_click', { location: 'left_sidebar' })}
            >
              <iframe src={coupangDynamicUrl} width="120" height="400" frameBorder="0" scrolling="no" referrerPolicy="unsafe-url"></iframe>
              <p className="text-[10px] text-gray-400 leading-tight mt-2 text-center font-medium italic">Partner's AD</p>
            </div>
          </aside>

          <div className="flex-1 space-y-6 text-left">
            <section className="bg-white rounded-2xl p-5 shadow-sm space-y-4 border border-zinc-200">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">사업자 정보</h2>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="사업자명" className="input-style" onChange={e => setInfo({...info, provider: e.target.value})} />
                <input type="text" placeholder="사업자등록번호" className="input-style" onChange={e => setInfo({...info, bizNumber: e.target.value})} />
                <input type="date" className="input-style" value={info.date} onChange={e => setInfo({...info, date: e.target.value})} />
                <input type="text" placeholder="받는분(귀하)" className="input-style" onChange={e => setInfo({...info, customer: e.target.value})} />
                <input type="text" placeholder="주소" className="input-style col-span-2" onChange={e => setInfo({...info, address: e.target.value})} />
                <input type="text" placeholder="업태" className="input-style" onChange={e => setInfo({...info, category: e.target.value})} />
                <input type="text" placeholder="종목" className="input-style" onChange={e => setInfo({...info, sector: e.target.value})} />
              </div>
              <div className="pt-2">
                <input type="file" accept="image/*" ref={fileInputRef} hidden onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setStampImage(reader.result as string);
                    reader.readAsDataURL(file);
                    trackEvent('upload_stamp');
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
                <div key={item.id} className="bg-white rounded-xl p-4 shadow-sm border border-zinc-200 flex flex-col gap-3 relative">
                  <input type="text" placeholder="품명" className="border-b text-sm outline-none pb-1 focus:border-blue-500 font-medium" onChange={e => updateItem(item.id, 'name', e.target.value)} />
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" placeholder="규격" className="border-b text-xs outline-none pb-1 text-left" onChange={e => updateItem(item.id, 'spec', e.target.value)} />
                    <input type="number" placeholder="수량" className="border-b text-xs outline-none pb-1 text-left" onChange={e => updateItem(item.id, 'count', Number(e.target.value))} />
                    <input type="number" placeholder="단가" className="border-b text-xs outline-none pb-1 text-left" onChange={e => updateItem(item.id, 'price', Number(e.target.value))} />
                  </div>
                  <button onClick={() => {
                    if(items.length > 1) {
                      setItems(items.filter(i => i.id !== item.id));
                      trackEvent('bill_remove_item');
                    }
                  }} className="absolute top-2 right-2 text-slate-300 hover:text-red-500">✕</button>
                </div>
              ))}
            </section>

            <section className="bg-white rounded-2xl p-5 shadow-sm border border-zinc-200">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">비고란</h2>
              <textarea className="w-full bg-gray-50 rounded-xl p-3 text-sm outline-none h-20 focus:ring-1 focus:ring-blue-500" placeholder="추가 기재사항을 작성해주세요." onChange={e => setInfo({...info, remark: e.target.value})} />
            </section>

            <div 
              className="w-full flex flex-col items-center bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm"
              onClick={() => trackEvent('ad_click', { location: 'bottom_banner' })}
            >
              <iframe src={coupangDynamicUrl} width="380" height="180" frameBorder="0" scrolling="no" referrerPolicy="unsafe-url"></iframe>
              <p className="text-[9px] text-gray-400 mt-1 italic">이 포스팅은 쿠팡 파트너스 활동의 일환으로 수수료를 제공받습니다.</p>
            </div>
          </div>

          <aside className="w-full lg:w-[180px] flex flex-col items-center gap-4">
            <div 
              className="lg:sticky lg:top-24 w-full flex flex-col items-center bg-white p-2 rounded-2xl border border-zinc-200"
              onClick={() => trackEvent('ad_click', { location: 'right_sidebar' })}
            >
              <iframe src={coupangDynamicUrl} width="160" height="180" frameBorder="0" scrolling="no" referrerPolicy="unsafe-url"></iframe>
              <p className="text-[10px] text-gray-400 leading-tight mt-2 text-center">이 포스팅은 쿠팡 파트너스 활동의 일환으로 수수료를 제공받습니다.</p>
            </div>
          </aside>
        </main>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-start overflow-y-auto pt-4 pb-20 px-2">
          <div className="w-full max-w-[800px] flex justify-end mb-2 no-print">
            <button onClick={() => setShowPreview(false)} className="bg-white/20 text-white w-10 h-10 rounded-full text-xl hover:bg-white/40 transition">✕</button>
          </div>
          
          <div className="preview-container bg-white shadow-2xl origin-top">
            <div ref={printRef} className="p-10 md:p-14 bg-white text-left">
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
                  <div className="mt-4 text-left">
                    <div className="flex items-baseline gap-2 inline-flex pr-4">
                      <span className="text-2xl font-black tracking-tight text-slate-900">합계금액:</span>
                      <span className="text-2xl font-black tracking-tight text-slate-900">₩{totalAmount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="w-[400px] min-w-[400px] shrink-0">
                  <table className="border-collapse border-2 border-black w-full text-[11px] table-fixed">
                    <tbody>
                      <tr className="h-12">
                        <td className="border border-black p-1 w-7 text-center bg-slate-100 font-bold" rowSpan={5}>공<br/>급<br/>자</td>
                        <td className="border border-black p-2 bg-slate-100 font-bold w-16 text-center">사업자<br/>등록번호</td>
                        <td className="border border-black p-2 font-bold text-[12px]" colSpan={3}>{info.bizNumber}</td>
                      </tr>
                      <tr className="h-14">
                        <td className="border border-black p-2 bg-slate-100 font-bold text-center">상호</td>
                        <td className="border border-black p-2 font-bold">{info.provider}</td>
                        <td className="border border-black p-2 bg-slate-100 font-bold w-10 text-center">성명</td>
                        <td className="border border-black p-2 text-right relative pr-6">
                          (인)
                          {stampImage && (
                            <img src={stampImage} alt="인감" className="absolute top-1/2 -translate-y-1/2 right-1 w-12 h-12 object-contain mix-blend-multiply" />
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
                  <tr className="h-11 bg-slate-50 font-bold">
                    <td className="border border-black text-center" colSpan={2}>합 계 (TOTAL)</td>
                    <td className="border border-black text-center">{items.reduce((a, b) => a + b.count, 0)}</td>
                    <td className="border border-black"></td>
                    <td className="border border-black text-right px-2 text-blue-800 text-[14px]">₩{totalAmount.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>

              <div className="border-2 border-black p-5 text-[11px] leading-relaxed bg-slate-50/50 text-left">
                <p className="font-bold text-slate-900 mb-3 underline underline-offset-4 tracking-wider">※ 비고 및 특약사항</p>
                <div className="flex flex-col gap-1 text-slate-700 font-semibold mb-3">
                  <div>• 이 견적서는 검인받지 않고 사용할 수 있음.</div>
                  <div>• 공사 절충 합의 견적</div>
                  <div>• 공사 착수금 : 30% / 공사 중도금 : 50% / 공사 잔금 : 20%</div>
                  <div>• 부가세 별도 첨부</div>
                </div>
                <div className="border-t border-slate-300 pt-3">
                  <div className="whitespace-pre-wrap text-slate-600 font-medium min-h-[40px]">
                    {info.remark ? `• 추가사항: ${info.remark}` : "- 추가 특이사항 없음"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900/90 backdrop-blur grid grid-cols-2 gap-3 no-print z-[60]">
            <button 
              onClick={() => {
                setShowAdModal(true); // 다운로드 대신 광고 팝업 먼저 띄움
                trackEvent('click_download_trigger', { type: 'jpg' });
              }} 
              className="bg-white text-slate-900 py-4 rounded-xl font-bold text-sm shadow-lg active:scale-95 transition border-b-2 border-slate-200"
            >
              이미지 다운로드(JPG)
            </button>
            <button 
              onClick={() => {
                window.print();
                trackEvent('click_download', { type: 'pdf', customer: info.customer });
              }} 
              className="bg-blue-600 text-white py-4 rounded-xl font-bold text-sm shadow-lg active:scale-95 transition"
            >
              PDF 출력 / 인쇄
            </button>
          </div>
        </div>
      )}

      {/* [광고 팝업 모달 영역] */}
      {showAdModal && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-[400px] overflow-hidden relative animate-in fade-in zoom-in duration-300">
            {/* 닫기 버튼 */}
            <button onClick={() => setShowAdModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition z-10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="p-6 pt-10 flex flex-col items-center text-center">
              <div className="mb-6">
                <span className="text-3xl mb-3 block">☕</span>
                <h3 className="text-lg font-black text-slate-800 leading-tight">오늘도 수고 많으셨습니다!</h3>
                <p className="text-[13px] text-slate-500 mt-2 font-medium">
                  무료 운영 유지를 위해 광고 한 번 확인해주시면<br/>
                  더 좋은 기능으로 보답하겠습니다.
                </p>
              </div>

              {/* 팝업 내 텐핑 배너 */}
              <div 
                className="max-w-4xl mx-auto mt-4 px-4 flex flex-col items-center bg-white p-3 rounded-2xl border border-zinc-200 shadow-sm overflow-hidden cursor-pointer"
                onClick={() => trackEvent('ad_click_tenping', { location: 'top_banner_tenping' })}
              >
                <div className="w-full flex items-center bg-white h-[100px]">
                  <div className="flex-shrink-0 w-[80px] h-[80px] ml-4 overflow-hidden rounded-xl border border-gray-100">
                    <a href="https://iryan.kr/t8f69fuddg" target="_blank" rel="noopener noreferrer">
                      <img 
                        src="http://img.tenping.kr/Content/Upload/Images/2025111715060001_Squa_20251117151015.jpg?RS=170x170" 
                        alt="메디콕" 
                        className="w-full h-full object-cover"
                      />
                    </a>
                  </div>
                  <div className="flex-1 px-4 text-left">
                     <h3 className="text-sm md:text-lg font-black text-slate-800 leading-tight">
                      의사가 설계한 맞춤형 건강기능식품 메디콕!
                    </h3>
                  </div>
                </div>
                <p className="text-[9px] text-gray-400 mt-1">이 광고는 서비스 운영을 위한 후원을 포함하고 있습니다.</p>
              </div>

              {/* 실제 다운로드 실행 */}
              <button
                onClick={executeDownload}
                className="w-full mt-6 bg-blue-600 text-white py-4 rounded-xl font-bold text-lg shadow-xl hover:bg-blue-700 active:scale-95 transition"
              >
                견적서 파일 저장하기
              </button>
              <p className="text-[10px] text-gray-400 mt-4 tracking-tighter italic">항상 사장님의 번창을 진심으로 응원합니다!</p>
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
          .fixed { position: static !important; background: white !important; overflow: visible !important; }
          .preview-container { transform: scale(0.98) !important; width: 100% !important; min-width: 100% !important; margin: 0 !important; box-shadow: none !important; border: none !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}