'use client';

import React, { useState } from 'react';
import {
  Bell,
  Gift,
  ThumbsUp,
  Volume2,
  CheckCircle2,
  Fuel,
  Coffee,
  Droplets,
  Zap,
  Wind,
  X,
  Send,
  QrCode,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { usePlateTalk } from '@/context/PlateTalkContext';
import { speakDrivingBriefing } from '@/lib/voiceAiEngine';
import { GiftItem, GiftTransaction, DrivingMessageType } from '@/types/platetalk';

export default function AlertsAndGiftsTab() {
  const {
    theme,
    drivingMessages,
    acknowledgeHelpfulMessage,
    restoreArchivedMessage,
    toggleDrivingMode,
    isDrivingMode,
    giftCatalog,
    giftTransactions,
    sendGiftByPlate,
    redeemReceivedGift,
    showToast,
  } = usePlateTalk();

  const isLight = theme === 'light';

  // 1. 최상단 3단 세그먼트 탭: 'ALERTS' (알림) | 'GIFT_BOX' (선물함) | 'SEND_GIFT' (선물하기)
  const [mainTab, setMainTab] = useState<'ALERTS' | 'GIFT_BOX' | 'SEND_GIFT'>('ALERTS');

  // 알림 탭 내부 필터: 'ACTIVE' (활성) | 'ARCHIVED' (지난 알림)
  const [alertSubFilter, setAlertSubFilter] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');

  // 선물하기 탭 입력 상태
  const [giftReceiverPlate, setGiftReceiverPlate] = useState('123가 4568');
  const [selectedGiftId, setSelectedGiftId] = useState('GIFT_COFFEE_STARBUCKS');
  const [giftNote, setGiftNote] = useState('배려와 안전 운전에 감사드립니다!');

  // 기프티콘 바코드 사용 모달 상태
  const [barcodeModalTx, setBarcodeModalTx] = useState<GiftTransaction | null>(null);

  const activeMessages = drivingMessages.filter((m) => !m.is_dismissed);
  const archivedMessages = drivingMessages.filter((m) => m.is_dismissed);
  const displayedMessages = alertSubFilter === 'ACTIVE' ? activeMessages : archivedMessages;

  const receivedGifts = giftTransactions.filter((g) => g.direction === 'RECEIVED');

  // 알림 카드에서 바로 선물하기로 이동
  const handleJumpToGiftSend = (targetPlate: string) => {
    setGiftReceiverPlate(targetPlate);
    setMainTab('SEND_GIFT');
    showToast(`[${targetPlate}] 차량에게 보낼 선물을 선택해 주세요.`, 'sky');
  };

  const handleDirectGiftSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!giftReceiverPlate.trim()) {
      showToast('선물 받을 차량 번호판을 입력해 주세요.', 'amber');
      return;
    }
    const res = sendGiftByPlate({
      receiverPlate: giftReceiverPlate,
      itemId: selectedGiftId,
      thankYouNote: giftNote,
    });
    if (res.ok) {
      showToast(
        `[${giftReceiverPlate}] 번호판으로 선물이 전송되었습니다!`,
        'emerald'
      );
      setMainTab('GIFT_BOX');
    }
  };

  const renderCategoryIcon = (cat: GiftItem['category']) => {
    switch (cat) {
      case 'FUEL':
        return <Fuel className="h-6 w-6 text-amber-500" />;
      case 'COFFEE':
        return <Coffee className="h-6 w-6 text-emerald-500" />;
      case 'CAR_WASH':
        return <Droplets className="h-6 w-6 text-blue-500" />;
      case 'ENERGY':
        return <Zap className="h-6 w-6 text-yellow-500" />;
      case 'AIR_FRESHENER':
        return <Wind className="h-6 w-6 text-teal-500" />;
    }
  };

  const renderMessageTypeBadge = (type: DrivingMessageType) => {
    switch (type) {
      case 'DEFECT_ALERT':
        return {
          dotColor: 'bg-blue-500',
          label: '차량 이상',
          textClass: isLight ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-blue-400 bg-blue-500/10 border-blue-500/30',
        };
      case 'OVERLOAD_WARN':
        return {
          dotColor: 'bg-amber-500',
          label: '화물 위험',
          textClass: isLight ? 'text-amber-800 bg-amber-50 border-amber-300' : 'text-amber-400 bg-amber-500/15 border-amber-500/30',
        };
      case 'YIELD_THANKS':
        return {
          dotColor: 'bg-emerald-500',
          label: '양보 감사',
          textClass: isLight ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
        };
      case 'COMPLIMENT':
      case 'TUNING_ASK':
      default:
        return {
          dotColor: 'bg-blue-500',
          label: '칭찬·문의',
          textClass: isLight ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-blue-400 bg-blue-500/10 border-blue-500/30',
        };
    }
  };

  return (
    <div className="space-y-4">
      {/* ─────────────────────────────────────────────────────────────
          1. 최상단 3단 세그먼트 컨트롤 (Segmented Tab)
          - 알림 (3) | 선물함 (2) | 선물하기
         ───────────────────────────────────────────────────────────── */}
      <div
        className={`p-1.5 rounded-2xl border grid grid-cols-3 gap-1 shadow-sm transition-colors ${
          isLight
            ? 'bg-[#f5efe0] border-amber-900/10'
            : 'bg-zinc-900 border-white/10'
        }`}
      >
        <button
          type="button"
          onClick={() => setMainTab('ALERTS')}
          className={`py-2.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all ${
            mainTab === 'ALERTS'
              ? 'bg-blue-600 text-white shadow-md'
              : isLight
              ? 'text-stone-600 hover:text-stone-900'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Bell className="h-4 w-4" />
          <span>알림</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              mainTab === 'ALERTS'
                ? 'bg-white/20 text-white'
                : isLight
                ? 'bg-amber-200/80 text-stone-800'
                : 'bg-zinc-800 text-zinc-300'
            }`}
          >
            {activeMessages.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('GIFT_BOX')}
          className={`py-2.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all ${
            mainTab === 'GIFT_BOX'
              ? 'bg-blue-600 text-white shadow-md'
              : isLight
              ? 'text-stone-600 hover:text-stone-900'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <QrCode className="h-4 w-4" />
          <span>선물함</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              mainTab === 'GIFT_BOX'
                ? 'bg-white/20 text-white'
                : isLight
                ? 'bg-amber-200/80 text-stone-800'
                : 'bg-zinc-800 text-zinc-300'
            }`}
          >
            {receivedGifts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('SEND_GIFT')}
          className={`py-2.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all ${
            mainTab === 'SEND_GIFT'
              ? 'bg-blue-600 text-white shadow-md'
              : isLight
              ? 'text-stone-600 hover:text-stone-900'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Gift className="h-4 w-4" />
          <span>선물하기</span>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          ① 알림 탭 (깔끔한 피드형 리스트)
         ───────────────────────────────────────────────────────────── */}
      {mainTab === 'ALERTS' && (
        <div className="space-y-4">
          {/* 상단 유틸 바 */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-3 text-xs font-bold">
              <button
                type="button"
                id="filter-active-alerts-btn"
                onClick={() => setAlertSubFilter('ACTIVE')}
                className={`transition ${
                  alertSubFilter === 'ACTIVE'
                    ? isLight
                      ? 'text-stone-900 border-b-2 border-blue-600 pb-0.5'
                      : 'text-white border-b-2 border-blue-500 pb-0.5'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                활성 ({activeMessages.length})
              </button>
              <span className="text-zinc-600">|</span>
              <button
                type="button"
                id="filter-archived-alerts-btn"
                onClick={() => setAlertSubFilter('ARCHIVED')}
                className={`transition ${
                  alertSubFilter === 'ARCHIVED'
                    ? isLight
                      ? 'text-stone-900 border-b-2 border-blue-600 pb-0.5'
                      : 'text-white border-b-2 border-blue-500 pb-0.5'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                지난 알림 ({archivedMessages.length})
              </button>
            </div>

            {isDrivingMode && activeMessages.length > 0 && (
              <button
                type="button"
                id="end-driving-archive-now-btn"
                onClick={() => {
                  toggleDrivingMode();
                  setAlertSubFilter('ARCHIVED');
                }}
                className={`text-xs font-semibold hover:underline transition ${
                  isLight ? 'text-stone-600 hover:text-stone-900' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                읽은 알림 비우기
              </button>
            )}
          </div>

          {/* 알림 피드 목록 */}
          <div className="space-y-3">
            {displayedMessages.length === 0 ? (
              <div
                className={`p-10 rounded-2xl border text-center ${
                  isLight
                    ? 'bg-white border-amber-900/10 text-stone-600 shadow-sm'
                    : 'bg-zinc-900/70 border-white/10 text-zinc-400'
                }`}
              >
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-40 text-blue-500" />
                <p className="text-sm font-semibold">
                  {alertSubFilter === 'ACTIVE'
                    ? '새로운 알림이 없습니다.'
                    : '보관된 지난 알림이 없습니다.'}
                </p>
              </div>
            ) : (
              displayedMessages.map((msg) => {
                const badge = renderMessageTypeBadge(msg.message_type);

                return (
                  <div
                    key={msg.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      isLight
                        ? 'bg-white border-amber-900/10 shadow-sm'
                        : 'bg-zinc-900 border-white/10'
                    }`}
                  >
                    {/* 1줄(헤더): 상태 컬러 점 + 태그 + 발신 번호판 + 시간 */}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${badge.dotColor}`} />
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[11px] border ${badge.textClass}`}
                        >
                          {badge.label}
                        </span>
                        <span
                          className={`font-mono text-sm font-extrabold tracking-wide ${
                            isLight ? 'text-stone-900' : 'text-white'
                          }`}
                        >
                          {msg.direction === 'OUTGOING'
                            ? `To. ${msg.receiver_plate}`
                            : msg.sender_plate_snapshot}
                        </span>
                      </div>

                      <span className="text-[11px] text-zinc-400 font-medium">
                        {msg.created_at}
                      </span>
                    </div>

                    {/* 2줄(본문): 선명한 핵심 메시지 */}
                    <p
                      className={`mt-2.5 text-base font-semibold leading-relaxed ${
                        isLight ? 'text-stone-900' : 'text-white'
                      }`}
                    >
                      “{msg.content}”
                    </p>

                    {/* 3줄(액션): [🔊] [👍 감사 +50P] [🎁 선물] */}
                    <div className="mt-3.5 pt-3 border-t border-white/10 dark:border-white/10 flex items-center justify-between gap-2">
                      {/* 좌측 TTS 스피커 재생 아이콘 원형 버튼 */}
                      <button
                        type="button"
                        onClick={() => speakDrivingBriefing(msg.content)}
                        className={`h-9 w-9 rounded-full flex items-center justify-center border transition ${
                          isLight
                            ? 'bg-stone-100 hover:bg-stone-200 border-stone-300 text-stone-700'
                            : 'bg-zinc-800 hover:bg-zinc-700 border-white/10 text-zinc-200'
                        }`}
                        aria-label="음성으로 듣기"
                        title="음성으로 듣기"
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>

                      {/* 우측 감사 & 선물 액션 */}
                      <div className="flex items-center gap-2">
                        {msg.direction !== 'OUTGOING' && (
                          <>
                            <button
                              type="button"
                              disabled={msg.helpful_acknowledged}
                              onClick={() => acknowledgeHelpfulMessage(msg.id)}
                              className={`h-9 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                                msg.helpful_acknowledged
                                  ? isLight
                                    ? 'bg-stone-100 text-emerald-700 cursor-default'
                                    : 'bg-zinc-800 text-emerald-400 cursor-default'
                                  : 'bg-emerald-500 text-black hover:bg-emerald-400 active:scale-95'
                              }`}
                            >
                              <ThumbsUp className="h-3.5 w-3.5" />
                              <span>
                                {msg.helpful_acknowledged ? '감사 완료' : '👍 감사 (+50P)'}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleJumpToGiftSend(msg.sender_plate_snapshot)}
                              className="h-9 px-3.5 rounded-xl bg-amber-400 text-black hover:bg-amber-300 font-bold text-xs flex items-center gap-1.5 active:scale-95 transition"
                            >
                              <Gift className="h-3.5 w-3.5" />
                              <span>🎁 선물</span>
                            </button>
                          </>
                        )}

                        {msg.is_dismissed && (
                          <button
                            type="button"
                            onClick={() => restoreArchivedMessage(msg.id)}
                            className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1 transition ${
                              isLight
                                ? 'bg-stone-100 border-stone-300 text-stone-700 hover:bg-stone-200'
                                : 'bg-zinc-800 border-white/10 text-zinc-300 hover:bg-zinc-700'
                            }`}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>복원</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ② 선물함 탭 (카카오톡 기프티콘 지갑 스타일)
         ───────────────────────────────────────────────────────────── */}
      {mainTab === 'GIFT_BOX' && (
        <div className="space-y-4">
          <div className="space-y-3">
            {receivedGifts.length === 0 ? (
              <div
                className={`p-10 rounded-2xl border text-center ${
                  isLight
                    ? 'bg-white border-amber-900/10 text-stone-600 shadow-sm'
                    : 'bg-zinc-900/70 border-white/10 text-zinc-400'
                }`}
              >
                <Gift className="h-8 w-8 mx-auto mb-2 opacity-40 text-amber-500" />
                <p className="text-sm font-semibold">보관된 기프티콘이 없습니다.</p>
                <p className="text-xs text-zinc-500 mt-1">
                  도로 위에서 다른 운전자에게 도움을 주면 감사의 선물을 받을 수 있습니다.
                </p>
              </div>
            ) : (
              receivedGifts.map((tx) => {
                const isRedeemed = tx.payment_status === 'REDEEMED';

                return (
                  <div
                    key={tx.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      isLight
                        ? 'bg-white border-amber-900/10 shadow-sm'
                        : 'bg-zinc-900 border-white/10'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      {/* 좌측 썸네일 아이콘 */}
                      <div
                        className={`h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 border ${
                          isLight
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-zinc-800 border-white/10'
                        }`}
                      >
                        {tx.item_category === 'FUEL' ? (
                          <Fuel className="h-7 w-7 text-amber-500" />
                        ) : (
                          <Coffee className="h-7 w-7 text-emerald-500" />
                        )}
                      </div>

                      {/* 중앙 상품명 + From 번호판 + 한 줄 감사 메시지 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3
                            className={`text-base font-extrabold truncate ${
                              isLight ? 'text-stone-900' : 'text-white'
                            }`}
                          >
                            {tx.item_name}
                          </h3>
                          <span className="font-mono text-sm font-extrabold text-blue-600">
                            {tx.item_price.toLocaleString()}원
                          </span>
                        </div>

                        <p className="text-xs text-blue-600 font-bold mt-0.5 font-mono">
                          From. {tx.sender_plate}
                        </p>

                        <p
                          className={`text-xs mt-1 truncate ${
                            isLight ? 'text-stone-600' : 'text-zinc-400'
                          }`}
                        >
                          “{tx.thank_you_note}”
                        </p>
                      </div>
                    </div>

                    {/* 하단 단일 대형 버튼: [바코드 사용하기] */}
                    <div className="mt-4 pt-3.5 border-t border-white/10 flex items-center justify-between">
                      <span className="text-xs text-zinc-400 font-medium">{tx.created_at}</span>

                      <button
                        type="button"
                        onClick={() => setBarcodeModalTx(tx)}
                        className={`min-h-[46px] px-5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition active:scale-95 ${
                          isRedeemed
                            ? isLight
                              ? 'bg-stone-200 text-stone-500 cursor-default'
                              : 'bg-zinc-800 text-zinc-500 cursor-default'
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md'
                        }`}
                      >
                        <QrCode className="h-4 w-4" />
                        <span>{isRedeemed ? '사용 완료됨' : '바코드 사용하기'}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ③ 선물하기 탭 (원클릭 간편 선물)
         ───────────────────────────────────────────────────────────── */}
      {mainTab === 'SEND_GIFT' && (
        <form
          onSubmit={handleDirectGiftSend}
          className={`p-5 rounded-2xl border space-y-5 transition-all ${
            isLight
              ? 'bg-white border-amber-900/10 shadow-sm'
              : 'bg-zinc-900 border-white/10'
          }`}
        >
          {/* Step 1. 받는 차량 선택 */}
          <div className="space-y-2">
            <label
              htmlFor="gift-receiver-plate-input"
              className={`block text-xs font-bold uppercase tracking-wider ${
                isLight ? 'text-stone-600' : 'text-zinc-400'
              }`}
            >
              선물 받을 차량 번호판
            </label>
            <input
              id="gift-receiver-plate-input"
              type="text"
              value={giftReceiverPlate}
              onChange={(e) => setGiftReceiverPlate(e.target.value)}
              placeholder="예: 123가 4568"
              className={`w-full rounded-xl px-4 py-3 font-mono text-base font-black tracking-wider border focus:outline-none focus:border-blue-500 ${
                isLight
                  ? 'bg-white border-amber-900/15 text-stone-900 placeholder-stone-400'
                  : 'bg-zinc-950 border-white/10 text-white placeholder-zinc-600'
              }`}
            />

            {/* 빠른 번호판 선택 가로 칩 */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-zinc-400 mr-1">최근 소통:</span>
              {['123가 4568', '54나 8821', '28하 9911', '82바 9104'].map((plate) => (
                <button
                  key={plate}
                  type="button"
                  onClick={() => setGiftReceiverPlate(plate)}
                  className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold transition border ${
                    giftReceiverPlate === plate
                      ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                      : isLight
                      ? 'bg-[#f5efe0] border-amber-900/10 text-stone-700 hover:border-amber-400'
                      : 'bg-zinc-950 border-white/10 text-zinc-300 hover:border-white/30'
                  }`}
                >
                  {plate}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2. 상품 선택 (2열 심플 그리드: 아이콘 + 상품명 + 가격) */}
          <div className="space-y-2">
            <span
              className={`block text-xs font-bold uppercase tracking-wider ${
                isLight ? 'text-stone-600' : 'text-zinc-400'
              }`}
            >
              선물 상품 선택
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              {giftCatalog.map((item) => {
                const isSelected = item.id === selectedGiftId;

                return (
                  <button
                    key={item.id}
                    type="button"
                    id={`gift-item-${item.id}`}
                    onClick={() => setSelectedGiftId(item.id)}
                    className={`p-4 rounded-2xl flex flex-col items-center justify-center text-center transition border ${
                      isSelected
                        ? isLight
                          ? 'bg-blue-50/70 border-2 border-blue-600 shadow-md'
                          : 'bg-blue-600/15 border-2 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.25)]'
                        : isLight
                        ? 'bg-[#fcf9ef] border-amber-900/10 hover:border-blue-400'
                        : 'bg-zinc-950/80 border-white/10 hover:border-white/30'
                    }`}
                  >
                    <div className="mb-2">{renderCategoryIcon(item.category)}</div>
                    <span
                      className={`text-xs font-bold line-clamp-1 ${
                        isLight ? 'text-stone-900' : 'text-white'
                      }`}
                    >
                      {item.name}
                    </span>
                    <span className="font-mono text-sm font-black text-blue-600 mt-1">
                      {item.price.toLocaleString()}원
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3. 1줄 심플 감사 메시지 & 하단 고정 결제 버튼 */}
          <div className="space-y-3 pt-2">
            <div>
              <label
                htmlFor="gift-thank-you-note"
                className={`block text-xs font-bold mb-1.5 ${
                  isLight ? 'text-stone-600' : 'text-zinc-400'
                }`}
              >
                감사 메시지 (1줄)
              </label>
              <input
                id="gift-thank-you-note"
                type="text"
                value={giftNote}
                onChange={(e) => setGiftNote(e.target.value)}
                placeholder="감사 메시지를 입력하세요"
                className={`w-full rounded-xl px-3.5 py-2.5 text-xs border focus:outline-none focus:border-blue-500 ${
                  isLight
                    ? 'bg-white border-amber-900/15 text-stone-900'
                    : 'bg-zinc-950 border-white/10 text-white'
                }`}
              />
            </div>

            <button
              type="submit"
              id="send-plate-gift-submit-btn"
              className="w-full min-h-[52px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
            >
              <Send className="h-4 w-4" />
              <span>[{giftReceiverPlate}]에게 선물 보내기</span>
            </button>
          </div>
        </form>
      )}

      {/* ─────────────────────────────────────────────────────────────
          카카오톡 스타일 모바일 바코드 & PIN 모달
         ───────────────────────────────────────────────────────────── */}
      {barcodeModalTx && (
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
              <span className="text-xs font-bold text-blue-600 flex items-center gap-1">
                <Sparkles className="h-4 w-4" /> 모바일 교환권
              </span>
              <button
                type="button"
                onClick={() => setBarcodeModalTx(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 상품 정보 */}
            <div className="mt-4 text-center">
              <h4 className="text-lg font-black">{barcodeModalTx.item_name}</h4>
              <p className="text-xs text-zinc-400 mt-0.5">{barcodeModalTx.item_brand}</p>
            </div>

            {/* 바코드 그래픽 */}
            <div className="my-5 p-4 rounded-2xl bg-white border border-stone-200 text-center flex flex-col items-center justify-center">
              {/* 바코드 패턴 시뮬레이션 */}
              <div className="h-16 w-52 flex items-center justify-between px-2 bg-white">
                {[3, 1, 4, 1, 2, 1, 3, 2, 1, 4, 2, 1, 2, 3, 1, 4, 1, 2, 3, 1, 3, 2, 1, 4].map(
                  (w, i) => (
                    <span
                      key={i}
                      style={{ width: `${w * 2}px` }}
                      className="h-full bg-black inline-block"
                    />
                  )
                )}
              </div>

              {/* PIN 번호 */}
              <span className="mt-2.5 font-mono text-sm font-extrabold tracking-widest text-black">
                {barcodeModalTx.coupon_code || 'PT-9482-7710-3921'}
              </span>
            </div>

            <p className="text-center text-[11px] text-zinc-400">
              매장 결제 시 직원에게 위 바코드를 제시해 주세요.
            </p>

            {/* 사용 완료 버튼 */}
            <div className="mt-5 space-y-2">
              {barcodeModalTx.payment_status !== 'REDEEMED' ? (
                <button
                  type="button"
                  onClick={() => {
                    redeemReceivedGift(barcodeModalTx.id);
                    setBarcodeModalTx(null);
                  }}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-sm flex items-center justify-center gap-1.5 transition"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>사용 완료 처리</span>
                </button>
              ) : (
                <div className="py-2.5 rounded-xl bg-stone-100 text-stone-500 text-center font-bold text-xs">
                  이미 교환 완료된 상품입니다
                </div>
              )}

              <button
                type="button"
                onClick={() => setBarcodeModalTx(null)}
                className={`w-full py-2.5 rounded-xl text-xs font-bold border transition ${
                  isLight
                    ? 'bg-stone-100 text-stone-700 border-stone-300'
                    : 'bg-zinc-900 text-zinc-300 border-white/10'
                }`}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
