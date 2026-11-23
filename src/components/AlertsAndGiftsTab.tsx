'use client';

import React, { useState } from 'react';
import {
  Bell,
  Archive,
  Gift,
  ThumbsUp,
  Volume2,
  RotateCcw,
  QrCode,
  Send,
  CheckCircle2,
  Sparkles,
  Fuel,
  Coffee,
  Droplets,
  Zap,
  Wind,
  PowerOff,
} from 'lucide-react';
import { usePlateTalk } from '@/context/PlateTalkContext';
import { speakDrivingBriefing } from '@/lib/voiceAiEngine';
import { GiftItem } from '@/types/platetalk';

export default function AlertsAndGiftsTab() {
  const {
    drivingMessages,
    acknowledgeHelpfulMessage,
    restoreArchivedMessage,
    toggleDrivingMode,
    isDrivingMode,
    giftCatalog,
    giftTransactions,
    openQuickGiftModal,
    sendGiftByPlate,
    redeemReceivedGift,
    showToast,
  } = usePlateTalk();

  const [messageFilter, setMessageFilter] = useState<'ACTIVE' | 'ARCHIVED'>(
    'ACTIVE'
  );
  const [giftReceiverPlate, setGiftReceiverPlate] = useState('123가 4568');
  const [selectedGiftId, setSelectedGiftId] = useState(
    'GIFT_COFFEE_STARBUCKS'
  );
  const [giftNote, setGiftNote] = useState(
    '도로 위에서 보여주신 매너 운전과 안전 배려에 감사드립니다!'
  );

  const activeMessages = drivingMessages.filter((m) => !m.is_dismissed);
  const archivedMessages = drivingMessages.filter((m) => m.is_dismissed);

  const displayedMessages =
    messageFilter === 'ACTIVE' ? activeMessages : archivedMessages;

  const handleDirectGiftSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!giftReceiverPlate.trim()) {
      showToast('선물을 보낼 상대 차량 번호판을 입력해 주세요.', 'amber');
      return;
    }
    const res = sendGiftByPlate({
      receiverPlate: giftReceiverPlate,
      itemId: selectedGiftId,
      thankYouNote: giftNote,
    });
    if (res.ok) {
      showToast(
        `[${giftReceiverPlate}] 번호판 앞으로 모바일 기프티콘(${res.couponCode})이 즉시 전송되었습니다!`,
        'emerald'
      );
    }
  };

  const renderCategoryIcon = (cat: GiftItem['category']) => {
    switch (cat) {
      case 'FUEL':
        return <Fuel className="h-5 w-5 text-amber-400" />;
      case 'COFFEE':
        return <Coffee className="h-5 w-5 text-emerald-400" />;
      case 'CAR_WASH':
        return <Droplets className="h-5 w-5 text-sky-400" />;
      case 'ENERGY':
        return <Zap className="h-5 w-5 text-yellow-400" />;
      case 'AIR_FRESHENER':
        return <Wind className="h-5 w-5 text-teal-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. 주행 알림 센터 & 자동 말소(Auto-Archiving) 섹션 */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-sky-400" />
              <h2 className="text-lg font-bold text-white">
                주행 안전 알림 센터 & 자동 말소 아카이브
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              주행 중 TTS로 브리핑된 메시지는 시동 종료(드라이빙 모드 해제) 시 자동으로 말소되어 알림 피로도를 줄입니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                id="filter-active-alerts-btn"
                onClick={() => setMessageFilter('ACTIVE')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  messageFilter === 'ACTIVE'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Bell className="h-3.5 w-3.5" />
                <span>활성 알림 ({activeMessages.length})</span>
              </button>
              <button
                type="button"
                id="filter-archived-alerts-btn"
                onClick={() => setMessageFilter('ARCHIVED')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  messageFilter === 'ARCHIVED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Archive className="h-3.5 w-3.5" />
                <span>말소된 히스토리 ({archivedMessages.length})</span>
              </button>
            </div>

            {isDrivingMode && activeMessages.length > 0 && (
              <button
                type="button"
                id="end-driving-archive-now-btn"
                onClick={() => {
                  toggleDrivingMode();
                  setMessageFilter('ARCHIVED');
                }}
                className="flex items-center gap-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/30 transition"
              >
                <PowerOff className="h-3.5 w-3.5" />
                <span>시동 OFF · 읽은 메시지 즉시 말소</span>
              </button>
            )}
          </div>
        </div>

        {/* 메시지 리스트 */}
        <div className="mt-5 space-y-3">
          {displayedMessages.length === 0 ? (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-8 text-center">
              <p className="text-sm font-semibold text-slate-300">
                {messageFilter === 'ACTIVE'
                  ? '현재 활성 알림이 없습니다. (주행 종료로 모두 자동 말소되었거나 신규 수신 대기 중)'
                  : '아직 자동 말소된 히스토리 메시지가 없습니다.'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                상단 탭에서 [말소된 히스토리]를 확인하거나 드라이빙 HUD에서 수신 시뮬레이터를 실행해 보세요.
              </p>
            </div>
          ) : (
            displayedMessages.map((msg) => (
              <div
                key={msg.id}
                className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/90 p-4 sm:flex-row sm:items-center"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                        msg.message_type === 'OVERLOAD_WARN'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                          : msg.message_type === 'DEFECT_ALERT'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                      }`}
                    >
                      {msg.message_type === 'OVERLOAD_WARN'
                        ? '1-2 화물위험 · 5km 브로드캐스트'
                        : msg.message_type === 'DEFECT_ALERT'
                        ? '1-1 차량 이상 고지'
                        : msg.message_type === 'YIELD_THANKS'
                        ? '1-5 양보운전 감사'
                        : '1-3 칭찬 · 튜닝 문의'}
                    </span>

                    <span className="font-mono text-xs font-bold text-white">
                      {msg.direction === 'OUTGOING'
                        ? `발신 → [${msg.receiver_plate}]`
                        : `발신 번호판: [${msg.sender_plate_snapshot}]`}
                    </span>

                    <span className="text-xs text-slate-400">
                      · {msg.sender_vehicle_summary} · {msg.created_at}
                    </span>

                    {msg.is_dismissed && (
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                        주행 종료 자동 말소됨
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-medium text-slate-100">
                    “{msg.content}”
                  </p>

                  <p className="text-[11px] text-slate-500">
                    위치: {msg.location_name} · AI 안전 문맥 검증 완료
                  </p>
                </div>

                {/* 우측 액션 버튼들 */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => speakDrivingBriefing(msg.content)}
                    className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-sky-400 transition"
                  >
                    <Volume2 className="h-3.5 w-3.5 text-sky-400" />
                    <span>TTS 다시 듣기</span>
                  </button>

                  {msg.direction !== 'OUTGOING' && (
                    <>
                      <button
                        type="button"
                        disabled={msg.helpful_acknowledged}
                        onClick={() => acknowledgeHelpfulMessage(msg.id)}
                        className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold transition ${
                          msg.helpful_acknowledged
                            ? 'bg-slate-800 text-emerald-400'
                            : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                        }`}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        <span>
                          {msg.helpful_acknowledged
                            ? '감사 전달됨 (+50pt)'
                            : '도움 됐어요 (+50pt)'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openQuickGiftModal(
                            msg.sender_plate_snapshot,
                            msg.sender_vehicle_summary,
                            msg.id
                          )
                        }
                        className="flex items-center gap-1 rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 transition"
                      >
                        <Gift className="h-3.5 w-3.5" />
                        <span>커피/주유권 답례</span>
                      </button>
                    </>
                  )}

                  {msg.is_dismissed && (
                    <button
                      type="button"
                      onClick={() => restoreArchivedMessage(msg.id)}
                      className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-300 hover:text-white"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>복원</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 2. [1-6] 번호판 기반 인앱 기프트샵 & 내 선물 보관함 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 좌측: 번호판만으로 선물 보내기 스토어 */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 lg:col-span-7">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                [1-6] 번호판 기반 인앱 기프트샵 (선물하기)
              </h2>
              <p className="text-xs text-slate-400">
                상대방의 전화번호나 실명을 몰라도 차량 번호판만으로 주유권·세차권·커피를 즉시 선물합니다.
              </p>
            </div>
          </div>

          <form onSubmit={handleDirectGiftSend} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="gift-receiver-plate-input"
                  className="block text-xs font-semibold text-slate-300"
                >
                  선물 받을 차량 번호판 (미가입 차량도 보관 후 수령 가능)
                </label>
                <input
                  id="gift-receiver-plate-input"
                  type="text"
                  value={giftReceiverPlate}
                  onChange={(e) => setGiftReceiverPlate(e.target.value)}
                  placeholder="예: 123가 4568"
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-sm font-bold text-emerald-300 focus:border-emerald-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  빠른 번호판 선택 (최근 소통 차량)
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {['123가 4568', '54나 8821', '28하 9911', '82바 9104'].map(
                    (plate) => (
                      <button
                        key={plate}
                        type="button"
                        onClick={() => setGiftReceiverPlate(plate)}
                        className={`rounded-lg px-2.5 py-2 font-mono text-xs font-bold transition border ${
                          giftReceiverPlate === plate
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {plate}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* 기프트 카탈로그 그리드 */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {giftCatalog.map((item) => {
                const isSelected = item.id === selectedGiftId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    id={`gift-item-${item.id}`}
                    onClick={() => setSelectedGiftId(item.id)}
                    className={`flex flex-col justify-between rounded-2xl p-3.5 text-left transition border ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-400 shadow-lg'
                        : 'bg-slate-950/85 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {renderCategoryIcon(item.category)}
                        <div>
                          <span className="text-[10px] font-bold text-amber-300">
                            {item.badgeText}
                          </span>
                          <h3 className="text-xs font-bold text-white">
                            {item.name}
                          </h3>
                        </div>
                      </div>
                      <span className="font-mono text-xs font-extrabold text-emerald-300">
                        {item.price.toLocaleString()}원
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">
                      {item.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <div>
              <label
                htmlFor="gift-thank-you-note"
                className="block text-xs font-semibold text-slate-300"
              >
                동봉할 감사 메시지
              </label>
              <input
                id="gift-thank-you-note"
                type="text"
                value={giftNote}
                onChange={(e) => setGiftNote(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              id="send-plate-gift-submit-btn"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3 text-sm font-extrabold text-slate-950 hover:bg-amber-300 transition shadow-lg"
            >
              <Send className="h-4 w-4" />
              <span>
                [{giftReceiverPlate}] 번호판으로 즉시 선물 발송 (+60 명예포인트 적립)
              </span>
            </button>
          </form>
        </div>

        {/* 우측: 내 기프티콘 보관함 (수신 및 발신 내역) */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 lg:col-span-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-emerald-400" />
              <h2 className="text-base font-bold text-white">
                내 차량({`12라 3466`}) 기프티콘 보관함
              </h2>
            </div>
            <span className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-300">
              총 {giftTransactions.length}건
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {giftTransactions.map((tx) => (
              <div
                key={tx.id}
                className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                      tx.direction === 'RECEIVED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                        : 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                    }`}
                  >
                    {tx.direction === 'RECEIVED'
                      ? `받은 선물 (From ${tx.sender_plate})`
                      : `보낸 선물 (To ${tx.receiver_plate})`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[9px] font-extrabold ${
                        tx.payment_status === 'PAID'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                          : tx.payment_status === 'PENDING'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                          : tx.payment_status === 'REDEEMED'
                          ? 'bg-slate-800 text-slate-400'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {tx.payment_status === 'PAID'
                        ? '결제완료'
                        : tx.payment_status === 'PENDING'
                        ? 'PG 결제대기'
                        : tx.payment_status === 'REDEEMED'
                        ? '사용완료'
                        : tx.payment_status}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {tx.created_at}
                    </span>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {tx.item_name}
                    </h3>
                    <p className="text-xs text-slate-400">{tx.item_brand}</p>
                  </div>
                  <span className="font-mono text-xs font-bold text-amber-300">
                    {tx.item_price.toLocaleString()}원권
                  </span>
                </div>

                <p className="mt-2 rounded-xl bg-slate-900/90 p-2.5 text-xs text-slate-200 border border-slate-800">
                  “{tx.thank_you_note}”
                </p>

                <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2.5">
                  <div>
                    <span className="block text-[10px] text-slate-500">
                      모바일 바코드 PIN
                    </span>
                    <span className="font-mono text-xs font-bold tracking-wider text-sky-300">
                      {tx.coupon_code || '결제 확인 후 바코드 발급'}
                    </span>
                  </div>

                  {tx.direction === 'RECEIVED' && (
                    <button
                      type="button"
                      disabled={tx.payment_status === 'REDEEMED'}
                      onClick={() => redeemReceivedGift(tx.id)}
                      className={`flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                        tx.payment_status === 'REDEEMED'
                          ? 'bg-slate-800 text-slate-400'
                          : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>
                        {tx.payment_status === 'REDEEMED'
                          ? `교환완료 (${tx.redeemed_at})`
                          : '바코드 사용하기'}
                      </span>
                    </button>
                  )}

                  {tx.direction === 'SENT' && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                      <Sparkles className="h-3.5 w-3.5" />
                      전송 완료
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
