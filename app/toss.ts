/**
 * 토스 미니앱(앱인토스) 빌드 전용 스위치.
 *  - `npm run build:ait` 로 빌드할 때만 NEXT_PUBLIC_AIT=1 이 되어 IS_TOSS 가 true.
 *  - 토스 심사 정책: 외부 광고(쿠팡·텐핑) 금지, 앱 설치 유도 금지, 외부 사이트 이동 제한.
 *    그래서 토스 모드에서는 광고·홈 화면 추가·카톡 외부열기를 전부 뺀다.
 *  - 토스 웹뷰는 <a download>·navigator.share 가 막혀 있어 파일 저장은 토스 브리지(File.saveBase64)로 한다.
 */
export const IS_TOSS = process.env.NEXT_PUBLIC_AIT === '1';

const fileToBase64 = (file: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

// ── 보상형 광고 (저장·보내기 전에 짧은 영상 광고) ─────────────────────
//  개발·심사 중엔 토스 테스트 ID. 콘솔에서 '보상형' 광고 그룹을 만들어 받은 ID 를
//  NEXT_PUBLIC_AIT_REWARDED_ID 환경변수(또는 아래 값)에 넣고 다시 빌드하면 진짜 광고가 나온다.
//  (실제 ID 로 테스트하면 정책 위반 처리되니, 테스트 땐 반드시 아래 테스트 ID)
const REWARDED_AD_GROUP_ID = process.env.NEXT_PUBLIC_AIT_REWARDED_ID || 'ait-ad-test-rewarded-id';

let unloadAd: () => void = () => {};
let adLoaded = false;

/** 광고를 미리 불러 둔다 (미리보기 화면에 들어올 때·광고를 닫은 직후). 지원 안 되면 조용히 무시 */
export async function preloadRewardedAd(): Promise<void> {
  if (!IS_TOSS) return;
  try {
    const { loadFullScreenAd } = await import('@apps-in-toss/web-framework');
    if (!loadFullScreenAd.isSupported()) return;
    adLoaded = false;
    unloadAd();
    unloadAd = loadFullScreenAd({
      options: { adGroupId: REWARDED_AD_GROUP_ID },
      onEvent: (e) => { if (e.type === 'loaded') adLoaded = true; },
      onError: () => { adLoaded = false; },
    });
  } catch { adLoaded = false; }
}

/**
 * 보상형 광고를 보여 준다.
 *  'rewarded' — 끝까지 봄 (저장해도 됨)
 *  'skipped'  — 광고를 못 띄움(구버전 토스·광고 없음·오류) → 사용자를 막지 않고 저장해 준다
 *  'closed'   — 중간에 닫음 (저장하지 않고 다시 안내)
 * 보상은 userEarnedReward 에서만 인정한다 (dismissed 만으로는 인정 X — 토스 정책)
 */
export async function showRewardedAd(): Promise<'rewarded' | 'skipped' | 'closed'> {
  if (!IS_TOSS) return 'skipped';
  try {
    const { showFullScreenAd } = await import('@apps-in-toss/web-framework');
    if (!showFullScreenAd.isSupported()) return 'skipped';
    if (!adLoaded) await preloadRewardedAd();           // 아직 못 불러왔으면 한 번 더 시도 (로드 완료는 이벤트로 오므로 잠깐 대기)
    for (let i = 0; i < 20 && !adLoaded; i++) await new Promise(r => setTimeout(r, 100));
    if (!adLoaded) return 'skipped';
    return await new Promise(resolve => {
      let earned = false;
      showFullScreenAd({
        options: { adGroupId: REWARDED_AD_GROUP_ID },
        onEvent: (e) => {
          if (e.type === 'userEarnedReward') earned = true;
          else if (e.type === 'dismissed') { adLoaded = false; preloadRewardedAd(); resolve(earned ? 'rewarded' : 'closed'); }
          else if (e.type === 'failedToShow') { adLoaded = false; resolve('skipped'); }
        },
        onError: () => { adLoaded = false; resolve('skipped'); },
      });
    });
  } catch { return 'skipped'; }
}

/** 토스 앱의 파일 저장 브리지로 저장. 토스 밖(일반 브라우저)이거나 구버전이면 false → 호출한 쪽에서 일반 다운로드로 대체 */
export async function tossSaveFile(file: File): Promise<boolean> {
  if (!IS_TOSS) return false;
  try {
    const { File: TossFile } = await import('@apps-in-toss/web-framework');
    if (!TossFile.saveBase64.isSupported()) return false;
    await TossFile.saveBase64({ data: await fileToBase64(file), fileName: file.name, mimeType: file.type });
    return true;
  } catch {
    return false;
  }
}
