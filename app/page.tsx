'use client';

import { useState, useRef, useEffect } from 'react';
import { toJpeg } from 'html-to-image';
import { removeStampBackground, shrinkForStorage } from './stampCutout';
import { parseQuoteText } from './quickParse';
import SignaturePad from './SignaturePad';
import { buildExcelBlob } from './exportExcel';
import { numToKorean, addDaysLabel, makeQuoteNo, detectInApp, kakaoExternalUrl,
         dataUrlToBlob, shareFile, downloadBlob, jpgToPdfBlob, type InApp } from './billUtils';
import { IS_TOSS, tossSaveFile } from './toss';

type FileKind = 'jpg' | 'pdf' | 'xlsx';
const FILE_LABEL: Record<FileKind, string> = { jpg: '이미지', pdf: 'PDF', xlsx: '엑셀' };
const HISTORY_KEY = 'smartbill.history.v1';     // 지난 견적서
const FREQ_KEY = 'smartbill.freqItems.v1';      // 자주 쓰는 품목
interface HistoryEntry {
  id: string; date: string; customer: string; provider: string; total: number;
  info: MasterInfo; items: BillItem[]; vatMode: 'none' | 'include'; savedAt: number;
}
interface FreqItem { name: string; spec: string; price: number; uses: number; last: number }

// 저장 전 광고: 영상 광고를 받으면 여기에 mp4 주소만 넣으면 된다 (없으면 쿠팡 위젯 + 텐핑 이미지로 5초)
const AD_VIDEO_URL = '';
const AD_SECONDS = IS_TOSS ? 0 : 5;   // 토스 미니앱은 외부 광고 금지 → 기다림 없이 파일만 만든다

// 이 기기(브라우저)에 기억해 두는 공급자 정보 — 로그인 없이 다음에 바로 불러온다
interface SavedProfile {
  provider: string;
  bizNumber: string;
  address: string;
  category: string;
  sector: string;
  phone?: string;
  account?: string;
  stamp: string | null;
  savedAt: number;
}
const PROFILES_KEY = 'smartbill.profiles.v1';
const LAST_PROFILE_KEY = 'smartbill.lastProfile.v1';

const STEP_TITLES = ['받는 분', '내 정보', '견적 내용', '확인'];
const DRAFT_KEY = 'smartbill.draft.v1';   // 작성 중 내용 (화면이 꺼지거나 새로고침해도 이어서)

// ── 쿠팡 파트너스 광고 카드 ─────────────────────────────────────
//  위젯 ID 는 쿠팡 파트너스 > 위젯 만들기에서 발급. 상품 구성(공구·장갑·건강식품 등)은 거기서 바꾼다.
//  50~60대가 보기 편하게: 큰 제목 + 한 줄 설명 + 카드 테두리. 파트너스 규정상 고지 문구 필수.
const COUPANG_IDS = ['963189', '964078'];
const COUPANG_TRACK = 'AF4084126';
const COUPANG_W = 330;   // 폰(390px) 안에서 가로 스크롤이 안 생기는 폭
function CoupangAd({ slot, title, sub }: { slot: number; title: string; sub?: string }) {
  if (IS_TOSS) return null;   // 토스 심사 정책: 외부 광고 네트워크 금지
  const id = COUPANG_IDS[slot % COUPANG_IDS.length];
  return (
    <aside className="bg-white rounded-2xl border-2 border-amber-200 overflow-hidden">
      <div className="px-4 pt-3 pb-2 bg-amber-50/60">
        <p className="text-base font-extrabold text-slate-800">{title}</p>
        {sub && <p className="text-[13px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
      <div className="flex justify-center py-2">
        <iframe
          src={`https://ads-partners.coupang.com/widgets.html?id=${id}&template=carousel&trackingCode=${COUPANG_TRACK}&width=${COUPANG_W}&height=180`}
          width={COUPANG_W} height="180" frameBorder="0" scrolling="no" loading="lazy" title="쿠팡 추천 상품"
          onLoad={() => trackEvent('coupang_widget_view', `slot${slot}`)}
        />
      </div>
      <p className="px-4 pb-2 text-[11px] text-slate-400 leading-snug">이 서비스는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</p>
    </aside>
  );
}

// 예시는 "띄어쓰기만" 하는 가장 쉬운 형태로. (하도:1말67000×3=201000 같은 형식도 그대로 읽힌다)
const QUICK_EXAMPLE = `받는분 홍길동
공급자 일광페인팅
하도 1말 67000 3
중도 1말 6만6천원 6개
신나 62000
기공 3일 35만원
식대 및 기타 30만원`;

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
  phone: string;      // 공급자 전화
  account: string;    // 입금 계좌
  validDays: number;  // 견적 유효기간(일)
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
    remark: '',
    phone: '', account: '', validDays: 30,
  });

  // 수량은 1로 시작 — 비워 둬서 금액에서 빠지는 일을 애초에 막는다
  const [items, setItems] = useState<BillItem[]>([{ id: Date.now(), name: '', spec: '', count: 1, price: '' }]);
  const [step, setStep] = useState(1);
  const [showQuick, setShowQuick] = useState(false);
  const [doneMsg, setDoneMsg] = useState('');          // 다운로드 완료 안내
  const [showSign, setShowSign] = useState(false);     // 손 서명 패드
  const [stampSource, setStampSource] = useState<'photo' | 'sign' | 'saved' | null>(null);
  const [adLeft, setAdLeft] = useState(AD_SECONDS);    // 저장 전 광고 남은 초
  const [installEvt, setInstallEvt] = useState<any>(null);   // 안드로이드 설치 프롬프트
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');
  const [standalone, setStandalone] = useState(false);       // 이미 홈 화면 앱으로 열림
  const [draftMsg, setDraftMsg] = useState('');        // 작성 중 내용 복원 안내
  const draftReady = useRef(false);                    // 복원이 끝난 뒤부터 저장 시작
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
  const [sheet, setSheet] = useState<'share' | 'save' | null>(null);          // 형식 선택창
  const [pending, setPending] = useState<{ mode: 'share' | 'save'; kind: FileKind } | null>(null);
  const [genFile, setGenFile] = useState<File | null>(null);                 // 광고 동안 미리 만든 파일
  const [genError, setGenError] = useState('');
  const [quoteNo, setQuoteNo] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [freqItems, setFreqItems] = useState<FreqItem[]>([]);
  const [inApp, setInApp] = useState<InApp>(null);
  const [voiceOk, setVoiceOk] = useState(false);
  const [listening, setListening] = useState(false);

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
      setStampSource('photo');
      cutoutStamp(original);
    };
    reader.readAsDataURL(file);
  };

  // ── 공급자 정보·도장 기억하기 (localStorage) ──────────────────
  const readProfiles = (): SavedProfile[] => {
    try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]'); } catch { return []; }
  };
  const applyProfile = (p: SavedProfile) => {
    setInfo(prev => ({ ...prev, provider: p.provider, bizNumber: p.bizNumber, address: p.address, category: p.category, sector: p.sector,
                       phone: p.phone || '', account: p.account || '' }));
    if (p.stamp) { setStampImage(p.stamp); setStampOriginal(null); setStampSource('saved'); }   // 저장본은 이미 배경이 지워진 상태
  };
  useEffect(() => {
    const list = readProfiles();
    setProfiles(list);
    // 지난번에 쓴 사업자 정보를 자동으로 채워 둔다 (처음 들어온 빈 화면일 때만)
    const last = localStorage.getItem(LAST_PROFILE_KEY);
    const p = list.find(x => x.provider === last);
    if (p) { applyProfile(p); setProfileMsg(`지난번 정보(${p.provider})를 자동으로 불러왔어요.`); }
    if (!localStorage.getItem('smartbill.guideSeen')) setShowGuide(true);
    // 작성하던 내용이 있으면 이어서 (전화·화면 꺼짐·새로고침 대비)
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      const hasContent = d && (d.info?.customer || d.items?.some((i: BillItem) => String(i.name).trim()));
      if (hasContent) {
        setInfo(prev => ({ ...prev, ...d.info }));
        setItems(d.items);
        setVatMode(d.vatMode || 'none');
        setStep(Math.min(4, Math.max(1, d.step || 1)));
        setDraftMsg('작성하던 내용을 그대로 불러왔어요.');
      }
    } catch {}
    draftReady.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 입력할 때마다 작성 중 내용을 이 기기에 저장 (도장은 사업자 정보 쪽에 저장됨)
  useEffect(() => {
    if (!draftReady.current) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ info, items, vatMode, step })); } catch {}
  }, [info, items, vatMode, step]);

  // 홈 화면 추가: 안드로이드는 설치 프롬프트를 잡아 두고 버튼 하나로, 아이폰은 그림 안내
  useEffect(() => {
    const ua = navigator.userAgent;
    setPlatform(/iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'other');
    setInApp(IS_TOSS ? null : detectInApp(ua));   // 토스 안에서는 '다른 브라우저로 열기' 안내를 하지 않는다 (외부 이동 금지)
    setVoiceOk(!!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
    setHistory(readJson<HistoryEntry[]>(HISTORY_KEY, []));
    setFreqItems(readJson<FreqItem[]>(FREQ_KEY, []));
    const sa = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    setStandalone(sa);
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', () => { setStandalone(true); trackEvent('pwa_installed', platform); });
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const installApp = async () => {
    if (!installEvt) return;
    trackEvent('pwa_install_click', 'android');
    installEvt.prompt();
    try { await installEvt.userChoice; } catch {}
    setInstallEvt(null);
  };

  // 저장 전 광고 카운트다운
  useEffect(() => {
    if (!showAdModal) return;
    setAdLeft(AD_SECONDS);
    const t = setInterval(() => setAdLeft(s => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [showAdModal]);

  const startFresh = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftMsg('');
    resetAll(true);
    // 새 견적을 시작해도 내 사업자 정보·도장은 그대로 — 다시 고를 필요 없게
    const last = localStorage.getItem(LAST_PROFILE_KEY);
    const p = readProfiles().find(x => x.provider === last);
    if (p) applyProfile(p);
  };

  const saveProfile = async (silent = false) => {
    const name = info.provider.trim();
    if (!name) { if (!silent) { alert('사업자명을 먼저 적어 주세요.'); document.getElementById('f-provider')?.focus(); } return; }
    try {
      const stamp = stampImage ? await shrinkForStorage(stampImage) : null;
      const p: SavedProfile = { provider: name, bizNumber: info.bizNumber, address: info.address, category: info.category, sector: info.sector,
                                phone: info.phone, account: info.account, stamp, savedAt: Date.now() };
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
    setShowQuick(false);   // 결과(항목 카드)가 바로 보이게 입력창은 접는다
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

  const resetAll = (skipConfirm = false) => {
  if (skipConfirm || confirm("입력하신 모든 정보가 삭제됩니다. 초기화할까요?")) {
    localStorage.removeItem(DRAFT_KEY);
    setInfo({
      provider: '', bizNumber: '', address: '', category: '', sector: '', customer: '',
      date: new Date().toISOString().split('T')[0], remark: '', phone: '', account: '', validDays: 30,
    });
    setQuoteNo('');
    setItems([{ id: Date.now(), name: '', spec: '', count: 1, price: '' }]);
    setStampImage(null);
    setStampOriginal(null);
    setVatMode('none');
    setQuickText(''); setQuickMsg(''); setProfileMsg('');
    setStep(1);
  }
};

  // ── 파일 만들기 / 보내기 / 저장 ─────────────────────────────
  //  흐름: [보내기]/[저장] → 형식 선택 → 광고 창(5초) 동안 파일을 미리 만든다 → 버튼이 켜지면 즉시 공유/저장
  //  (공유창은 '버튼을 누른 직후'에만 열 수 있어서, 파일을 미리 만들어 두는 게 핵심)
  const fileName = (kind: FileKind) =>
    `견적서_${(info.customer || '미지정').replace(/[\\/:*?"<>|]/g, '')}_${info.date.replace(/-/g, '')}.${kind}`;

  const buildFile = async (kind: FileKind): Promise<File> => {
    if (kind === 'xlsx') {
      const blob = await buildExcelBlob({ info, items, supplyAmount, vatAmount, totalAmount, withVat, stampImage, quoteNo });
      return new File([blob], fileName('xlsx'), { type: blob.type });
    }
    if (!printRef.current) throw new Error('미리보기가 열려 있지 않아요');
    const dataUrl = await toJpeg(printRef.current, { quality: 0.95, backgroundColor: '#ffffff', pixelRatio: 2 });
    if (kind === 'jpg') return new File([await dataUrlToBlob(dataUrl)], fileName('jpg'), { type: 'image/jpeg' });
    return new File([await jpgToPdfBlob(dataUrl)], fileName('pdf'), { type: 'application/pdf' });
  };

  const startAction = (mode: 'share' | 'save', kind: FileKind) => {
    trackEvent(`click_${mode}_${kind}`, mode);
    setSheet(null);
    setPending({ mode, kind });
    setGenFile(null); setGenError('');
    setShowAdModal(true);
    // 광고 창이 먼저 그려지도록 한 박자 뒤에 만든다 (이미지 변환이 1초쯤 화면을 멈추게 하므로)
    setTimeout(() => buildFile(kind).then(setGenFile).catch(e => setGenError(String(e?.message || e))), 80);
  };

  const finishAction = async () => {
    if (!pending || !genFile) return;
    const { mode, kind } = pending;
    const label = FILE_LABEL[kind];
    setShowAdModal(false);
    if (IS_TOSS) {
      // 토스 웹뷰: 브라우저 다운로드·공유창이 막혀 있어 토스 브리지로 기기에 저장하고, 보내기는 갤러리에서 하도록 안내
      const saved = await tossSaveFile(genFile);
      if (!saved) downloadBlob(genFile, genFile.name);
      trackEvent('toss_save', kind);
      setDoneMsg(kind === 'jpg'
        ? `견적서 이미지가 저장됐어요.\n${mode === 'share' ? '카톡·문자에서 [사진]을 눌러 방금 저장한 견적서를 골라 보내세요.' : '갤러리(사진)에서 확인하세요.'}`
        : `${label} 파일이 저장됐어요.\n${mode === 'share' ? "카톡·문자에서 [파일]을 눌러 방금 저장한 견적서를 골라 보내세요." : "'파일' 앱의 다운로드에서 확인하세요."}`);
      setPending(null); setGenFile(null);
      return;
    }
    if (mode === 'share') {
      const shared = await shareFile(genFile, `견적서 ${info.customer || ''}`.trim());
      if (shared) {
        trackEvent('share_done', kind);
        setDoneMsg(`${label} 견적서를 보냈어요.\n(공유창을 닫았다면 다시 '보내기'를 누르세요.)`);
      } else {
        downloadBlob(genFile, genFile.name);
        setDoneMsg(`이 기기는 바로 보내기를 지원하지 않아 ${label}로 저장했어요.\n폰은 갤러리(사진)에서 카톡으로 보내고, 컴퓨터는 다운로드 폴더에서 첨부하세요.`);
      }
    } else {
      downloadBlob(genFile, genFile.name);
      setDoneMsg(kind === 'jpg'
        ? '견적서 이미지가 저장됐어요.\n폰은 갤러리(사진), 컴퓨터는 다운로드 폴더에서 확인하세요.'
        : `${label} 파일이 저장됐어요.\n폰은 '파일' 앱의 다운로드, 컴퓨터는 다운로드 폴더에서 확인하세요.`);
    }
    setPending(null); setGenFile(null);
  };
  const handleAdConfirm = () => { finishAction(); };

  // ── 지난 견적서 / 자주 쓰는 품목 기억 ─────────────────────────
  const readJson = <T,>(key: string, fallback: T): T => {
    try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; }
  };
  const ensureQuoteNo = (): string => {
    const prefix = info.date.replace(/-/g, '');
    if (quoteNo.startsWith(prefix)) return quoteNo;
    const hist = readJson<HistoryEntry[]>(HISTORY_KEY, []);
    const qn = makeQuoteNo(info.date, hist.filter(h => h.date === info.date).length + 1);
    setQuoteNo(qn);
    return qn;
  };
  const recordHistory = (qn: string) => {
    try {
      const named = items.filter(i => i.name.trim());
      const entry: HistoryEntry = { id: qn, date: info.date, customer: info.customer, provider: info.provider,
        total: totalAmount, info, items: named, vatMode, savedAt: Date.now() };
      const hist = [entry, ...readJson<HistoryEntry[]>(HISTORY_KEY, []).filter(h => h.id !== qn)].slice(0, 30);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
      setHistory(hist);
      const freq = readJson<FreqItem[]>(FREQ_KEY, []);
      for (const it of named) {
        const k = `${it.name.trim()}|${it.spec.trim()}`;
        const f = freq.find(x => `${x.name}|${x.spec}` === k);
        if (f) { f.uses += 1; f.price = Number(it.price) || f.price; f.last = Date.now(); }
        else freq.push({ name: it.name.trim(), spec: it.spec.trim(), price: Number(it.price) || 0, uses: 1, last: Date.now() });
      }
      freq.sort((a, b) => b.uses - a.uses || b.last - a.last);
      localStorage.setItem(FREQ_KEY, JSON.stringify(freq.slice(0, 40)));
      setFreqItems(freq.slice(0, 40));
    } catch {}
  };
  const loadHistory = (h: HistoryEntry) => {
    const today = new Date().toISOString().split('T')[0];
    setInfo(prev => ({ ...prev, ...h.info, date: today }));
    setItems(h.items.map((it, i) => ({ ...it, id: Date.now() + i })));
    setVatMode(h.vatMode);
    setQuoteNo('');
    setStep(3);
    setDraftMsg(`'${h.customer || '받는 분 없음'}' 견적서를 복사했어요. 날짜는 오늘로 바꿨어요.`);
    trackEvent('history_load', h.id);
    window.scrollTo({ top: 0 });
  };
  const addFreq = (f: FreqItem) => {
    const blank = items.find(i => !i.name.trim());
    if (blank) setItems(items.map(i => i.id === blank.id ? { ...i, name: f.name, spec: f.spec, price: f.price || '', count: i.count || 1 } : i));
    else setItems([...items, { id: Date.now(), name: f.name, spec: f.spec, count: 1, price: f.price || '' }]);
    trackEvent('freq_item_add', f.name);
  };

  // ── 🎤 말로 적기 (지원되는 폰에서만 버튼이 보인다) ─────────────
  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = 'ko-KR'; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      const t: string = e.results[0][0].transcript;
      setQuickText(q => (q.trim() ? q.replace(/\s*$/, '') + '\n' : '') + t);
      trackEvent('voice_input', 'ok');
    };
    r.onend = () => setListening(false);
    r.onerror = () => { setListening(false); alert('잘 못 들었어요. 🎤 버튼을 다시 누르고 또박또박 말씀해 주세요.'); };
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  };

  const addItem = () => {
    const id = Date.now();
    setItems([...items, { id, name: '', spec: '', count: 1, price: '' }]);
    setTimeout(() => document.getElementById(`name-${id}`)?.focus(), 50);
  };

  // 단계 이동: 각 단계에서 꼭 필요한 것만 확인하고 넘어간다
  const goNext = () => {
    if (step === 2 && !info.provider.trim()) {
      alert('사업자명을 적어 주세요.\n견적서의 공급자 이름으로 들어가요.');
      document.getElementById('f-provider')?.focus();
      return;
    }
    if (step === 3 && !validateBeforePreview()) return;
    setStep(s => Math.min(4, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const openPreview = () => {
    trackEvent('click_preview', '미리보기 버튼 클릭');
    if (!validateBeforePreview()) { setStep(3); return; }
    saveProfile(true);          // 사업자 정보·도장은 조용히 기억해 둔다
    localStorage.setItem('smartbill.guideSeen', '1');   // 한 번 만들어 봤으면 다음엔 가이드 접기
    recordHistory(ensureQuoteNo());   // 지난 견적서·자주 쓰는 품목으로 기억
    setShowPreview(true);
  };
  const updateItem = (id: number, key: keyof BillItem, value: any) => setItems(items.map(i => i.id === id ? { ...i, [key]: value } : i));

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-slate-900 pb-10">
      <div className="no-print pb-28">
        {/* 상단: 로고 + 제목 + 모두 지우기 */}
        <header className="bg-white border-b px-4 py-3 sticky top-0 z-20 shadow-sm">
          <div className="max-w-xl mx-auto flex items-center gap-3">
            <img src="/images/smart_bill_logo.jpg" alt="로고" className="h-12 w-12 rounded-xl" />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-extrabold text-slate-900 leading-tight truncate">견적서 만들기</h1>
              <p className="text-[12px] text-slate-500 truncate">무료 · 가입 없음 · 내 폰에만 저장</p>
            </div>
            <button id="btn-preview-any" onClick={() => { trackEvent('click_preview_any', `step${step}`); ensureQuoteNo(); setShowPreview(true); }}
                    className="text-[14px] font-extrabold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 whitespace-nowrap">👁 미리보기</button>
            <button onClick={() => resetAll()} className="text-[13px] font-bold text-slate-400 hover:text-red-500 px-1 py-2 whitespace-nowrap">지우기</button>
          </div>
          {inApp && (
            <div id="inapp-banner" className="max-w-xl mx-auto mt-2 bg-yellow-50 border-2 border-yellow-300 rounded-xl px-3 py-2 text-[14px] text-slate-800">
              <b>⚠️ {inApp === 'kakao' ? '카카오톡' : '앱'} 안에서 열렸어요.</b> 여기서는 저장·보내기가 안 될 수 있어요.
              {inApp === 'kakao' ? (
                <a href={kakaoExternalUrl(typeof window !== 'undefined' ? window.location.href : '')}
                   className="block mt-2 text-center py-3 rounded-xl bg-yellow-400 font-extrabold text-base text-slate-900">🌐 크롬(사파리)으로 열기</a>
              ) : (
                <p className="mt-1">오른쪽 위 <b>⋮</b> 또는 <b>공유</b> 버튼을 눌러 <b>다른 브라우저로 열기</b>를 선택하세요.</p>
              )}
            </div>
          )}
          {draftMsg && (
            <div id="draft-msg" className="max-w-xl mx-auto mt-2 flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-[14px] text-green-800">
              <span>↩️ {draftMsg}</span>
              <button onClick={startFresh} className="shrink-0 font-bold text-green-700 underline">새로 시작</button>
            </div>
          )}
          {/* 진행 단계 */}
          <ol className="max-w-xl mx-auto mt-3 grid grid-cols-4 gap-1">
            {STEP_TITLES.map((t, i) => {
              const n = i + 1;
              const state = n === step ? 'current' : n < step ? 'done' : 'todo';
              return (
                <li key={t}>
                  <button
                    onClick={() => { if (n < step) setStep(n); }}
                    className={`w-full flex flex-col items-center gap-1 py-1 rounded-xl ${state === 'current' ? 'bg-orange-50' : ''}`}
                    aria-current={state === 'current' ? 'step' : undefined}
                  >
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${
                      state === 'current' ? 'bg-[#FF7E36] text-white' : state === 'done' ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                      {state === 'done' ? '✓' : n}
                    </span>
                    <span className={`text-[12px] font-bold ${state === 'current' ? 'text-slate-900' : 'text-slate-400'}`}>{t}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </header>

        <main className="max-w-xl mx-auto p-4 space-y-5">

          {/* ───────── 1단계: 받는 분 ───────── */}
          {step === 1 && (
            <section className="space-y-5">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900">누구에게 보내는 견적서인가요?</h2>
                <p className="text-slate-500 mt-1">모르면 비워 두고 <b>다음</b>을 눌러도 돼요.</p>
              </div>
              <label className="block">
                <span className="big-label">받는 분 (회사명 또는 이름)</span>
                <input id="f-customer" type="text" list="customer-list" placeholder="예: 홍길동 / 한빛아파트 관리사무소" value={info.customer} className="input-style"
                       onChange={e => setInfo({ ...info, customer: e.target.value })} />
                <datalist id="customer-list">
                  {Array.from(new Set(history.map(h => h.customer).filter(Boolean))).map(c => <option key={c} value={c} />)}
                </datalist>
              </label>
              {history.length > 0 && (
                <div id="history-card" className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
                  <span className="big-label">📂 지난 견적서 — 누르면 복사해서 새로 만들어요</span>
                  {history.slice(0, 5).map(h => (
                    <button key={h.id} onClick={() => loadHistory(h)}
                            className="history-item w-full flex items-center justify-between gap-2 text-left px-3 py-3 rounded-xl bg-slate-50 hover:bg-slate-100">
                      <span className="min-w-0">
                        <b className="block text-base text-slate-900 truncate">{h.customer || '(받는 분 없음)'}</b>
                        <span className="text-[13px] text-slate-500">{h.date.replace(/-/g, '.')} · 품목 {h.items.length}개</span>
                      </span>
                      <b className="text-blue-700 whitespace-nowrap">{h.total.toLocaleString()}원</b>
                    </button>
                  ))}
                </div>
              )}
              <label className="block">
                <span className="big-label">견적 날짜</span>
                <input type="date" value={info.date} className="input-style" onChange={e => setInfo({ ...info, date: e.target.value })} />
              </label>
              {showGuide && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-slate-700 leading-relaxed">
                  <p className="font-extrabold mb-1">📖 처음이세요? 4단계면 끝나요</p>
                  <p>① 받는 분 → ② 내 사업자 정보와 도장 → ③ 견적 내용 → ④ 확인하고 견적서 받기.</p>
                  <p className="mt-1">한 번 적은 사업자 정보와 도장은 다음부터 자동으로 채워져요.</p>
                </div>
              )}
              {!standalone && !IS_TOSS && (
                <div id="install-card" className="bg-white rounded-2xl border-2 border-green-200 p-4 space-y-3">
                  <p className="text-base font-extrabold text-slate-800">📱 폰 바탕화면에 넣어 두면 다음엔 한 번에 열려요</p>
                  {platform === 'android' && installEvt ? (
                    <>
                      <button id="btn-install" onClick={installApp} className="w-full py-4 rounded-2xl bg-green-600 text-white font-extrabold text-lg">📲 바탕화면에 추가하기</button>
                      <p className="text-[14px] text-slate-500">누르면 나오는 창에서 <b>[설치]</b> 또는 <b>[추가]</b>를 누르세요. 끝!</p>
                    </>
                  ) : platform === 'ios' ? (
                    <ol className="space-y-2 text-[15px] text-slate-700 leading-relaxed">
                      <li className="flex gap-2"><b className="text-green-700 shrink-0">①</b><span>화면 <b>맨 아래 가운데</b>에 있는 <b>공유 버튼</b> <span className="inline-block border border-slate-400 rounded px-1 text-[13px]">⬆︎ 네모에서 화살표가 위로 나온 모양</span>을 누르세요.</span></li>
                      <li className="flex gap-2"><b className="text-green-700 shrink-0">②</b><span>나오는 목록을 <b>아래로 내려서</b> <b>[홈 화면에 추가]</b>를 누르세요.</span></li>
                      <li className="flex gap-2"><b className="text-green-700 shrink-0">③</b><span>오른쪽 위 <b>[추가]</b>를 누르면 끝! 바탕화면에 <b>'견적서'</b> 아이콘이 생겨요.</span></li>
                    </ol>
                  ) : platform === 'android' ? (
                    <ol className="space-y-2 text-[15px] text-slate-700 leading-relaxed">
                      <li className="flex gap-2"><b className="text-green-700 shrink-0">①</b><span>화면 <b>오른쪽 위</b>의 <b>점 세 개 (⋮)</b>를 누르세요.</span></li>
                      <li className="flex gap-2"><b className="text-green-700 shrink-0">②</b><span><b>[홈 화면에 추가]</b> 또는 <b>[앱 설치]</b>를 누르세요.</span></li>
                      <li className="flex gap-2"><b className="text-green-700 shrink-0">③</b><span><b>[추가]</b>를 누르면 끝! 바탕화면에 <b>'견적서'</b> 아이콘이 생겨요.</span></li>
                    </ol>
                  ) : (
                    <p className="text-[15px] text-slate-600">폰으로 이 주소를 열면 바탕화면에 넣는 방법이 나와요. 컴퓨터에서는 주소창 오른쪽 끝의 <b>설치 아이콘</b>을 누르세요.</p>
                  )}
                </div>
              )}
              <CoupangAd slot={0} title="🛒 사장님들이 많이 찾는 상품" sub="로켓배송 — 오늘 주문하면 내일 도착해요" />
            </section>
          )}

          {/* ───────── 2단계: 내 사업자 정보 + 도장 ───────── */}
          {step === 2 && (
            <section className="space-y-5">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900">내 사업자 정보</h2>
                <p className="text-slate-500 mt-1">견적서에 '공급자'로 찍히는 내용이에요. <b>사업자명</b>만 꼭 필요해요.</p>
              </div>

              {profiles.length > 0 && (
                <div className="space-y-2">
                  <span className="big-label">📂 저장된 사업자 — 누르면 바로 채워져요</span>
                  <div className="flex flex-wrap gap-2">
                    {profiles.map(p => {
                      const active = p.provider === info.provider.trim();
                      return (
                        <button key={p.provider} onClick={() => loadProfile(p.provider)}
                                className={`profile-chip px-4 py-3 rounded-2xl text-base font-bold border-2 transition ${
                                  active ? 'bg-green-50 border-green-500 text-green-800' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400'}`}>
                          {active ? '✓ ' : ''}{p.provider}{p.stamp ? ' 🔏' : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {profileMsg && <p id="profile-msg" className="text-[15px] text-green-800 bg-green-50 rounded-xl px-4 py-3">{profileMsg}</p>}

              <label className="block">
                <span className="big-label">사업자명 <em className="text-red-500 not-italic">*필수</em></span>
                <input id="f-provider" type="text" placeholder="예: 일광페인팅" value={info.provider} className="input-style" onChange={e => setInfo({ ...info, provider: e.target.value })} />
              </label>
              <label className="block">
                <span className="big-label">사업자번호 <span className="text-slate-400 font-medium">(선택)</span></span>
                <input type="text" inputMode="numeric" placeholder="숫자만 10자리" value={info.bizNumber} className="input-style" onChange={e => handleBizNumberChange(e.target.value)} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="big-label">업태 <span className="text-slate-400 font-medium">(선택)</span></span>
                  <input type="text" placeholder="예: 건설업" value={info.category} className="input-style" onChange={e => setInfo({ ...info, category: e.target.value })} />
                </label>
                <label className="block">
                  <span className="big-label">종목 <span className="text-slate-400 font-medium">(선택)</span></span>
                  <input type="text" placeholder="예: 도장" value={info.sector} className="input-style" onChange={e => setInfo({ ...info, sector: e.target.value })} />
                </label>
              </div>
              <label className="block">
                <span className="big-label">주소 <span className="text-slate-400 font-medium">(선택)</span></span>
                <input type="text" placeholder="예: 서울 강남구 학동로 28" value={info.address} className="input-style" onChange={e => setInfo({ ...info, address: e.target.value })} />
              </label>
              <label className="block">
                <span className="big-label">전화번호 <span className="text-slate-400 font-medium">(선택 — 거래처가 연락할 번호)</span></span>
                <input id="f-phone" type="tel" inputMode="tel" placeholder="예: 010-1234-5678" value={info.phone} className="input-style" onChange={e => setInfo({ ...info, phone: e.target.value })} />
              </label>
              <label className="block">
                <span className="big-label">입금 계좌 <span className="text-slate-400 font-medium">(선택)</span></span>
                <input id="f-account" type="text" placeholder="예: 국민은행 123456-01-123456 홍길동" value={info.account} className="input-style" onChange={e => setInfo({ ...info, account: e.target.value })} />
              </label>

              {/* 도장 또는 손 서명 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <span className="big-label">도장 또는 서명 <span className="text-slate-400 font-medium">(선택)</span></span>
                <input type="file" accept="image/*" ref={fileInputRef} hidden
                       onChange={(e) => { const f = e.target.files?.[0]; if (f) handleStampFile(f); e.target.value = ''; }} />
                {stampImage && !stampBusy ? (
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-20 rounded-xl shrink-0 flex items-center justify-center border border-slate-200 p-1"
                         style={{ backgroundImage: 'conic-gradient(#e5e7eb 25%, #fff 0 50%, #e5e7eb 0 75%, #fff 0)', backgroundSize: '12px 12px' }}>
                      <img src={stampImage} alt="도장 미리보기" className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <p id="stamp-note" className="text-[15px] text-slate-700 font-bold">
                        {stampSource === 'sign' ? '손으로 쓴 서명을 쓰고 있어요.'
                          : stampSource === 'saved' ? '저장해 둔 도장(서명)을 쓰고 있어요.'
                          : stampOriginal && stampImage !== stampOriginal ? '도장 배경을 투명하게 지웠어요.'
                          : '원본 사진 그대로 쓰고 있어요.'}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => fileInputRef.current?.click()} className="text-[15px] font-bold text-blue-700 bg-blue-50 px-3 py-2 rounded-xl">📸 사진으로</button>
                        <button onClick={() => setShowSign(true)} className="text-[15px] font-bold text-blue-700 bg-blue-50 px-3 py-2 rounded-xl">✍️ 다시 서명</button>
                        {stampSource === 'photo' && stampOriginal && (
                          <button onClick={() => stampImage !== stampOriginal ? setStampImage(stampOriginal) : cutoutStamp(stampOriginal)}
                                  className="text-[15px] font-bold text-slate-600 bg-slate-100 px-3 py-2 rounded-xl">
                            {stampImage !== stampOriginal ? '원본으로' : '배경 지우기'}
                          </button>
                        )}
                        <button onClick={() => { setStampImage(null); setStampOriginal(null); setStampSource(null); }} className="text-[15px] text-slate-400 px-2 py-2">빼기</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => fileInputRef.current?.click()} disabled={stampBusy}
                            className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl py-5 px-2 text-slate-700 font-bold text-base hover:bg-slate-100 transition disabled:opacity-60">
                      {stampBusy ? '⏳ 배경 지우는 중…' : <>📸 도장 사진<br /><span className="text-[13px] font-medium text-slate-400">찍어서 올리면<br />배경은 자동으로 지워져요</span></>}
                    </button>
                    <button id="btn-sign" onClick={() => setShowSign(true)}
                            className="bg-orange-50 border-2 border-dashed border-orange-300 rounded-2xl py-5 px-2 text-slate-800 font-bold text-base hover:bg-orange-100 transition">
                      ✍️ 손으로 서명<br /><span className="text-[13px] font-medium text-slate-500">도장이 없으면<br />손가락으로 서명하세요</span>
                    </button>
                  </div>
                )}
              </div>

              <button id="btn-save-profile" onClick={() => saveProfile(false)}
                      className="w-full text-base font-bold bg-blue-50 text-blue-700 border border-blue-200 py-3 rounded-2xl hover:bg-blue-100 transition">
                💾 이 정보와 도장을 이 폰에 저장해 두기
              </button>
              {info.provider && profiles.some(p => p.provider === info.provider.trim()) && (
                <button onClick={() => deleteProfile(info.provider.trim())} className="w-full text-[14px] text-slate-400 underline py-1">'{info.provider.trim()}' 저장 정보 지우기</button>
              )}

              <CoupangAd slot={1} title="🧰 현장 필수품 한 번에 보기" sub="장갑·공구·안전용품, 떨어지기 전에 챙기세요" />
            </section>
          )}

          {/* ───────── 3단계: 견적 내용 ───────── */}
          {step === 3 && (
            <section className="space-y-5">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900">무엇을 얼마에 하나요?</h2>
                <p className="text-slate-500 mt-1">하나씩 적거나, 문자처럼 쭉 적어서 한 번에 넣을 수 있어요.</p>
              </div>

              {/* 글로 한 번에 넣기 */}
              <div className="bg-white rounded-2xl border-2 border-blue-200 overflow-hidden">
                <button onClick={() => setShowQuick(v => !v)} className="w-full flex items-center justify-between px-4 py-4 text-left">
                  <span className="text-base font-extrabold text-blue-800">✍️ 문자처럼 쭉 적어서 한 번에 넣기</span>
                  <span className="text-slate-400 text-sm">{showQuick ? '접기 ▲' : '열기 ▼'}</span>
                </button>
                {showQuick && (
                  <div className="px-4 pb-4 space-y-3">
                    <p className="text-[15px] text-slate-600 leading-relaxed">
                      한 줄에 하나씩, <b className="text-slate-900">품명 단가 수량</b> 순서로 <b className="text-slate-900">띄어쓰기만</b> 하면 돼요.
                      <b>6만7천원</b>, <b>30만원</b>처럼 말로 적어도 되고, <b>받는분 홍길동</b>처럼 받는 분·공급자도 같이 적을 수 있어요.
                    </p>
                    <textarea id="quick-text" value={quickText} onChange={e => setQuickText(e.target.value)} placeholder={QUICK_EXAMPLE}
                              className="input-style h-44 font-mono !text-[15px] leading-relaxed" />
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <button id="btn-quick-apply" onClick={applyQuickText}
                              className="bg-blue-600 text-white py-4 rounded-2xl font-extrabold text-base shadow hover:bg-blue-700 transition">✨ 자동으로 채우기</button>
                      <button onClick={() => setQuickText(QUICK_EXAMPLE)} className="text-[14px] text-slate-500 px-3 border border-slate-200 rounded-2xl">예시 보기</button>
                    </div>
                    {voiceOk && (
                      <button id="btn-voice" onClick={startVoice} disabled={listening}
                              className={`w-full py-3 rounded-2xl font-extrabold text-base border-2 ${listening ? 'bg-red-50 border-red-300 text-red-600' : 'bg-white border-slate-300 text-slate-700'}`}>
                        {listening ? '🎙 듣고 있어요… 말씀하세요' : '🎤 말로 적기 (예: "하도 1말 육만칠천원 세 개")'}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {/* 결과 안내는 입력창을 접어도 보이도록 카드 바깥에 */}
              {quickMsg && <p id="quick-msg" className="text-[15px] text-slate-800 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 whitespace-pre-line leading-relaxed">{quickMsg}</p>}

              {/* 자주 쓰는 품목 */}
              {freqItems.length > 0 && (
                <div id="freq-card" className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
                  <span className="big-label">⭐ 자주 쓰는 품목 — 누르면 추가돼요</span>
                  <div className="flex flex-wrap gap-2">
                    {freqItems.slice(0, 8).map(f => (
                      <button key={`${f.name}|${f.spec}`} onClick={() => addFreq(f)}
                              className="freq-chip px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 text-[15px] font-bold text-blue-800">
                        {f.name}{f.spec ? <span className="text-blue-500 font-medium"> {f.spec}</span> : ''} · {f.price.toLocaleString()}원
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 항목 카드 */}
              <div id="items-section" className="space-y-3">
                {items.map((item, idx) => {
                  const named = !!item.name.trim();
                  const needCount = named && !(Number(item.count) > 0);
                  const needPrice = named && !(Number(item.price) > 0);
                  const line = (Number(item.count) || 0) * (Number(item.price) || 0);
                  const warn = 'border-red-400 bg-red-50';
                  return (
                    <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 text-sm font-black flex items-center justify-center shrink-0">{idx + 1}</span>
                        <input id={`name-${item.id}`} type="text" placeholder="품명 (예: 하도 페인트)" value={item.name}
                               className="input-style !py-3 flex-1 font-bold" onChange={e => updateItem(item.id, 'name', e.target.value)} />
                        {items.length > 1 && (
                          <button onClick={() => setItems(items.filter(i => i.id !== item.id))} className="w-10 h-10 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 text-xl" aria-label="항목 삭제">✕</button>
                        )}
                      </div>
                      <div className="grid grid-cols-[1fr_1fr] gap-3">
                        <label className="block">
                          <span className="big-label">수량 <em className="text-red-500 not-italic">*</em></span>
                          <div className="relative">
                            <input id={`count-${item.id}`} type="text" inputMode="numeric" placeholder="1" value={item.count}
                                   className={`input-style !py-3 !pr-10 text-right ${needCount ? warn : ''}`}
                                   onChange={e => updateItem(item.id, 'count', e.target.value.replace(/[^\d]/g, ''))} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[15px]">개</span>
                          </div>
                        </label>
                        <label className="block">
                          <span className="big-label">단가 <em className="text-red-500 not-italic">*</em></span>
                          <div className="relative">
                            <input id={`price-${item.id}`} type="text" inputMode="numeric" placeholder="0" value={item.price === '' ? '' : Number(item.price).toLocaleString()}
                                   className={`input-style !py-3 !pr-10 text-right ${needPrice ? warn : ''}`}
                                   onChange={e => updateItem(item.id, 'price', e.target.value.replace(/[^\d]/g, ''))} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[15px]">원</span>
                          </div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <input type="text" placeholder="규격 (선택, 예: 1말)" value={item.spec}
                               className="input-style !py-2 !text-[15px] flex-1" onChange={e => updateItem(item.id, 'spec', e.target.value)} />
                        <span className="text-base font-extrabold text-slate-800 whitespace-nowrap">= {line.toLocaleString()}원</span>
                      </div>
                      {(needCount || needPrice) && <p className="text-[14px] text-red-600 font-bold">{needCount ? '수량' : '단가'}을(를) 적어야 금액에 들어가요.</p>}
                    </div>
                  );
                })}
                <button onClick={addItem} className="w-full bg-white border-2 border-dashed border-blue-300 text-blue-700 rounded-2xl py-4 font-extrabold text-base hover:bg-blue-50 transition">
                  ＋ 항목 하나 더 추가
                </button>
              </div>

              <div className="bg-slate-900 text-white rounded-2xl px-5 py-4 flex items-center justify-between">
                <span className="text-base font-bold">지금까지 합계</span>
                <span className="text-2xl font-black">{supplyAmount.toLocaleString()}원</span>
              </div>
              <CoupangAd slot={0} title="🧤 작업 소모품도 같이 챙기세요" sub="견적 넣은 김에 자재·소모품 미리 준비" />
            </section>
          )}

          {/* ───────── 4단계: 확인 ───────── */}
          {step === 4 && (
            <section className="space-y-5">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900">마지막으로 확인해 주세요</h2>
                <p className="text-slate-500 mt-1">부가세를 고르고 <b>견적서 만들기</b>를 누르면 끝이에요.</p>
              </div>

              <div className="space-y-2">
                <span className="big-label">부가세</span>
                <div className="grid grid-cols-2 gap-3">
                  {([['none', '부가세 없이', '적은 금액 그대로'], ['include', '부가세 포함', '10%를 더해요']] as const).map(([mode, label, sub]) => (
                    <label key={mode}
                           className={`flex flex-col items-start gap-1 rounded-2xl p-4 cursor-pointer border-2 transition ${
                             vatMode === mode ? 'bg-blue-50 border-blue-500' : 'bg-white border-slate-200'}`}>
                      <span className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                        <input type="checkbox" checked={vatMode === mode} onChange={() => { setVatMode(mode); trackEvent('click_vat_mode', label); }} className="w-5 h-5 accent-blue-600" />
                        {label}
                      </span>
                      <span className="text-[14px] text-slate-500 pl-7">{sub}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
                <div className="px-4 py-3 text-[15px] text-slate-500 flex justify-between"><span>받는 분</span><b className="text-slate-900">{info.customer || '(비움)'}</b></div>
                <div className="px-4 py-3 text-[15px] text-slate-500 flex justify-between"><span>공급자</span><b className="text-slate-900">{info.provider}{stampImage ? ' 🔏' : ''}</b></div>
                {items.filter(i => i.name.trim()).map(i => (
                  <div key={i.id} className="px-4 py-3 text-[15px] flex justify-between gap-3">
                    <span className="text-slate-700 truncate">{i.name}{i.spec ? <span className="text-slate-400"> ({i.spec})</span> : ''} × {i.count}</span>
                    <b className="text-slate-900 whitespace-nowrap">{((Number(i.count) || 0) * (Number(i.price) || 0)).toLocaleString()}원</b>
                  </div>
                ))}
                {withVat && (
                  <>
                    <div className="px-4 py-3 text-[15px] text-slate-500 flex justify-between"><span>공급가액</span><span>{supplyAmount.toLocaleString()}원</span></div>
                    <div className="px-4 py-3 text-[15px] text-slate-500 flex justify-between"><span>부가세 (10%)</span><span>{vatAmount.toLocaleString()}원</span></div>
                  </>
                )}
                <div className="px-4 py-4 flex justify-between items-center bg-slate-50 rounded-b-2xl">
                  <span className="text-base font-bold text-slate-700">합계금액{withVat ? ' (부가세 포함)' : ''}</span>
                  <span id="final-total" className="text-2xl font-black text-blue-700">{totalAmount.toLocaleString()}원</span>
                </div>
              </div>

              <label className="block">
                <span className="big-label">견적 유효기간</span>
                <select id="f-valid" value={info.validDays} onChange={e => setInfo({ ...info, validDays: Number(e.target.value) })} className="input-style font-bold">
                  {[7, 15, 30, 60, 90].map(d => <option key={d} value={d}>발행일로부터 {d}일 ({addDaysLabel(info.date, d)}까지)</option>)}
                </select>
              </label>
              <label className="block">
                <span className="big-label">비고·특약사항 <span className="text-slate-400 font-medium">(선택)</span></span>
                <textarea placeholder="예: 계약금 30% 선입금, 자재 변경 시 별도 협의" value={info.remark} className="input-style h-24 !text-base" onChange={e => setInfo({ ...info, remark: e.target.value })} />
              </label>

              <CoupangAd slot={1} title="🎁 거래처에 함께 보내면 좋은 선물" sub="견적서와 같이 챙기면 계약이 더 잘 돼요" />
            </section>
          )}
        </main>

        {/* 하단 고정: 이전 / 다음 (마지막은 견적서 만들기) */}
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 p-3">
          <div className="max-w-xl mx-auto grid grid-cols-[1fr_2fr] gap-3">
            <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}
                    className="py-4 rounded-2xl font-bold text-base bg-slate-100 text-slate-600 disabled:opacity-40">← 이전</button>
            {step < 4 ? (
              <button id="btn-next" onClick={goNext}
                      className="py-4 rounded-2xl font-extrabold text-lg bg-[#FF7E36] text-white shadow-[0_4px_14px_0_rgba(255,126,54,0.39)]">
                다음 →
              </button>
            ) : (
              <button id="btn_preview_open" onClick={openPreview}
                      className="py-4 rounded-2xl font-extrabold text-lg bg-[#FF7E36] text-white shadow-[0_4px_14px_0_rgba(255,126,54,0.39)]">
                🚀 견적서 만들기
              </button>
            )}
          </div>
        </div>
      </div>

      {showPreview && (
      <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-start overflow-y-auto pt-4 pb-24 px-2">
        {inApp === 'kakao' && (
          <a href={kakaoExternalUrl(typeof window !== 'undefined' ? window.location.href : '')}
             className="w-full max-w-[800px] mb-2 text-center py-3 rounded-xl bg-yellow-400 font-extrabold text-base text-slate-900 no-print">
            ⚠️ 카카오톡 안에서는 저장·보내기가 막힐 수 있어요 — 🌐 크롬으로 열기
          </a>
        )}
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
                    <p className="text-[12px] text-slate-500 mb-2 font-medium">일자: {info.date.replace(/-/g, '. ')}{quoteNo && <span className="ml-3">견적번호: {quoteNo}</span>}</p>
                    <p className="text-2xl font-bold border-b-2 border-black pb-1 inline-block min-w-[200px]">{info.customer || '            '} <span className="text-lg font-normal">귀하</span></p>
                    <p className="text-sm mt-3 text-slate-600 font-medium">아래와 같이 견적합니다.</p>
                    <div className="mt-4 text-2xl font-black">
                      합계금액: ₩{totalAmount.toLocaleString()}
                      {withVat && <p className="mt-1 text-xs font-bold text-slate-500 whitespace-nowrap">(부가세 10% 포함)</p>}
                      <p id="korean-amount" className="mt-1 text-[13px] font-bold text-slate-700 whitespace-nowrap">금 {numToKorean(totalAmount)}원정</p>
                      <p className="mt-2 text-[11px] font-medium text-slate-500 whitespace-nowrap">유효기간: 발행일로부터 {info.validDays}일 ({addDaysLabel(info.date, info.validDays)}까지)</p>
                    </div>
                  </div>

                  <div className="w-[400px] shrink-0">
                    <table className="border-collapse border-2 border-black w-full text-[11px] table-fixed">
                      <tbody>
                        <tr>
                          <td className="border border-black p-1 text-center bg-slate-100 font-bold w-10" rowSpan={5}>공<br/>급<br/>자</td>
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
                                {/* 도장은 정사각, 손 서명은 가로로 길어서 폭을 더 준다 */}
                                <img src={stampImage} className="h-12 max-w-[76px] object-contain mix-blend-multiply" alt="도장" />
                              </div>
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-black p-2 bg-slate-100 font-bold text-center">주소</td>
                          <td className="border border-black p-2 text-[10px]" colSpan={3}>{info.address}</td>
                        </tr>
                        <tr>
                          <td className="border border-black p-2 bg-slate-100 font-bold text-center">전화</td>
                          <td className="border border-black p-2 text-center font-bold" colSpan={3}>{info.phone}</td>
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
                          <td className="border border-black">{item?.name?.trim() ? item.count : ''}</td>
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
                      <td className="border border-black">{items.filter(i => i.name.trim()).reduce((a, b) => a + (Number(b.count) || 0), 0) || ''}</td>
                      <td className="border border-black"></td>
                      <td className="border border-black text-right px-2 text-blue-800">₩{totalAmount.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 하단 고정 비고란 */}
              <div className="border-2 border-black p-5 flex-1 h-[300px] text-[11px] bg-slate-50/50 whitespace-pre-wrap text-left mt-auto">
                <p className="font-bold underline mb-2">※ 비고 및 특약사항</p>
                {info.account && <p className="font-bold mb-1">입금계좌: {info.account}</p>}
                <p>{info.remark || "특이사항 없음"}</p>
              </div>
            </div>
          </div>

          {/* 미리보기 아래: 결과를 보며 기다리는 동안 */}
          <div className="w-full max-w-[800px] mt-4 no-print">
            <CoupangAd slot={0} title="📦 견적서 보냈다면, 자재도 미리 준비하세요" sub="사장님들이 많이 주문하는 현장 용품" />
          </div>

          {/* 하단 버튼 바: 보내기(카톡·문자) / 저장 */}
          <div className="fixed bottom-0 left-0 right-0 p-3 bg-slate-900/95 grid grid-cols-[3fr_2fr] gap-2 no-print z-[60]">
            <button id="btn_share_open" onClick={() => setSheet('share')} className="bg-[#FF7E36] text-white py-4 rounded-2xl font-extrabold text-lg">📨 보내기 (카톡·문자)</button>
            <button id="btn_save_open" onClick={() => setSheet('save')} className="bg-white text-slate-900 py-4 rounded-2xl font-extrabold text-base">💾 저장</button>
          </div>

          {/* 형식 선택 */}
          {sheet && (
            <div className="fixed inset-0 z-[70] bg-black/60 flex items-end justify-center no-print" onClick={() => setSheet(null)}>
              <div className="bg-white rounded-t-3xl w-full max-w-md p-5 pb-7 space-y-3" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-black text-center text-slate-900">{sheet === 'share' ? '📨 어떤 형식으로 보낼까요?' : '💾 어떤 형식으로 저장할까요?'}</h3>
                <button id={`opt-${sheet}-jpg`} onClick={() => startAction(sheet, 'jpg')} className="w-full py-4 rounded-2xl bg-[#FF7E36] text-white font-extrabold text-lg">
                  🖼 이미지 (사진)<span className="block text-[13px] font-medium opacity-90">카톡에서 바로 보여요 — 가장 추천</span>
                </button>
                <button id={`opt-${sheet}-pdf`} onClick={() => startAction(sheet, 'pdf')} className="w-full py-4 rounded-2xl bg-blue-600 text-white font-extrabold text-lg">
                  📄 PDF<span className="block text-[13px] font-medium opacity-90">인쇄하거나 이메일로 보낼 때</span>
                </button>
                {sheet === 'save' && (
                  <button id="opt-save-xlsx" onClick={() => startAction('save', 'xlsx')} className="w-full py-4 rounded-2xl bg-green-600 text-white font-extrabold text-lg">
                    📊 엑셀<span className="block text-[13px] font-medium opacity-90">숫자를 고쳐서 다시 쓰려면</span>
                  </button>
                )}
                <button onClick={() => setSheet(null)} className="w-full py-3 text-slate-500 font-bold text-base">취소</button>
              </div>
            </div>
          )}
        </div>
      )}

      {showSign && (
        <SignaturePad
          onClose={() => setShowSign(false)}
          onDone={(png) => { setStampImage(png); setStampOriginal(null); setStampSource('sign'); setShowSign(false); trackEvent('signature_done', 'pad'); }}
        />
      )}

      {doneMsg && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4 no-print">
          <div id="done-msg" className="bg-white rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="text-center">
              <div className="text-5xl mb-2">✅</div>
              <h3 className="text-xl font-black text-slate-900">저장됐어요!</h3>
              <p className="text-[15px] text-slate-600 mt-2 whitespace-pre-line leading-relaxed">{doneMsg}</p>
            </div>
            <CoupangAd slot={1} title="💡 이런 상품도 많이 봐요" sub="오늘 주문하면 내일 도착" />
            {!standalone && !IS_TOSS && <p className="text-[14px] text-slate-500 text-center">다음엔 더 빨리 쓰려면 첫 화면의 <b>📱 바탕화면에 넣기</b>를 해 두세요.</p>}
            <button onClick={() => setDoneMsg('')} className="w-full py-4 rounded-2xl bg-blue-600 text-white font-extrabold text-lg">확인</button>
          </div>
        </div>
      )}

      {showAdModal && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-md text-center space-y-3 shadow-2xl max-h-[92vh] overflow-y-auto">
            {IS_TOSS ? (
              <>
                <h3 className="text-xl font-black">견적서 파일을 만들고 있어요</h3>
                <p className="text-[15px] text-slate-500">{pending?.kind ? FILE_LABEL[pending.kind] : ''} 견적서가 준비되면 아래 <b>{pending?.mode === 'share' ? '보내기' : '저장하기'}</b> 버튼이 켜져요.</p>
                <div className="text-5xl py-4">🧾</div>
              </>
            ) : (
              <>
                <h3 className="text-xl font-black">잠깐만요, {AD_SECONDS}초만 기다려 주세요</h3>
                <p className="text-[15px] text-slate-500">{pending?.kind ? FILE_LABEL[pending.kind] : ''} 견적서를 만드는 동안 광고가 나와요. 끝나면 아래 <b>{pending?.mode === 'share' ? '보내기' : '저장하기'}</b> 버튼이 켜져요.</p>
                {AD_VIDEO_URL ? (
                  <video src={AD_VIDEO_URL} autoPlay muted playsInline className="w-full rounded-2xl bg-black" onEnded={() => setAdLeft(0)} />
                ) : (
                  <CoupangAd slot={1} title="🛒 오늘의 추천 상품" sub="로켓배송 — 내일 도착" />
                )}
                <div onClick={handleAdConfirm} className="cursor-pointer border border-blue-100 rounded-2xl overflow-hidden">
                  <a href="https://iryan.kr/t8f69fuddg" target="_blank" rel="noreferrer" id="btn_ad_medicok" onClick={() => trackEvent('click_ad_image', '메디콕 광고 이미지 클릭')} className="block"><img src="http://img.tenping.kr/Content/Upload/Images/2025111715060001_Dis_20251117151015.jpg" className="w-full" /><div className="p-2 bg-blue-50 text-blue-700 font-bold text-[14px]">맞춤형 건강기능식품 메디콕 (누르면 바로 저장돼요)</div></a>
                </div>
              </>
            )}
            <div className="grid grid-cols-[1fr_2fr] gap-3 pt-1">
              <button onClick={() => setShowAdModal(false)} className="py-4 rounded-2xl bg-gray-100 font-bold text-slate-500">취소</button>
              <button id="btn_ad_confirm_save" disabled={adLeft > 0 || !genFile}
                      onClick={() => { trackEvent('click_ad_save_action', pending?.mode || ''); handleAdConfirm(); }}
                      className="py-4 rounded-2xl bg-blue-600 text-white font-extrabold text-lg disabled:bg-slate-300 disabled:text-slate-500">
                {adLeft > 0 ? `${adLeft}초 후 ${pending?.mode === 'share' ? '보낼' : '저장할'} 수 있어요`
                  : genError ? '파일을 못 만들었어요 — 취소 후 다시'
                  : !genFile ? '⏳ 파일 만드는 중…'
                  : pending?.mode === 'share' ? '📨 보내기' : '💾 저장하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        /* 50~60대 기준: 글씨 18px, 손가락으로 누르기 좋은 높이(56px) */
        .input-style { width: 100%; padding: 0.95rem 1rem; min-height: 56px; background-color: #fff; border-radius: 1rem; font-size: 1.125rem; outline: none; border: 2px solid #e2e8f0; color: #0f172a; }
        .input-style:focus { border-color: #FF7E36; box-shadow: 0 0 0 4px rgba(255,126,54,0.15); }
        .input-style::placeholder { color: #94a3b8; }
        .big-label { display: block; font-size: 1rem; font-weight: 800; color: #334155; margin-bottom: 0.4rem; }
        .preview-container { width: 800px; min-width: 800px; background: white; }
        @media (max-width: 800px) { .preview-container { transform: scale(${(typeof window !== 'undefined' ? window.innerWidth - 32 : 800) / 800}); } }
        @media print { .no-print { display: none !important; } .fixed { position: static !important; } .preview-container { transform: scale(1) !important; width: 100% !important; margin: 0 !important; } }
      `}</style>
    </div>
  );
}