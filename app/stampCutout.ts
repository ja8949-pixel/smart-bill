/**
 * 도장 사진 배경 제거(누끼) — 브라우저 canvas 로만 처리 (서버 전송 없음)
 *
 * 1) 테두리 픽셀로 배경(종이) 색을 추정
 * 2) 배경색과의 거리로 투명도 결정 (부드러운 경계)
 *    - 그림자 진 종이(채도 낮고 배경 밝기 근처)는 배경으로 처리
 * 3) 반투명 경계는 배경색을 빼서 색 번짐(흰 테두리) 제거
 * 4) 도장 부분만 남게 여백 잘라내기
 */

const MAX_SIDE = 600; // 처리 속도·용량용 축소 (견적서에는 48px 로 표시됨)

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const median = (arr: number[]) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** 저장(localStorage)용으로 긴 변을 maxSide 이하로 줄인 PNG 반환. 이미 작으면 그대로. */
export async function shrinkForStorage(dataUrl: string, maxSide = 400): Promise<string> {
  if (dataUrl.length < 400_000) return dataUrl;
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

export async function removeStampBackground(dataUrl: string): Promise<{ result: string; changed: boolean }> {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { result: dataUrl, changed: false };
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // 테두리 픽셀 수집
  const border: number[] = [];
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.03));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < band || y < band || x >= w - band || y >= h - band) border.push((y * w + x) * 4);
    }
  }

  // 이미 투명 배경인 PNG → 그대로 사용
  const transparentBorder = border.filter((i) => px[i + 3] < 30).length / border.length;
  if (transparentBorder > 0.5) return { result: dataUrl, changed: false };

  const bg = [0, 1, 2].map((c) => median(border.map((i) => px[i + c])));
  const bgL = (bg[0] + bg[1] + bg[2]) / 3;

  // 테두리 안의 색 편차로 임계값 조정 (조명 얼룩이 큰 사진일수록 관대하게)
  const borderDist = border.map((i) =>
    Math.hypot(px[i] - bg[0], px[i + 1] - bg[1], px[i + 2] - bg[2]));
  const noise = median(borderDist);
  const lo = Math.max(28, noise * 2.5);  // 이하 → 완전 투명
  const hi = lo + 55;                    // 이상 → 완전 불투명

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      let d = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);

      // 그림자 진 종이: 채도 낮고 밝기가 배경의 65% 이상 → 배경
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      const L = (r + g + b) / 3;
      if (sat < 0.18 && L > bgL * 0.65) d = Math.min(d, lo);

      let a = (d - lo) / (hi - lo);
      a = a <= 0 ? 0 : a >= 1 ? 1 : a;

      if (a > 0 && a < 1) {
        // 배경색이 섞인 경계 픽셀에서 배경 성분 제거 → 흰 테두리 방지
        px[i]     = Math.min(255, Math.max(0, (r - (1 - a) * bg[0]) / a));
        px[i + 1] = Math.min(255, Math.max(0, (g - (1 - a) * bg[1]) / a));
        px[i + 2] = Math.min(255, Math.max(0, (b - (1 - a) * bg[2]) / a));
      }
      px[i + 3] = Math.round(a * 255 * (px[i + 3] / 255));

      if (px[i + 3] > 40) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { result: dataUrl, changed: false }; // 도장을 못 찾음 → 원본 유지

  ctx.putImageData(data, 0, 0);

  // 도장 부분만 잘라내기 (약간의 여백)
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04) + 2;
  const cx = Math.max(0, minX - pad), cy = Math.max(0, minY - pad);
  const cw = Math.min(w, maxX + pad + 1) - cx, ch = Math.min(h, maxY + pad + 1) - cy;
  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  out.getContext('2d')!.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
  return { result: out.toDataURL('image/png'), changed: true };
}
