'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  Clock,
  XCircle,
  Users,
  CreditCard,
  Plus,
  CheckCircle2,
  ChevronRight,
  Camera,
  Car,
  FileText,
  Copy,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlateTalk } from '@/context/PlateTalkContext';
import { VerificationStatus } from '@/types/platetalk';

export default function GarageAuthTab() {
  const {
    theme,
    user,
    vehicles,
    activeVehicle,
    setActiveVehicleId,
    addSecondaryVehicle,
    showToast,
  } = usePlateTalk();

  const isLight = theme === 'light';

  // 모달 상태 관리
  const [isAddVehicleModalOpen, setIsAddVehicleModalOpen] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2 | 3>(1);
  const [isVerifyingOcr, setIsVerifyingOcr] = useState(false);
  const [hasUploadedPlatePhoto, setHasUploadedPlatePhoto] = useState(false);
  const [hasUploadedDocPhoto, setHasUploadedDocPhoto] = useState(false);

  // 설정 관련 모달 상태
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCoDriverModalOpen, setIsCoDriverModalOpen] = useState(false);

  // 하드웨어 카메라 설정
  const [rtspUrl, setRtspUrl] = useState(
    'rtsp://192.168.10.1:554/inavi_qxd1_front_fhd'
  );
  const [blackboxConnected, setBlackboxConnected] = useState(true);

  // 결제수단 설정
  const [selectedPayment, setSelectedPayment] = useState<'KAKAOPAY' | 'TOSSPAY' | 'CREDIT_CARD'>('KAKAOPAY');

  // 초대 링크 복사 상태
  const [copiedLink, setCopiedLink] = useState(false);

  // 신규 등록 위저드 시작
  const handleOpenAddVehicleWizard = () => {
    setAddStep(1);
    setIsVerifyingOcr(false);
    setHasUploadedPlatePhoto(false);
    setHasUploadedDocPhoto(false);
    setIsAddVehicleModalOpen(true);
  };

  // Step 2 -> Step 3 전환 (1초 시뮬레이션 후 완료)
  const handleSubmitOcrVerification = () => {
    if (!hasUploadedPlatePhoto || !hasUploadedDocPhoto) {
      showToast('번호판 사진과 자동차등록증 사진을 모두 등록해 주세요.', 'amber');
      return;
    }

    setIsVerifyingOcr(true);
    setTimeout(() => {
      setIsVerifyingOcr(false);
      setAddStep(3);
    }, 1100);
  };

  // Step 3 최종 확인 -> 차고에 추가 및 모달 닫기
  const handleCompleteAddVehicle = () => {
    addSecondaryVehicle({
      license_plate: '37마 8120',
      vin: 'KMHG541DBNP378120',
      registered_owner_name: `${user.real_name} (공동운전자 승인완료)`,
      ownership_role: 'CO_DRIVER',
      brand: '기아 (KIA)',
      model: 'EV9 GT-Line AWD',
      color: '오션 매트 블루',
      verification_status: 'VERIFIED',
    });
    setIsAddVehicleModalOpen(false);
    showToast('새로운 차량(37마 8120)이 내 차고에 등록되었습니다!', 'emerald');
  };

  // 초대 링크 클립보드 복사
  const handleCopyInviteLink = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText('https://platetalk.app/invite/family-v7x9q');
      setCopiedLink(true);
      showToast('가족 공동운전자 초대 링크가 복사되었습니다.', 'emerald');
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const renderStatusBadge = (status: VerificationStatus) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            소유주 인증완료
          </span>
        );
      case 'PENDING':
        return (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
            <Clock className="h-3.5 w-3.5" />
            심사 대기중
          </span>
        );
      case 'REJECTED':
        return (
          <span className="flex items-center gap-1 rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 text-xs font-bold text-rose-600 dark:text-rose-400">
            <XCircle className="h-3.5 w-3.5" />
            인증 반려
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 rounded-full bg-stone-500/15 border border-stone-500/30 px-2.5 py-0.5 text-xs font-bold text-stone-500">
            미인증
          </span>
        );
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-24">
      {/* ─────────────────────────────────────────────────────────────
          ① 상단 내 프로필 요약 (컴팩트 카드)
          - 닉네임/실명(김태훈님)
          - [✓ 본인인증 완료] 배지
          - 연동 계정 아이콘 (카카오)
         ───────────────────────────────────────────────────────────── */}
      <div
        className={`p-5 rounded-3xl border transition-colors ${
          isLight
            ? 'bg-white border-amber-900/15 shadow-sm text-stone-900'
            : 'bg-zinc-900 border-white/10 text-white'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-black text-lg shadow-md">
              {user.real_name.slice(0, 1)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight">{user.real_name}님</h2>
                {user.phone_verified ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">
                    <Check className="h-3 w-3 stroke-[3]" />
                    본인인증 완료
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] font-bold">
                    미인증
                  </span>
                )}
              </div>
              <p className={`text-xs mt-0.5 flex items-center gap-1.5 ${isLight ? 'text-stone-500' : 'text-zinc-400'}`}>
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                카카오 계정 연동됨 · {user.phone}
              </p>
            </div>
          </div>

          {!user.phone_verified && (
            <button
              type="button"
              onClick={() => showToast('PASS 본인인증 시스템으로 연결됩니다.', 'sky')}
              className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow transition hover:bg-blue-500"
            >
              본인인증 하기
            </button>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          ② 내 차고 (등록 차량 관리)
          - 헤더: 내 차량 (N대) + [+ 차량 등록] 버튼
          - 대표 차량 카드 (큼직한 번호판 + 차종명 + 인증 배지)
          - 서브 차량 카드 (탭 시 대표 차량으로 전환)
         ───────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-base font-black tracking-tight">
              내 차량 <span className="text-blue-600 dark:text-blue-400 font-bold">({vehicles.length})</span>
            </h3>
          </div>

          <button
            type="button"
            id="add-family-codriver-vehicle-btn"
            onClick={handleOpenAddVehicleWizard}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
              isLight
                ? 'bg-amber-100/70 hover:bg-amber-100 border-amber-300/80 text-amber-950'
                : 'bg-white/10 hover:bg-white/15 border-white/15 text-white'
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            차량 등록
          </button>
        </div>

        <div className="space-y-2.5">
          {vehicles.map((v) => {
            const isPrimary = activeVehicle.id === v.id;

            return (
              <div
                key={v.id}
                onClick={() => {
                  if (!isPrimary) {
                    setActiveVehicleId(v.id);
                    showToast(`${v.license_plate} 차량이 대표 차량으로 설정되었습니다.`, 'sky');
                  }
                }}
                className={`p-4 rounded-3xl border transition cursor-pointer relative overflow-hidden ${
                  isPrimary
                    ? isLight
                      ? 'bg-gradient-to-br from-amber-50 to-white border-blue-500/40 shadow-md ring-1 ring-blue-500/20'
                      : 'bg-gradient-to-br from-blue-950/30 to-zinc-900 border-blue-500/50 shadow-lg'
                    : isLight
                    ? 'bg-white border-amber-900/10 hover:border-amber-900/25 shadow-sm'
                    : 'bg-zinc-900/80 border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-2xl font-black tracking-wider text-stone-900 dark:text-white">
                        {v.license_plate}
                      </span>
                      {isPrimary && (
                        <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white text-[11px] font-black tracking-wide">
                          대표 차량
                        </span>
                      )}
                      {v.ownership_role === 'CO_DRIVER' && (
                        <span className="px-2 py-0.5 rounded-md bg-stone-500/20 text-stone-600 dark:text-stone-300 text-[11px] font-bold">
                          공동운전자
                        </span>
                      )}
                    </div>

                    <p className={`text-xs font-semibold ${isLight ? 'text-stone-600' : 'text-zinc-300'}`}>
                      {v.brand} {v.model}
                    </p>

                    <p className={`text-[11px] ${isLight ? 'text-stone-400' : 'text-zinc-500'}`}>
                      {v.color} · {v.registered_owner_name}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    {renderStatusBadge(v.verification_status)}
                    {!isPrimary && (
                      <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-0.5">
                        대표 차량으로 전환 <ChevronRight className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          ③ 주행 & 결제 설정 (구분선으로 나뉜 심플 리스트)
          - 1. 카메라 연동: [블랙박스 (RTSP) 연결됨 >]
          - 2. 간편결제 수단: [카카오페이 등록됨 >]
          - 3. 가족 공동운전자 초대: [공동운전자 1명 연결됨 >]
         ───────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-base font-black tracking-tight px-1">주행 & 결제 설정</h3>

        <div
          className={`rounded-3xl border divide-y overflow-hidden transition-colors ${
            isLight
              ? 'bg-white border-amber-900/15 divide-amber-900/10 shadow-sm text-stone-900'
              : 'bg-zinc-900 border-white/10 divide-white/10 text-white'
          }`}
        >
          {/* 1. 카메라 연동 */}
          <button
            type="button"
            onClick={() => setIsCameraModalOpen(true)}
            className="w-full p-4 flex items-center justify-between text-left transition hover:bg-black/5 dark:hover:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <span className="text-sm font-bold block">카메라 연동</span>
                <span className={`text-xs ${isLight ? 'text-stone-500' : 'text-zinc-400'}`}>
                  블랙박스 및 주행 번호판 인식 하드웨어
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
              <span>{blackboxConnected ? '블랙박스 (RTSP) 연결됨' : '연결 해제됨'}</span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </button>

          {/* 2. 간편결제 수단 */}
          <button
            type="button"
            onClick={() => setIsPaymentModalOpen(true)}
            className="w-full p-4 flex items-center justify-between text-left transition hover:bg-black/5 dark:hover:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <span className="text-sm font-bold block">간편결제 수단</span>
                <span className={`text-xs ${isLight ? 'text-stone-500' : 'text-zinc-400'}`}>
                  감사 선물(기프티콘) 원클릭 답례 결제
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 dark:text-zinc-300">
              <span>
                {selectedPayment === 'KAKAOPAY'
                  ? '카카오페이 등록됨'
                  : selectedPayment === 'TOSSPAY'
                  ? '토스페이 등록됨'
                  : '신용카드 등록됨'}
              </span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </button>

          {/* 3. 가족 공동운전자 초대 */}
          <button
            type="button"
            onClick={() => setIsCoDriverModalOpen(true)}
            className="w-full p-4 flex items-center justify-between text-left transition hover:bg-black/5 dark:hover:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <span className="text-sm font-bold block">가족 공동운전자 초대</span>
                <span className={`text-xs ${isLight ? 'text-stone-500' : 'text-zinc-400'}`}>
                  배우자 및 가족과 차량 알림 권한 공유
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 dark:text-zinc-300">
              <span>공동운전자 1명 연결됨</span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          [모달 1] 3단계 팝업 인증 위저드 (+ 차량 등록)
         ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isAddVehicleModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className={`w-full max-w-lg rounded-t-3xl sm:rounded-3xl border shadow-2xl overflow-hidden p-6 space-y-6 ${
                isLight ? 'bg-[#fdfaf1] border-amber-900/15 text-stone-900' : 'bg-zinc-900 border-white/10 text-white'
              }`}
            >
              {/* 상단 헤더 & 닫기 */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black tracking-tight">차량 등록 및 소유주 인증</h3>
                  <p className={`text-xs mt-0.5 ${isLight ? 'text-stone-500' : 'text-zinc-400'}`}>
                    단계 {addStep} / 3: {addStep === 1 ? '본인 확인' : addStep === 2 ? '사진 서류 제출' : '인증 완료'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddVehicleModalOpen(false)}
                  className={`p-2 rounded-xl transition ${isLight ? 'hover:bg-amber-900/10 text-stone-500' : 'hover:bg-white/10 text-zinc-400'}`}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* 진행률 바 */}
              <div className="w-full bg-stone-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300"
                  style={{ width: `${(addStep / 3) * 100}%` }}
                />
              </div>

              {/* STEP 1: 본인 확인 */}
              {addStep === 1 && (
                <div className="space-y-4">
                  <div
                    className={`p-4 rounded-2xl border flex items-center gap-3.5 ${
                      isLight ? 'bg-white border-amber-900/10' : 'bg-zinc-950 border-white/10'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 block">
                        본인확인 통과됨
                      </span>
                      <p className="text-sm font-bold">{user.real_name}님의 본인인증(PASS)이 확인되었습니다.</p>
                      <span className={`text-xs ${isLight ? 'text-stone-500' : 'text-zinc-400'}`}>
                        연동 휴대폰: {user.phone}
                      </span>
                    </div>
                  </div>

                  <p className={`text-xs leading-relaxed ${isLight ? 'text-stone-600' : 'text-zinc-300'}`}>
                    타인의 차량 도용을 방지하기 위해 등록증 상의 소유자(또는 공동운전자) 성명과 일치해야 정상 승인됩니다.
                  </p>

                  <button
                    type="button"
                    onClick={() => setAddStep(2)}
                    className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-md transition"
                  >
                    다음 단계로
                  </button>
                </div>
              )}

              {/* STEP 2: 사진 2장 올리기 */}
              {addStep === 2 && (
                <div className="space-y-4">
                  <p className={`text-xs ${isLight ? 'text-stone-600' : 'text-zinc-300'}`}>
                    차량 번호판 사진과 자동차등록증 사진을 올려주세요. (터치 시 데모 서류 자동 입력)
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {/* 번호판 사진 업로드 */}
                    <button
                      type="button"
                      onClick={() => {
                        setHasUploadedPlatePhoto(true);
                        showToast('차량 번호판(37마 8120) 사진이 등록되었습니다.', 'emerald');
                      }}
                      className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-2 text-center transition min-h-[140px] ${
                        hasUploadedPlatePhoto
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : isLight
                          ? 'bg-white border-amber-900/15 hover:border-blue-500 text-stone-700'
                          : 'bg-zinc-950 border-white/10 hover:border-blue-500 text-zinc-300'
                      }`}
                    >
                      <Camera className="h-6 w-6 text-blue-600" />
                      <div>
                        <span className="text-xs font-bold block">
                          {hasUploadedPlatePhoto ? '✓ 번호판 사진 첨부됨' : '📷 차량 번호판 사진'}
                        </span>
                        <span className="text-[10px] text-stone-500 dark:text-zinc-400">
                          {hasUploadedPlatePhoto ? '37마 8120 인식됨' : '정면 또는 후면 번호판'}
                        </span>
                      </div>
                    </button>

                    {/* 자동차등록증 사진 업로드 */}
                    <button
                      type="button"
                      onClick={() => {
                        setHasUploadedDocPhoto(true);
                        showToast('자동차등록증 서류가 등록되었습니다.', 'emerald');
                      }}
                      className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-2 text-center transition min-h-[140px] ${
                        hasUploadedDocPhoto
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : isLight
                          ? 'bg-white border-amber-900/15 hover:border-blue-500 text-stone-700'
                          : 'bg-zinc-950 border-white/10 hover:border-blue-500 text-zinc-300'
                      }`}
                    >
                      <FileText className="h-6 w-6 text-indigo-600" />
                      <div>
                        <span className="text-xs font-bold block">
                          {hasUploadedDocPhoto ? '✓ 등록증 서류 첨부됨' : '📄 자동차등록증 사진'}
                        </span>
                        <span className="text-[10px] text-stone-500 dark:text-zinc-400">
                          {hasUploadedDocPhoto ? '차대번호 교차 확인완료' : '차량등록증 전체면'}
                        </span>
                      </div>
                    </button>
                  </div>

                  {(!hasUploadedPlatePhoto || !hasUploadedDocPhoto) && (
                    <button
                      type="button"
                      onClick={() => {
                        setHasUploadedPlatePhoto(true);
                        setHasUploadedDocPhoto(true);
                        showToast('데모용 번호판 및 등록증 사진 2장이 자동 첨부되었습니다.', 'sky');
                      }}
                      className="w-full py-2 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/15 transition"
                    >
                      데모용 서류 2장 원클릭 자동 첨부
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isVerifyingOcr}
                    onClick={handleSubmitOcrVerification}
                    className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm shadow-md transition flex items-center justify-center gap-2"
                  >
                    {isVerifyingOcr ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>번호판과 등록증을 확인하고 있어요...</span>
                      </>
                    ) : (
                      <span>인증 신청하기</span>
                    )}
                  </button>
                </div>
              )}

              {/* STEP 3: 인증 완료 안내 */}
              {addStep === 3 && (
                <div className="space-y-5 text-center py-2">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-500 flex items-center justify-center mx-auto shadow-inner">
                    <CheckCircle2 className="h-9 w-9 stroke-[2.5]" />
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-lg font-black tracking-tight text-emerald-600 dark:text-emerald-400">
                      새로운 차량 등록 완료!
                    </h4>
                    <p className={`text-xs ${isLight ? 'text-stone-600' : 'text-zinc-300'}`}>
                      번호판과 자동차등록증 소유자 검증이 정상 통과되었습니다.
                    </p>
                  </div>

                  <div
                    className={`p-4 rounded-2xl border text-left space-y-1 ${
                      isLight ? 'bg-white border-amber-900/10' : 'bg-zinc-950 border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xl font-black text-stone-900 dark:text-white">
                        37마 8120
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                        소유주 인증완료
                      </span>
                    </div>
                    <p className="text-xs font-bold text-stone-700 dark:text-zinc-300">
                      기아 (KIA) EV9 GT-Line AWD
                    </p>
                    <p className={`text-[11px] ${isLight ? 'text-stone-400' : 'text-zinc-500'}`}>
                      오션 매트 블루 · 공동운전자 승인완료
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleCompleteAddVehicle}
                    className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-md transition"
                  >
                    내 차고에서 확인하기
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─────────────────────────────────────────────────────────────
          [모달 2] 카메라 연동 설정 모달
         ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isCameraModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-md rounded-3xl border shadow-2xl p-6 space-y-4 ${
                isLight ? 'bg-[#fdfaf1] border-amber-900/15 text-stone-900' : 'bg-zinc-900 border-white/10 text-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="h-5 w-5 text-blue-600" />
                  <h3 className="text-base font-bold">블랙박스 · 카메라 연동 설정</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCameraModalOpen(false)}
                  className={`p-1.5 rounded-xl ${isLight ? 'hover:bg-amber-900/10' : 'hover:bg-white/10'}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-black/5 dark:bg-white/5">
                  <span className="text-xs font-bold">RTSP 실시간 비디오 스트리밍</span>
                  <button
                    type="button"
                    onClick={() => setBlackboxConnected(!blackboxConnected)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                      blackboxConnected
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40'
                        : 'bg-stone-500/20 text-stone-400 border border-stone-500/40'
                    }`}
                  >
                    {blackboxConnected ? '연결됨 (활성)' : '연결 해제됨'}
                  </button>
                </div>

                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-stone-500' : 'text-zinc-400'}`}>
                    블랙박스 Wi-Fi RTSP 엔드포인트 URL
                  </label>
                  <input
                    type="text"
                    value={rtspUrl}
                    onChange={(e) => setRtspUrl(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 text-xs font-mono border focus:outline-none focus:border-blue-500 ${
                      isLight
                        ? 'bg-white border-amber-900/15 text-stone-900'
                        : 'bg-zinc-950 border-white/10 text-white'
                    }`}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setBlackboxConnected(true);
                  setIsCameraModalOpen(false);
                  showToast('블랙박스 실시간 스트림 연결 설정이 저장되었습니다.', 'emerald');
                }}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow transition"
              >
                연결 테스트 및 저장
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─────────────────────────────────────────────────────────────
          [모달 3] 간편결제 관리 모달
         ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isPaymentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-md rounded-3xl border shadow-2xl p-6 space-y-4 ${
                isLight ? 'bg-[#fdfaf1] border-amber-900/15 text-stone-900' : 'bg-zinc-900 border-white/10 text-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-amber-500" />
                  <h3 className="text-base font-bold">인앱 기프트샵 간편결제 관리</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className={`p-1.5 rounded-xl ${isLight ? 'hover:bg-amber-900/10' : 'hover:bg-white/10'}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className={`text-xs ${isLight ? 'text-stone-500' : 'text-zinc-400'}`}>
                주행 중 감사 선물 발송 시 안전을 위해 비밀번호 입력 없이 결제되는 기본 수단입니다.
              </p>

              <div className="space-y-2">
                {[
                  { id: 'KAKAOPAY', name: '카카오페이', desc: '현대카드 제네시스 에디션 (****-4821)' },
                  { id: 'TOSSPAY', name: '토스페이', desc: '토스뱅크 계좌 즉시출금' },
                  { id: 'CREDIT_CARD', name: '신용/체크카드', desc: 'KB국민카드 (****-1092)' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedPayment(item.id as typeof selectedPayment)}
                    className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition ${
                      selectedPayment === item.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : isLight
                        ? 'bg-white border-amber-900/10'
                        : 'bg-zinc-950 border-white/10'
                    }`}
                  >
                    <div>
                      <span className="text-xs font-bold block">{item.name}</span>
                      <span className={`text-[11px] ${isLight ? 'text-stone-400' : 'text-zinc-500'}`}>
                        {item.desc}
                      </span>
                    </div>
                    {selectedPayment === item.id && (
                      <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    )}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsPaymentModalOpen(false);
                  showToast('기본 결제 수단이 변경되었습니다.', 'emerald');
                }}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow transition"
              >
                확인
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─────────────────────────────────────────────────────────────
          [모달 4] 가족 공동운전자 초대 모달
         ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isCoDriverModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-md rounded-3xl border shadow-2xl p-6 space-y-4 ${
                isLight ? 'bg-[#fdfaf1] border-amber-900/15 text-stone-900' : 'bg-zinc-900 border-white/10 text-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-emerald-600" />
                  <h3 className="text-base font-bold">가족 공동운전자 초대 및 관리</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCoDriverModalOpen(false)}
                  className={`p-1.5 rounded-xl ${isLight ? 'hover:bg-amber-900/10' : 'hover:bg-white/10'}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div
                className={`p-3.5 rounded-2xl border space-y-1 ${
                  isLight ? 'bg-white border-amber-900/10' : 'bg-zinc-950 border-white/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">박지영 님 (배우자)</span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                    동의 승인완료
                  </span>
                </div>
                <p className={`text-[11px] ${isLight ? 'text-stone-500' : 'text-zinc-400'}`}>
                  대표 차량 (12라 3466) 알림 수신 권한 보유
                </p>
              </div>

              <div className="space-y-1.5">
                <span className={`text-xs font-bold block ${isLight ? 'text-stone-600' : 'text-zinc-300'}`}>
                  가족 초대 전용 링크
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value="https://platetalk.app/invite/family-v7x9q"
                    className={`flex-1 rounded-xl px-3 py-2 text-xs font-mono border ${
                      isLight ? 'bg-white border-amber-900/15 text-stone-700' : 'bg-zinc-950 border-white/10 text-zinc-300'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleCopyInviteLink}
                    className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1 shadow transition"
                  >
                    {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span>{copiedLink ? '복사됨' : '복사'}</span>
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCoDriverModalOpen(false)}
                className={`w-full py-2.5 rounded-xl border font-bold text-xs transition ${
                  isLight
                    ? 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-300'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-white/10'
                }`}
              >
                닫기
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
