'use client';

import React, { useState } from 'react';
import {
  Award,
  Crown,
  Sparkles,
  ChevronRight,
  PackageCheck,
  X,
  Truck,
  Shield,
} from 'lucide-react';
import { usePlateTalk } from '@/context/PlateTalkContext';
import { calculateHonorTier } from '@/lib/supabase';

const TIER_MILESTONES = [
  {
    tier: 'ROOKIE',
    name: '루키 드라이버',
    range: '0 ~ 299 P',
    perk: '기본 핸즈프리 음성 소통 및 번호판 오너 인증',
  },
  {
    tier: 'GUARDIAN',
    name: '세이프티 가디언',
    range: '300 ~ 999 P',
    perk: '실버 메탈 명예 엠블럼 무료 신청 자격',
  },
  {
    tier: 'MASTER',
    name: '로드 마스터',
    range: '1,000 ~ 2,999 P',
    perk: '홀로그램 티타늄 레이저 각인 엠블럼 무료 배송',
  },
  {
    tier: 'HONOR_SOCIETY',
    name: '아너 소사이어티',
    range: '3,000 P 이상',
    perk: '24K 골드 크레스트 엠블럼 + VIP 전용 제휴 혜택',
  },
];

const MONTHLY_HERO_RANKING = [
  {
    rank: 1,
    nickname: '설악투어링992',
    plateMasked: '**하 9911',
    vehicle: '포르쉐 911 GT3',
    points: 4820,
    summary: '화물 낙하 위험 경고 34회',
  },
  {
    rank: 2,
    nickname: '경부고속도로보안관',
    plateMasked: '***가 7712',
    vehicle: '제네시스 GV80',
    points: 3910,
    summary: '야간 브레이크등 고장 알림 61회',
  },
  {
    rank: 3,
    nickname: '판교젠틀드라이버 (나)',
    plateMasked: '**라 3466',
    vehicle: '제네시스 G80 Sport',
    points: 1180,
    summary: '차량 이상 알림 19회 · 양보 28회',
    isMe: true,
  },
  {
    rank: 4,
    nickname: '캠핑대디쏘렌토',
    plateMasked: '**나 8821',
    vehicle: '기아 쏘렌토 하이브리드',
    points: 840,
    summary: '주유구 열림 알림 14회',
  },
];

export default function HonorHubTab() {
  const { theme, user, claimHonorSticker, honorLedger, showToast } = usePlateTalk();
  const isLight = theme === 'light';

  // 1. 상단 2단 세그먼트 탭: 'MY_HONOR' (내 명예 · 엠블럼) | 'RANKING' (이달의 영웅 랭킹)
  const [activeSegment, setActiveSegment] = useState<'MY_HONOR' | 'RANKING'>('MY_HONOR');

  // 모달 상태 (배송지 입력 모달, 등급 혜택 모달)
  const [isShippingModalOpen, setIsShippingModalOpen] = useState(false);
  const [isTierBenefitModalOpen, setIsTierBenefitModalOpen] = useState(false);

  // 배송지 폼 상태
  const [recipientName, setRecipientName] = useState(user.real_name);
  const [phone, setPhone] = useState(user.phone);
  const [postalCode, setPostalCode] = useState('13494');
  const [addressLine1, setAddressLine1] = useState('경기도 성남시 분당구 판교역로 235');
  const [addressLine2, setAddressLine2] = useState('에이치스퀘어 N동 11층');

  const tierInfo = calculateHonorTier(user.honor_points);
  const progressPercent = Math.min(
    100,
    Math.round(
      ((user.honor_points - tierInfo.minPoints) /
        (tierInfo.nextTierPoints - tierInfo.minPoints)) *
        100
    )
  );

  const pointsToNext = Math.max(0, tierInfo.nextTierPoints - user.honor_points);
  const isClaimed = user.sticker_claim_status === 'REQUESTED';

  const handleStickerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientName.trim() || !phone.trim() || !addressLine1.trim()) {
      showToast('수령인과 주소를 정확히 입력해 주세요.', 'amber');
      return;
    }
    claimHonorSticker({
      recipientName,
      phone,
      postalCode,
      addressLine1,
      addressLine2,
    });
    setIsShippingModalOpen(false);
    showToast('실물 엠블럼 무료 배송 신청이 완료되었습니다.', 'emerald');
  };

  return (
    <div className="space-y-4">
      {/* ─────────────────────────────────────────────────────────────
          1. 상단 2단 세그먼트 컨트롤 (Segmented Tab)
          - 내 명예 · 엠블럼 | 이달의 영웅 랭킹
         ───────────────────────────────────────────────────────────── */}
      <div
        className={`p-1.5 rounded-2xl border grid grid-cols-2 gap-1 shadow-sm transition-colors ${
          isLight
            ? 'bg-[#f5efe0] border-amber-900/10'
            : 'bg-zinc-900 border-white/10'
        }`}
      >
        <button
          type="button"
          onClick={() => setActiveSegment('MY_HONOR')}
          className={`py-2.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all ${
            activeSegment === 'MY_HONOR'
              ? 'bg-blue-600 text-white shadow-md'
              : isLight
              ? 'text-stone-600 hover:text-stone-900'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Award className="h-4 w-4" />
          <span>내 명예 · 엠블럼</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSegment('RANKING')}
          className={`py-2.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all ${
            activeSegment === 'RANKING'
              ? 'bg-blue-600 text-white shadow-md'
              : isLight
              ? 'text-stone-600 hover:text-stone-900'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Crown className="h-4 w-4" />
          <span>이달의 영웅 랭킹</span>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          ① 내 명예 · 엠블럼 탭 (여백과 비주얼 중심 프리미엄 뷰)
         ───────────────────────────────────────────────────────────── */}
      {activeSegment === 'MY_HONOR' && (
        <div className="space-y-4">
          {/* 상단 통합 히어로 카드 */}
          <div
            className={`p-5 sm:p-6 rounded-3xl border transition-all ${
              isLight
                ? 'bg-white border-amber-900/10 shadow-sm'
                : 'bg-zinc-900/80 border-white/10'
            }`}
          >
            {/* 실물 홀로그램 메탈 엠블럼 이미지 & 시리얼 각인 */}
            <div className="relative overflow-hidden rounded-2xl bg-black shadow-xl aspect-[16/9] sm:aspect-[21/9]">
              <img
                src="/assets/honor-emblem.jpg"
                alt="PlateTalk 실물 명예 엠블럼"
                className="w-full h-full object-cover brightness-95"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

              {/* 하단 시리얼 번호 은은한 각인 */}
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs backdrop-blur-md bg-black/60 px-3.5 py-2 rounded-xl border border-white/15">
                <span className="text-[11px] text-zinc-300 font-semibold">
                  고유 시리얼 각인
                </span>
                <span className="font-mono text-xs sm:text-sm font-black tracking-widest text-amber-400">
                  {user.sticker_serial_number}
                </span>
              </div>
            </div>

            {/* 등급 타이틀 & 점수 정보 */}
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-amber-500 tracking-wider">
                    현재 명예 등급
                  </span>
                  <h3
                    className={`text-2xl sm:text-3xl font-black mt-0.5 ${
                      isLight ? 'text-stone-900' : 'text-white'
                    }`}
                  >
                    {tierInfo.koreanTitle}
                  </h3>
                </div>

                <div className="text-right">
                  <span
                    className={`font-mono text-2xl sm:text-3xl font-black text-amber-500`}
                  >
                    {user.honor_points.toLocaleString()} P
                  </span>
                </div>
              </div>

              {/* 게이지 바 및 다음 등급 목표 */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className={isLight ? 'text-stone-600' : 'text-zinc-400'}>
                    다음 등급(아너 소사이어티)까지{' '}
                    <strong className="text-amber-500 font-mono">
                      {pointsToNext.toLocaleString()} P
                    </strong>{' '}
                    남음
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsTierBenefitModalOpen(true)}
                    className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-0.5"
                  >
                    <span>등급 혜택 보기</span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>

                <div
                  className={`h-2.5 w-full rounded-full overflow-hidden p-0.5 border ${
                    isLight
                      ? 'bg-stone-100 border-stone-200'
                      : 'bg-zinc-950 border-white/10'
                  }`}
                >
                  <div
                    style={{ width: `${progressPercent}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
                  />
                </div>
              </div>

              {/* 핵심 CTA 버튼 1개: 실물 엠블럼 무료 배송 신청 */}
              <div className="pt-2">
                {isClaimed ? (
                  <div
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                      isLight
                        ? 'bg-amber-50/80 border-amber-300 text-stone-900'
                        : 'bg-zinc-950 border-white/10 text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <PackageCheck className="h-5 w-5 text-emerald-500 shrink-0" />
                      <div>
                        <span className="text-xs font-bold block">
                          실물 엠블럼 배송 준비 중
                        </span>
                        <span className="text-[11px] text-zinc-400 font-mono">
                          시리얼: {user.sticker_serial_number}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-emerald-500">신청 완료</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsShippingModalOpen(true)}
                    className="w-full min-h-[52px] rounded-2xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>실물 엠블럼 무료 배송 신청하기</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 하단 초간단 포인트 적립 내역 리스트 */}
          <div
            className={`p-5 rounded-3xl border transition-all ${
              isLight
                ? 'bg-white border-amber-900/10 shadow-sm'
                : 'bg-zinc-900/80 border-white/10'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <span
                className={`text-xs font-bold uppercase tracking-wider ${
                  isLight ? 'text-stone-700' : 'text-zinc-300'
                }`}
              >
                최근 포인트 내역
              </span>
              <span className="text-xs text-zinc-400">최근 4건</span>
            </div>

            <div
              className={`divide-y ${
                isLight ? 'divide-stone-100' : 'divide-white/5'
              }`}
            >
              {honorLedger.slice(0, 5).map((entry) => (
                <div
                  key={entry.id}
                  className="py-3 flex items-center justify-between gap-3 text-xs"
                >
                  <span
                    className={`font-semibold truncate ${
                      isLight ? 'text-stone-800' : 'text-zinc-200'
                    }`}
                  >
                    {entry.reason}
                  </span>
                  <span className="font-mono font-bold text-amber-500 shrink-0">
                    +{entry.points} P
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ② 이달의 영웅 랭킹 탭 (명예의 전당)
         ───────────────────────────────────────────────────────────── */}
      {activeSegment === 'RANKING' && (
        <div
          className={`p-5 rounded-3xl border space-y-3 transition-all ${
            isLight
              ? 'bg-white border-amber-900/10 shadow-sm'
              : 'bg-zinc-900/80 border-white/10'
          }`}
        >
          <div className="flex items-center justify-between pb-2">
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                isLight ? 'text-stone-700' : 'text-zinc-300'
              }`}
            >
              이달의 매너 드라이버 랭킹
            </span>
            <span className="text-xs text-zinc-400">매월 1일 갱신</span>
          </div>

          <div className="space-y-2.5">
            {MONTHLY_HERO_RANKING.map((hero) => {
              const isFirst = hero.rank === 1;
              const isSecond = hero.rank === 2;
              const isThird = hero.rank === 3;

              return (
                <div
                  key={hero.rank}
                  className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    hero.isMe
                      ? isLight
                        ? 'bg-blue-50/80 border-blue-400 shadow-sm'
                        : 'bg-blue-600/15 border-blue-500'
                      : isLight
                      ? 'bg-[#fcf9ef] border-amber-900/10'
                      : 'bg-zinc-950 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* 순위 배지 */}
                    <span
                      className={`h-8 w-8 rounded-xl font-mono text-sm font-black flex items-center justify-center shrink-0 ${
                        isFirst
                          ? 'bg-amber-400 text-stone-950 shadow-md'
                          : isSecond
                          ? 'bg-stone-300 text-stone-950'
                          : isThird
                          ? 'bg-amber-700 text-white'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {hero.rank}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-sm font-extrabold truncate ${
                            hero.isMe
                              ? 'text-blue-600'
                              : isLight
                              ? 'text-stone-900'
                              : 'text-white'
                          }`}
                        >
                          {hero.nickname}
                        </span>
                        <span className="font-mono text-xs text-zinc-400">
                          ({hero.plateMasked})
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 truncate mt-0.5">
                        {hero.vehicle} · {hero.summary}
                      </p>
                    </div>
                  </div>

                  <span className="font-mono text-sm font-black text-amber-500 shrink-0">
                    {hero.points.toLocaleString()} P
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          배송지 입력 모달 (실물 엠블럼 무료 신청)
         ───────────────────────────────────────────────────────────── */}
      {isShippingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div
            className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl border transition-all ${
              isLight
                ? 'bg-white border-amber-900/15 text-stone-900'
                : 'bg-zinc-950 border-white/10 text-white'
            }`}
          >
            {/* 상단 닫기 */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <span className="text-xs font-bold text-amber-500 flex items-center gap-1">
                <Truck className="h-4 w-4" /> 실물 엠블럼 배송지
              </span>
              <button
                type="button"
                onClick={() => setIsShippingModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3">
              <h4 className="text-base font-black">엠블럼 수령 주소 입력</h4>
              <p className="text-xs text-zinc-400 mt-0.5">
                시리얼 [{user.sticker_serial_number}]이 레이저 각인된 실물 메탈 엠블럼을 무료 배송합니다.
              </p>
            </div>

            <form onSubmit={handleStickerSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-zinc-400">
                  수령인 성명
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className={`w-full rounded-xl px-3.5 py-2 text-xs border ${
                    isLight
                      ? 'bg-white border-amber-900/15 text-stone-900'
                      : 'bg-zinc-900 border-white/10 text-white'
                  }`}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-zinc-400">
                  연락처
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={`w-full rounded-xl px-3.5 py-2 text-xs border ${
                    isLight
                      ? 'bg-white border-amber-900/15 text-stone-900'
                      : 'bg-zinc-900 border-white/10 text-white'
                  }`}
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-zinc-400">
                    우편번호
                  </label>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className={`w-full rounded-xl px-3.5 py-2 text-xs font-mono border ${
                      isLight
                        ? 'bg-white border-amber-900/15 text-stone-900'
                        : 'bg-zinc-900 border-white/10 text-white'
                    }`}
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold mb-1 text-zinc-400">
                    기본 주소
                  </label>
                  <input
                    type="text"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    className={`w-full rounded-xl px-3.5 py-2 text-xs border ${
                      isLight
                        ? 'bg-white border-amber-900/15 text-stone-900'
                        : 'bg-zinc-900 border-white/10 text-white'
                    }`}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-zinc-400">
                  상세 주소
                </label>
                <input
                  type="text"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  className={`w-full rounded-xl px-3.5 py-2 text-xs border ${
                    isLight
                      ? 'bg-white border-amber-900/15 text-stone-900'
                      : 'bg-zinc-900 border-white/10 text-white'
                  }`}
                />
              </div>

              <button
                type="submit"
                id="claim-honor-sticker-btn"
                className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-black text-xs shadow-md transition mt-2"
              >
                무료 배송 신청하기
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4단계 명예 등급 혜택 안내 모달
         ───────────────────────────────────────────────────────────── */}
      {isTierBenefitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div
            className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl border transition-all ${
              isLight
                ? 'bg-white border-amber-900/15 text-stone-900'
                : 'bg-zinc-950 border-white/10 text-white'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <span className="text-xs font-bold text-amber-500 flex items-center gap-1">
                <Shield className="h-4 w-4" /> 명예 등급 혜택
              </span>
              <button
                type="button"
                onClick={() => setIsTierBenefitModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {TIER_MILESTONES.map((m) => {
                const isCurrent = user.honor_tier === m.tier;

                return (
                  <div
                    key={m.tier}
                    className={`p-3.5 rounded-2xl border ${
                      isCurrent
                        ? isLight
                          ? 'bg-amber-50/80 border-amber-400 shadow-sm'
                          : 'bg-amber-500/15 border-amber-400'
                        : isLight
                        ? 'bg-[#fcf9ef] border-amber-900/10'
                        : 'bg-zinc-900 border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold">{m.name}</span>
                      <span className="font-mono text-xs font-bold text-amber-500">
                        {m.range}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">{m.perk}</p>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setIsTierBenefitModalOpen(false)}
              className="w-full mt-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
