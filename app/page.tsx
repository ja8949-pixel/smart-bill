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
  
  const printRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalAmount = items.reduce((acc, cur) => acc + (cur.price * cur.count), 0);

  const saveAsJpg = () => {
    if (printRef.current === null) return;
    toJpeg(printRef.current, { quality: 0.95, backgroundColor: '#ffffff' })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `견적서_${info.customer || "미지정"}.jpg`;
        link.href = dataUrl;
        link.click();
      })
      .catch((err) => console.error('JPG 저장 실패:', err));
  };

  const addItem = () => setItems([...items, { id: Date.now(), name: '', spec: '', count: 1, price: 0 }]);
  const updateItem = (id: number, key: keyof BillItem, value: any) => {
    setItems(items.map(i => i.id === id ? { ...i, [key]: value } : i));
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-slate-900 pb-10">
      <div className="no-print">
        <header className="bg-white border-b px-6 py-4 sticky top-0 z-20 flex justify-between items-center shadow-sm">
          <h1 className="text-xl font-black text-blue-600 tracking-tighter italic">SMART BILL</h1>
          <button onClick={() => setShowPreview(true)} className="bg-blue-600 text-white px-5 py-2 rounded-full font-bold text-sm shadow-lg">미리보기 및 저장</button>
        </header>

        <main className="max-w-4xl mx-auto p-4 flex flex-col md:flex-row gap-6 mt-4">
          <div className="flex-1 space-y-6">
            <section className="bg-white rounded-3xl p-6 shadow-sm space-y-4 border border-zinc-200">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">사업자 정보</h2>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="사업자명" className="input-style" onChange={e => setInfo({...info, provider: e.target.value})} />
                <input type="text" placeholder="사업자번호" className="input-style" onChange={e => setInfo({...info, bizNumber: e.target.value})} />
                <input type="text" placeholder="날짜" className="input-style" value={info.date} onChange={e => setInfo({...info, date: e.target.value})} />
                <input type="text" placeholder="받는분(거래처)" className="input-style" onChange={e => setInfo({...info, customer: e.target.value})} />
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
                  }
                }} />
                <button onClick={() => fileInputRef.current?.click()} className="text-xs bg-gray-100 px-4 py-2 rounded-lg font-bold hover:bg-gray-200 transition">도장 이미지 업로드</button>
              </div>
            </section>
            
            <section className="space-y-3">
              <div className="flex justify-between items-center px-2">
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">견적 내역</h2>
                <button onClick={addItem} className="text-blue-600 font-bold text-xs hover:underline">+ 항목 추가</button>
              </div>
              {items.map((item) => (
                <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-200 flex gap-3 items-end">
                  <div className="flex-1 grid grid-cols-12 gap-2">
                    <input type="text" placeholder="품명" className="col-span-12 border-b text-sm outline-none p-1 focus:border-blue-500" onChange={e => updateItem(item.id, 'name', e.target.value)} />
                    <input type="text" placeholder="규격" className="col-span-4 border-b text-xs outline-none p-1 focus:border-blue-500" onChange={e => updateItem(item.id, 'spec', e.target.value)} />
                    <input type="number" placeholder="수량" className="col-span-3 border-b text-xs outline-none p-1 text-center focus:border-blue-500" onChange={e => updateItem(item.id, 'count', Number(e.target.value))} />
                    <input type="number" placeholder="단가" className="col-span-5 border-b text-xs outline-none p-1 text-right focus:border-blue-500" onChange={e => updateItem(item.id, 'price', Number(e.target.value))} />
                  </div>
                  <button onClick={() => items.length > 1 && setItems(items.filter(i => i.id !== item.id))} className="text-slate-300 hover:text-red-500 p-1">✕</button>
                </div>
              ))}
            </section>

            <section className="bg-white rounded-3xl p-6 shadow-sm space-y-2 border border-zinc-200">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">비고란 (선택)</h2>
              <textarea className="w-full bg-gray-50 rounded-xl p-3 text-sm outline-none h-20 focus:ring-2 focus:ring-blue-100 transition" onChange={e => setInfo({...info, remark: e.target.value})} />
            </section>
          </div>

          <aside className="no-print w-full md:w-[150px] flex flex-col items-center gap-2">
            <div className="sticky top-24">
              <iframe 
                src="https://coupa.ng/clwBOQ" 
                width="120" 
                height="240" 
                style={{ border: 'none' }}
                scrolling="no" 
                referrerPolicy="unsafe-url"
              ></iframe>
              <p className="text-[10px] text-gray-400 leading-tight mt-2 text-center w-[120px]">
                이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
              </p>
            </div>
          </aside>
        </main>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-[800px] shadow-2xl relative my-10 print:my-0">
            <button onClick={() => setShowPreview(false)} className="absolute top-4 right-4 text-slate-400 hover:text-black text-2xl no-print">✕</button>
            
            <div ref={printRef} className="p-12 bg-white">
              <h1 className="text-5xl text-center font-serif font-black tracking-[2rem] mb-12 underline underline-offset-8">견적서</h1>
              <div className="grid grid-cols-2 gap-10 mb-10">
                <div className="flex flex-col justify-between py-2">
                  <div>
                    <p className="text-2xl font-bold border-b-2 border-black pb-1 inline-block min-w-[240px]">{info.customer || '　　　　'} <span className="text-sm font-normal">귀하</span></p>
                    <p className="mt-6 text-sm">아래와 같이 견적합니다.</p>
                    <p className="text-[10px] text-gray-400 mt-1">발행일: {info.date}</p>
                  </div>
                  <div className="mt-10">
                    <p className="text-3xl font-black border-b-[5px] border-double border-slate-800 pb-2 italic">₩{totalAmount.toLocaleString()}-</p>
                    <p className="text-[10px] font-bold text-gray-400 mt-2 tracking-widest uppercase">Total Amount (VAT 별도)</p>
                  </div>
                </div>

                <table className="border-collapse border border-slate-800 w-full text-[12px] table-fixed">
                  <tbody>
                    <tr>
                      <td className="border border-slate-800 p-1 w-8 text-center bg-gray-50 font-bold" rowSpan={4}>공<br/>급<br/>자</td>
                      <td className="border border-slate-800 p-2 bg-gray-50 font-bold w-20 text-center">등록번호</td>
                      <td className="border border-slate-800 p-2 font-bold text-sm" colSpan={3}>{info.bizNumber}</td>
                    </tr>
                    <tr className="h-10">
                      <td className="border border-slate-800 p-2 bg-gray-50 font-bold text-center">상호</td>
                      <td className="border border-slate-800 p-2 font-bold">{info.provider}</td>
                      <td className="border border-slate-800 p-2 bg-gray-50 font-bold w-10 text-center">성명</td>
                      <td className="border border-slate-800 p-2 text-right relative pr-6">
                        (인)
                        {stampImage && (
                          <img 
                            src={stampImage} 
                            alt="인감" 
                            className="absolute top-0 right-1 w-12 h-12 object-contain mix-blend-multiply opacity-90" 
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-800 p-2 bg-gray-50 font-bold text-center">주소</td>
                      <td className="border border-slate-800 p-2 text-[11px]" colSpan={3}>{info.address}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-800 p-2 bg-gray-50 font-bold text-center">업태/종목</td>
                      <td className="border border-slate-800 p-2" colSpan={3}>{info.category} / {info.sector}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <table className="w-full border-collapse border border-slate-800 text-[13px] mb-8">
                <thead className="bg-gray-50 font-bold">
                  <tr className="h-10 text-center">
                    <td className="border border-slate-800 w-12">번호</td>
                    <td className="border border-slate-800">품명 및 규격</td>
                    <td className="border border-slate-800 w-16">수량</td>
                    <td className="border border-slate-800 w-28">단가</td>
                    <td className="border border-slate-800 w-32">금액</td>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={item.id} className="h-10 text-center">
                      <td className="border border-slate-800 text-gray-400">{i + 1}</td>
                      <td className="border border-slate-800 text-left px-4 font-bold">{item.name} <span className="font-normal text-gray-400 text-xs ml-2">{item.spec}</span></td>
                      <td className="border border-slate-800">{item.count}</td>
                      <td className="border border-slate-800 text-right px-3">{item.price.toLocaleString()}</td>
                      <td className="border border-slate-800 text-right px-3 font-bold">{(item.count * item.price).toLocaleString()}</td>
                    </tr>
                  ))}
                  {[...Array(Math.max(0, 10 - items.length))].map((_, i) => (
                    <tr key={i} className="h-10"><td className="border border-slate-800" colSpan={5}></td></tr>
                  ))}
                </tbody>
              </table>

              <div className="border border-slate-800 p-6 text-[12px] leading-relaxed">
                <p className="font-black text-slate-900 mb-3 underline underline-offset-4 tracking-wider">[ 비고 및 특약사항 ]</p>
                <div className="whitespace-pre-wrap mb-6 text-slate-700 font-medium">{info.remark}</div>
                <div className="space-y-1.5 font-bold text-slate-500 bg-slate-50 p-4 rounded-lg">
                  <p>• 이 견적서는 검인 받지 않고 사용할 수 있음</p>
                  <p>• 공사 절충 합의 견적</p>
                  <p>• 공사 착수금 : 30%   공사 중도금 : 50%   공사 잔금 : 20%</p>
                  <p>• 부가세 별도 첨부</p>
                </div>
              </div>
            </div>

            <div className="p-8 bg-gray-50 grid grid-cols-2 gap-4 no-print border-t">
              <button onClick={saveAsJpg} className="bg-slate-800 text-white py-4 rounded-2xl font-black shadow-lg hover:bg-black transition">JPG 이미지로 저장</button>
              <button onClick={() => window.print()} className="bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg hover:bg-blue-700 transition">PDF 출력 및 저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 스타일 파싱 에러 방지를 위해 문자열 결합 방식으로 안전하게 처리 */}
      <style jsx global>{`
        .input-style { width: 100%; padding: 0.8rem; background-color: #f8fafc; border-radius: 0.75rem; font-size: 0.875rem; outline: none; transition: all 0.2s; border: 1px solid #e2e8f0; }
        .input-style:focus { border-color: #3b82f6; background-color: #fff; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1); }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; padding: 0 !important; }
          .fixed { position: absolute !important; left: 0 !important; top: 0 !important; background: white !important; width: 100% !important; overflow: visible !important; }
          @page { size: auto; margin: 15mm; }
        }
      `}</style>
    </div>
  );
}