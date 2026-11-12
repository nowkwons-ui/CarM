'use client';

import React, { useState } from 'react';
import {
  Award,
  Shield,
  Crown,
  Truck,
  CheckCircle2,
  Sparkles,
  TrendingUp,
  PackageCheck,
  MapPin,
} from 'lucide-react';
import { usePlateTalk } from '@/context/PlateTalkContext';
import { calculateHonorTier, maskLicensePlate } from '@/lib/supabase';

const TIER_MILESTONES = [
  {
    tier: 'ROOKIE',
    name: '루키 드라이버',
    range: '0 ~ 299 PT',
    perk: '기본 핸즈프리 음성 소통 & 번호판 인증 배지',
  },
  {
    tier: 'GUARDIAN',
    name: '세이프티 가디언 (Guardian)',
    range: '300 ~ 999 PT',
    perk: '실버 메탈 명예 스티커 발송 자격 해금',
  },
  {
    tier: 'MASTER',
    name: '로드 마스터 (Master)',
    range: '1,000 ~ 2,999 PT',
    perk: '홀로그램 티타늄 시리얼 각인 엠블럼 무료 배송',
  },
  {
    tier: 'HONOR_SOCIETY',
    name: '아너 소사이어티 (상위 1%)',
    range: '3,000+ PT',
    perk: '24K 크레스트 에디션 엠블럼 + 제휴 세차/주유 VIP 할인',
  },
];

const MONTHLY_HERO_RANKING = [
  {
    rank: 1,
    nickname: '설악투어링992',
    plateMasked: '**하 9911',
    vehicle: '포르쉐 911 GT3 Touring',
    tier: 'HONOR_SOCIETY',
    points: 4820,
    rescues: '화물 낙하물 경고 34회 · 양보 감사 89회',
  },
  {
    rank: 2,
    nickname: '경부고속도로보안관',
    plateMasked: '***가 7712',
    vehicle: '제네시스 GV80 3.5T',
    tier: 'HONOR_SOCIETY',
    points: 3910,
    rescues: '야간 브레이크등 고장 알림 61회',
  },
  {
    rank: 3,
    nickname: '판교젠틀드라이버 (나)',
    plateMasked: '**라 3466',
    vehicle: '제네시스 G80 Sport',
    tier: 'MASTER',
    points: 1180,
    rescues: '차량 이상 알림 19회 · 양보 감사 28회',
    isMe: true,
  },
  {
    rank: 4,
    nickname: '캠핑대디쏘렌토',
    plateMasked: '**나 8821',
    vehicle: '기아 쏘렌토 하이브리드',
    tier: 'GUARDIAN',
    points: 840,
    rescues: '주유구 열림 알림 14회 · 양보 감사 15회',
  },
];

export default function HonorHubTab() {
  const { user, activeVehicle, claimHonorSticker, addHonorPoints } =
    usePlateTalk();

  const tierInfo = calculateHonorTier(user.honor_points);
  const progressPercent = Math.min(
    100,
    Math.round(
      ((user.honor_points - tierInfo.minPoints) /
        (tierInfo.nextTierPoints - tierInfo.minPoints)) *
        100
    )
  );

  const [recipientName, setRecipientName] = useState(user.real_name);
  const [phone, setPhone] = useState(user.phone);
  const [postalCode, setPostalCode] = useState('13494');
  const [addressLine1, setAddressLine1] = useState(
    '경기도 성남시 분당구 판교역로 235'
  );
  const [addressLine2, setAddressLine2] = useState('에이치스퀘어 N동 11층');

  const handleStickerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    claimHonorSticker({
      recipientName,
      phone,
      postalCode,
      addressLine1,
      addressLine2,
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. 내 명예 점수(Honor Points) 게이지 및 포인트 적립 시뮬레이터 */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-emerald-400" />
              <span className="text-xs font-bold tracking-wider text-emerald-400 uppercase">
                {tierInfo.englishSubtitle}
              </span>
            </div>
            <h2 className="text-2xl font-extrabold text-white">
              {user.nickname}님의 명예 등급:{' '}
              <span className="text-emerald-300">{tierInfo.koreanTitle}</span>
            </h2>
            <p className="text-xs text-slate-400">
              위험 고지를 받은 운전자가 ‘도움 됐어요’를 누르거나 양보 감사 인사를 보내면 명예 포인트가 적립됩니다.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/40 bg-slate-950 px-4 py-3">
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase">
                CURRENT HONOR SCORE
              </span>
              <span className="font-mono text-2xl font-extrabold text-emerald-300">
                {user.honor_points.toLocaleString()} PT
              </span>
            </div>
          </div>
        </div>

        {/* 프로그레스 게이지 */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-300">
              현재 구간 시작: {tierInfo.minPoints.toLocaleString()} PT
            </span>
            <span className="text-sky-300">
              다음 등급 목표: {tierInfo.nextTierPoints.toLocaleString()} PT (
              {progressPercent}%)
            </span>
          </div>
          <div className="mt-2 h-3.5 w-full overflow-hidden rounded-full bg-slate-950 p-0.5 border border-slate-800">
            <div
              style={{ width: `${progressPercent}%` }}
              className="h-full rounded-full bg-gradient-to-r from-sky-400 via-teal-400 to-emerald-400 transition-all duration-500"
            />
          </div>
        </div>

        {/* 4단계 등급 카드 */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TIER_MILESTONES.map((m) => {
            const isCurrent = user.honor_tier === m.tier;
            return (
              <div
                key={m.tier}
                className={`rounded-2xl p-3.5 border transition ${
                  isCurrent
                    ? 'bg-emerald-500/15 border-emerald-400 shadow-lg'
                    : 'bg-slate-950/80 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-white">
                    {m.name}
                  </span>
                  {isCurrent && (
                    <span className="rounded bg-emerald-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                      현재 등급
                    </span>
                  )}
                </div>
                <p className="mt-1 font-mono text-xs font-bold text-sky-300">
                  {m.range}
                </p>
                <p className="mt-1.5 text-[11px] text-slate-400">{m.perk}</p>
              </div>
            );
          })}
        </div>

        {/* 명예 포인트 적립 알고리즘 즉시 테스트 */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
          <span className="text-xs font-semibold text-slate-300">
            명예 포인트 적립 알고리즘 시뮬레이션:
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              id="honor-sim-helpful-btn"
              onClick={() =>
                addHonorPoints(
                  50,
                  '위험 고지 수신자 [도움 됐어요] 감사 표시 대량 지급'
                )
              }
              className="rounded-xl bg-emerald-500/20 border border-emerald-400/50 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30"
            >
              +50 PT (위험 고지 ‘도움 됐어요’ 보상)
            </button>
            <button
              type="button"
              id="honor-sim-yield-btn"
              onClick={() =>
                addHonorPoints(30, '끼어들기 양보운전 후 상대방 감사 수신')
              }
              className="rounded-xl bg-sky-500/20 border border-sky-400/50 px-3 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-500/30"
            >
              +30 PT (양보운전 감사 수신)
            </button>
            <button
              type="button"
              id="honor-sim-promote-btn"
              onClick={() =>
                addHonorPoints(
                  500,
                  '이달의 도로 위 안전 영웅 특별 보너스 (아너 소사이어티 승급 체험)'
                )
              }
              className="rounded-xl bg-amber-500/20 border border-amber-400/50 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/30"
            >
              +500 PT (상위 1% 아너 소사이어티 승급 테스트)
            </button>
          </div>
        </div>
      </div>

      {/* 2. 실물 '명예 스티커(엠블럼)' 홀로그램 프리뷰 & 무료 배송 신청 폼 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 좌측: 실물 홀로그램 메탈 스티커 프리뷰 */}
        <div className="flex flex-col justify-between rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 lg:col-span-6">
          <div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-sky-400 uppercase">
                <Shield className="h-4 w-4" /> PHYSICAL HONOR EMBLEM
              </span>
              <span className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-300 border border-emerald-400/40">
                고유 시리얼 레이저 각인
              </span>
            </div>
            <h3 className="mt-1.5 text-lg font-extrabold text-white">
              후면 유리 부착용 홀로그램·브러시드 티타늄 명예 엠블럼
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              도로 위에서 이 스티커만 봐도 검증된 매너·방어운전 오너임을 한눈에 알아볼 수 있는 실물 메탈 엠블럼입니다.
            </p>

            {/* 실물 엠블럼 이미지 + 실시간 시리얼 넘버 오버레이 */}
            <div className="relative mt-4 overflow-hidden rounded-3xl border border-emerald-400/40 bg-slate-950 shadow-2xl">
              <img
                src="/assets/honor-emblem.jpg"
                alt="PlateTalk 홀로그램 메탈 실물 명예 스티커"
                className="h-72 w-full object-cover sm:h-80"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-400/50 bg-slate-900/90 px-4 py-3 backdrop-blur-md">
                  <div>
                    <span className="block text-[10px] font-bold tracking-widest text-emerald-400 uppercase">
                      LASER ENGRAVED SERIAL NO.
                    </span>
                    <span className="font-mono text-base font-extrabold text-white">
                      {user.sticker_serial_number}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] text-slate-400">
                      인증 차량 & 등급
                    </span>
                    <span className="font-mono text-xs font-bold text-sky-300">
                      {maskLicensePlate(activeVehicle.license_plate)} ·{' '}
                      {user.honor_tier}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 배송 신청 상태 배지 */}
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center gap-2.5">
              <PackageCheck className="h-5 w-5 text-emerald-400" />
              <div>
                <span className="text-xs font-bold text-white">
                  현재 엠블럼 발급 상태:{' '}
                  <span className="text-emerald-300">
                    {user.sticker_claim_status === 'REQUESTED'
                      ? '시리얼 각인 및 발송 준비 중 (무료 배송)'
                      : '무료 발급 신청 가능 (ELIGIBLE)'}
                  </span>
                </span>
                {user.sticker_shipping_address && (
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    배송지: {user.sticker_shipping_address.addressLine1}{' '}
                    {user.sticker_shipping_address.addressLine2}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 우측: 실물 스티커 무료 배송 신청 폼 & 이번 달 영웅 랭킹 */}
        <div className="space-y-6 lg:col-span-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-emerald-400" />
              <h3 className="text-base font-bold text-white">
                실물 명예 스티커(엠블럼) 무료 배송 신청
              </h3>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              세이프티 가디언(300 PT) 이상 달성 오너에게 고유 시리얼이 각인된 실물 메탈 스티커를 무료로 발송해 드립니다.
            </p>

            <form onSubmit={handleStickerSubmit} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    수령인 성명 (인증 오너)
                  </label>
                  <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    연락처
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    우편번호
                  </label>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    기본 주소
                  </label>
                  <input
                    type="text"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  상세 주소
                </label>
                <input
                  type="text"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
              </div>

              <button
                type="submit"
                id="claim-honor-sticker-btn"
                disabled={user.sticker_claim_status === 'REQUESTED'}
                className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-extrabold transition ${
                  user.sticker_claim_status === 'REQUESTED'
                    ? 'bg-slate-800 text-emerald-400 cursor-default'
                    : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300 shadow-lg'
                }`}
              >
                {user.sticker_claim_status === 'REQUESTED' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      시리얼 [{user.sticker_serial_number}] 엠블럼 배송 신청 완료
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>
                      고유 시리얼 [{user.sticker_serial_number}] 실물 엠블럼 무료 배송 신청
                    </span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* 이번 달 도로 위 영웅 랭킹 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">
                  이번 달 도로 위 영웅 랭킹 (Honor Leaderboard)
                </h3>
              </div>
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            </div>

            <div className="mt-4 space-y-2.5">
              {MONTHLY_HERO_RANKING.map((hero) => (
                <div
                  key={hero.rank}
                  className={`flex items-center justify-between rounded-2xl p-3 border ${
                    hero.isMe
                      ? 'bg-emerald-500/15 border-emerald-400/70'
                      : 'bg-slate-950/90 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-lg font-mono text-xs font-extrabold ${
                        hero.rank === 1
                          ? 'bg-amber-400 text-slate-950'
                          : hero.rank === 2
                          ? 'bg-slate-300 text-slate-950'
                          : 'bg-amber-700/60 text-amber-200'
                      }`}
                    >
                      {hero.rank}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white">
                          {hero.nickname}
                        </span>
                        <span className="font-mono text-[11px] text-sky-300">
                          ({hero.plateMasked})
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {hero.vehicle} · {hero.rescues}
                      </p>
                    </div>
                  </div>

                  <span className="font-mono text-xs font-extrabold text-emerald-300">
                    {(hero.isMe ? user.honor_points : hero.points).toLocaleString()}{' '}
                    PT
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
