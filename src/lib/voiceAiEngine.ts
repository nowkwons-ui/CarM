import { DrivingMessageType, ScannedBufferVehicle } from '@/types/platetalk';

export interface VoiceCommandAnalysis {
  wakeWordDetected: boolean;
  matchedVehicle: ScannedBufferVehicle | null;
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
];

/**
 * [3.2] 웨이크워드("헤이 플레이트") + 타겟 차량 자동 매칭 + AI 욕설/난폭 발화 정중 템플릿 변환기
 */
export function analyzeDriverVoiceCommand(
  rawSpeech: string,
  bufferVehicles: ScannedBufferVehicle[]
): VoiceCommandAnalysis {
  const normalized = rawSpeech.trim();
  // [REVIEW] 기존 `|| normalized.length > 0` 때문에 아무 발화나 웨이크워드로 인식됨 (차 안 대화 오발송 위험)
  const wakeWordDetected = /(헤이|hey)\s*플레이트/i.test(normalized);

  // 1. 타겟 차량 매칭 (번호판 끝자리, 색상, 차종, 차선 키워드 기반)
  let matchedVehicle: ScannedBufferVehicle | null = null;

  for (const v of bufferVehicles) {
    const last4 = v.license_plate.slice(-4);
    if (
      normalized.includes(last4) ||
      normalized.includes(v.license_plate) ||
      (normalized.includes('쏘나타') && v.model.includes('쏘나타')) ||
      (normalized.includes('화물') && v.vehicleType === 'CARGO_TRUCK') ||
      (normalized.includes('트럭') && v.vehicleType === 'CARGO_TRUCK') ||
      (normalized.includes('포터') && v.model.includes('포터')) ||
      (normalized.includes('쏘렌토') && v.model.includes('쏘렌토')) ||
      (normalized.includes('SUV') && v.vehicleType === 'SUV') ||
      (normalized.includes('흰색') && v.color.includes('화이트'))
    ) {
      matchedVehicle = v;
      break;
    }
  }

  // [REVIEW] 기존엔 매칭 실패 시 임의로 중앙 차선 차량에 발송 → 엉뚱한 차량 오발송 위험.
  // 매칭 실패 시 null 을 반환하고, 호출부가 운전자가 명시적으로 선택한 타겟을 사용하도록 함.

  // 2. 공격성/욕설 포함 여부 검사
  const hadProfanityOrAggression = PROFANITY_OR_AGGRESSION_KEYWORDS.some((kw) =>
    normalized.includes(kw)
  );
  const isPureAbuse = PURE_ABUSE_ONLY_KEYWORDS.some((kw) =>
    normalized.includes(kw)
  );

  // 순수 위협/보복운전 발언이고 안전 정보조차 없는 경우 원천 차단
  const hasSafetyOrSocialIntent =
    normalized.includes('브레이크') ||
    normalized.includes('미등') ||
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
      matchedVehicle,
      messageType: 'DEFECT_ALERT',
      rawTranscript: normalized,
      sanitizedContent: '',
      hadProfanityOrAggression: true,
      blockedEntirely: true,
      blockReason:
        'PlateTalk AI 안전 가드: 상대 운전자를 위협하거나 시비를 유발하는 순수 공격성 발화는 전송이 원천 차단됩니다.',
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
      '[긴급 안전 고지] 차주님, 현재 후방 적재물 결박이 느슨하여 낙하 위험이 보입니다. 가까운 안전지대에서 점검 부탁드립니다. (반경 5km 주행 차량 동시 브로드캐스트 완료)';
  } else if (normalized.includes('브레이크') || normalized.includes('미등')) {
    messageType = 'DEFECT_ALERT';
    sanitizedContent =
      '[차량 이상 알림] 안녕하세요 차주님! 주행 중 확인해보니 우측 브레이크등(제동등)이 점등되지 않고 있습니다. 안전 운전을 위해 점검을 권장드립니다.';
  } else if (normalized.includes('타이어') || normalized.includes('공기압')) {
    messageType = 'DEFECT_ALERT';
    sanitizedContent =
      '[차량 이상 알림] 차주님, 후륜 타이어 공기압이 다소 낮아 보입니다. 주행 안전을 위해 가까운 정비소나 휴게소에서 공기압 점검을 권장드립니다.';
  } else if (normalized.includes('주유구') || normalized.includes('트렁크')) {
    messageType = 'DEFECT_ALERT';
    sanitizedContent =
      '[차량 이상 알림] 차주님! 주유구 커버(또는 트렁크)가 완전히 닫히지 않은 상태로 주행 중이십니다. 정차 시 확인 부탁드립니다.';
  } else if (
    normalized.includes('휠') ||
    normalized.includes('루프') ||
    normalized.includes('배기') ||
    normalized.includes('튜닝') ||
    normalized.includes('모델명')
  ) {
    messageType = 'TUNING_ASK';
    sanitizedContent =
      '[튜닝/장착 문의] 차주님 차량이 정말 멋집니다! 장착하신 휠/루프박스 스펙과 모델명이 궁금하여 정중히 여쭤봅니다. 안전 운전하세요!';
  } else if (
    normalized.includes('예쁘') ||
    normalized.includes('멋지') ||
    normalized.includes('색상') ||
    normalized.includes('칭찬')
  ) {
    messageType = 'COMPLIMENT';
    sanitizedContent =
      '[드라이버 칭찬] 차주님 차량 색상과 관리 상태가 정말 훌륭하네요! 도로 위에서 기분 좋은 에너지 받고 갑니다. 오늘도 안전 운전하세요!';
  } else if (
    normalized.includes('양보') ||
    normalized.includes('고마') ||
    normalized.includes('감사') ||
    normalized.includes('끼어들기')
  ) {
    messageType = 'YIELD_THANKS';
    sanitizedContent =
      '[양보운전 감사] 방금 차선 변경 시 배려해주시고 여유 있게 양보해주셔서 진심으로 감사합니다! 덕분에 안전하게 합류했습니다. 좋은 하루 보내세요!';
  } else {
    messageType = 'DEFECT_ALERT';
    sanitizedContent =
      '[안전 소통 알림] 뒤따르는 차량에서 안전 확인 메시지를 보냈습니다. 차량 외관 및 등화장치를 가볍게 점검해 주세요. 항상 안전 운전하세요!';
  }

  const coachingNote = hadProfanityOrAggression
    ? 'AI 문맥 정제 작동: 발화 중 거친 표현을 제거하고 정중한 안전 고지 템플릿으로 변환했습니다.'
    : 'AI 핸즈프리 매칭 완료: 사전 정의된 정중한 드라이버 소통 템플릿으로 변환되었습니다.';

  return {
    wakeWordDetected,
    matchedVehicle,
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
    setTimeout(() => onEnd?.(), 3200);
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
