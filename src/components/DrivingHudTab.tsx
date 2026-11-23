'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  Radio,
  ShieldAlert,
  Sparkles,
  Volume2,
  Gift,
  AlertTriangle,
  Camera,
  Wifi,
  Power,
  Send,
  ThumbsUp,
  HelpCircle,
  HeartHandshake,
  Eye,
  ShieldCheck,
  Navigation,
  X,
} from 'lucide-react';
import { usePlateTalk } from '@/context/PlateTalkContext';
import {
  analyzeDriverVoiceCommand,
  speakDrivingBriefing,
  VoiceCommandAnalysis,
} from '@/lib/voiceAiEngine';
import { DrivingMessageType } from '@/types/platetalk';

const VOICE_PRESET_COMMANDS = [
  {
    id: 'preset-brake',
    label: '브레이크등 고장 알림 (음성)',
    speech: '헤이 플레이트, 앞에 흰색 쏘나타 4568에게 브레이크등 나갔다고 알려줘',
    badge: '1-1 차량이상',
  },
  {
    id: 'preset-rage-sanitize',
    label: '거친 발화 → AI 정중 순화 테스트',
    speech: '헤이 플레이트, 아 진짜 앞에 4568 브레이크등 고장났잖아 위험하게 왜 저래!',
    badge: 'AI 욕설/시비 필터링',
  },
  {
    id: 'preset-overload',
    label: '화물차 낙하물 경고 + 5km 브로드캐스트',
    speech: '헤이 플레이트, 우측 9104 화물트럭 적재물 낙하 위험 경고해줘',
    badge: '1-2 과적/5km공유',
  },
  {
    id: 'preset-tuning',
    label: '루프박스·휠 모델명 문의',
    speech: '헤이 플레이트, 좌측 쏘렌토 8821 차량에 장착한 루프박스 모델명이 궁금합니다',
    badge: '1-3 튜닝문의',
  },
  {
    id: 'preset-yield',
    label: '끼어들기 양보운전 감사 인사',
    speech: '헤이 플레이트, 끝자리 4568 차량에게 방금 차선 양보해줘서 고맙다고 전해줘',
    badge: '1-5 양보감사',
  },
];

export default function DrivingHudTab() {
  const {
    activeVehicle,
    scannedVehicles,
    selectedTargetPlate,
    setSelectedTargetPlate,
    isDrivingMode,
    isTtsSpeaking,
    activeHudIncomingMessage,
    dismissHudOverlayCard,
    toggleDrivingMode,
    sendDrivingMessage,
    triggerSimulatedIncomingAlert,
    acknowledgeHelpfulMessage,
    openQuickGiftModal,
    setActiveTab,
    showToast,
  } = usePlateTalk();

  const [cameraSource, setCameraSource] = useState<
    'BLACKBOX_RTSP' | 'ACTION_CAM' | 'WEBRTC_CAM'
  >('BLACKBOX_RTSP');
  const [webcamActive, setWebcamActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [isListeningStt, setIsListeningStt] = useState(false);
  const [voiceInputText, setVoiceInputText] = useState(
    '헤이 플레이트, 앞에 흰색 쏘나타 4568에게 브레이크등 나갔다고 알려줘'
  );
  const [aiAnalysis, setAiAnalysis] = useState<VoiceCommandAnalysis>(() =>
    analyzeDriverVoiceCommand(
      '헤이 플레이트, 앞에 흰색 쏘나타 4568에게 브레이크등 나갔다고 알려줘',
      scannedVehicles
    )
  );

  const selectedVehicle =
    scannedVehicles.find((v) => v.license_plate === selectedTargetPlate) ||
    scannedVehicles[0];

  // WebRTC 실제 카메라 연결/해제 처리
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    if (cameraSource === 'WEBRTC_CAM') {
      if (
        typeof navigator !== 'undefined' &&
        navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia
      ) {
        navigator.mediaDevices
          .getUserMedia({ video: { facingMode: 'environment' } })
          .then((mediaStream) => {
            if (cancelled) {
              mediaStream.getTracks().forEach((t) => t.stop());
              return;
            }
            stream = mediaStream;
            setWebcamActive(true);
            if (videoRef.current) {
              videoRef.current.srcObject = mediaStream;
            }
          })
          .catch(() => {
            if (!cancelled) {
              setWebcamActive(false);
              showToast(
                '브라우저 카메라 권한이 없어 시뮬레이션 스트림으로 표시합니다.',
                'amber'
              );
            }
          });
      }
    }

    return () => {
      cancelled = true;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [cameraSource, showToast]);

  const handleVoiceTextChange = (text: string) => {
    setVoiceInputText(text);
    const result = analyzeDriverVoiceCommand(text, scannedVehicles);
    setAiAnalysis(result);
    if (result.matchedVehicle) {
      setSelectedTargetPlate(result.matchedVehicle.license_plate);
    }
  };

  // Web Speech API STT 실행
  const handleStartWebSpeechStt = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognitionCtor =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      // 마이크 미지원 환경에서는 시뮬레이션 파형 작동 후 프리셋 순환
      setIsListeningStt(true);
      setTimeout(() => {
        setIsListeningStt(false);
        const nextPreset =
          VOICE_PRESET_COMMANDS[
            Math.floor(Math.random() * VOICE_PRESET_COMMANDS.length)
          ];
        handleVoiceTextChange(nextPreset.speech);
        showToast(
          `웨이크워드 감지 완료: "${nextPreset.speech}"`,
          'sky'
        );
      }, 1800);
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recognition = new (SpeechRecognitionCtor as any)();
      recognition.lang = 'ko-KR';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListeningStt(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          handleVoiceTextChange(transcript);
        }
        setIsListeningStt(false);
      };
      recognition.onerror = () => {
        setIsListeningStt(false);
        showToast(
          '마이크 입력 대신 음성 시뮬레이션 프리셋을 사용할 수 있습니다.',
          'amber'
        );
      };
      recognition.onend = () => setIsListeningStt(false);
      recognition.start();
    } catch {
      setIsListeningStt(false);
    }
  };

  const handleSendAnalyzedVoiceCommand = () => {
    if (aiAnalysis.blockedEntirely) {
      showToast(
        aiAnalysis.blockReason || '보복/욕설 발화는 전송이 차단됩니다.',
        'rose'
      );
      return;
    }

    if (aiAnalysis.requiresTargetConfirmation && !aiAnalysis.matchedVehicle) {
      showToast(
        aiAnalysis.confirmationReason ||
          '수신 차량을 특정하지 못했습니다. 화면의 번호판을 터치해 선택한 후 발송해 주세요.',
        'amber'
      );
      return;
    }

    const targetPlate =
      aiAnalysis.matchedVehicle?.license_plate || selectedTargetPlate;

    const res = sendDrivingMessage({
      receiverPlate: targetPlate,
      messageType: aiAnalysis.messageType,
      content: aiAnalysis.sanitizedContent,
      rawVoiceTranscript: aiAnalysis.rawTranscript,
      aiSanitized: true,
      broadcastRadiusKm: aiAnalysis.broadcastRadiusKm,
    });

    if (res.ok) {
      speakDrivingBriefing(
        `${targetPlate} 차량에게 정중하게 정제된 안전 메시지를 발송했습니다.`
      );
    }
  };

  const handleQuickCategorySend = (
    type: DrivingMessageType,
    templateText: string,
    broadcastKm = 0
  ) => {
    const res = sendDrivingMessage({
      receiverPlate: selectedTargetPlate,
      messageType: type,
      content: templateText,
      rawVoiceTranscript: `[원터치/음성 단축키] ${templateText}`,
      aiSanitized: true,
      broadcastRadiusKm: broadcastKm,
    });

    if (res.ok) {
      speakDrivingBriefing(
        broadcastKm > 0
          ? `${selectedTargetPlate} 화물 차량 경고 및 반경 5킬로미터 방어운전 브로드캐스트를 완료했습니다.`
          : `${selectedTargetPlate} 차량에게 메시지를 발송했습니다.`
      );
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. 상단 드라이빙 HUD 텔레메트리 및 주행모드 제어 바 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/90 bg-slate-900/90 px-4 py-3.5 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isDrivingMode
                  ? 'animate-ping bg-emerald-400'
                  : 'bg-slate-500'
              }`}
            />
            <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
              {isDrivingMode ? 'HANDS-FREE HUD ACTIVE' : 'PARKING / STANDBY MODE'}
            </span>
          </div>

          <span className="hidden text-slate-700 sm:inline">|</span>

          {/* 하드웨어 카메라 소스 선택 */}
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-950/90 p-1 border border-slate-800">
            <button
              type="button"
              id="cam-source-blackbox"
              onClick={() => setCameraSource('BLACKBOX_RTSP')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                cameraSource === 'BLACKBOX_RTSP'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wifi className="h-3.5 w-3.5" />
              <span>블랙박스 RTSP</span>
            </button>
            <button
              type="button"
              id="cam-source-actioncam"
              onClick={() => setCameraSource('ACTION_CAM')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                cameraSource === 'ACTION_CAM'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="h-3.5 w-3.5" />
              <span>액션캠 연동</span>
            </button>
            <button
              type="button"
              id="cam-source-webrtc"
              onClick={() => setCameraSource('WEBRTC_CAM')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                cameraSource === 'WEBRTC_CAM'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Camera className="h-3.5 w-3.5" />
              <span>내장 카메라</span>
            </button>
          </div>
        </div>

        {/* 주행 종료 & 읽은 알림 자동 말소 버튼 */}
        <div className="flex items-center gap-2.5">
          {activeVehicle.verification_status !== 'VERIFIED' && (
            <button
              type="button"
              onClick={() => setActiveTab('GARAGE')}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500/20 border border-amber-400/40 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>미인증 눈팅모드 (OCR 인증하러 가기)</span>
            </button>
          )}

          <button
            type="button"
            id="toggle-driving-mode-btn"
            onClick={toggleDrivingMode}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              isDrivingMode
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
            }`}
          >
            <Power className="h-3.5 w-3.5" />
            <span>
              {isDrivingMode
                ? '주행 종료 (읽은 알림 자동 말소)'
                : '드라이빙 HUD 재시작'}
            </span>
          </button>
        </div>
      </div>

      {/* 2. 메인 전방 블랙박스/카메라 ALPR 비전 뷰포트 */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="relative aspect-[16/9] w-full min-h-[300px] sm:min-h-[420px]">
          {cameraSource === 'WEBRTC_CAM' && webcamActive ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          ) : (
            <img
              src="/assets/dashcam-road.jpg"
              alt="PlateTalk 전방 블랙박스 실시간 비전 스트림"
              className="h-full w-full object-cover brightness-95 contrast-105"
            />
          )}

          {/* 다크 비네팅 오버레이 */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/75" />

          {/* 상단 HUD 헤드업 상태 표시줄 */}
          <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 rounded-xl bg-slate-950/85 px-3 py-1.5 text-xs font-mono text-sky-300 border border-sky-500/30 backdrop-blur-md">
              <Navigation className="h-3.5 w-3.5 text-sky-400" />
              <span>ALPR VISION v4.2 · 60 FPS</span>
              <span className="text-slate-600">|</span>
              <span className="text-emerald-400">
                내 차: {activeVehicle.license_plate} ({activeVehicle.verification_status})
              </span>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-slate-950/85 px-3 py-1.5 text-xs font-medium text-amber-300 border border-amber-500/30 backdrop-blur-md">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
              <span>반경 5km 위험 브로드캐스트 레이더 가동 중</span>
            </div>
          </div>

          {/* 실시간 번호판 객체 탐지(Bounding Box) 오버레이 */}
          {scannedVehicles.map((veh) => {
            const isSelected = veh.license_plate === selectedTargetPlate;
            const isTruck = veh.vehicleType === 'CARGO_TRUCK';
            return (
              <button
                key={veh.id}
                type="button"
                id={`hud-bbox-${veh.id}`}
                onClick={() => setSelectedTargetPlate(veh.license_plate)}
                style={{
                  top: `${veh.bbox.topPercent}%`,
                  left: `${veh.bbox.leftPercent}%`,
                  width: `${veh.bbox.widthPercent}%`,
                  height: `${veh.bbox.heightPercent}%`,
                }}
                className={`group absolute rounded-xl transition-all duration-200 focus:outline-none ${
                  isSelected
                    ? isTruck
                      ? 'border-2 border-amber-400 bg-amber-500/15 shadow-[0_0_25px_rgba(251,191,36,0.45)]'
                      : 'border-2 border-emerald-400 bg-emerald-500/15 shadow-[0_0_25px_rgba(16,185,129,0.45)]'
                    : 'border border-sky-400/70 bg-sky-500/10 hover:border-sky-300'
                }`}
              >
                {/* 번호판 OCR 캡션 플로팅 태그 */}
                <div
                  className={`absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold tracking-tight shadow-lg backdrop-blur-md transition ${
                    isSelected
                      ? isTruck
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-emerald-400 text-slate-950'
                      : 'bg-slate-950/90 text-sky-200 border border-sky-400/40'
                  }`}
                >
                  <span>{veh.license_plate}</span>
                  <span className="ml-1.5 opacity-80 font-mono text-[10px]">
                    {veh.distanceMeters}m
                  </span>
                </div>

                {/* 하단 차종 및 상태 배지 */}
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950/90 px-2 py-0.5 text-[10px] font-medium text-slate-200 border border-slate-700/80">
                  {veh.color} {veh.model}
                </div>
              </button>
            );
          })}

          {/* [3.2.3] 주행 중 수신 메시지 대형 HUD 브리핑 카드 */}
          <AnimatePresence>
            {activeHudIncomingMessage && (
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.96 }}
                className="absolute bottom-4 left-4 right-4 z-20 rounded-2xl border border-emerald-400/50 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        activeHudIncomingMessage.message_type === 'OVERLOAD_WARN'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                      }`}
                    >
                      <Volume2 className="h-5 w-5 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                          {isTtsSpeaking
                            ? 'TTS 음성 자동 브리핑 중...'
                            : 'TTS 음성 브리핑 완료 (주행 종료 시 자동 말소 예정)'}
                        </span>
                        <span className="text-xs font-mono text-sky-300">
                          발신 번호판: {activeHudIncomingMessage.sender_plate_snapshot}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {activeHudIncomingMessage.sender_vehicle_summary} ·{' '}
                        {activeHudIncomingMessage.location_name}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={dismissHudOverlayCard}
                    className="rounded-lg bg-slate-800/80 p-1.5 text-slate-400 hover:text-white"
                    aria-label="HUD 알림 카드 닫기"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <p className="mt-3 text-sm font-semibold leading-relaxed text-white sm:text-base">
                  “{activeHudIncomingMessage.content}”
                </p>

                {/* 원클릭 감사 표시(+50 명예포인트) 및 커피 답례 플로우 */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/90 pt-3">
                  <div className="flex items-center gap-2 text-xs text-amber-300">
                    <Gift className="h-4 w-4 shrink-0" />
                    <span>
                      “커피 한 잔이나 주유권으로 고마운 운전자에게 즉시 보답하시겠습니까?”
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      id="hud-helpful-ack-btn"
                      disabled={activeHudIncomingMessage.helpful_acknowledged}
                      onClick={() =>
                        acknowledgeHelpfulMessage(activeHudIncomingMessage.id)
                      }
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                        activeHudIncomingMessage.helpful_acknowledged
                          ? 'bg-slate-800 text-emerald-400 cursor-default'
                          : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                      }`}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                      <span>
                        {activeHudIncomingMessage.helpful_acknowledged
                          ? '도움 됐어요 완료 (+50pt 지급됨)'
                          : '도움 됐어요 (+50 명예포인트)'}
                      </span>
                    </button>

                    <button
                      type="button"
                      id="hud-oneclick-gift-btn"
                      onClick={() =>
                        openQuickGiftModal(
                          activeHudIncomingMessage.sender_plate_snapshot,
                          activeHudIncomingMessage.sender_vehicle_summary,
                          activeHudIncomingMessage.id
                        )
                      }
                      className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 transition"
                    >
                      <Gift className="h-3.5 w-3.5" />
                      <span>원클릭 커피/주유권 답례하기</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 3. 최근 3분 내 마주친 차량 로컬 버퍼 리스트 */}
        <div className="border-t border-slate-800/90 bg-slate-900/95 p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider text-sky-400 uppercase">
                RECENT 3-MIN LOCAL BUFFER
              </span>
              <span className="text-xs text-slate-400">
                (최근 3분 내 인식된 주변 차량 · 터치 또는 음성으로 타겟 전환)
              </span>
            </div>
            <span className="text-xs font-mono text-emerald-400">
              현재 타겟: [{selectedTargetPlate}]
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {scannedVehicles.map((v) => {
              const isSelected = v.license_plate === selectedTargetPlate;
              return (
                <button
                  key={v.id}
                  type="button"
                  id={`buffer-select-${v.id}`}
                  onClick={() => setSelectedTargetPlate(v.license_plate)}
                  className={`flex flex-col justify-between rounded-2xl p-3 text-left transition ${
                    isSelected
                      ? 'bg-emerald-500/15 border-2 border-emerald-400/80 shadow-lg'
                      : 'bg-slate-950/80 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-sm font-bold text-white border border-slate-700">
                      {v.license_plate}
                    </span>
                    <span className="text-[11px] font-mono text-sky-400">
                      OCR {v.ocrConfidence}% · {v.distanceMeters}m
                    </span>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-slate-200">
                      {v.brand} {v.model} ({v.color})
                    </p>
                    <p className="mt-0.5 text-[11px] text-amber-300/90">
                      {v.suspectedIssue || v.tuningHighlight}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. 웨이크워드("헤이 플레이트") 음성 발송(STT) & AI 욕설 안전 필터링 콘솔 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
                <Mic className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">
                  웨이크워드 음성 명령 (STT) & AI 안전 필터링
                </h2>
                <p className="text-xs text-slate-400">
                  “헤이 플레이트” 발화 시 타겟 차량 자동 매칭 후 정중한 템플릿으로 정제하여 발송합니다.
                </p>
              </div>
            </div>

            <button
              type="button"
              id="start-stt-voice-btn"
              onClick={handleStartWebSpeechStt}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                isListeningStt
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'bg-sky-400 text-slate-950 hover:bg-sky-300'
              }`}
            >
              {isListeningStt ? (
                <>
                  <MicOff className="h-4 w-4" />
                  <span>음성 인식 중... (파형 분석)</span>
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" />
                  <span>음성 발화 시작 (“헤이 플레이트”)</span>
                </>
              )}
            </button>
          </div>

          {/* 음성 테스트 프리셋 버튼들 */}
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-slate-400">
              원클릭 음성 발화 시뮬레이션 프리셋 (욕설/거친 표현 순화 테스트 포함):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {VOICE_PRESET_COMMANDS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  id={preset.id}
                  onClick={() => handleVoiceTextChange(preset.speech)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-medium transition border ${
                    voiceInputText === preset.speech
                      ? 'bg-sky-500/20 text-sky-300 border-sky-400/60'
                      : 'bg-slate-950/80 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span className="mr-1.5 text-[10px] font-bold text-emerald-400">
                    [{preset.badge}]
                  </span>
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* 자유 발화 입력창 */}
          <div className="mt-4">
            <label
              htmlFor="driver-voice-transcript-input"
              className="block text-xs font-medium text-slate-400"
            >
              운전자 실시간 음성 인식 텍스트 (직접 수정하여 AI 필터링 테스트 가능)
            </label>
            <input
              id="driver-voice-transcript-input"
              type="text"
              value={voiceInputText}
              onChange={(e) => handleVoiceTextChange(e.target.value)}
              placeholder="예: 헤이 플레이트, 앞에 흰색 쏘나타 브레이크등 나갔다고 알려줘"
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none"
            />
          </div>

          {/* AI 문맥 정제 및 타겟 매칭 결과 프리뷰 */}
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400">
                  AI 안전 문맥 정제 결과 (Whisper + GPT Safety Guard)
                </span>
              </div>
              <span className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-xs font-semibold text-sky-300 border border-slate-800">
                매칭 타겟: {aiAnalysis.matchedVehicle?.license_plate || selectedTargetPlate} (
                {aiAnalysis.matchedVehicle?.model || '전방 차량'})
              </span>
            </div>

            {aiAnalysis.hadProfanityOrAggression && (
              <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-amber-500/15 border border-amber-400/40 px-3 py-2 text-xs text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                <span>{aiAnalysis.coachingNote}</span>
              </div>
            )}

            {aiAnalysis.blockedEntirely ? (
              <div className="mt-3 rounded-xl bg-rose-500/15 border border-rose-500/40 p-3 text-xs font-semibold text-rose-300">
                {aiAnalysis.blockReason}
              </div>
            ) : (
              <p className="mt-2.5 text-sm font-medium leading-relaxed text-slate-100">
                “{aiAnalysis.sanitizedContent}”
              </p>
            )}

            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">
                {aiAnalysis.broadcastRadiusKm > 0
                  ? `반경 ${aiAnalysis.broadcastRadiusKm}km 내 주행 중인 모든 플레이트톡 차량에게 동시 경고 브로드캐스트됩니다.`
                  : '수신 차량의 HUD 및 TTS 스피커로 즉시 전달됩니다.'}
              </span>

              <button
                type="button"
                id="send-ai-sanitized-voice-btn"
                onClick={handleSendAnalyzedVoiceCommand}
                className="flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-300 transition"
              >
                <Send className="h-3.5 w-3.5" />
                <span>정제된 안전 메시지 발송</span>
              </button>
            </div>
          </div>
        </div>

        {/* 5. 상황별 원터치 소통 버튼 ([1-1] ~ [1-5]) 및 수신 TTS 시뮬레이터 */}
        <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-800 bg-slate-900/90 p-5 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                상황별 원터치 안전 소통 ({selectedTargetPlate})
              </h2>
              <span className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 border border-emerald-500/30">
                {selectedVehicle.color} {selectedVehicle.model}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              주행 중 원터치로 차량 이상 고지, 화물 낙하 경고, 튜닝 문의, 양보 감사를 발송합니다.
            </p>

            <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                id="quick-send-defect-btn"
                onClick={() =>
                  handleQuickCategorySend(
                    'DEFECT_ALERT',
                    '[차량 이상 알림] 차주님! 우측 브레이크등(또는 주유구 커버) 상태를 정차 시 꼭 점검해 주세요. 안전 운전하세요!'
                  )
                }
                className="flex items-start gap-2.5 rounded-2xl border border-slate-800 bg-slate-950/90 p-3 text-left hover:border-sky-400/60 transition"
              >
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" />
                <div>
                  <span className="text-xs font-bold text-white">
                    [1-1] 차량 이상 공유
                  </span>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    브레이크등 고장 · 타이어 공기압 · 주유구 열림 알림
                  </p>
                </div>
              </button>

              <button
                type="button"
                id="quick-send-overload-btn"
                onClick={() =>
                  handleQuickCategorySend(
                    'OVERLOAD_WARN',
                    '[화물 낙하 위험 + 5km 브로드캐스트] 적재물 결박이 느슨하여 낙하 위험이 있습니다. 즉시 점검 부탁드립니다!',
                    5.0
                  )
                }
                className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-left hover:border-amber-400 transition"
              >
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                <div>
                  <span className="text-xs font-bold text-amber-300">
                    [1-2] 화물 과적·낙하 경고
                  </span>
                  <p className="mt-0.5 text-[11px] text-amber-200/80">
                    당사자 경고 + 반경 5km 방어운전 브로드캐스트
                  </p>
                </div>
              </button>

              <button
                type="button"
                id="quick-send-tuning-btn"
                onClick={() =>
                  handleQuickCategorySend(
                    'TUNING_ASK',
                    '[차량 칭찬 & 튜닝 문의] 차량 색상이 정말 멋집니다! 장착하신 휠/루프박스 모델명이 궁금합니다.'
                  )
                }
                className="flex items-start gap-2.5 rounded-2xl border border-slate-800 bg-slate-950/90 p-3 text-left hover:border-emerald-400/60 transition"
              >
                <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <div>
                  <span className="text-xs font-bold text-white">
                    [1-3] 차량 칭찬·튜닝 문의
                  </span>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    드레스업 칭찬 및 장착 휠/루프박스 스펙 질문
                  </p>
                </div>
              </button>

              <button
                type="button"
                id="quick-send-yield-btn"
                onClick={() =>
                  handleQuickCategorySend(
                    'YIELD_THANKS',
                    '[양보운전 감사] 방금 차선 변경 시 배려해주시고 양보해주셔서 진심으로 감사합니다!'
                  )
                }
                className="flex items-start gap-2.5 rounded-2xl border border-slate-800 bg-slate-950/90 p-3 text-left hover:border-emerald-400/60 transition"
              >
                <HeartHandshake className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <div>
                  <span className="text-xs font-bold text-white">
                    [1-5] 양보운전 감사 인사
                  </span>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    고마운 차주에게 감사 인사 + 명예점수 부여
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* 실시간 수신 메시지 & TTS 자동 브리핑 테스트 패널 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-300">
                실시간 메시지 수신 & TTS 음성 브리핑 시뮬레이터
              </span>
              <span className="text-[11px] text-slate-400">즉시 음성 재생</span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                id="sim-incoming-brake-btn"
                onClick={() => triggerSimulatedIncomingAlert('BRAKE_LIGHT')}
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 border border-slate-800 hover:border-sky-400/50 transition"
              >
                🔊 “브레이크등 고장” 수신
              </button>
              <button
                type="button"
                id="sim-incoming-overload-btn"
                onClick={() =>
                  triggerSimulatedIncomingAlert('OVERLOAD_BROADCAST')
                }
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-amber-300 border border-slate-800 hover:border-amber-400/50 transition"
              >
                🔊 “반경 5km 화물위험” 수신
              </button>
              <button
                type="button"
                id="sim-incoming-yield-btn"
                onClick={() => triggerSimulatedIncomingAlert('YIELD_THANKS')}
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-emerald-300 border border-slate-800 hover:border-emerald-400/50 transition"
              >
                🔊 “양보 감사 (+30pt)” 수신
              </button>
              <button
                type="button"
                id="sim-incoming-tuning-btn"
                onClick={() => triggerSimulatedIncomingAlert('TUNING_QUESTION')}
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 border border-slate-800 hover:border-sky-400/50 transition"
              >
                🔊 “브론즈 휠 문의” 수신
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
