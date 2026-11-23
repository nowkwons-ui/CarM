'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  Volume2,
  Gift,
  AlertTriangle,
  Power,
  ThumbsUp,
  Settings,
  Sparkles,
  ShieldAlert,
  HeartHandshake,
  Car,
  X,
  Send,
  Camera,
  Wifi,
  Radio,
  Sun,
  Moon,
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
    badge: '차량이상',
  },
  {
    id: 'preset-rage-sanitize',
    label: '거친 발화 → AI 정중 순화 테스트',
    speech: '헤이 플레이트, 아 진짜 앞에 4568 브레이크등 고장났잖아 위험하게 왜 저래!',
    badge: 'AI 필터링',
  },
  {
    id: 'preset-overload',
    label: '화물차 낙하물 경고 + 5km 브로드캐스트',
    speech: '헤이 플레이트, 우측 9104 화물트럭 적재물 낙하 위험 경고해줘',
    badge: '화물낙하',
  },
  {
    id: 'preset-tuning',
    label: '루프박스·휠 모델명 문의',
    speech: '헤이 플레이트, 좌측 쏘렌토 8821 차량에 장착한 루프박스 모델명이 궁금합니다',
    badge: '튜닝문의',
  },
  {
    id: 'preset-yield',
    label: '끼어들기 양보운전 감사 인사',
    speech: '헤이 플레이트, 끝자리 4568 차량에게 방금 차선 양보해줘서 고맙다고 전해줘',
    badge: '양보감사',
  },
];

export default function DrivingHudTab() {
  const {
    theme,
    toggleTheme,
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
    addHonorPoints,
    updateVerificationStatus,
    showToast,
  } = usePlateTalk();

  const isLight = theme === 'light';

  // 카메라 스트림 상태
  const [cameraSource, setCameraSource] = useState<
    'BLACKBOX_RTSP' | 'ACTION_CAM' | 'WEBRTC_CAM'
  >('BLACKBOX_RTSP');
  const [webcamActive, setWebcamActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 시뮬레이터 및 데모 드로어(Drawer) 상태
  const [isDemoDrawerOpen, setIsDemoDrawerOpen] = useState(false);

  // 음성인식(STT) 및 AI 상태
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
                '카메라 권한을 확인해 주세요. 시뮬레이션 화면으로 표시됩니다.',
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
      setIsListeningStt(true);
      setTimeout(() => {
        setIsListeningStt(false);
        const nextPreset =
          VOICE_PRESET_COMMANDS[
            Math.floor(Math.random() * VOICE_PRESET_COMMANDS.length)
          ];
        handleVoiceTextChange(nextPreset.speech);
        showToast(`음성 인식됨: "${nextPreset.speech}"`, 'sky');
      }, 1500);
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
          showToast(`인식: "${transcript}"`, 'sky');
        }
        setIsListeningStt(false);
      };
      recognition.onerror = () => {
        setIsListeningStt(false);
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
        aiAnalysis.blockReason || '보복성 표현은 전송이 차단됩니다.',
        'rose'
      );
      return;
    }

    if (aiAnalysis.requiresTargetConfirmation && !aiAnalysis.matchedVehicle) {
      showToast(
        aiAnalysis.confirmationReason ||
          '수신 차량을 화면에서 터치하여 선택해 주세요.',
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
        `${targetPlate} 차량에 정제된 안전 메시지를 전송했습니다.`
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
      rawVoiceTranscript: `[원터치] ${templateText}`,
      aiSanitized: true,
      broadcastRadiusKm: broadcastKm,
    });

    if (res.ok) {
      speakDrivingBriefing(
        broadcastKm > 0
          ? `${selectedTargetPlate} 화물 경고 및 반경 5km 공유 완료`
          : `${selectedTargetPlate} 차량에 전송 완료`
      );
    }
  };

  return (
    <div
      className={`relative flex flex-col h-full w-full overflow-hidden select-none transition-colors duration-200 ${
        isLight ? 'bg-[#fbf8ee] text-stone-900' : 'bg-zinc-950 text-white'
      }`}
    >
      {/* ─────────────────────────────────────────────────────────────
          ① 상단 헤더 (초슬림, 높이 56px 이하)
          - 좌측: 내 차 번호판 배지 (12라 3466)
          - 우측: [🔴 주행 종료] + [☀️/🌙 테마 전환] + [⚙️ 데모]
         ───────────────────────────────────────────────────────────── */}
      <header
        className={`h-14 shrink-0 px-4 flex items-center justify-between border-b backdrop-blur-md z-20 transition-colors ${
          isLight
            ? 'bg-[#fdfaf1]/95 border-amber-900/10 text-stone-900'
            : 'bg-zinc-950/90 border-white/10 text-white'
        }`}
      >
        {/* 좌측 내 차 번호판 */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-colors ${
            isLight
              ? 'bg-white border-amber-300/60 shadow-sm text-stone-900'
              : 'bg-zinc-900 border-white/10 text-white'
          }`}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span
            className={`font-mono text-base font-black tracking-wider ${
              isLight ? 'text-stone-900' : 'text-white'
            }`}
          >
            {activeVehicle.license_plate}
          </span>
        </div>

        {/* 우측 주행 제어, 테마 스위처 및 데모 드로어 버튼 */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* 주행 모드 토글 */}
          <button
            type="button"
            id="toggle-driving-mode-btn"
            onClick={toggleDrivingMode}
            className={`min-h-[40px] px-3.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition ${
              isDrivingMode
                ? isLight
                  ? 'bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100'
                  : 'bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25'
                : isLight
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
            }`}
          >
            <Power className="h-3.5 w-3.5" />
            <span>{isDrivingMode ? '🔴 주행 종료' : '🟢 주행 시작'}</span>
          </button>

          {/* 테마 스위처 버튼 (다크모드 ↔ 연한 노란색 밝은모드) */}
          <button
            type="button"
            id="toggle-theme-hud-btn"
            onClick={toggleTheme}
            className={`min-h-[40px] px-2.5 sm:px-3 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition ${
              isLight
                ? 'bg-amber-100/70 border-amber-300 text-amber-900 hover:bg-amber-200/70 shadow-sm'
                : 'bg-zinc-900 border-white/10 text-amber-300 hover:bg-zinc-800'
            }`}
            aria-label="테마 전환"
            title={isLight ? '다크 모드로 전환' : '연한 노란색 밝은 모드로 전환'}
          >
            {isLight ? (
              <>
                <Sun className="h-4 w-4 text-amber-600 fill-amber-500" />
                <span className="hidden sm:inline">밝은모드</span>
              </>
            ) : (
              <>
                <Moon className="h-4 w-4 text-amber-300 fill-amber-300" />
                <span className="hidden sm:inline">다크모드</span>
              </>
            )}
          </button>

          {/* 데모/시뮬레이션 열기 버튼 */}
          <button
            type="button"
            id="open-demo-drawer-btn"
            onClick={() => setIsDemoDrawerOpen(true)}
            className={`min-h-[40px] px-3 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition ${
              isLight
                ? 'bg-white border-amber-900/10 text-stone-700 hover:text-stone-950 shadow-sm'
                : 'bg-zinc-900 border-white/10 text-zinc-300 hover:text-white'
            }`}
            aria-label="데모 및 시뮬레이션 설정 열기"
          >
            <Settings className={`h-4 w-4 ${isLight ? 'text-stone-500' : 'text-zinc-400'}`} />
            <span className="hidden sm:inline">데모</span>
          </button>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          ② 중앙 메인 뷰 (전방 카메라 + 대형 번호판 태그 + 하단 대형 칩 3개 + 알림 팝업)
          화면의 약 55~60% 차지
         ───────────────────────────────────────────────────────────── */}
      <section className="relative flex-1 min-h-0 w-full overflow-hidden bg-black flex flex-col justify-between">
        {/* 카메라 피드 또는 로드뷰 배경 */}
        <div className="absolute inset-0 z-0">
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
              alt="전방 로드 뷰"
              className="h-full w-full object-cover brightness-90 contrast-105"
            />
          )}
          {/* 절제된 비네팅 오버레이 */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80 pointer-events-none" />
        </div>

        {/* 카메라 화면 위 번호판 객체 터치 태그 (대형 타이포그래피 text-2xl font-black) */}
        <div className="absolute inset-0 pointer-events-none z-10">
          {scannedVehicles.map((veh) => {
            const isSelected = veh.license_plate === selectedTargetPlate;
            const isCargo = veh.vehicleType === 'CARGO_TRUCK';

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
                className={`pointer-events-auto absolute rounded-2xl transition-all duration-200 focus:outline-none flex items-start justify-center ${
                  isSelected
                    ? isCargo
                      ? 'border-2 border-amber-400 bg-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.5)]'
                      : 'border-2 border-blue-500 bg-blue-500/20 shadow-[0_0_30px_rgba(59,130,246,0.6)]'
                    : 'border border-white/20 bg-black/20 hover:border-white/50'
                }`}
              >
                {/* Tesla/CarPlay 스타일 대형 번호판 플로팅 태그 */}
                <div
                  className={`-translate-y-full mb-1.5 px-3 py-1 rounded-xl shadow-2xl backdrop-blur-md font-mono text-xl sm:text-2xl font-black tracking-wider transition ${
                    isSelected
                      ? isCargo
                        ? 'bg-amber-500 text-black shadow-amber-500/50'
                        : 'bg-blue-600 text-white shadow-blue-500/50'
                      : 'bg-black/80 text-white border border-white/20'
                  }`}
                >
                  {veh.license_plate}
                </div>
              </button>
            );
          })}
        </div>

        {/* 최상단 가벼운 타겟 안내 (군더더기 텍스트 제거) */}
        <div className="relative z-10 p-3 flex items-center justify-between pointer-events-none">
          <div className="pointer-events-auto px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs font-bold text-zinc-300">
            타겟: <span className="font-mono text-blue-400 font-extrabold">{selectedTargetPlate}</span>
          </div>
          {isTtsSpeaking && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600/90 text-white text-xs font-bold animate-pulse">
              <Volume2 className="h-3.5 w-3.5" />
              <span>TTS 브리핑 중</span>
            </div>
          )}
        </div>

        {/* 수신 알림 팝업 오버레이 (Toast Overlay) */}
        <AnimatePresence>
          {activeHudIncomingMessage && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              className={`relative z-30 mx-3 mb-2 rounded-2xl p-4 shadow-2xl backdrop-blur-xl border transition-colors ${
                isLight
                  ? 'bg-white/95 border-amber-900/15 text-stone-900 shadow-stone-400/20'
                  : 'bg-black/85 border-white/15 text-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xl sm:text-2xl font-black tracking-wider text-blue-600">
                    {activeHudIncomingMessage.sender_plate_snapshot}
                  </span>
                  <span className={`text-xs font-medium ${isLight ? 'text-stone-600' : 'text-zinc-400'}`}>
                    {activeHudIncomingMessage.sender_vehicle_summary}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={dismissHudOverlayCard}
                  className={`p-1 rounded-lg ${isLight ? 'text-stone-400 hover:text-stone-800' : 'text-zinc-400 hover:text-white'}`}
                  aria-label="알림 닫기"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* 핵심 한 줄 메시지 (text-xl font-bold, 최대 2줄) */}
              <p
                className={`mt-2 text-lg sm:text-xl font-bold leading-snug line-clamp-2 ${
                  isLight ? 'text-stone-950' : 'text-white'
                }`}
              >
                “{activeHudIncomingMessage.content}”
              </p>

              {/* 하단 2개 대형 버튼 (min-h-[56px]) */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  id="hud-helpful-ack-btn"
                  disabled={activeHudIncomingMessage.helpful_acknowledged}
                  onClick={() =>
                    acknowledgeHelpfulMessage(activeHudIncomingMessage.id)
                  }
                  className={`min-h-[56px] rounded-xl px-4 flex items-center justify-center gap-2 font-bold text-base transition ${
                    activeHudIncomingMessage.helpful_acknowledged
                      ? isLight
                        ? 'bg-stone-100 text-emerald-700 cursor-default'
                        : 'bg-zinc-800 text-emerald-400 cursor-default'
                      : 'bg-emerald-500 text-black hover:bg-emerald-400 active:scale-95'
                  }`}
                >
                  <ThumbsUp className="h-5 w-5" />
                  <span>
                    {activeHudIncomingMessage.helpful_acknowledged
                      ? '감사 완료'
                      : '👍 감사 (+50P)'}
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
                  className="min-h-[56px] rounded-xl px-4 bg-amber-400 text-black hover:bg-amber-300 font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition"
                >
                  <Gift className="h-5 w-5" />
                  <span>☕ 커피 선물</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 카메라 하단 가로형 대형 칩(Chip) 3개 (주변 차량 원터치 선택) */}
        <div className="relative z-10 px-3 pb-2 pt-1">
          <div className="grid grid-cols-3 gap-2">
            {scannedVehicles.map((v) => {
              const isSelected = v.license_plate === selectedTargetPlate;
              const isCargo = v.vehicleType === 'CARGO_TRUCK';

              return (
                <button
                  key={v.id}
                  type="button"
                  id={`buffer-select-${v.id}`}
                  onClick={() => setSelectedTargetPlate(v.license_plate)}
                  className={`min-h-[52px] rounded-2xl px-2.5 py-1.5 flex flex-col justify-center text-left transition-all active:scale-95 ${
                    isSelected
                      ? isCargo
                        ? 'bg-amber-500 text-black border-2 border-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.5)]'
                        : 'bg-blue-600 text-white border-2 border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.6)]'
                      : isLight
                      ? 'bg-[#fdfaf1]/95 backdrop-blur-md border border-amber-900/15 text-stone-800 shadow-sm hover:border-amber-400'
                      : 'bg-zinc-950/85 backdrop-blur-md border border-white/10 text-zinc-300 hover:border-white/30'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-mono text-sm sm:text-base font-black tracking-wide truncate">
                      {v.license_plate}
                    </span>
                    {isCargo ? (
                      <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-black' : 'text-amber-500'}`} />
                    ) : (
                      <Car className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-white' : isLight ? 'text-stone-500' : 'text-zinc-400'}`} />
                    )}
                  </div>
                  <span
                    className={`text-[11px] font-semibold truncate ${
                      isSelected
                        ? isCargo
                          ? 'text-black/80'
                          : 'text-white/80'
                        : isLight
                        ? 'text-stone-600'
                        : 'text-zinc-400'
                    }`}
                  >
                    {v.color} {v.model}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          ③ 하단 컨트롤 독 (화면의 약 30% 차지, 직관적 원터치)
          대형 마이크 1개 + 4개 원터치 퀵 버튼 (2x2 그리드)
         ───────────────────────────────────────────────────────────── */}
      <footer
        className={`shrink-0 p-3 border-t z-20 transition-colors ${
          isLight
            ? 'bg-[#f5efe0] border-amber-900/10'
            : 'bg-zinc-950 border-white/10'
        }`}
      >
        <div className="flex items-stretch gap-3">
          {/* 중앙/좌측 대형 마이크 버튼 (헤이 플레이트) */}
          <button
            type="button"
            id="start-stt-voice-btn"
            onClick={handleStartWebSpeechStt}
            className={`w-28 sm:w-32 shrink-0 rounded-2xl flex flex-col items-center justify-center p-2.5 transition active:scale-95 ${
              isListeningStt
                ? 'bg-blue-600 text-white shadow-[0_0_35px_rgba(59,130,246,0.85)] border-2 border-white animate-pulse'
                : isLight
                ? 'bg-white border-2 border-blue-500/40 text-blue-600 shadow-md hover:border-blue-500'
                : 'bg-zinc-900 border border-blue-500/40 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:border-blue-400'
            }`}
          >
            {isListeningStt ? (
              <>
                <MicOff className="h-8 w-8 text-white mb-1" />
                <span className="text-xs font-black tracking-tight">듣는 중...</span>
                <div className="mt-1 flex items-center gap-1">
                  <span className="h-2 w-1 bg-white rounded-full animate-bounce" />
                  <span className="h-3 w-1 bg-white rounded-full animate-bounce [animation-delay:0.15s]" />
                  <span className="h-2 w-1 bg-white rounded-full animate-bounce [animation-delay:0.3s]" />
                </div>
              </>
            ) : (
              <>
                <Mic className="h-8 w-8 text-blue-600 mb-1" />
                <span
                  className={`text-xs font-black tracking-tight ${
                    isLight ? 'text-stone-900' : 'text-white'
                  }`}
                >
                  헤이 플레이트
                </span>
                <span className="text-[10px] font-bold text-blue-600 mt-0.5">음성 명령</span>
              </>
            )}
          </button>

          {/* 4개 원터치 퀵 버튼 (2x2 그리드, 설명 없이 큼직한 아이콘 + 단어) */}
          <div className="flex-1 grid grid-cols-2 gap-2">
            {/* 1. 차량 이상 */}
            <button
              type="button"
              id="quick-send-defect-btn"
              onClick={() =>
                handleQuickCategorySend(
                  'DEFECT_ALERT',
                  '[차량 이상 알림] 브레이크등 또는 주유구 커버 상태를 확인해 주세요!'
                )
              }
              className={`min-h-[56px] rounded-2xl p-2.5 flex items-center gap-2.5 text-left active:scale-95 transition ${
                isLight
                  ? 'bg-white border border-amber-900/10 hover:border-blue-500/50 text-stone-900 shadow-sm'
                  : 'bg-zinc-900 border border-white/10 hover:border-blue-500/50 text-white'
              }`}
            >
              <div className="h-9 w-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0">
                <ShieldAlert className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-sm sm:text-base font-black leading-tight">
                차량 이상
              </span>
            </button>

            {/* 2. 화물 위험 */}
            <button
              type="button"
              id="quick-send-overload-btn"
              onClick={() =>
                handleQuickCategorySend(
                  'OVERLOAD_WARN',
                  '[화물 낙하 위험] 적재물 낙하 위험이 있습니다. 즉시 점검 부탁드립니다!',
                  5.0
                )
              }
              className={`min-h-[56px] rounded-2xl p-2.5 flex items-center gap-2.5 text-left active:scale-95 transition ${
                isLight
                  ? 'bg-amber-50/90 border border-amber-300/80 hover:border-amber-500 text-amber-950 shadow-sm'
                  : 'bg-zinc-900 border border-amber-500/30 hover:border-amber-400 text-amber-300'
              }`}
            >
              <div className="h-9 w-9 rounded-xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <span className="text-sm sm:text-base font-black leading-tight">
                화물 위험
              </span>
            </button>

            {/* 3. 양보 감사 */}
            <button
              type="button"
              id="quick-send-yield-btn"
              onClick={() =>
                handleQuickCategorySend(
                  'YIELD_THANKS',
                  '[양보운전 감사] 차선 양보와 배려에 감사드립니다!'
                )
              }
              className={`min-h-[56px] rounded-2xl p-2.5 flex items-center gap-2.5 text-left active:scale-95 transition ${
                isLight
                  ? 'bg-white border border-amber-900/10 hover:border-blue-500/50 text-stone-900 shadow-sm'
                  : 'bg-zinc-900 border border-white/10 hover:border-blue-500/50 text-white'
              }`}
            >
              <div className="h-9 w-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0">
                <HeartHandshake className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-sm sm:text-base font-black leading-tight">
                양보 감사
              </span>
            </button>

            {/* 4. 칭찬·문의 */}
            <button
              type="button"
              id="quick-send-tuning-btn"
              onClick={() =>
                handleQuickCategorySend(
                  'TUNING_ASK',
                  '[차량 칭찬 & 문의] 차량이 멋집니다! 장착 부품 모델명이 궁금합니다.'
                )
              }
              className={`min-h-[56px] rounded-2xl p-2.5 flex items-center gap-2.5 text-left active:scale-95 transition ${
                isLight
                  ? 'bg-white border border-amber-900/10 hover:border-blue-500/50 text-stone-900 shadow-sm'
                  : 'bg-zinc-900 border border-white/10 hover:border-blue-500/50 text-white'
              }`}
            >
              <div className="h-9 w-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-sm sm:text-base font-black leading-tight">
                칭찬·문의
              </span>
            </button>
          </div>
        </div>
      </footer>

      {/* ─────────────────────────────────────────────────────────────
          ⚙️ 데모 및 개발자 시뮬레이션 슬라이드 드로어 (Drawer Modal)
          모든 기존 시뮬레이터/테스트 기능을 온전히 유지하여 이관
         ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isDemoDrawerOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 240 }}
              className={`w-full max-w-md h-full p-5 flex flex-col justify-between overflow-y-auto border-l transition-colors ${
                isLight
                  ? 'bg-[#fdfaf1] border-amber-900/15 text-stone-900'
                  : 'bg-zinc-950 border-white/10 text-white'
              }`}
            >
              <div className="space-y-5">
                {/* 드로어 헤더 */}
                <div
                  className={`flex items-center justify-between pb-3 border-b ${
                    isLight ? 'border-amber-900/10' : 'border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-blue-600" />
                    <h3 className="font-bold text-base">데모 & 시뮬레이터 도구</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDemoDrawerOpen(false)}
                    className={`p-1 rounded-lg ${isLight ? 'text-stone-400 hover:text-stone-900' : 'text-zinc-400 hover:text-white'}`}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* 테마 스위처 설정 타일 */}
                <div
                  className={`p-3 rounded-2xl border flex items-center justify-between ${
                    isLight
                      ? 'bg-amber-100/50 border-amber-300 text-stone-900'
                      : 'bg-zinc-900 border-white/10 text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {isLight ? (
                      <Sun className="h-5 w-5 text-amber-600 fill-amber-500" />
                    ) : (
                      <Moon className="h-5 w-5 text-amber-300 fill-amber-300" />
                    )}
                    <div>
                      <span className="text-xs font-bold block">
                        현재 테마: {isLight ? '연한 노란색 밝은 모드' : '다크 모드'}
                      </span>
                      <span className="text-[10px] text-stone-500 dark:text-zinc-400">
                        {isLight
                          ? '부드럽고 편안한 웜 옐로우 인테리어'
                          : '고대비 주행 야간 HUD 테마'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition"
                  >
                    {isLight ? '다크로 변경' : '밝은모드로 변경'}
                  </button>
                </div>

                {/* 카메라 하드웨어 소스 선택 */}
                <div className="space-y-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-stone-500' : 'text-zinc-400'}`}>
                    카메라 입력 소스
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      id="cam-source-blackbox"
                      onClick={() => setCameraSource('BLACKBOX_RTSP')}
                      className={`p-2 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 border transition ${
                        cameraSource === 'BLACKBOX_RTSP'
                          ? 'bg-blue-600/20 border-blue-500 text-blue-600 font-bold'
                          : isLight
                          ? 'bg-white border-amber-900/10 text-stone-600'
                          : 'bg-zinc-900 border-white/10 text-zinc-400'
                      }`}
                    >
                      <Wifi className="h-4 w-4" />
                      <span>블랙박스</span>
                    </button>
                    <button
                      type="button"
                      id="cam-source-actioncam"
                      onClick={() => setCameraSource('ACTION_CAM')}
                      className={`p-2 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 border transition ${
                        cameraSource === 'ACTION_CAM'
                          ? 'bg-blue-600/20 border-blue-500 text-blue-600 font-bold'
                          : isLight
                          ? 'bg-white border-amber-900/10 text-stone-600'
                          : 'bg-zinc-900 border-white/10 text-zinc-400'
                      }`}
                    >
                      <Radio className="h-4 w-4" />
                      <span>액션캠</span>
                    </button>
                    <button
                      type="button"
                      id="cam-source-webrtc"
                      onClick={() => setCameraSource('WEBRTC_CAM')}
                      className={`p-2 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 border transition ${
                        cameraSource === 'WEBRTC_CAM'
                          ? 'bg-blue-600/20 border-blue-500 text-blue-600 font-bold'
                          : isLight
                          ? 'bg-white border-amber-900/10 text-stone-600'
                          : 'bg-zinc-900 border-white/10 text-zinc-400'
                      }`}
                    >
                      <Camera className="h-4 w-4" />
                      <span>내장카메라</span>
                    </button>
                  </div>
                </div>

                {/* 수신 시뮬레이션 버튼들 */}
                <div className="space-y-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-stone-500' : 'text-zinc-400'}`}>
                    실시간 메시지 수신 테스트 (TTS 낭독)
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      id="sim-incoming-brake-btn"
                      onClick={() => {
                        triggerSimulatedIncomingAlert('BRAKE_LIGHT');
                        setIsDemoDrawerOpen(false);
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-left transition ${
                        isLight
                          ? 'bg-white border-amber-900/10 text-stone-900 hover:border-blue-500 shadow-sm'
                          : 'bg-zinc-900 border-white/10 text-zinc-200 hover:border-blue-400'
                      }`}
                    >
                      🔊 브레이크등 고장 수신
                    </button>
                    <button
                      type="button"
                      id="sim-incoming-overload-btn"
                      onClick={() => {
                        triggerSimulatedIncomingAlert('OVERLOAD_BROADCAST');
                        setIsDemoDrawerOpen(false);
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-left transition ${
                        isLight
                          ? 'bg-amber-50/90 border-amber-300 text-amber-950 hover:border-amber-500 shadow-sm'
                          : 'bg-zinc-900 border-amber-500/30 text-amber-300 hover:border-amber-400'
                      }`}
                    >
                      🔊 5km 화물위험 수신
                    </button>
                    <button
                      type="button"
                      id="sim-incoming-yield-btn"
                      onClick={() => {
                        triggerSimulatedIncomingAlert('YIELD_THANKS');
                        setIsDemoDrawerOpen(false);
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-left transition ${
                        isLight
                          ? 'bg-white border-amber-900/10 text-emerald-700 hover:border-emerald-500 shadow-sm'
                          : 'bg-zinc-900 border-white/10 text-emerald-300 hover:border-blue-400'
                      }`}
                    >
                      🔊 양보 감사 수신
                    </button>
                    <button
                      type="button"
                      id="sim-incoming-tuning-btn"
                      onClick={() => {
                        triggerSimulatedIncomingAlert('TUNING_QUESTION');
                        setIsDemoDrawerOpen(false);
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-left transition ${
                        isLight
                          ? 'bg-white border-amber-900/10 text-stone-900 hover:border-blue-500 shadow-sm'
                          : 'bg-zinc-900 border-white/10 text-zinc-200 hover:border-blue-400'
                      }`}
                    >
                      🔊 부품 문의 수신
                    </button>
                  </div>
                </div>

                {/* 명예 포인트 적립 시뮬레이션 */}
                <div className="space-y-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-stone-500' : 'text-zinc-400'}`}>
                    명예 포인트 적립 시뮬레이션
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      id="honor-sim-helpful-btn"
                      onClick={() => {
                        addHonorPoints(50, '위험 고지 수신자 [도움 됐어요] 감사 표시');
                        showToast('+50 PT가 적립되었습니다.', 'emerald');
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-left transition ${
                        isLight
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 shadow-sm'
                          : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                      }`}
                    >
                      +50 PT (도움 됐어요)
                    </button>
                    <button
                      type="button"
                      id="honor-sim-yield-btn"
                      onClick={() => {
                        addHonorPoints(30, '끼어들기 양보운전 감사 수신');
                        showToast('+30 PT가 적립되었습니다.', 'sky');
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-left transition ${
                        isLight
                          ? 'bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100 shadow-sm'
                          : 'bg-blue-500/15 border-blue-500/30 text-blue-300 hover:bg-blue-500/25'
                      }`}
                    >
                      +30 PT (양보 감사)
                    </button>
                  </div>
                </div>

                {/* 차량 소유주 인증 권한 시뮬레이션 */}
                <div className="space-y-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-stone-500' : 'text-zinc-400'}`}>
                    차량 인증 권한 시뮬레이션
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      id="quick-auth-state-VERIFIED"
                      onClick={() => {
                        updateVerificationStatus('VERIFIED', '정상 인증 완료 (소유주 검증 통과)');
                        showToast('차량 소유주 인증이 완료(VERIFIED)되었습니다.', 'emerald');
                      }}
                      className={`p-2 rounded-xl border text-xs font-bold text-center transition ${
                        isLight
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 shadow-sm'
                          : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                      }`}
                    >
                      ✓ 승인 완료
                    </button>
                    <button
                      type="button"
                      id="quick-auth-state-PENDING"
                      onClick={() => {
                        updateVerificationStatus('PENDING', '심사 대기 중 (서류 확인 단계)');
                        showToast('소유주 인증 심사 대기(PENDING) 상태로 전환되었습니다.', 'amber');
                      }}
                      className={`p-2 rounded-xl border text-xs font-bold text-center transition ${
                        isLight
                          ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 shadow-sm'
                          : 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                      }`}
                    >
                      ⏳ 심사 대기
                    </button>
                    <button
                      type="button"
                      id="quick-auth-state-REJECTED"
                      onClick={() => {
                        updateVerificationStatus('REJECTED', '등록증 명의 불일치로 반려됨');
                        showToast('소유주 인증이 반려(REJECTED)되었습니다.', 'rose');
                      }}
                      className={`p-2 rounded-xl border text-xs font-bold text-center transition ${
                        isLight
                          ? 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100 shadow-sm'
                          : 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                      }`}
                    >
                      ✕ 반려 상태
                    </button>
                  </div>
                </div>

                {/* OCR 교차 검증 시뮬레이션 프리셋 4종 */}
                <div className="space-y-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-stone-500' : 'text-zinc-400'}`}>
                    OCR 서류 교차 검증 프리셋
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      id="ocr-preset-match"
                      onClick={() => {
                        updateVerificationStatus(
                          'VERIFIED',
                          '12라 3466',
                          'KMHL341CBNP034661',
                          '김태훈',
                          'PRIMARY_OWNER'
                        );
                        showToast('소유주 100% 일치 인증 완료', 'emerald');
                      }}
                      className={`p-2 rounded-xl border text-xs font-bold text-left transition ${
                        isLight
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-sm'
                          : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      }`}
                    >
                      ① 본인소유 일치
                    </button>
                    <button
                      type="button"
                      id="ocr-preset-codriver-pending"
                      onClick={() => {
                        updateVerificationStatus(
                          'PENDING',
                          '12라 3466',
                          'KMHL341CBNP034661',
                          '박지영 (배우자)',
                          'CO_DRIVER'
                        );
                        showToast('가족 공동운전자 승인대기', 'amber');
                      }}
                      className={`p-2 rounded-xl border text-xs font-bold text-left transition ${
                        isLight
                          ? 'bg-amber-50 border-amber-300 text-amber-800 shadow-sm'
                          : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                      }`}
                    >
                      ② 가족차량 승인대기
                    </button>
                    <button
                      type="button"
                      id="ocr-preset-codriver-approved"
                      onClick={() => {
                        updateVerificationStatus(
                          'VERIFIED',
                          '12라 3466',
                          'KMHL341CBNP034661',
                          '박지영 (배우자)',
                          'CO_DRIVER'
                        );
                        showToast('가족차량 소유주 승인완료', 'sky');
                      }}
                      className={`p-2 rounded-xl border text-xs font-bold text-left transition ${
                        isLight
                          ? 'bg-blue-50 border-blue-300 text-blue-800 shadow-sm'
                          : 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                      }`}
                    >
                      ③ 공동운전자 승인완료
                    </button>
                    <button
                      type="button"
                      id="ocr-preset-fraud"
                      onClick={() => {
                        updateVerificationStatus(
                          'REJECTED',
                          '12라 3466',
                          'INVALID_VIN_123',
                          '홍길동',
                          'PRIMARY_OWNER',
                          '번호판 사진과 등록증 정보 불일치'
                        );
                        showToast('번호판 불일치 반려', 'rose');
                      }}
                      className={`p-2 rounded-xl border text-xs font-bold text-left transition ${
                        isLight
                          ? 'bg-rose-50 border-rose-300 text-rose-800 shadow-sm'
                          : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                      }`}
                    >
                      ④ 도용/불일치 반려
                    </button>
                  </div>
                </div>

                {/* 음성 발화 시뮬레이션 프리셋 */}
                <div className="space-y-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-stone-500' : 'text-zinc-400'}`}>
                    음성 발화 프리셋 (AI 필터링 테스트)
                  </span>
                  <div className="space-y-1.5">
                    {VOICE_PRESET_COMMANDS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        id={preset.id}
                        onClick={() => handleVoiceTextChange(preset.speech)}
                        className={`w-full p-2.5 rounded-xl border text-left text-xs font-medium transition ${
                          voiceInputText === preset.speech
                            ? 'bg-blue-600/20 border-blue-500 text-blue-600 font-bold'
                            : isLight
                            ? 'bg-white border-amber-900/10 text-stone-800 hover:border-amber-300 shadow-sm'
                            : 'bg-zinc-900 border-white/10 text-zinc-300 hover:border-white/20'
                        }`}
                      >
                        <span className="font-bold text-blue-600 mr-1.5">[{preset.badge}]</span>
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 운전자 음성 텍스트 직접 입력 및 AI 정제 테스트 */}
                <div className="space-y-2">
                  <label
                    htmlFor="driver-voice-transcript-input"
                    className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-stone-500' : 'text-zinc-400'}`}
                  >
                    음성 텍스트 직접 입력 (AI 순화 테스트)
                  </label>
                  <input
                    id="driver-voice-transcript-input"
                    type="text"
                    value={voiceInputText}
                    onChange={(e) => handleVoiceTextChange(e.target.value)}
                    placeholder="헤이 플레이트, 발화 내용..."
                    className={`w-full rounded-xl px-3 py-2 text-xs border focus:outline-none focus:border-blue-500 ${
                      isLight
                        ? 'bg-white border-amber-900/15 text-stone-900 placeholder-stone-400'
                        : 'bg-zinc-900 border-white/10 text-white placeholder-zinc-500'
                    }`}
                  />
                </div>

                {/* AI 정제 결과 박스 */}
                <div
                  className={`p-3.5 rounded-2xl border space-y-2 ${
                    isLight
                      ? 'bg-white border-amber-900/15 text-stone-900 shadow-sm'
                      : 'bg-zinc-900 border-white/10 text-white'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-blue-600 flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5" /> AI 정제 결과
                    </span>
                    <span className={`font-mono ${isLight ? 'text-stone-500' : 'text-zinc-400'}`}>
                      타겟: {aiAnalysis.matchedVehicle?.license_plate || selectedTargetPlate}
                    </span>
                  </div>

                  {aiAnalysis.hadProfanityOrAggression && (
                    <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-700 text-xs">
                      {aiAnalysis.coachingNote}
                    </div>
                  )}

                  <p className="text-xs font-medium leading-relaxed">
                    “{aiAnalysis.sanitizedContent}”
                  </p>

                  <button
                    type="button"
                    id="send-ai-sanitized-voice-btn"
                    onClick={() => {
                      handleSendAnalyzedVoiceCommand();
                      setIsDemoDrawerOpen(false);
                    }}
                    className="w-full mt-2 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>정제된 메시지 발송하기</span>
                  </button>
                </div>
              </div>

              {/* 드로어 하단 닫기 버튼 */}
              <button
                type="button"
                onClick={() => setIsDemoDrawerOpen(false)}
                className={`w-full py-2.5 rounded-xl font-bold text-xs border mt-4 transition ${
                  isLight
                    ? 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-300'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-white/10'
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
