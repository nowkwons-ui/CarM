'use client';

import React, { useState } from 'react';
import {
  Navigation,
  Bell,
  Car,
  Award,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  Smartphone,
  Monitor,
  Wifi,
  BatteryCharging,
  Signal,
} from 'lucide-react';
import {
  PlateTalkProvider,
  usePlateTalk,
  ActiveTabId,
} from '@/context/PlateTalkContext';
import DrivingHudTab from '@/components/DrivingHudTab';
import AlertsAndGiftsTab from '@/components/AlertsAndGiftsTab';
import CommunityShowroomTab from '@/components/CommunityShowroomTab';
import HonorHubTab from '@/components/HonorHubTab';
import GarageAuthTab from '@/components/GarageAuthTab';
import QuickGiftModal from '@/components/QuickGiftModal';

const NAV_TABS: {
  id: ActiveTabId;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'HUD',
    label: '드라이빙 HUD',
    shortLabel: 'HUD 홈',
    icon: Navigation,
  },
  {
    id: 'ALERTS_GIFTS',
    label: '알림 & 선물함',
    shortLabel: '알림·선물',
    icon: Bell,
  },
  {
    id: 'COMMUNITY',
    label: '쇼룸 & 커뮤니티',
    shortLabel: '쇼룸·소통',
    icon: Car,
  },
  {
    id: 'HONOR',
    label: '명예의 전당',
    shortLabel: '명예·스티커',
    icon: Award,
  },
  {
    id: 'GARAGE',
    label: '마이 개러지',
    shortLabel: '내차·인증',
    icon: ShieldCheck,
  },
];

function PlateTalkMobileAppShell() {
  const {
    activeTab,
    setActiveTab,
    user,
    activeVehicle,
    drivingMessages,
    giftTransactions,
    toastBanner,
  } = usePlateTalk();

  // 모바일 뷰포트 모드: 'PORTRAIT' (스마트폰 세로 앱 430px) vs 'CAR_MOUNT' (차량 거치대 대시보드 와이드 모드)
  const [viewportMode, setViewportMode] = useState<'PORTRAIT' | 'CAR_MOUNT'>(
    'PORTRAIT'
  );

  const unreadActiveCount = drivingMessages.filter(
    (m) => !m.is_dismissed
  ).length;
  const unredeemedGiftsCount = giftTransactions.filter(
    (g) => g.direction === 'RECEIVED' && g.payment_status === 'PAID'
  ).length;
  const totalBadge = unreadActiveCount + unredeemedGiftsCount;

  return (
    <div className="min-h-screen bg-[#020409] text-slate-100 flex flex-col items-center justify-start sm:py-4 sm:px-3">
      {/* 상단 디바이스 뷰포트 모드 스위처 (모바일 세로 앱 ↔ 차량 대시보드 가로 거치 모드) */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800/90 bg-slate-900/90 px-3.5 py-2 text-xs backdrop-blur-md w-full max-w-[440px]">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold text-slate-200">PlateTalk Mobile PWA</span>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-slate-950 p-1 border border-slate-800">
          <button
            type="button"
            id="switch-portrait-mobile-btn"
            onClick={() => setViewportMode('PORTRAIT')}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              viewportMode === 'PORTRAIT'
                ? 'bg-sky-400 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="h-3 w-3" />
            <span>모바일 세로형 (430px)</span>
          </button>
          <button
            type="button"
            id="switch-carmount-wide-btn"
            onClick={() => setViewportMode('CAR_MOUNT')}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              viewportMode === 'CAR_MOUNT'
                ? 'bg-emerald-400 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Monitor className="h-3 w-3" />
            <span>차량 거치 와이드 HUD</span>
          </button>
        </div>
      </div>

      {/* 스마트폰 / 차량 거치대 메인 앱 컨테이너 */}
      <div
        className={`relative flex flex-col w-full overflow-hidden bg-[#050811] sm:rounded-[38px] sm:border-[3px] sm:border-slate-800/90 shadow-[0_24px_80px_rgba(0,0,0,0.85)] transition-all duration-300 ${
          viewportMode === 'PORTRAIT'
            ? 'max-w-[440px] min-h-[860px]'
            : 'max-w-5xl min-h-[760px]'
        }`}
      >
        {/* 1. 모바일 네이티브 상태 표시줄 (iOS/Android Status Bar) */}
        <div className="flex items-center justify-between bg-[#050811] px-6 pt-3 pb-1.5 text-[11px] font-semibold text-slate-300 select-none">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-white">09:41</span>
            <span className="rounded bg-sky-500/20 px-1.5 py-0.2 text-[9px] font-bold text-sky-300 border border-sky-400/30">
              RTSP 연결됨
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <Signal className="h-3 w-3 text-emerald-400" />
            <span className="text-[10px] font-mono">5G</span>
            <Wifi className="h-3 w-3 text-sky-400" />
            <BatteryCharging className="h-3.5 w-3.5 text-emerald-400" />
          </div>
        </div>

        {/* 2. 모바일 앱 상단 헤더 */}
        <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#050811]/95 px-4 py-2.5 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-emerald-400 text-slate-950 font-black text-sm shadow-md">
                PT
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-black tracking-tight text-white">
                    PlateTalk <span className="text-sky-400">모바일</span>
                  </h1>
                  <span className="rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                    {activeVehicle.license_plate}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  핸즈프리 음성 소통 & 번호판 명예 커뮤니티
                </p>
              </div>
            </div>

            {/* 우측 인증배지 & 명예점수 알약 */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                id="header-garage-status-btn"
                onClick={() => setActiveTab('GARAGE')}
                className={`flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[10px] font-extrabold transition ${
                  activeVehicle.verification_status === 'VERIFIED'
                    ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                    : activeVehicle.verification_status === 'PENDING'
                    ? 'border-amber-400/50 bg-amber-500/15 text-amber-300'
                    : 'border-rose-400/50 bg-rose-500/15 text-rose-300'
                }`}
              >
                <ShieldCheck className="h-3 w-3" />
                <span>{activeVehicle.verification_status}</span>
              </button>

              <button
                type="button"
                id="header-honor-points-btn"
                onClick={() => setActiveTab('HONOR')}
                className="flex items-center gap-1 rounded-xl border border-sky-400/40 bg-sky-500/15 px-2.5 py-1 text-[10px] font-extrabold text-sky-300"
              >
                <Award className="h-3 w-3 text-emerald-400" />
                <span className="font-mono">
                  {user.honor_points.toLocaleString()}P
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* 실시간 토스트 알림 배너 */}
        {toastBanner && (
          <div className="px-3 pt-2.5">
            <div
              className={`flex items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-bold shadow-xl ${
                toastBanner.tone === 'emerald'
                  ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200'
                  : toastBanner.tone === 'amber'
                  ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                  : toastBanner.tone === 'rose'
                  ? 'border-rose-400/60 bg-rose-500/15 text-rose-200'
                  : 'border-sky-400/60 bg-sky-500/15 text-sky-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {toastBanner.tone === 'rose' ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                ) : (
                  <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" />
                )}
                <span className="leading-snug">{toastBanner.message}</span>
              </div>
            </div>
          </div>
        )}

        {/* 3. 모바일 스크롤 컨텐츠 영역 */}
        <main className="flex-1 overflow-y-auto px-3.5 pt-3.5 pb-28">
          {activeTab === 'HUD' && <DrivingHudTab />}
          {activeTab === 'ALERTS_GIFTS' && <AlertsAndGiftsTab />}
          {activeTab === 'COMMUNITY' && <CommunityShowroomTab />}
          {activeTab === 'HONOR' && <HonorHubTab />}
          {activeTab === 'GARAGE' && <GarageAuthTab />}
        </main>

        {/* 원클릭 기프트 답례 모달 */}
        <QuickGiftModal />

        {/* 4. 모바일 앱 하단 고정 5탭 네비게이션 바 (Bottom App Bar) */}
        <nav
          aria-label="모바일 하단 탭 네비게이션"
          className="sticky bottom-0 inset-x-0 z-40 border-t border-slate-800/90 bg-[#050811]/95 px-2 pt-2 pb-3 backdrop-blur-xl"
        >
          <div className="grid grid-cols-5 gap-1">
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  id={`mobile-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex flex-col items-center justify-center rounded-2xl py-2 text-[11px] font-extrabold transition ${
                    isActive
                      ? 'bg-gradient-to-b from-sky-500/25 to-emerald-500/20 text-sky-300 border border-sky-400/50 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      isActive ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  />
                  <span className="mt-1 tracking-tight">{tab.shortLabel}</span>

                  {tab.id === 'ALERTS_GIFTS' && totalBadge > 0 && (
                    <span className="absolute top-1 right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-400 px-1 text-[9px] font-black text-slate-950">
                      {totalBadge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {/* 모바일 홈 인디케이터 바 */}
          <div className="mx-auto mt-2.5 h-1 w-28 rounded-full bg-slate-700/80" />
        </nav>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <PlateTalkProvider>
      <PlateTalkMobileAppShell />
    </PlateTalkProvider>
  );
}
