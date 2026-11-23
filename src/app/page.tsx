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

  // 모바일 뷰포트 모드: 'PORTRAIT' (스마트폰 세로 앱) vs 'CAR_MOUNT' (차량 대시보드 거치 와이드 모드)
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

  const isHudTab = activeTab === 'HUD';

  return (
    <div className="h-dvh w-full bg-black text-zinc-100 flex flex-col items-center justify-start overflow-hidden sm:p-2">
      {/* 데스크톱/테스트 환경용 뷰포트 전환 툴바 (초소형) */}
      <div className="hidden sm:flex items-center justify-between gap-2 px-3 py-1 text-[11px] bg-zinc-900/80 border border-white/10 rounded-xl mb-1.5 w-full max-w-[440px]">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="font-bold text-zinc-300">PlateTalk CarPlay HUD</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            id="switch-portrait-mobile-btn"
            onClick={() => setViewportMode('PORTRAIT')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
              viewportMode === 'PORTRAIT'
                ? 'bg-blue-600 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Smartphone className="inline h-3 w-3 mr-1" />
            세로
          </button>
          <button
            type="button"
            id="switch-carmount-wide-btn"
            onClick={() => setViewportMode('CAR_MOUNT')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
              viewportMode === 'CAR_MOUNT'
                ? 'bg-blue-600 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Monitor className="inline h-3 w-3 mr-1" />
            와이드
          </button>
        </div>
      </div>

      {/* 스마트폰 / 차량 거치대 메인 앱 컨테이너 (No-Scroll 100dvh) */}
      <div
        className={`relative flex flex-col w-full h-full max-h-full overflow-hidden bg-zinc-950 sm:rounded-[32px] sm:border sm:border-white/10 shadow-2xl transition-all duration-200 ${
          viewportMode === 'PORTRAIT'
            ? 'max-w-[440px]'
            : 'max-w-5xl'
        }`}
      >
        {/* 네이티브 상태 표시줄 (HUD 탭에서는 미니멀 처리) */}
        {!isHudTab && (
          <div className="flex items-center justify-between bg-zinc-950 px-5 pt-2.5 pb-1 text-[11px] font-semibold text-zinc-400 select-none">
            <span className="font-mono font-bold text-white">09:41</span>
            <div className="flex items-center gap-2">
              <Signal className="h-3 w-3 text-zinc-300" />
              <span className="text-[10px] font-mono">5G</span>
              <Wifi className="h-3 w-3 text-blue-400" />
              <BatteryCharging className="h-3.5 w-3.5 text-emerald-400" />
            </div>
          </div>
        )}

        {/* 일반 탭(알림, 커뮤니티, 명예, 개러지)에서만 노출되는 헤더 (HUD 탭에서는 HUD 자체 슬림 헤더가 전담) */}
        {!isHudTab && (
          <header className="shrink-0 border-b border-white/10 bg-zinc-950/95 px-4 py-2.5 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white font-black text-xs shadow-md">
                  PT
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h1 className="text-sm font-black text-white">PlateTalk</h1>
                    <span className="rounded-md bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-400 border border-white/10">
                      {activeVehicle.license_plate}
                    </span>
                  </div>
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
                  className="flex items-center gap-1 rounded-xl border border-white/10 bg-zinc-900 px-2.5 py-1 text-[10px] font-extrabold text-blue-400"
                >
                  <Award className="h-3 w-3 text-amber-400" />
                  <span className="font-mono">{user.honor_points.toLocaleString()}P</span>
                </button>
              </div>
            </div>
          </header>
        )}

        {/* 실시간 글로벌 토스트 알림 배너 */}
        {toastBanner && (
          <div className="absolute top-2 left-3 right-3 z-50 pointer-events-none">
            <div
              className={`flex items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-bold shadow-2xl backdrop-blur-md pointer-events-auto ${
                toastBanner.tone === 'emerald'
                  ? 'border-emerald-500/40 bg-zinc-950/95 text-emerald-300'
                  : toastBanner.tone === 'amber'
                  ? 'border-amber-500/40 bg-zinc-950/95 text-amber-300'
                  : toastBanner.tone === 'rose'
                  ? 'border-rose-500/40 bg-zinc-950/95 text-rose-300'
                  : 'border-blue-500/40 bg-zinc-950/95 text-blue-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {toastBanner.tone === 'rose' ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                ) : (
                  <Sparkles className="h-4 w-4 shrink-0 text-blue-400" />
                )}
                <span className="leading-snug">{toastBanner.message}</span>
              </div>
            </div>
          </div>
        )}

        {/* 메인 컨텐츠 영역 (HUD 탭에서는 스크롤 없이 100% 핏, 타 탭에서는 수직 스크롤) */}
        <main
          className={`flex-1 min-h-0 flex flex-col ${
            isHudTab ? 'overflow-hidden p-0' : 'overflow-y-auto px-4 py-4 pb-20'
          }`}
        >
          {activeTab === 'HUD' && <DrivingHudTab />}
          {activeTab === 'ALERTS_GIFTS' && <AlertsAndGiftsTab />}
          {activeTab === 'COMMUNITY' && <CommunityShowroomTab />}
          {activeTab === 'HONOR' && <HonorHubTab />}
          {activeTab === 'GARAGE' && <GarageAuthTab />}
        </main>

        {/* 원클릭 기프트 답례 모달 */}
        <QuickGiftModal />

        {/* ④ 하단 네비게이션 바 (높이 64px, h-16, 미니멀 정리) */}
        <nav
          aria-label="하단 네비게이션"
          className="h-16 shrink-0 border-t border-white/10 bg-zinc-950/95 px-2 flex items-center justify-around backdrop-blur-xl z-40"
        >
          <div className="grid grid-cols-5 w-full gap-1">
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  id={`mobile-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex flex-col items-center justify-center py-1 transition ${
                    isActive
                      ? 'text-blue-500 font-extrabold'
                      : 'text-zinc-500 hover:text-zinc-300 font-medium'
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 transition ${
                      isActive ? 'text-blue-500' : 'text-zinc-500'
                    }`}
                  />
                  <span className="mt-1 text-[12px] sm:text-[13px] tracking-tight">
                    {tab.shortLabel}
                  </span>

                  {tab.id === 'ALERTS_GIFTS' && totalBadge > 0 && (
                    <span className="absolute top-0 right-3 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-black text-white shadow-md">
                      {totalBadge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
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
