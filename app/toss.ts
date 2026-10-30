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
