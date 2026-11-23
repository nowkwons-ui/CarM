import { DrivingMessageType, ScannedBufferVehicle } from '@/types/platetalk';
import { normalizePlate } from './supabase';

export interface VoiceCommandAnalysis {
  wakeWordDetected: boolean;
  matchedVehicle: ScannedBufferVehicle | null;
  /** 타겟을 특정하지 못했거나 여러 대가 후보일 때 명시적 재확인 플래그 */
  requiresTargetConfirmation: boolean;
  confirmationReason?: string;
  candidateVehicles: ScannedBufferVehicle[];
  messageType: DrivingMessageType;
  rawTranscript: string;
  sanitizedContent: string;
  hadProfanityOrAggression: boolean;
  blockedEntirely: boolean;
  blockReason?: string;
  broadcastRadiusKm: number;
  coachingNote: string;
}

const PROFANITY_OR_AGGRESSION_KEYWORDS = [
  '씨발',
  '시발',
  '미친',
  '병신',
  '개새',
  '죽을래',
  '눈깔',
  '운전 똑바로',
  '박아버린다',
  '보복',
  '꺼져',
  '짜증나게',
  '위험하게 진짜',
  '아 진짜',
  '왜 저래',
];

const PURE_ABUSE_ONLY_KEYWORDS = [
  '죽어라',
  '박아버린다',
  '보복운전',
  '내려봐',
  '세워라',
  '쳐박아',
];

/**
 * [3.2] 웨이크워드("헤이 플레이트") + 타겟 차량 자동 매칭 + AI 욕설/난폭 발화 정중 템플릿 변환기
 * - [UX/안전 원칙]: 타겟이 모호하면 임의로 발송하지 않고 requiresTargetConfirmation = true 로 재확인 요구
 */
export function analyzeDriverVoiceCommand(
  rawSpeech: string,
  bufferVehicles: ScannedBufferVehicle[]
): VoiceCommandAnalysis {
  const normalized = rawSpeech.trim();
  const wakeWordDetected = /(헤이|hey)\s*플레이트/i.test(normalized);

  // 1. 타겟 차량 매칭 (번호판 끝자리, 색상, 차종, 차선 키워드 기반)
  const candidates: ScannedBufferVehicle[] = [];

  for (const v of bufferVehicles) {
    const normPlate = normalizePlate(v.license_plate);
    const last4 = normPlate.slice(-4);
    const matchesPlate = normalized.includes(last4) || normalized.includes(normPlate);
    const matchesModel =
      (normalized.includes('쏘나타') && v.model.includes('쏘나타')) ||
      (normalized.includes('포터') && v.model.includes('포터')) ||
      (normalized.includes('쏘렌토') && v.model.includes('쏘렌토')) ||
      (normalized.includes('트럭') && v.vehicleType === 'CARGO_TRUCK') ||
      (normalized.includes('화물') && v.vehicleType === 'CARGO_TRUCK') ||
      (normalized.includes('SUV') && v.vehicleType === 'SUV');
    const matchesColor =
      (normalized.includes('흰색') && v.color.includes('화이트')) ||
      (normalized.includes('파란') && v.color.includes('블루')) ||
      (normalized.includes('회색') && (v.color.includes('그레이') || v.color.includes('다크')));

    if (matchesPlate || (matchesModel && matchesColor)) {
      candidates.push(v);
    } else if (matchesModel) {
      candidates.push(v);
    }
  }

  let matchedVehicle: ScannedBufferVehicle | null = null;
  let requiresTargetConfirmation = false;
  let confirmationReason: string | undefined;

  if (candidates.length === 1) {
    matchedVehicle = candidates[0];
  } else if (candidates.length > 1) {
    matchedVehicle = candidates[0];
    requiresTargetConfirmation = true;
    confirmationReason = `후보 차량이 ${candidates.length}대 감지되었습니다. 발송 전 타겟 차량을 확인해 주세요.`;
  } else {
    // 번호판이나 차종이 전혀 언급되지 않은 경우
    matchedVehicle = null;
    requiresTargetConfirmation = true;
    confirmationReason =
      '수신 차량(번호판 끝자리 또는 차종)이 명확하지 않습니다. 타겟을 선택하거나 번호판을 말해 주세요.';
  }

  // 2. 공격성/욕설 포함 여부 검사
  const hadProfanityOrAggression = PROFANITY_OR_AGGRESSION_KEYWORDS.some((kw) =>
    normalized.includes(kw)
  );
  const isPureAbuse = PURE_ABUSE_ONLY_KEYWORDS.some((kw) =>
    normalized.includes(kw)
  );

  const hasSafetyOrSocialIntent =
    normalized.includes('브레이크') ||
    normalized.includes('미등') ||
    normalized.includes('제동') ||
    normalized.includes('타이어') ||
    normalized.includes('공기압') ||
    normalized.includes('주유구') ||
    normalized.includes('트렁크') ||
    normalized.includes('적재') ||
    normalized.includes('과적') ||
    normalized.includes('낙하') ||
    normalized.includes('박스') ||
    normalized.includes('휠') ||
    normalized.includes('루프') ||
    normalized.includes('예쁘') ||
    normalized.includes('멋지') ||
    normalized.includes('양보') ||
    normalized.includes('고마') ||
    normalized.includes('감사');

  if (isPureAbuse && !hasSafetyOrSocialIntent) {
    return {
      wakeWordDetected,
      matchedVehicle: null,
      requiresTargetConfirmation: false,
      candidateVehicles: [],
      messageType: 'DEFECT_ALERT',
      rawTranscript: normalized,
      sanitizedContent: '',
      hadProfanityOrAggression: true,
      blockedEntirely: true,
      blockReason:
        'PlateTalk AI 안전 가드: 보복 운전 및 위협성 발화는 도로교통 안전을 위해 발송이 원천 차단됩니다.',
      broadcastRadiusKm: 0,
      coachingNote: '보복/위협 발화 자동 차단됨',
    };
  }

  // 3. 의도 분류 및 정중한 안전 템플릿으로 자동 정제
  let messageType: DrivingMessageType = 'DEFECT_ALERT';
  let sanitizedContent = '';
  let broadcastRadiusKm = 0;

  if (
    normalized.includes('적재') ||
    normalized.includes('과적') ||
    normalized.includes('낙하') ||
    normalized.includes('화물') ||
    normalized.includes('트럭')
  ) {
    messageType = 'OVERLOAD_WARN';
    broadcastRadiusKm = 5.0;
    sanitizedContent =
      '[긴급 안전 고지] 차주님, 현재 후방 적재물 결박이 느슨하여 낙하 위험이 보입니다. 안전지대에서 점검 부탁드립니다. (반경 5km 방어운전 동시 브로드캐스트)';
  } else if (
    normalized.includes('브레이크') ||
    normalized.includes('미등') ||
    normalized.includes('제동')
  ) {
    messageType = 'DEFECT_ALERT';
    sanitizedContent =
      '[차량 이상 알림] 안녕하세요 차주님! 주행 중 확인해보니 제동등(브레이크등)이 점등되지 않고 있습니다. 안전을 위해 점검을 권장드립니다.';
  } else if (normalized.includes('타이어') || normalized.includes('공기압')) {
    messageType = 'DEFECT_ALERT';
    sanitizedContent =
      '[차량 이상 알림] 차주님, 타이어 공기압이 낮아 보입니다. 주행 안전을 위해 가까운 서비스센터나 휴게소 점검을 권장드립니다.';
  } else if (normalized.includes('주유구') || normalized.includes('트렁크')) {
    messageType = 'DEFECT_ALERT';
    sanitizedContent =
      '[차량 이상 알림] 차주님! 주유구 커버 또는 트렁크가 완전히 닫히지 않은 상태입니다. 안전을 위해 정차 시 확인 부탁드립니다.';
  } else if (
    normalized.includes('휠') ||
    normalized.includes('루프') ||
    normalized.includes('배기') ||
    normalized.includes('튜닝') ||
    normalized.includes('모델명')
  ) {
    messageType = 'TUNING_ASK';
    sanitizedContent =
      '[튜닝/장착 문의] 차주님 차량 드레스업이 정말 멋집니다! 장착하신 파츠 모델명과 스펙이 궁금하여 정중히 여쭤봅니다. 안전 운전하세요!';
  } else if (
    normalized.includes('예쁘') ||
    normalized.includes('멋지') ||
    normalized.includes('색상') ||
    normalized.includes('칭찬')
  ) {
    messageType = 'COMPLIMENT';
    sanitizedContent =
      '[드라이버 칭찬] 차주님 차량 외관과 관리 상태가 정말 훌륭하네요! 도로 위에서 좋은 에너지를 받았습니다. 오늘도 안전 운전하세요!';
  } else if (
    normalized.includes('양보') ||
    normalized.includes('고마') ||
    normalized.includes('감사') ||
    normalized.includes('끼어들기')
  ) {
    messageType = 'YIELD_THANKS';
    sanitizedContent =
      '[양보운전 감사] 방금 차선 변경 시 여유 있게 배려해 주셔서 진심으로 감사합니다! 덕분에 안전하게 합류했습니다. 좋은 하루 보내세요!';
  } else {
    messageType = 'DEFECT_ALERT';
    sanitizedContent =
      '[안전 소통 알림] 주변 주행 차량에서 보낸 안전 확인 메시지입니다. 등화장치와 외관을 가볍게 점검해 주세요. 항상 안전 운전하세요!';
  }

  const coachingNote = hadProfanityOrAggression
    ? 'AI 문맥 정제: 발화 중 공격적 표현을 제거하고 정중한 안전 템플릿으로 변환했습니다.'
    : 'AI 핸즈프리 매칭 완료: 정중한 안전 소통 템플릿으로 변환되었습니다.';

  return {
    wakeWordDetected,
    matchedVehicle,
    requiresTargetConfirmation,
    confirmationReason,
    candidateVehicles: candidates,
    messageType,
    rawTranscript: normalized,
    sanitizedContent,
    hadProfanityOrAggression,
    blockedEntirely: false,
    broadcastRadiusKm,
    coachingNote,
  };
}

/**
 * [3.2.3] Web Speech API TTS 브리핑 실행 유틸리티
 */
export function speakDrivingBriefing(
  text: string,
  onStart?: () => void,
  onEnd?: () => void
) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onStart?.();
    setTimeout(() => onEnd?.(), 3000);
    return;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.02;
    utterance.pitch = 1.0;

    utterance.onstart = () => onStart?.();
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();

    window.speechSynthesis.speak(utterance);
  } catch {
    onStart?.();
    setTimeout(() => onEnd?.(), 3000);
  }
}
