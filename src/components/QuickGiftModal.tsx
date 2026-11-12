'use client';

import React, { useState } from 'react';
import { Gift, X, CreditCard, Sparkles, Mic } from 'lucide-react';
import { usePlateTalk } from '@/context/PlateTalkContext';
import { speakDrivingBriefing } from '@/lib/voiceAiEngine';

export default function QuickGiftModal() {
  const {
    quickGiftModal,
    closeQuickGiftModal,
    giftCatalog,
    sendGiftByPlate,
    user,
    showToast,
  } = usePlateTalk();

  const [selectedItemId, setSelectedItemId] = useState('GIFT_COFFEE_STARBUCKS');
  const [note, setNote] = useState(
    '내 차 안전을 챙겨주셔서 진심으로 감사합니다! 시원한 커피 한 잔 드시고 안전운전하세요.'
  );

  if (!quickGiftModal.isOpen) return null;

  const selectedItem =
    giftCatalog.find((g) => g.id === selectedItemId) || giftCatalog[0];

  const handleInstantPayAndSend = () => {
    const res = sendGiftByPlate({
      receiverPlate: quickGiftModal.targetPlate,
      itemId: selectedItem.id,
      thankYouNote: note,
      relatedMessageId: quickGiftModal.relatedMessageId,
    });
    if (res.ok) {
      speakDrivingBriefing(
        `${quickGiftModal.targetPlate} 차량에게 ${selectedItem.name} 기프티콘 결제를 완료하여 발송했습니다.`
      );
      showToast(
        `원클릭 답례 완료! [${quickGiftModal.targetPlate}] 보관함으로 ${selectedItem.name} 쿠폰이 전송되었습니다.`,
        'emerald'
      );
      closeQuickGiftModal();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-3xl border border-amber-400/50 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-slate-950">
              <Gift className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold tracking-wider text-amber-300 uppercase">
                ONE-CLICK GRATITUDE REPLY
              </span>
              <h3 className="text-lg font-extrabold text-white">
                고마운 [{quickGiftModal.targetPlate}] 차량에 즉시 답례하기
              </h3>
              <p className="text-xs text-slate-400">
                {quickGiftModal.targetSummary} · 전화번호 없이 번호판으로 즉시 발송
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeQuickGiftModal}
            className="rounded-xl bg-slate-800 p-2 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-2.5">
          <p className="text-xs font-semibold text-slate-300">
            답례 기프티콘 선택 (음성 “응, 커피 보내줘” 지원):
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {giftCatalog.slice(0, 4).map((item) => {
              const active = item.id === selectedItemId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedItemId(item.id)}
                  className={`rounded-2xl p-3 text-left transition border ${
                    active
                      ? 'bg-amber-500/20 border-amber-400 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{item.name}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] text-amber-300">
                      {item.badgeText}
                    </span>
                    <span className="font-mono text-xs font-bold text-emerald-300">
                      {item.price.toLocaleString()}원
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-300">
            답례 메시지
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
          />
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <CreditCard className="h-4 w-4 text-sky-400" />
            <span>등록된 간편결제:</span>
            <strong className="text-white">{user.default_payment_method}</strong>
          </div>
          <span className="font-mono text-sm font-extrabold text-amber-300">
            결제금액 {selectedItem.price.toLocaleString()}원
          </span>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={closeQuickGiftModal}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:text-white"
          >
            다음에 하기
          </button>
          <button
            type="button"
            id="confirm-oneclick-gift-btn"
            onClick={handleInstantPayAndSend}
            className="flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-300 transition shadow-lg"
          >
            <Mic className="h-4 w-4" />
            <Sparkles className="h-4 w-4" />
            <span>원클릭 간편결제 및 쿠폰 즉시 발송 (+60pt)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
