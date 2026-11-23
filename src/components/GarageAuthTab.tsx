'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  XCircle,
  ScanLine,
  Smartphone,
  FileCheck2,
  Users,
  Wifi,
  CreditCard,
  Plus,
  CheckCircle2,
  Eye,
  Car,
} from 'lucide-react';
import { usePlateTalk } from '@/context/PlateTalkContext';
import { runOcrCrossVerification, OcrVerificationResult } from '@/lib/ocrEngine';
import { OwnershipRole, VerificationStatus } from '@/types/platetalk';

export default function GarageAuthTab() {
  const {
    user,
    vehicles,
    activeVehicle,
    setActiveVehicleId,
    updateVerificationStatus,
    addSecondaryVehicle,
    showToast,
  } = usePlateTalk();

  // Step 1: 소셜 로그인 & PASS 본인인증 상태
  const [selectedSocialProvider, setSelectedSocialProvider] = useState<
    'KAKAO' | 'GOOGLE' | 'APPLE'
  >(user.auth_provider);
  const [passRealName, setPassRealName] = useState(user.real_name);
  const [passPhone, setPassPhone] = useState(user.phone);
  const [passVerified, setPassVerified] = useState(true);

  // Step 2: 번호판 사진 + 자동차등록증 OCR 교차 검증 입력 상태
  const [platePhotoOcrText, setPlatePhotoOcrText] = useState(
    activeVehicle.license_plate
  );
  const [regDocPlateText, setRegDocPlateText] = useState(
    activeVehicle.license_plate
  );
  const [regDocVinText, setRegDocVinText] = useState(activeVehicle.vin);
  const [regDocOwnerName, setRegDocOwnerName] = useState(
    activeVehicle.registered_owner_name
  );
  const [ownershipRole, setOwnershipRole] = useState<OwnershipRole>(
    activeVehicle.ownership_role
  );
  const [coDriverSmsApproved, setCoDriverSmsApproved] = useState(true);
  const [isScanningOcr, setIsScanningOcr] = useState(false);

  const [ocrResult, setOcrResult] = useState<OcrVerificationResult>(() =>
    runOcrCrossVerification({
      loggedInUserRealName: user.real_name,
      loggedInUserPhone: user.phone,
      platePhotoText: activeVehicle.license_plate,
      registrationDocPlate: activeVehicle.license_plate,
      registrationDocVin: activeVehicle.vin,
      registrationDocOwnerName: activeVehicle.registered_owner_name,
      ownershipRole: activeVehicle.ownership_role,
      coDriverConsentVerified: true,
    })
  );

  // 하드웨어 연동 상태
  const [rtspUrl, setRtspUrl] = useState(
    'rtsp://192.168.10.1:554/inavi_qxd1_front_fhd'
  );
  const [blackboxConnected, setBlackboxConnected] = useState(true);

  const handleRunOcrVerification = () => {
    setIsScanningOcr(true);
    setTimeout(() => {
      const result = runOcrCrossVerification({
        loggedInUserRealName: passRealName,
        loggedInUserPhone: passPhone,
        platePhotoText: platePhotoOcrText,
        registrationDocPlate: regDocPlateText,
        registrationDocVin: regDocVinText,
        registrationDocOwnerName: regDocOwnerName,
        ownershipRole,
        coDriverConsentVerified: coDriverSmsApproved,
      });
      setOcrResult(result);
      setIsScanningOcr(false);

      updateVerificationStatus(
        result.status,
        regDocPlateText,
        regDocVinText,
        regDocOwnerName,
        ownershipRole,
        result.status === 'REJECTED' ? result.summaryMessage : undefined
      );
    }, 650);
  };

  // 시나리오별 원클릭 프리셋 적용
  const applyOcrScenario = (
    scenario: 'PRIMARY_MATCH' | 'CO_DRIVER_PENDING' | 'CO_DRIVER_APPROVED' | 'FRAUD_REJECTED'
  ) => {
    if (scenario === 'PRIMARY_MATCH') {
      setPlatePhotoOcrText('12라 3466');
      setRegDocPlateText('12라 3466');
      setRegDocVinText('KMHL341CBNP034661');
      setRegDocOwnerName(passRealName);
      setOwnershipRole('PRIMARY_OWNER');
      setCoDriverSmsApproved(true);
    } else if (scenario === 'CO_DRIVER_PENDING') {
      setPlatePhotoOcrText('12라 3466');
      setRegDocPlateText('12라 3466');
      setRegDocVinText('KMHL341CBNP034661');
      setRegDocOwnerName('박지영 (배우자)');
      setOwnershipRole('CO_DRIVER');
      setCoDriverSmsApproved(false);
    } else if (scenario === 'CO_DRIVER_APPROVED') {
      setPlatePhotoOcrText('12라 3466');
      setRegDocPlateText('12라 3466');
      setRegDocVinText('KMHL341CBNP034661');
      setRegDocOwnerName('박지영 (배우자)');
      setOwnershipRole('CO_DRIVER');
      setCoDriverSmsApproved(true);
    } else {
      // 도용 시도 (사진 번호판과 등록증 번호판 불일치)
      setPlatePhotoOcrText('99바 7777');
      setRegDocPlateText('12라 3466');
      setRegDocVinText('INVALID_VIN_123');
      setRegDocOwnerName('홍길동');
      setOwnershipRole('PRIMARY_OWNER');
      setCoDriverSmsApproved(false);
    }
  };

  const handleAddFamilyVehicle = () => {
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
  };

  const renderStatusBadge = (status: VerificationStatus) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="flex items-center gap-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/50 px-3 py-1.5 text-xs font-extrabold text-emerald-300">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            VERIFIED (인증완료 · 모든 기능 해금)
          </span>
        );
      case 'PENDING':
        return (
          <span className="flex items-center gap-1.5 rounded-xl bg-amber-500/20 border border-amber-400/50 px-3 py-1.5 text-xs font-extrabold text-amber-300">
            <Clock className="h-4 w-4 text-amber-400" />
            PENDING (심사/소유주 승인 대기 · 눈팅만 가능)
          </span>
        );
      case 'REJECTED':
        return (
          <div className="flex flex-col items-end gap-1">
            <span className="flex items-center gap-1.5 rounded-xl bg-rose-500/20 border border-rose-400/50 px-3 py-1.5 text-xs font-extrabold text-rose-300">
              <XCircle className="h-4 w-4 text-rose-400" />
              REJECTED (반려 · 발송 및 작성 차단)
            </span>
            {activeVehicle.verification_rejection_reason && (
              <span className="text-[10px] text-rose-400/90 max-w-xs text-right">
                사유: {activeVehicle.verification_rejection_reason}
              </span>
            )}
          </div>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300">
            <Eye className="h-4 w-4" />
            UNVERIFIED (미인증 눈팅 모드)
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 상단: 현재 차량 인증 상태 및 권한 테스터 바 */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold tracking-wider text-sky-400 uppercase">
              3-STAGE VEHICLE OWNER VERIFICATION PIPELINE
            </span>
            <h2 className="mt-1 text-xl font-extrabold text-white">
              [3.1] 3단계 차량 소유주 OCR 교차 인증 및 다중 차량 관리
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              단순 번호판 입력 도용을 막기 위해 [소셜+PASS 실명인증] → [차량사진+자동차등록증 OCR 교차검증] → [소유주/공동운전자 권한]을 검증합니다.
            </p>
          </div>

          {renderStatusBadge(activeVehicle.verification_status)}
        </div>

        {/* 빠른 권한 상태 전환 시뮬레이터 (미인증 눈팅 제한 확인용) */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
          <span className="text-xs font-semibold text-slate-300">
            권한별 기능 제한 즉시 체험 (미인증/반려 시 HUD 발송 및 커뮤니티 작성 차단 테스트):
          </span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { status: 'VERIFIED', label: 'VERIFIED (모든 기능 해금)' },
                { status: 'PENDING', label: 'PENDING (심사중 · 눈팅 전용)' },
                { status: 'REJECTED', label: 'REJECTED (반려 · 발송 차단)' },
              ] as const
            ).map((item) => (
              <button
                key={item.status}
                type="button"
                id={`quick-auth-state-${item.status}`}
                onClick={() => updateVerificationStatus(item.status)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition border ${
                  activeVehicle.verification_status === item.status
                    ? 'bg-sky-500/25 text-sky-200 border-sky-400'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3단계 인증 파이프라인 그리드 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Step 1 + Step 2: 소셜/PASS 인증 & 차량사진+등록증 OCR 교차 검증기 */}
        <div className="space-y-6 lg:col-span-7">
          {/* 1단계: 소셜 로그인 & PASS 본인 명의 휴대폰 인증 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/20 font-mono text-xs font-extrabold text-sky-300 border border-sky-400/40">
                01
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  소셜 로그인 연동 및 PASS 본인 명의 휴대폰 인증
                </h3>
                <p className="text-xs text-slate-400">
                  자동차등록증 소유주 성명과 대조할 본인 실명 CI/DI를 확보합니다.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {(
                [
                  { id: 'KAKAO', label: '카카오 로그인', color: 'border-yellow-400/50 text-yellow-300' },
                  { id: 'GOOGLE', label: 'Google 로그인', color: 'border-sky-400/50 text-sky-300' },
                  { id: 'APPLE', label: 'Apple 로그인', color: 'border-slate-400/50 text-white' },
                ] as const
              ).map((prov) => (
                <button
                  key={prov.id}
                  type="button"
                  onClick={() => setSelectedSocialProvider(prov.id)}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                    selectedSocialProvider === prov.id
                      ? `bg-slate-950 ${prov.color} shadow-md`
                      : 'border-slate-800 bg-slate-950/60 text-slate-400'
                  }`}
                >
                  {prov.label} {selectedSocialProvider === prov.id && '✓'}
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400">
                  PASS 인증 실명
                </label>
                <input
                  type="text"
                  value={passRealName}
                  onChange={(e) => setPassRealName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400">
                  본인 명의 휴대폰
                </label>
                <input
                  type="text"
                  value={passPhone}
                  onChange={(e) => setPassPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    setPassVerified(true);
                    showToast(
                      `PASS 본인명의 휴대폰(${passPhone} / ${passRealName}) 실명 인증이 확인되었습니다.`,
                      'emerald'
                    );
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/50 py-2 text-xs font-bold text-emerald-300"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  <span>{passVerified ? 'PASS 실명인증 완료' : 'PASS 인증하기'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 2단계: 차량 번호판 사진 + 자동차등록증 Vision OCR 교차 검증 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 font-mono text-xs font-extrabold text-emerald-300 border border-emerald-400/40">
                  02
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    차량 번호판 사진 + 자동차등록증 Vision OCR 교차 검증
                  </h3>
                  <p className="text-xs text-slate-400">
                    두 이미지에서 추출한 [차량번호], [차대번호(VIN)], [소유주 성명]을 교차 대조합니다.
                  </p>
                </div>
              </div>
            </div>

            {/* 검증 시나리오 프리셋 버튼 */}
            <div className="mt-4">
              <span className="block text-[11px] font-semibold text-slate-400">
                OCR 교차 검증 테스트 프리셋 선택:
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  id="ocr-preset-match"
                  onClick={() => applyOcrScenario('PRIMARY_MATCH')}
                  className="rounded-xl bg-emerald-500/15 border border-emerald-400/40 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
                >
                  ① 본인소유 100% 일치 (VERIFIED)
                </button>
                <button
                  type="button"
                  id="ocr-preset-codriver-pending"
                  onClick={() => applyOcrScenario('CO_DRIVER_PENDING')}
                  className="rounded-xl bg-amber-500/15 border border-amber-400/40 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/25"
                >
                  ② 가족차량 공동운전자 승인대기 (PENDING)
                </button>
                <button
                  type="button"
                  id="ocr-preset-codriver-approved"
                  onClick={() => applyOcrScenario('CO_DRIVER_APPROVED')}
                  className="rounded-xl bg-sky-500/15 border border-sky-400/40 px-3 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-500/25"
                >
                  ③ 가족차량 소유주 승인완료 (VERIFIED)
                </button>
                <button
                  type="button"
                  id="ocr-preset-fraud"
                  onClick={() => applyOcrScenario('FRAUD_REJECTED')}
                  className="rounded-xl bg-rose-500/15 border border-rose-400/40 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/25"
                >
                  ④ 번호판 도용/불일치 (REJECTED)
                </button>
              </div>
            </div>

            {/* OCR 추출 필드 편집 및 비교 UI */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3.5">
                <span className="text-[11px] font-bold text-sky-400">
                  [이미지 A] 차량 전면/후면 사진 OCR 추출 번호판
                </span>
                <input
                  id="ocr-photo-plate-input"
                  type="text"
                  value={platePhotoOcrText}
                  onChange={(e) => setPlatePhotoOcrText(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm font-extrabold text-white"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  전/후면 실물 번호판 객체 탐지 결과
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3.5">
                <span className="text-[11px] font-bold text-emerald-400">
                  [이미지 B] 자동차등록증 OCR 추출 차량번호
                </span>
                <input
                  id="ocr-doc-plate-input"
                  type="text"
                  value={regDocPlateText}
                  onChange={(e) => setRegDocPlateText(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm font-extrabold text-white"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  자동차등록증 제1호 서식 차량번호란
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3.5">
                <span className="text-[11px] font-bold text-emerald-400">
                  [자동차등록증] 차대번호 (17자리 VIN)
                </span>
                <input
                  id="ocr-doc-vin-input"
                  type="text"
                  value={regDocVinText}
                  onChange={(e) => setRegDocVinText(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs font-bold text-sky-300"
                />
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3.5">
                <span className="text-[11px] font-bold text-emerald-400">
                  [자동차등록증] 소유주 성명 및 운전자 유형
                </span>
                <div className="mt-2 flex gap-2">
                  <input
                    id="ocr-doc-owner-input"
                    type="text"
                    value={regDocOwnerName}
                    onChange={(e) => setRegDocOwnerName(e.target.value)}
                    className="w-1/2 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs font-bold text-white"
                  />
                  <select
                    value={ownershipRole}
                    onChange={(e) =>
                      setOwnershipRole(e.target.value as OwnershipRole)
                    }
                    className="w-1/2 rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white"
                  >
                    <option value="PRIMARY_OWNER">본인 단독 소유</option>
                    <option value="CO_DRIVER">가족 공동운전자</option>
                    <option value="CORPORATE_LEASE">법인/리스/렌트</option>
                  </select>
                </div>
              </div>
            </div>

            {ownershipRole === 'CO_DRIVER' && (
              <div className="mt-3 flex items-center justify-between rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs text-sky-200">
                  <Users className="h-4 w-4 text-sky-400" />
                  <span>
                    가족/배우자 차량 공동 운전자 등록: 원 소유주({regDocOwnerName}) 모바일 승인 여부
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCoDriverSmsApproved((prev) => !prev)}
                  className={`rounded-lg px-3 py-1 text-xs font-bold ${
                    coDriverSmsApproved
                      ? 'bg-emerald-400 text-slate-950'
                      : 'bg-amber-400 text-slate-950'
                  }`}
                >
                  {coDriverSmsApproved ? '소유주 승인 완료됨' : '승인 대기중 (클릭시 승인)'}
                </button>
              </div>
            )}

            <button
              type="button"
              id="run-ocr-cross-verify-btn"
              onClick={handleRunOcrVerification}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-400 py-3 text-sm font-extrabold text-slate-950 hover:bg-sky-300 transition shadow-lg"
            >
              <ScanLine className="h-4 w-4" />
              <span>
                {isScanningOcr
                  ? 'Vision OCR 교차 대조 분석 중...'
                  : 'Vision OCR 교차 검증 실행 및 권한 업데이트'}
              </span>
            </button>

            {/* OCR 교차 검증 상세 리포트 */}
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <FileCheck2 className="h-4 w-4 text-emerald-400" />
                  OCR 교차 검증 리포트 (신뢰도 {ocrResult.confidenceScore}%)
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-extrabold ${
                    ocrResult.status === 'VERIFIED'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : ocrResult.status === 'PENDING'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  판정: {ocrResult.status}
                </span>
              </div>

              <p className="mt-2 text-xs text-slate-300">
                {ocrResult.summaryMessage}
              </p>

              <div className="mt-3 space-y-2">
                {ocrResult.detailedChecks.map((chk) => (
                  <div
                    key={chk.label}
                    className="flex items-start justify-between gap-2 rounded-xl border border-slate-800/90 bg-slate-900/70 p-2.5 text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-200">
                        {chk.label}
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {chk.expectedNote}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-xs font-bold ${
                        chk.passed ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {chk.passed ? 'PASS ✓' : 'FAIL ✕'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 우측: 다중 차량 관리 + 블랙박스/액션캠 연동 + 간편결제 관리 */}
        <div className="space-y-6 lg:col-span-5">
          {/* 내 차고 다중 차량 관리 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Car className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  다중 차량 및 가족 공동운전자 관리
                </h3>
              </div>
              <button
                type="button"
                id="add-family-codriver-vehicle-btn"
                onClick={handleAddFamilyVehicle}
                className="flex items-center gap-1 rounded-xl bg-emerald-500/20 border border-emerald-400/40 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>가족 공동차량(EV9) 추가</span>
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {vehicles.slice(0, 3).map((v) => {
                const isCurrent = v.id === activeVehicle.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setActiveVehicleId(v.id)}
                    className={`flex w-full items-center justify-between rounded-2xl p-3.5 text-left transition border ${
                      isCurrent
                        ? 'bg-emerald-500/15 border-emerald-400'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-extrabold text-white">
                          {v.license_plate}
                        </span>
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                          {v.ownership_role === 'PRIMARY_OWNER'
                            ? '본인소유'
                            : '공동운전자'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-300">
                        {v.brand} {v.model} ({v.color})
                      </p>
                      <p className="font-mono text-[10px] text-slate-500">
                        VIN: {v.vin}
                      </p>
                    </div>

                    <span
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                        v.verification_status === 'VERIFIED'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : v.verification_status === 'PENDING'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {v.verification_status}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 블랙박스 Wi-Fi RTSP 스트리밍 & 외부 액션캠 연동 설정 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wifi className="h-5 w-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">
                  블랙박스(Wi-Fi/RTSP) & 액션캠 연동
                </h3>
              </div>
              <span className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                {blackboxConnected ? 'RTSP 스트림 정상' : '연결 해제됨'}
              </span>
            </div>

            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400">
                  블랙박스 실시간 RTSP 스트림 엔드포인트
                </label>
                <input
                  type="text"
                  value={rtspUrl}
                  onChange={(e) => setRtspUrl(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-sky-300"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setBlackboxConnected(true);
                  showToast(
                    '블랙박스 Wi-Fi RTSP 1080p@60fps 실시간 비디오 스트림 동기화가 완료되었습니다.',
                    'emerald'
                  );
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-sky-400/50 bg-sky-500/20 py-2.5 text-xs font-bold text-sky-300 hover:bg-sky-500/30"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>블랙박스/액션캠 스트림 연결 테스트</span>
              </button>
            </div>
          </div>

          {/* 원클릭 답례용 간편결제 수단 관리 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-amber-400" />
              <h3 className="text-base font-bold text-white">
                인앱 기프트샵 원클릭 간편결제 관리
              </h3>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              주행 중 “커피 한 잔으로 고마움을 전하시겠습니까?” 음성 응답 시 즉시 결제되는 기본 수단입니다.
            </p>
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 p-3.5">
              <div>
                <span className="text-xs font-bold text-white">
                  카카오페이 (현대카드 제네시스 에디션 ****-4821)
                </span>
                <p className="text-[11px] text-emerald-400">
                  음성 생체인증 원클릭 결제 활성화됨
                </p>
              </div>
              <ShieldAlert className="h-5 w-5 text-emerald-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
