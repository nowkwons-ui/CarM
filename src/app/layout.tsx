import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'PlateTalk (플레이트톡) | 차량 번호판 기반 실시간 운전자 핸즈프리 소통 & 명예 플랫폼',
  description:
    '차량 번호판(License Plate)을 고유 ID로 활용하여 운전 중 완벽한 핸즈프리(STT/TTS) 안전 소통, 차량 이상 공유, 화물 낙하 5km 브로드캐스트, 번호판 기프티콘 선물하기 및 실물 명예 스티커 보상을 제공하는 플랫폼',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#04070f] text-slate-100 selection:bg-sky-500/30 selection:text-sky-200`}
      >
        {children}
      </body>
    </html>
  );
}
