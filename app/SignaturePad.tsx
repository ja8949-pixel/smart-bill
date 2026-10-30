'use client';

/**
 * 손 서명 패드 — 도장이 없을 때 손가락/펜으로 서명해 투명 PNG 로 만든다.
 *
 * 정확도를 위해 한 것들
 *  - 캔버스 픽셀 = 보이는 크기 × devicePixelRatio  → 흐릿함·좌표 밀림 없음
 *  - pointer 이벤트 + getCoalescedEvents           → 빠르게 그어도 중간 점을 안 놓침
 *  - 점 사이를 중점 기준 2차 곡선으로 연결           → 꺾임 없이 부드러움
 *  - 속도에 따라 굵기 변화                          → 펜으로 쓴 느낌
 *  - 내보낼 때는 안내선 없이 새 캔버스에 3배 해상도로 다시 그리고 여백을 잘라낸다
 *  - touch-action:none + 스크롤 잠금                → 서명 중 화면이 밀리지 않음
 */
import { useEffect, useRef, useState } from 'react';

interface Props { onDone: (png: string) => void; onClose: () => void; }
type Pt = { x: number; y: number; t: number };

const COLORS: [string, string][] = [['#111827', '검정'], ['#1d4ed8', '파랑'], ['#dc2626', '빨강']];
const W_MAX = 3.4, W_MIN = 1.5;

function widthFor(a: Pt, b: Pt, prev: number): number {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const dt = Math.max(1, b.t - a.t);
  const v = d / dt;                               // px/ms
  const target = Math.max(W_MIN, Math.min(W_MAX, W_MAX - v * 1.6));
  return prev * 0.7 + target * 0.3;               // 급격한 굵기 변화 완화
}

function drawStroke(ctx: CanvasRenderingContext2D, pts: Pt[], color: string) {
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (pts.length === 1) {                          // 점 하나 (톡 찍음)
    ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, W_MAX / 2, 0, Math.PI * 2); ctx.fill();
    return;
  }
  let w = W_MAX * 0.8;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i];
    const pPrev = pts[i - 2] ?? p0;
    const m0 = { x: (pPrev.x + p0.x) / 2, y: (pPrev.y + p0.y) / 2 };
    const m1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    w = widthFor(p0, p1, w);
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(m0.x, m0.y);
    ctx.quadraticCurveTo(p0.x, p0.y, m1.x, m1.y);
    ctx.stroke();
  }
}

export default function SignaturePad({ onDone, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<{ pts: Pt[]; color: string }[]>([]);
  const cur = useRef<Pt[] | null>(null);
  const colorRef = useRef(COLORS[0][0]);
  const [color, setColor] = useState(COLORS[0][0]);
  const [count, setCount] = useState(0);          // 획 수 (버튼 활성용)

  const dpr = () => Math.max(1, window.devicePixelRatio || 1);

  const ctx2 = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
    return ctx;
  };

  const redraw = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = ctx2();
    const r = c.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    // 안내선 (내보낼 때는 안 들어감)
    ctx.save();
    ctx.setLineDash([6, 6]); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(20, r.height * 0.72); ctx.lineTo(r.width - 20, r.height * 0.72); ctx.stroke();
    ctx.restore();
    for (const s of strokes.current) drawStroke(ctx, s.pts, s.color);
  };

  const fit = () => {
    const c = canvasRef.current; if (!c) return;
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width * dpr());
    c.height = Math.round(r.height * dpr());
    redraw();
  };

  useEffect(() => {
    fit();
    window.addEventListener('resize', fit);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';            // 서명 중 페이지 스크롤 잠금
    return () => { window.removeEventListener('resize', fit); document.body.style.overflow = prevOverflow; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: { clientX: number; clientY: number; timeStamp: number }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    cur.current = [pos(e)];
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!cur.current) return;
    e.preventDefault();
    const native = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
    const evs = native.getCoalescedEvents?.() ?? [native];
    const ctx = ctx2();
    for (const ev of evs.length ? evs : [native]) {
      const p = pos(ev);
      const last = cur.current[cur.current.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.4) continue;   // 제자리 떨림 무시
      cur.current.push(p);
    }
    // 현재 획만 다시 그림 (지난 획 위에 덧그려도 같은 색이라 문제 없음)
    drawStroke(ctx, cur.current.slice(-4), colorRef.current);
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!cur.current) return;
    e.preventDefault();
    try { canvasRef.current!.releasePointerCapture(e.pointerId); } catch {}
    strokes.current.push({ pts: cur.current, color: colorRef.current });
    cur.current = null;
    setCount(strokes.current.length);
    redraw();
  };

  const undo = () => { strokes.current.pop(); setCount(strokes.current.length); redraw(); };
  const clear = () => { strokes.current = []; setCount(0); redraw(); };
  const pick = (c: string) => { colorRef.current = c; setColor(c); };

  // 투명 배경 PNG — 안내선 없이, 3배 해상도, 여백 잘라서
  const exportPng = (): string | null => {
    const all = strokes.current.flatMap(s => s.pts);
    if (!all.length) return null;
    const pad = W_MAX + 4;
    const minX = Math.min(...all.map(p => p.x)) - pad, maxX = Math.max(...all.map(p => p.x)) + pad;
    const minY = Math.min(...all.map(p => p.y)) - pad, maxY = Math.max(...all.map(p => p.y)) + pad;
    const w = maxX - minX, h = maxY - minY;
    const s = Math.min(3, 900 / Math.max(w, h));
    const off = document.createElement('canvas');
    off.width = Math.ceil(w * s); off.height = Math.ceil(h * s);
    const ctx = off.getContext('2d')!;
    ctx.scale(s, s); ctx.translate(-minX, -minY);
    for (const st of strokes.current) drawStroke(ctx, st.pts, st.color);
    return off.toDataURL('image/png');
  };

  const done = () => {
    const png = exportPng();
    if (!png) { alert('서명을 먼저 해 주세요.'); return; }
    onDone(png);
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/85 flex flex-col items-center justify-center p-3">
      <div className="bg-white rounded-3xl w-full max-w-lg p-4 space-y-3 shadow-2xl">
        <div>
          <h3 className="text-xl font-black text-slate-900">✍️ 손으로 서명하기</h3>
          <p className="text-[15px] text-slate-600 mt-1">아래 네모 안에 손가락이나 펜으로 서명하세요. <b>천천히 크게</b> 쓰면 더 잘 나와요.</p>
        </div>
        <div className="relative rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 overflow-hidden">
          <canvas
            ref={canvasRef}
            id="sign-canvas"
            className="block w-full h-[240px] touch-none select-none"
            style={{ touchAction: 'none' }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}
            onContextMenu={e => e.preventDefault()}
          />
          {count === 0 && <span className="absolute inset-0 flex items-center justify-center text-slate-300 text-2xl font-bold pointer-events-none">여기에 서명</span>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            {COLORS.map(([c, label]) => (
              <button key={c} onClick={() => pick(c)} aria-label={label}
                      className={`w-10 h-10 rounded-full border-4 ${color === c ? 'border-orange-400 scale-110' : 'border-white'} shadow`} style={{ background: c }} />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={undo} disabled={!count} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-[15px] disabled:opacity-40">↶ 한 획 지우기</button>
            <button onClick={clear} disabled={!count} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-[15px] disabled:opacity-40">다시 쓰기</button>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_2fr] gap-3 pt-1">
          <button onClick={onClose} className="py-4 rounded-2xl bg-slate-100 text-slate-600 font-bold text-base">취소</button>
          <button id="sign-done" onClick={done} disabled={!count}
                  className="py-4 rounded-2xl bg-[#FF7E36] text-white font-extrabold text-lg disabled:opacity-40">✅ 이 서명 쓰기</button>
        </div>
      </div>
    </div>
  );
}
