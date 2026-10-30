import { defineConfig } from '@apps-in-toss/web-framework/config';

// 앱인토스 미니앱 설정. appName 은 콘솔에 등록한 값과 글자 하나까지 같아야 업로드된다.
export default defineConfig({
  appName: 'smart-bill',
  brand: {
    primaryColor: '#FF7E36',
  },
  navigationBar: {
    withBackButton: true,
    withHomeButton: false,
    withTitle: true,
  },
  webView: {
    bounces: false,
    overScrollMode: 'never',
    pullToRefreshEnabled: false,
  },
  // 도장 사진 올리기(앨범에서 고르기)에만 쓴다
  permissions: [
    { name: 'photos', access: 'read' },
  ],
  // next build (output: 'export') 결과물 폴더
  webBundleDir: 'out',
});
