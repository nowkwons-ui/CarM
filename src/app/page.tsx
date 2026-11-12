'use client';

import React from 'react';
import {
  Navigation,
  Bell,
  Car,
  Award,
  ShieldCheck,
  Gift,
  Sparkles,
  AlertTriangle,
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
    label: '알림 & 기프트샵',
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
    label: '마이 개러지 (OCR 인증)',
    shortLabel: '내차·인증',
    icon: ShieldCheck,
  },
];

function PlateTalkCockpitShell() {
  const {
    activeTab,
    setActiveTab,
    user,
    activeVehicle,
    drivingMessages,
    giftTransactions,
    toastBanner,
  } = usePlateTalk();

  const unreadActiveCount = drivingMessages.filter(
    (m) => !m.is_dismissed
  ).length;
  const unredeemedGiftsCount = giftTransactions.filter(
    (g) => g.direction === 'RECEIVED' && g.payment_status === 'PAID'
  ).length;

  return (
    <div className="min-h-screen bg-[#04070f] pb-24 text-slate-100">
      {/* 상단 글로벌 콕핏 헤더 */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#04070f]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-emerald-400 text-slate-950 font-black text-base shadow-lg">
              PT
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight text-white sm:text-lg">
                  PlateTalk <span className="text-sky-400">플레이트톡</span>
                </h1>
                <span className="hidden rounded-md bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300 border border-emerald-500/30 sm:inline-block">
                  {activeVehicle.license_plate}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                번호판 기반 실시간 핸즈프리 안전 소통 & 명예 커뮤니티 플랫폼
              </p>
            </div>
          </div>

          {/* 우측 차량 OCR 인증 상태 & 명예 점수 요약 */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              id="header-garage-status-btn"
              onClick={() => setActiveTab('GARAGE')}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                activeVehicle.verification_status === 'VERIFIED'
                  ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                  : activeVehicle.verification_status === 'PENDING'
                  ? 'border-amber-400/50 bg-amber-500/15 text-amber-300'
                  : 'border-rose-400/50 bg-rose-500/15 text-rose-300'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>
                {activeVehicle.license_plate} · {activeVehicle.verification_status}
              </span>
            </button>

            <button
              type="button"
              id="header-honor-points-btn"
              onClick={() => setActiveTab('HONOR')}
              className="flex items-center gap-1.5 rounded-xl border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 text-xs font-extrabold text-sky-300 hover:bg-sky-500/25 transition"
            >
              <Award className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-mono">
                {user.honor_points.toLocaleString()} PT
              </span>
              <span className="hidden text-[10px] text-emerald-300 md:inline">
                ({user.honor_tier})
              </span>
            </button>
          </div>
        </div>

        {/* 데스크톱/태블릿 상단 5대 탭 네비게이션 */}
        <nav
          aria-label="주요 기능 탭"
          className="mx-auto hidden max-w-7xl px-4 pb-2.5 sm:px-6 md:block"
        >
          <div className="grid grid-cols-5 gap-2 rounded-2xl border border-slate-800/90 bg-slate-900/80 p-1.5">
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  id={`desktop-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-extrabold transition ${
                    isActive
                      ? 'bg-gradient-to-r from-sky-400 to-emerald-400 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  {tab.id === 'ALERTS_GIFTS' &&
                    unreadActiveCount + unredeemedGiftsCount > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                          isActive
                            ? 'bg-slate-950 text-emerald-300'
                            : 'bg-emerald-500 text-slate-950'
                        }`}
                      >
                        {unreadActiveCount + unredeemedGiftsCount}
                      </span>
                    )}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* 실시간 토스트 알림 배너 */}
      {toastBanner && (
        <div className="mx-auto max-w-7xl px-4 pt-3 sm:px-6">
          <div
            className={`flex items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-xs font-bold shadow-xl ${
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
              <span>{toastBanner.message}</span>
            </div>
          </div>
        </div>
      )}

      {/* 메인 탭 컨텐츠 뷰포트 */}
      <main className="mx-auto max-w-7xl px-4 pt-5 sm:px-6">
        {activeTab === 'HUD' && <DrivingHudTab />}
        {activeTab === 'ALERTS_GIFTS' && <AlertsAndGiftsTab />}
        {activeTab === 'COMMUNITY' && <CommunityShowroomTab />}
        {activeTab === 'HONOR' && <HonorHubTab />}
        {activeTab === 'GARAGE' && <GarageAuthTab />}
      </main>

      {/* 원클릭 기프트 답례 모달 */}
      <QuickGiftModal />

      {/* 모바일 하단 고정 5탭 독(Dock) 네비게이션 */}
      <nav
        aria-label="모바일 하단 탭"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 px-2 py-2 backdrop-blur-xl md:hidden"
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
                className={`flex flex-col items-center justify-center rounded-xl py-2 text-[11px] font-bold transition ${
                  isActive
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="mt-1">{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function HomePage() {
  return (
    <PlateTalkProvider>
      <PlateTalkCockpitShell />
    </PlateTalkProvider>
  );
}
