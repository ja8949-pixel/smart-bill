import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
}); // <- 이 부분의 오타(Rand)를 제거했습니다.

export const metadata: Metadata = {
  title: "SMART BILL",
  description: "스마트한 견적서 생성기",
  // 홈 화면에 추가(앱처럼 설치)용
  manifest: "/manifest.json",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "견적서", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#FF7E36",
  width: "device-width",
  initialScale: 1,
  // 토스 미니앱 심사 항목: 손가락 확대·축소(핀치 줌) 끄기
  ...(process.env.NEXT_PUBLIC_AIT === '1' ? { maximumScale: 1, userScalable: false } : {}),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {/* 구글 애널리틱스 스크립트 */}
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-V10XP0L5M3"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-V10XP0L5M3');
          `}
        </Script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}