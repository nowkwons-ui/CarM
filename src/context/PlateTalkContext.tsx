'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  CommunityCategory,
  CommunityPost,
  DrivingMessage,
  DrivingMessageType,
  GiftItem,
  GiftTransaction,
  HonorTier,
  OwnershipRole,
  ScannedBufferVehicle,
  StickerClaimStatus,
  UserProfile,
  Vehicle,
  VerificationStatus,
} from '@/types/platetalk';
import { calculateHonorTier, maskLicensePlate } from '@/lib/supabase';
import { speakDrivingBriefing } from '@/lib/voiceAiEngine';

export type ActiveTabId = 'HUD' | 'ALERTS_GIFTS' | 'COMMUNITY' | 'HONOR' | 'GARAGE';

interface QuickGiftModalState {
  isOpen: boolean;
  targetPlate: string;
  targetSummary: string;
  relatedMessageId?: string;
}

interface PlateTalkContextValue {
  activeTab: ActiveTabId;
  setActiveTab: (tab: ActiveTabId) => void;
  user: UserProfile;
  vehicles: Vehicle[];
  activeVehicle: Vehicle;
  setActiveVehicleId: (id: string) => void;
  updateVerificationStatus: (
    status: VerificationStatus,
    updatedPlate?: string,
    updatedVin?: string,
    updatedOwnerName?: string,
    role?: OwnershipRole
  ) => void;
  addSecondaryVehicle: (vehicleData: {
    license_plate: string;
    vin: string;
    registered_owner_name: string;
    ownership_role: OwnershipRole;
    brand: string;
    model: string;
    color: string;
    verification_status: VerificationStatus;
  }) => void;
  scannedVehicles: ScannedBufferVehicle[];
  selectedTargetPlate: string;
  setSelectedTargetPlate: (plate: string) => void;
  isDrivingMode: boolean;
  isTtsSpeaking: boolean;
  activeHudIncomingMessage: DrivingMessage | null;
  dismissHudOverlayCard: () => void;
  toggleDrivingMode: () => { archivedCount: number; newMode: boolean };
  drivingMessages: DrivingMessage[];
  sendDrivingMessage: (params: {
    receiverPlate: string;
    messageType: DrivingMessageType;
    content: string;
    rawVoiceTranscript?: string;
    aiSanitized?: boolean;
    broadcastRadiusKm?: number;
  }) => { ok: boolean; error?: string; message?: DrivingMessage };
  triggerSimulatedIncomingAlert: (presetType: 'BRAKE_LIGHT' | 'OVERLOAD_BROADCAST' | 'YIELD_THANKS' | 'TUNING_QUESTION') => void;
  acknowledgeHelpfulMessage: (messageId: string) => void;
  restoreArchivedMessage: (messageId: string) => void;
  communityPosts: CommunityPost[];
  createCommunityPost: (params: {
    category: CommunityCategory;
    title: string;
    content: string;
    tuningTags: string[];
    imageUrl?: string;
  }) => { ok: boolean; error?: string };
  togglePostLike: (postId: string) => void;
  addPostComment: (postId: string, commentText: string) => { ok: boolean; error?: string };
  giftCatalog: GiftItem[];
  giftTransactions: GiftTransaction[];
  quickGiftModal: QuickGiftModalState;
  openQuickGiftModal: (targetPlate: string, targetSummary?: string, relatedMessageId?: string) => void;
  closeQuickGiftModal: () => void;
  sendGiftByPlate: (params: {
    receiverPlate: string;
    itemId: string;
    thankYouNote: string;
    relatedMessageId?: string;
  }) => { ok: boolean; couponCode?: string; error?: string };
  redeemReceivedGift: (giftId: string) => void;
  claimHonorSticker: (shippingAddress: {
    recipientName: string;
    phone: string;
    postalCode: string;
    addressLine1: string;
    addressLine2: string;
  }) => void;
  addHonorPoints: (points: number, reason: string) => void;
  lookupGarageByPlate: (plateQuery: string) => Vehicle | null;
  toastBanner: { message: string; tone: 'emerald' | 'amber' | 'sky' | 'rose' } | null;
  showToast: (message: string, tone?: 'emerald' | 'amber' | 'sky' | 'rose') => void;
}

const INITIAL_USER: UserProfile = {
  id: 'usr-platetalk-001',
  auth_provider: 'KAKAO',
  email: 'taehoon.kim@platetalk.kr',
  phone: '010-8942-3104',
  real_name: '김태훈',
  phone_verified: true,
  nickname: '판교젠틀드라이버',
  honor_points: 1180,
  honor_tier: 'MASTER',
  sticker_claim_status: 'ELIGIBLE',
  sticker_serial_number: 'PT-2026-KR-000842',
  default_payment_method: 'KAKAOPAY',
  created_at: '2026-02-14T09:00:00Z',
};

const INITIAL_VEHICLES: Vehicle[] = [
  {
    id: 'veh-genesis-g80',
    user_id: 'usr-platetalk-001',
    license_plate: '12라 3466',
    vin: 'KMHL341CBNP034661',
    registered_owner_name: '김태훈',
    ownership_role: 'PRIMARY_OWNER',
    brand: '제네시스 (GENESIS)',
    model: 'G80 Sport 3.5T AWD',
    model_year: 2025,
    color: '베르비에 화이트 (매트)',
    tuning_specs: {
      wheels: 'BBS CI-R 20인치 사틴 브론즈',
      tires: '미쉐린 파일럿 스포츠 4S (245/40R20, 275/35R20)',
      suspension: '전자제어 프리뷰 에어서스펜션 순정 세팅',
      exhaust: '능동형 가변 배기 스포츠 플러스 모드',
      exteriorWrap: '전체 무광 PPF (XPEL Stealth)',
      dashcamModel: '아이나비 QXD1 Plus (Wi-Fi RTSP 연동됨)',
    },
    garage_bio: '강남·판교 출퇴근합니다. 깜빡이 켜시면 무조건 양보해 드립니다!',
    car_wash_logs: [
      {
        id: 'cw-1',
        date: '2026-11-08',
        location: '워시존 분당점',
        workSummary: '디테일링 폼건 세차 + 휠 분진 철분 제거',
        coatType: '기온쿼츠 웻코트 시공',
      },
      {
        id: 'cw-2',
        date: '2026-10-25',
        location: '개러지웍스 성수',
        workSummary: '실내 가죽 클리닝 및 유리 발수 코팅',
        coatType: '글라코 울트라 발수',
      },
    ],
    verification_status: 'VERIFIED',
    ocr_confidence_score: 99.6,
    plate_photo_url: '/assets/showroom-genesis.jpg',
    registration_doc_url: '/assets/showroom-genesis.jpg',
    is_primary: true,
    owner_nickname: '판교젠틀드라이버',
    owner_honor_tier: 'MASTER',
  },
  {
    id: 'veh-porsche-911',
    user_id: 'usr-platetalk-999',
    license_plate: '28하 9911',
    vin: 'WP0ZZZ99ZTS289911',
    registered_owner_name: '박성민',
    ownership_role: 'PRIMARY_OWNER',
    brand: '포르쉐 (PORSCHE)',
    model: '911 GT3 Touring (992)',
    model_year: 2025,
    color: '크레용 (Chalk Grey)',
    tuning_specs: {
      wheels: '순정 센터락 20/21인치 새틴 블랙 단조휠',
      tires: '피렐리 P Zero Corsa',
      roofBox: '포르쉐 테큅먼트 퍼포먼스 루프박스 320L (블랙 하이글로시)',
      exhaust: '순정 경량 스포츠 배기 시스템',
      exteriorWrap: '프론트 풀 패키지 PPF',
    },
    garage_bio: '주말 설악·양양 와인딩 투어러입니다. 루프박스 정보 언제든 환영!',
    car_wash_logs: [
      {
        id: 'cw-3',
        date: '2026-11-10',
        location: '인제 스피디움 피트',
        workSummary: '투어링 후 버그 클리닝 및 타이어 공기압 점검',
        coatType: '세라믹 프로 9H',
      },
    ],
    verification_status: 'VERIFIED',
    ocr_confidence_score: 99.8,
    plate_photo_url: '/assets/showroom-porsche.jpg',
    registration_doc_url: '/assets/showroom-porsche.jpg',
    is_primary: false,
    owner_nickname: '설악투어링992',
    owner_honor_tier: 'HONOR_SOCIETY',
  },
  {
    id: 'veh-sonata-target',
    user_id: 'usr-platetalk-202',
    license_plate: '123가 4568',
    vin: 'KMHL241ABNP124568',
    registered_owner_name: '이수진',
    ownership_role: 'PRIMARY_OWNER',
    brand: '현대 (HYUNDAI)',
    model: '쏘나타 디 엣지 1.6 터보',
    model_year: 2024,
    color: '세레니티 화이트 펄',
    tuning_specs: {
      wheels: 'N 라인 19인치 알로이 휠',
      tires: '피렐리 P Zero All Season',
      dashcamModel: '파인뷰 X3300',
    },
    garage_bio: '초보 탈출 중인 직장인 오너입니다. 차량 이상 보이면 꼭 알려주세요!',
    car_wash_logs: [],
    verification_status: 'VERIFIED',
    ocr_confidence_score: 98.9,
    plate_photo_url: '/assets/dashcam-road.jpg',
    registration_doc_url: '/assets/dashcam-road.jpg',
    is_primary: false,
    owner_nickname: '수진엣지오너',
    owner_honor_tier: 'GUARDIAN',
  },
  {
    id: 'veh-sorento-left',
    user_id: 'usr-platetalk-303',
    license_plate: '54나 8821',
    vin: 'KNAG481BBNP548821',
    registered_owner_name: '정현우',
    ownership_role: 'PRIMARY_OWNER',
    brand: '기아 (KIA)',
    model: '더 뉴 쏘렌토 하이브리드 그래비티',
    model_year: 2025,
    color: '인터스텔라 그레이',
    tuning_specs: {
      wheels: '그래비티 전용 20인치 블랙 알로이 휠',
      roofBox: '툴레 Motion XT Alpine 무광 블랙',
      suspension: '빌스테인 B6 댐퍼 장착',
    },
    garage_bio: '아이 둘과 매주 캠핑 떠나는 패밀리 SUV 차고입니다.',
    car_wash_logs: [],
    verification_status: 'VERIFIED',
    ocr_confidence_score: 99.1,
    plate_photo_url: '/assets/dashcam-road.jpg',
    registration_doc_url: '/assets/dashcam-road.jpg',
    is_primary: false,
    owner_nickname: '캠핑대디쏘렌토',
    owner_honor_tier: 'GUARDIAN',
  },
];

const INITIAL_SCANNED_BUFFER: ScannedBufferVehicle[] = [
  {
    id: 'scan-center-sonata',
    license_plate: '123가 4568',
    brand: '현대',
    model: '쏘나타 디 엣지',
    color: '화이트 펄',
    vehicleType: 'SEDAN',
    lane: 'CENTER',
    distanceMeters: 18,
    ocrConfidence: 99.2,
    detectedAt: '방금 전 (전방 중앙 차선)',
    bbox: {
      topPercent: 48,
      leftPercent: 44,
      widthPercent: 14,
      heightPercent: 17,
    },
    suspectedIssue: '우측 브레이크등 간헐적 점등 불량 감지 의심',
  },
  {
    id: 'scan-right-truck',
    license_plate: '82바 9104',
    brand: '현대',
    model: '포터 II 카고트럭',
    color: '중형 블루',
    vehicleType: 'CARGO_TRUCK',
    lane: 'RIGHT',
    distanceMeters: 24,
    ocrConfidence: 97.8,
    detectedAt: '18초 전 (우측 3차선)',
    bbox: {
      topPercent: 44,
      leftPercent: 60,
      widthPercent: 18,
      heightPercent: 22,
    },
    suspectedIssue: '후방 적재함 로프 결박 느슨함 주의',
  },
  {
    id: 'scan-left-suv',
    license_plate: '54나 8821',
    brand: '기아',
    model: '쏘렌토 하이브리드',
    color: '다크 그레이',
    vehicleType: 'SUV',
    lane: 'LEFT',
    distanceMeters: 29,
    ocrConfidence: 98.4,
    detectedAt: '42초 전 (좌측 1차선)',
    bbox: {
      topPercent: 47,
      leftPercent: 30,
      widthPercent: 13,
      heightPercent: 16,
    },
    tuningHighlight: '툴레 로우프로파일 루프박스 & 블랙 휠 장착',
  },
];

const INITIAL_MESSAGES: DrivingMessage[] = [
  {
    id: 'msg-001',
    sender_vehicle_id: 'veh-sorento-left',
    sender_plate_snapshot: '54나 8821',
    sender_vehicle_summary: '좌측 1차선 다크 그레이 쏘렌토 하이브리드',
    receiver_plate: '12라 3466',
    message_type: 'DEFECT_ALERT',
    content:
      '차주님! 조수석 쪽 주유구 커버가 살짝 열려 있는 상태로 주행 중이십니다. 정차 시 닫아주시면 안전할 것 같습니다!',
    ai_sanitized: true,
    location_lat: 37.4021,
    location_lng: 127.1086,
    location_name: '경부고속도로 판교IC 부근',
    broadcast_radius_km: 0,
    helpful_acknowledged: false,
    honor_points_awarded: 50,
    is_read: true,
    is_dismissed: false,
    direction: 'INCOMING',
    created_at: '3분 전',
  },
  {
    id: 'msg-002',
    sender_vehicle_id: 'veh-sonata-target',
    sender_plate_snapshot: '123가 4568',
    sender_vehicle_summary: '전방 화이트 쏘나타 디 엣지',
    receiver_plate: '12라 3466',
    message_type: 'YIELD_THANKS',
    content:
      '방금 판교 분기점 진입 구간에서 기분 좋게 차선 양보해주셔서 정말 감사합니다! 덕분에 초보인데 무사히 합류했어요.',
    ai_sanitized: true,
    location_lat: 37.3948,
    location_lng: 127.1112,
    location_name: '분당내곡간도시고속화도로',
    broadcast_radius_km: 0,
    helpful_acknowledged: true,
    honor_points_awarded: 30,
    is_read: true,
    is_dismissed: false,
    direction: 'INCOMING',
    created_at: '12분 전',
  },
  {
    id: 'msg-003',
    sender_vehicle_id: 'veh-porsche-911',
    sender_plate_snapshot: '28하 9911',
    sender_vehicle_summary: '반경 1.8km 내 아너 소사이어티 오너 제보',
    receiver_plate: 'ALL_5KM_RADIUS',
    message_type: 'OVERLOAD_WARN',
    content:
      '[반경 5km 실시간 위험 브로드캐스트] 전방 3차선 82바 9104 화물트럭 적재함 박스 흔들림 감지. 후방 추종 금지 및 차선 변경 방어운전 바랍니다.',
    ai_sanitized: true,
    location_lat: 37.4085,
    location_lng: 127.1032,
    location_name: '양재대로 헌릉IC 방향 2km 지점',
    broadcast_radius_km: 5.0,
    helpful_acknowledged: false,
    honor_points_awarded: 40,
    is_read: false,
    is_dismissed: false,
    direction: 'BROADCAST',
    created_at: '방금 전',
  },
];

const INITIAL_COMMUNITY_POSTS: CommunityPost[] = [
  {
    id: 'post-001',
    vehicle_id: 'veh-genesis-g80',
    license_plate: '12라 3466',
    masked_plate_display: maskLicensePlate('12라 3466'),
    owner_nickname: '판교젠틀드라이버',
    owner_honor_tier: 'MASTER',
    vehicle_summary: '제네시스 G80 Sport 3.5T · 베르비에 화이트',
    verified_owner_badge: true,
    category: 'MY_CAR_SHOW',
    title: '베르비에 화이트 G80 스포츠 + BBS CI-R 20인치 사틴 브론즈 세팅 완료했습니다',
    content:
      '순정 무광 화이트 컬러에 가장 잘 어울리는 휠 옵셋을 고민하다가 BBS CI-R 20인치 사틴 브론즈로 장착했습니다. 지하주차장 조명 아래에서 림 프로텍터 라인과 브론즈 톤이 은은하게 살아나서 만족도가 정말 높네요! 도로에서 마주치면 플레이트톡으로 인사 남겨주세요.',
    image_urls: ['/assets/showroom-genesis.jpg'],
    tuning_tags: ['BBS CI-R 20인치', '무광 PPF', '미쉐린 PS4S', 'G80 Sport'],
    likes_count: 142,
    comments_count: 2,
    liked_by_me: false,
    comments: [
      {
        id: 'cmt-1',
        author_nickname: '설악투어링992',
        author_plate_masked: '**하 9911',
        content: '베르비에 화이트에 브론즈 조합은 언제 봐도 정답이네요! 간섭은 전혀 없으신가요?',
        created_at: '1시간 전',
      },
      {
        id: 'cmt-2',
        author_nickname: '캠핑대디쏘렌토',
        author_plate_masked: '**나 8821',
        content: '어제 판교IC에서 양보해주신 차량 맞으시죠! 실물 포스가 대단했습니다.',
        created_at: '35분 전',
      },
    ],
    created_at: '2시간 전',
  },
  {
    id: 'post-002',
    vehicle_id: 'veh-porsche-911',
    license_plate: '28하 9911',
    masked_plate_display: maskLicensePlate('28하 9911'),
    owner_nickname: '설악투어링992',
    owner_honor_tier: 'HONOR_SOCIETY',
    vehicle_summary: '포르쉐 911 GT3 Touring (992) · 크레용',
    verified_owner_badge: true,
    category: 'TUNING_INFO',
    title: '911 GT3 투어링에 순정 테큅먼트 루프박스 장착 후 고속 풍절음 & 연비 실사용 후기',
    content:
      '주행 중 플레이트톡으로 루프박스 모델명 문의를 정말 많이 주셔서 아예 상세 스펙을 정리해 올립니다! 포르쉐 테큅먼트 퍼포먼스 루프박스 320L 모델이며, 크레용 외장 컬러에 맞춰 사이드 블레이드를 하이글로시 블랙으로 커스텀했습니다.',
    image_urls: ['/assets/showroom-porsche.jpg'],
    tuning_tags: ['테큅먼트 루프박스', '992 GT3 Touring', '센터락 단조휠', '와인딩'],
    likes_count: 289,
    comments_count: 1,
    liked_by_me: true,
    comments: [
      {
        id: 'cmt-3',
        author_nickname: '판교젠틀드라이버',
        author_plate_masked: '**라 3466',
        content: 'GT3 투어링에 루프박스 조합이라니 드림카 그 자체입니다!',
        created_at: '4시간 전',
      },
    ],
    created_at: '5시간 전',
  },
];

const GIFT_CATALOG: GiftItem[] = [
  {
    id: 'GIFT_COFFEE_STARBUCKS',
    name: '스타벅스 아이스 아메리카노 T',
    brand: 'Starbucks Korea',
    category: 'COFFEE',
    price: 4500,
    description: '양보운전 감사 및 졸음운전 예방을 위한 가장 센스 있는 한 잔',
    badgeText: '답례 인기 1위',
  },
  {
    id: 'GIFT_FUEL_5000',
    name: 'GS칼텍스·SK 모바일 주유권 5,000원',
    brand: '에너지 플러스',
    category: 'FUEL',
    price: 5000,
    description: '내 차의 위험을 알려준 고마운 운전자에게 드리는 실속 주유 쿠폰',
    badgeText: '안전고지 답례 추천',
  },
  {
    id: 'GIFT_FUEL_10000',
    name: 'GS칼텍스·SK 모바일 주유권 10,000원',
    brand: '에너지 플러스',
    category: 'FUEL',
    price: 10000,
    description: '큰 사고를 예방해 준 도로 위 영웅에게 전하는 든든한 주유 상품권',
    badgeText: '베스트 기프트',
  },
  {
    id: 'GIFT_WASH_PREMIUM',
    name: '워시존 전국 프리미엄 셀프/노터치 세차권',
    brand: 'WashZone Alliance',
    category: 'CAR_WASH',
    price: 12000,
    description: '차량 관리에 진심인 오너에게 번호판만으로 선물하는 세차 바우처',
    badgeText: '차쟁이 취향저격',
  },
  {
    id: 'GIFT_ENERGY_REDBULL',
    name: '레드불 에너지드링크 250ml 2캔 세트',
    brand: 'GS25 / CU 모바일교환권',
    category: 'ENERGY',
    price: 5800,
    description: '장거리 고속도로 및 야간 화물/승용 운전자를 위한 활력 충전',
    badgeText: '야간주행 응원',
  },
  {
    id: 'GIFT_SCENT_DIPTYQUE',
    name: '딥티크 차량용 방향제 베이(Baies) 리필 세트',
    brand: '프리미엄 기프트 배송',
    category: 'AIR_FRESHENER',
    price: 48000,
    description: '상대방이 앱에서 배송지를 직접 입력해 수령하는 하이엔드 방향제',
    badgeText: '프리미엄 에디션',
  },
];

const INITIAL_GIFTS: GiftTransaction[] = [
  {
    id: 'gift-tx-001',
    sender_user_id: 'usr-platetalk-202',
    sender_plate: '123가 4568',
    receiver_plate: '12라 3466',
    item_id: 'GIFT_COFFEE_STARBUCKS',
    item_name: '스타벅스 아이스 아메리카노 T',
    item_brand: 'Starbucks Korea',
    item_category: 'COFFEE',
    item_price: 4500,
    message_id: 'msg-002',
    thank_you_note: '판교 분기점에서 따뜻하게 양보해주셔서 커피 한 잔 보냅니다! 항상 안전운전하세요.',
    payment_status: 'PAID',
    coupon_code: 'PT-9482-7710-3921',
    direction: 'RECEIVED',
    created_at: '11분 전',
  },
  {
    id: 'gift-tx-002',
    sender_user_id: 'usr-platetalk-999',
    sender_plate: '28하 9911',
    receiver_plate: '12라 3466',
    item_id: 'GIFT_FUEL_5000',
    item_name: 'GS칼텍스·SK 모바일 주유권 5,000원',
    item_brand: '에너지 플러스',
    item_category: 'FUEL',
    item_price: 5000,
    thank_you_note: '지난주 브레이크등 점검 알림 주신 덕분에 바로 수리했습니다. 고맙습니다!',
    payment_status: 'PAID',
    coupon_code: 'PT-5510-8834-1109',
    direction: 'RECEIVED',
    created_at: '어제',
  },
];

const PlateTalkContext = createContext<PlateTalkContextValue | undefined>(undefined);

export function PlateTalkProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<ActiveTabId>('HUD');
  const [user, setUser] = useState<UserProfile>(INITIAL_USER);
  const [vehicles, setVehicles] = useState<Vehicle[]>(INITIAL_VEHICLES);
  const [activeVehicleId, setActiveVehicleId] = useState<string>('veh-genesis-g80');
  const [scannedVehicles] = useState<ScannedBufferVehicle[]>(INITIAL_SCANNED_BUFFER);
  const [selectedTargetPlate, setSelectedTargetPlate] = useState<string>('123가 4568');

  const [isDrivingMode, setIsDrivingMode] = useState<boolean>(true);
  const [isTtsSpeaking, setIsTtsSpeaking] = useState<boolean>(false);
  const [activeHudIncomingMessage, setActiveHudIncomingMessage] =
    useState<DrivingMessage | null>(INITIAL_MESSAGES[0]);

  const [drivingMessages, setDrivingMessages] =
    useState<DrivingMessage[]>(INITIAL_MESSAGES);
  const [communityPosts, setCommunityPosts] =
    useState<CommunityPost[]>(INITIAL_COMMUNITY_POSTS);
  const [giftTransactions, setGiftTransactions] =
    useState<GiftTransaction[]>(INITIAL_GIFTS);

  const [quickGiftModal, setQuickGiftModal] = useState<QuickGiftModalState>({
    isOpen: false,
    targetPlate: '54나 8821',
    targetSummary: '좌측 1차선 다크 그레이 쏘렌토 하이브리드',
  });

  const [toastBanner, setToastBanner] = useState<{
    message: string;
    tone: 'emerald' | 'amber' | 'sky' | 'rose';
  } | null>(null);

  const showToast = useCallback(
    (
      message: string,
      tone: 'emerald' | 'amber' | 'sky' | 'rose' = 'emerald'
    ) => {
      setToastBanner({ message, tone });
      setTimeout(() => {
        setToastBanner((prev) => (prev?.message === message ? null : prev));
      }, 4200);
    },
    []
  );

  const activeVehicle =
    vehicles.find((v) => v.id === activeVehicleId) || vehicles[0];

  const addHonorPoints = useCallback(
    (pointsToAdd: number, reason: string) => {
      setUser((prev) => {
        const nextPoints = prev.honor_points + pointsToAdd;
        const nextTierInfo = calculateHonorTier(nextPoints);
        const nextClaimStatus: StickerClaimStatus =
          nextPoints >= 300 && prev.sticker_claim_status === 'LOCKED'
            ? 'ELIGIBLE'
            : prev.sticker_claim_status;
        return {
          ...prev,
          honor_points: nextPoints,
          honor_tier: nextTierInfo.tier as HonorTier,
          sticker_claim_status: nextClaimStatus,
        };
      });
      showToast(`명예 포인트 +${pointsToAdd}pt 적립! (${reason})`, 'emerald');
    },
    [showToast]
  );

  const updateVerificationStatus = useCallback(
    (
      status: VerificationStatus,
      updatedPlate?: string,
      updatedVin?: string,
      updatedOwnerName?: string,
      role?: OwnershipRole
    ) => {
      setVehicles((prev) =>
        prev.map((v) =>
          v.id === activeVehicle.id
            ? {
                ...v,
                verification_status: status,
                license_plate: updatedPlate || v.license_plate,
                vin: updatedVin || v.vin,
                registered_owner_name:
                  updatedOwnerName || v.registered_owner_name,
                ownership_role: role || v.ownership_role,
                ocr_confidence_score: status === 'VERIFIED' ? 99.6 : 62.0,
              }
            : v
        )
      );

      if (status === 'VERIFIED') {
        showToast(
          '차량 번호판 + 등록증 OCR 교차 인증 완료! 모든 발신 및 커뮤니티 기능이 해금되었습니다.',
          'emerald'
        );
      } else if (status === 'PENDING') {
        showToast(
          '인증 상태가 [PENDING 심사중]으로 변경되었습니다. 승인 전까지 읽기(눈팅)만 가능합니다.',
          'amber'
        );
      } else {
        showToast(
          '미인증/반려 상태에서는 눈팅(읽기)만 가능하며 메시지 발송 및 게시글 작성이 제한됩니다.',
          'rose'
        );
      }
    },
    [activeVehicle.id, showToast]
  );

  const addSecondaryVehicle = useCallback(
    (vehicleData: {
      license_plate: string;
      vin: string;
      registered_owner_name: string;
      ownership_role: OwnershipRole;
      brand: string;
      model: string;
      color: string;
      verification_status: VerificationStatus;
    }) => {
      const newId = `veh-custom-${Date.now()}`;
      const newVehicle: Vehicle = {
        id: newId,
        user_id: user.id,
        license_plate: vehicleData.license_plate,
        vin: vehicleData.vin,
        registered_owner_name: vehicleData.registered_owner_name,
        ownership_role: vehicleData.ownership_role,
        brand: vehicleData.brand,
        model: vehicleData.model,
        model_year: 2025,
        color: vehicleData.color,
        tuning_specs: {
          wheels: '순정 알로이 휠',
          dashcamModel: 'Wi-Fi 연동 블랙박스',
        },
        garage_bio: '새로 등록한 다중 관리 차량입니다.',
        car_wash_logs: [],
        verification_status: vehicleData.verification_status,
        ocr_confidence_score:
          vehicleData.verification_status === 'VERIFIED' ? 99.4 : 84.0,
        plate_photo_url: '/assets/showroom-genesis.jpg',
        registration_doc_url: '/assets/showroom-genesis.jpg',
        is_primary: false,
        owner_nickname: user.nickname,
        owner_honor_tier: user.honor_tier,
      };
      setVehicles((prev) => [newVehicle, ...prev]);
      setActiveVehicleId(newId);
      showToast(
        `신규 차량 [${vehicleData.license_plate}] 등록 완료 (${vehicleData.verification_status})`,
        vehicleData.verification_status === 'VERIFIED' ? 'emerald' : 'amber'
      );
    },
    [showToast, user.honor_tier, user.id, user.nickname]
  );

  const sendDrivingMessage = useCallback(
    (params: {
      receiverPlate: string;
      messageType: DrivingMessageType;
      content: string;
      rawVoiceTranscript?: string;
      aiSanitized?: boolean;
      broadcastRadiusKm?: number;
    }) => {
      // [3.1.3] 미인증 가입자는 눈팅(읽기)만 가능하며 메시지 발송 불가
      if (activeVehicle.verification_status !== 'VERIFIED') {
        showToast(
          `발송 차단: 현재 차량 인증 상태가 [${activeVehicle.verification_status}]입니다. 번호판+등록증 OCR 인증 완료 후 발송할 수 있습니다.`,
          'rose'
        );
        return {
          ok: false,
          error:
            '미인증(또는 심사중/반려) 가입자는 눈팅(읽기)만 가능하며 메시지 발송이 제한됩니다.',
        };
      }

      const pointsAwarded =
        params.messageType === 'OVERLOAD_WARN'
          ? 40
          : params.messageType === 'DEFECT_ALERT'
          ? 25
          : params.messageType === 'YIELD_THANKS'
          ? 30
          : 15;

      const newMessage: DrivingMessage = {
        id: `msg-${Date.now()}`,
        sender_vehicle_id: activeVehicle.id,
        sender_plate_snapshot: activeVehicle.license_plate,
        sender_vehicle_summary: `${activeVehicle.color} ${activeVehicle.model}`,
        receiver_plate: params.receiverPlate,
        message_type: params.messageType,
        raw_voice_transcript: params.rawVoiceTranscript,
        content: params.content,
        ai_sanitized: params.aiSanitized ?? true,
        location_lat: 37.4021,
        location_lng: 127.1086,
        location_name: '경부고속도로 서울 방향 판교 구간',
        broadcast_radius_km: params.broadcastRadiusKm || 0,
        helpful_acknowledged: false,
        honor_points_awarded: pointsAwarded,
        is_read: true,
        is_dismissed: false,
        direction:
          (params.broadcastRadiusKm || 0) > 0 ? 'BROADCAST' : 'OUTGOING',
        created_at: '방금 전',
      };

      setDrivingMessages((prev) => [newMessage, ...prev]);
      addHonorPoints(
        pointsAwarded,
        params.messageType === 'OVERLOAD_WARN'
          ? '화물 낙하 위험 경고 + 반경 5km 브로드캐스트'
          : '안전 주행 실시간 소통 발송'
      );

      return { ok: true, message: newMessage };
    },
    [activeVehicle, addHonorPoints, showToast]
  );

  const triggerSimulatedIncomingAlert = useCallback(
    (
      presetType:
        | 'BRAKE_LIGHT'
        | 'OVERLOAD_BROADCAST'
        | 'YIELD_THANKS'
        | 'TUNING_QUESTION'
    ) => {
      let incoming: DrivingMessage;
      let ttsScript = '';

      if (presetType === 'BRAKE_LIGHT') {
        incoming = {
          id: `msg-in-${Date.now()}`,
          sender_vehicle_id: 'veh-sonata-target',
          sender_plate_snapshot: '123가 4568',
          sender_vehicle_summary: '뒤따르는 화이트 쏘나타 디 엣지',
          receiver_plate: activeVehicle.license_plate,
          message_type: 'DEFECT_ALERT',
          content:
            '우측 브레이크등이 점등되지 않고 있습니다. 야간 주행 안전을 위해 가까운 정비소에서 점검해 보세요!',
          ai_sanitized: true,
          location_lat: 37.405,
          location_lng: 127.109,
          location_name: '경부고속도로 달래내3교 부근',
          broadcast_radius_km: 0,
          helpful_acknowledged: false,
          honor_points_awarded: 50,
          is_read: true,
          is_dismissed: false,
          direction: 'INCOMING',
          created_at: '방금 전',
        };
        ttsScript =
          "플레이트톡 음성 브리핑입니다. 뒤따르는 123가 4568 차량으로부터 '우측 브레이크등이 나갔습니다'라는 안전 알림이 도착했습니다.";
      } else if (presetType === 'OVERLOAD_BROADCAST') {
        incoming = {
          id: `msg-in-${Date.now()}`,
          sender_vehicle_id: 'veh-sorento-left',
          sender_plate_snapshot: '54나 8821',
          sender_vehicle_summary: '반경 5km 방어운전 경보 (54나 8821 발신)',
          receiver_plate: 'ALL_5KM_RADIUS',
          message_type: 'OVERLOAD_WARN',
          content:
            '[반경 5km 긴급 브로드캐스트] 전방 우측 차로 82바 9104 화물차 적재물 결박 불량으로 낙하 위험이 있습니다. 차간 거리를 넓히고 방어운전하세요.',
          ai_sanitized: true,
          location_lat: 37.409,
          location_lng: 127.104,
          location_name: '경부고속도로 양재IC 1.5km 전방',
          broadcast_radius_km: 5.0,
          helpful_acknowledged: false,
          honor_points_awarded: 40,
          is_read: true,
          is_dismissed: false,
          direction: 'BROADCAST',
          created_at: '방금 전',
        };
        ttsScript =
          '긴급 방어운전 브로드캐스트입니다. 반경 5킬로미터 내 전방 3차로 82바 9104 화물차의 적재물 낙하 위험이 접수되었습니다. 차선을 변경하거나 안전거리를 확보하세요.';
      } else if (presetType === 'YIELD_THANKS') {
        incoming = {
          id: `msg-in-${Date.now()}`,
          sender_vehicle_id: 'veh-sonata-target',
          sender_plate_snapshot: '123가 4568',
          sender_vehicle_summary: '합류한 화이트 쏘나타 디 엣지',
          receiver_plate: activeVehicle.license_plate,
          message_type: 'YIELD_THANKS',
          content:
            '방금 합류 구간에서 비상등 인사 받아주시고 넉넉하게 양보해주셔서 정말 감사합니다! 명예 포인트 +30점을 함께 보냅니다.',
          ai_sanitized: true,
          location_lat: 37.402,
          location_lng: 127.108,
          location_name: '판교JC 진입 램프',
          broadcast_radius_km: 0,
          helpful_acknowledged: true,
          honor_points_awarded: 30,
          is_read: true,
          is_dismissed: false,
          direction: 'INCOMING',
          created_at: '방금 전',
        };
        ttsScript =
          '기분 좋은 메시지입니다! 123가 4568 차량으로부터 양보운전 감사 인사와 함께 명예 포인트 30점이 도착했습니다.';
        addHonorPoints(30, '양보운전 감사 메시지 수신');
      } else {
        incoming = {
          id: `msg-in-${Date.now()}`,
          sender_vehicle_id: 'veh-sorento-left',
          sender_plate_snapshot: '54나 8821',
          sender_vehicle_summary: '좌측 차선 다크 그레이 쏘렌토',
          receiver_plate: activeVehicle.license_plate,
          message_type: 'TUNING_ASK',
          content:
            '차주님 무광 화이트 컬러와 브론즈 휠 조합이 정말 예술이네요! 장착하신 20인치 휠 모델명과 옵셋이 궁금합니다!',
          ai_sanitized: true,
          location_lat: 37.403,
          location_lng: 127.107,
          location_name: '경부고속도로 서울 톨게이트 방향',
          broadcast_radius_km: 0,
          helpful_acknowledged: false,
          honor_points_awarded: 15,
          is_read: true,
          is_dismissed: false,
          direction: 'INCOMING',
          created_at: '방금 전',
        };
        ttsScript =
          '54나 8821 차량으로부터 차량 칭찬 및 장착하신 브론즈 휠 모델명 문의 메시지가 도착했습니다.';
      }

      setDrivingMessages((prev) => [incoming, ...prev]);
      setActiveHudIncomingMessage(incoming);

      speakDrivingBriefing(
        ttsScript,
        () => setIsTtsSpeaking(true),
        () => setIsTtsSpeaking(false)
      );
    },
    [activeVehicle.license_plate, addHonorPoints]
  );

  const dismissHudOverlayCard = useCallback(() => {
    setActiveHudIncomingMessage(null);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsTtsSpeaking(false);
  }, []);

  /**
   * [3.2.3] 시동 종료 또는 드라이빙 모드 해제 시 읽은 메시지 자동 말소 (Auto-Archiving)
   */
  const toggleDrivingMode = useCallback(() => {
    if (isDrivingMode) {
      // 주행 종료 -> 읽은(is_read=true) 메시지들을 알림 센터에서 자동 말소(is_dismissed=true)
      let archivedCount = 0;
      setDrivingMessages((prev) =>
        prev.map((m) => {
          if (m.is_read && !m.is_dismissed) {
            archivedCount += 1;
            return { ...m, is_dismissed: true };
          }
          return m;
        })
      );
      setIsDrivingMode(false);
      setActiveHudIncomingMessage(null);
      showToast(
        `주행 종료 감지: 주행 중 브리핑 완료된 메시지 ${archivedCount}건이 알림 센터에서 자동 말소(아카이브 이동)되었습니다.`,
        'sky'
      );
      return { archivedCount, newMode: false };
    } else {
      setIsDrivingMode(true);
      showToast(
        '드라이빙 HUD 모드가 활성화되었습니다. 전방 번호판 실시간 스캔 및 TTS 자동 브리핑을 시작합니다.',
        'emerald'
      );
      return { archivedCount: 0, newMode: true };
    }
  }, [isDrivingMode, showToast]);

  const acknowledgeHelpfulMessage = useCallback(
    (messageId: string) => {
      const targetMsg = drivingMessages.find((m) => m.id === messageId);
      if (!targetMsg || targetMsg.helpful_acknowledged) return;

      setDrivingMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, helpful_acknowledged: true } : m
        )
      );
      if (activeHudIncomingMessage?.id === messageId) {
        setActiveHudIncomingMessage((prev) =>
          prev ? { ...prev, helpful_acknowledged: true } : null
        );
      }

      addHonorPoints(
        50,
        `[${targetMsg.sender_plate_snapshot}] 안전 고지 '도움 됐어요' 감사 인증 보상`
      );
    },
    [activeHudIncomingMessage?.id, addHonorPoints, drivingMessages]
  );

  const restoreArchivedMessage = useCallback(
    (messageId: string) => {
      setDrivingMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, is_dismissed: false } : m
        )
      );
      showToast('말소된 메시지를 활성 알림함으로 복원했습니다.', 'sky');
    },
    [showToast]
  );

  const createCommunityPost = useCallback(
    (params: {
      category: CommunityCategory;
      title: string;
      content: string;
      tuningTags: string[];
      imageUrl?: string;
    }) => {
      if (activeVehicle.verification_status !== 'VERIFIED') {
        showToast(
          '커뮤니티 작성 제한: 번호판+등록증 OCR 인증을 완료한 VERIFIED 오너만 글을 작성할 수 있습니다.',
          'rose'
        );
        return {
          ok: false,
          error:
            '미인증 가입자는 눈팅(읽기)만 가능하며 커뮤니티 게시글 작성이 불가합니다.',
        };
      }

      const newPost: CommunityPost = {
        id: `post-${Date.now()}`,
        vehicle_id: activeVehicle.id,
        license_plate: activeVehicle.license_plate,
        masked_plate_display: maskLicensePlate(activeVehicle.license_plate),
        owner_nickname: user.nickname,
        owner_honor_tier: user.honor_tier,
        vehicle_summary: `${activeVehicle.brand} ${activeVehicle.model} · ${activeVehicle.color}`,
        verified_owner_badge: true,
        category: params.category,
        title: params.title,
        content: params.content,
        image_urls: [params.imageUrl || activeVehicle.plate_photo_url],
        tuning_tags:
          params.tuningTags.length > 0
            ? params.tuningTags
            : ['Verified Owner', activeVehicle.model],
        likes_count: 1,
        comments_count: 0,
        liked_by_me: true,
        comments: [],
        created_at: '방금 전',
      };

      setCommunityPosts((prev) => [newPost, ...prev]);
      addHonorPoints(20, '인증 오너 쇼룸/커뮤니티 게시글 작성');
      return { ok: true };
    },
    [activeVehicle, addHonorPoints, showToast, user.honor_tier, user.nickname]
  );

  const togglePostLike = useCallback((postId: string) => {
    setCommunityPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const liked = !p.liked_by_me;
        return {
          ...p,
          liked_by_me: liked,
          likes_count: liked ? p.likes_count + 1 : p.likes_count - 1,
        };
      })
    );
  }, []);

  const addPostComment = useCallback(
    (postId: string, commentText: string) => {
      if (activeVehicle.verification_status !== 'VERIFIED') {
        showToast(
          '댓글 작성 제한: VERIFIED 차량 인증 오너만 댓글을 작성할 수 있습니다.',
          'rose'
        );
        return {
          ok: false,
          error: '미인증 가입자는 눈팅(읽기) 전용입니다.',
        };
      }

      setCommunityPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          return {
            ...p,
            comments_count: p.comments_count + 1,
            comments: [
              ...p.comments,
              {
                id: `cmt-${Date.now()}`,
                author_nickname: user.nickname,
                author_plate_masked: maskLicensePlate(
                  activeVehicle.license_plate
                ),
                content: commentText,
                created_at: '방금 전',
              },
            ],
          };
        })
      );
      return { ok: true };
    },
    [activeVehicle, showToast, user.nickname]
  );

  const openQuickGiftModal = useCallback(
    (
      targetPlate: string,
      targetSummary = '도로 위 매너 운전자',
      relatedMessageId?: string
    ) => {
      setQuickGiftModal({
        isOpen: true,
        targetPlate,
        targetSummary,
        relatedMessageId,
      });
    },
    []
  );

  const closeQuickGiftModal = useCallback(() => {
    setQuickGiftModal((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const sendGiftByPlate = useCallback(
    (params: {
      receiverPlate: string;
      itemId: string;
      thankYouNote: string;
      relatedMessageId?: string;
    }) => {
      const item = GIFT_CATALOG.find((g) => g.id === params.itemId);
      if (!item) {
        return { ok: false, error: '상품을 찾을 수 없습니다.' };
      }

      const randomDigits = () =>
        Math.floor(1000 + Math.random() * 9000).toString();
      const couponCode = `PT-${randomDigits()}-${randomDigits()}-${randomDigits()}`;

      const tx: GiftTransaction = {
        id: `gift-tx-${Date.now()}`,
        sender_user_id: user.id,
        sender_plate: activeVehicle.license_plate,
        receiver_plate: params.receiverPlate.trim(),
        item_id: item.id,
        item_name: item.name,
        item_brand: item.brand,
        item_category: item.category,
        item_price: item.price,
        message_id: params.relatedMessageId,
        thank_you_note:
          params.thankYouNote.trim() ||
          '안전하고 배려 깊은 운전에 감사드리며 작은 선물을 보냅니다!',
        payment_status: 'PAID',
        coupon_code: couponCode,
        direction: 'SENT',
        created_at: '방금 전',
      };

      setGiftTransactions((prev) => [tx, ...prev]);
      addHonorPoints(60, `[${params.receiverPlate}] 차량에 감사 기프티콘 선물 발송`);
      return { ok: true, couponCode };
    },
    [activeVehicle.license_plate, addHonorPoints, user.id]
  );

  const redeemReceivedGift = useCallback(
    (giftId: string) => {
      setGiftTransactions((prev) =>
        prev.map((g) =>
          g.id === giftId
            ? {
                ...g,
                payment_status: 'REDEEMED',
                redeemed_at: new Date().toLocaleTimeString('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              }
            : g
        )
      );
      showToast('기프티콘 바코드 사용(교환) 완료 처리되었습니다!', 'emerald');
    },
    [showToast]
  );

  const claimHonorSticker = useCallback(
    (shippingAddress: {
      recipientName: string;
      phone: string;
      postalCode: string;
      addressLine1: string;
      addressLine2: string;
    }) => {
      setUser((prev) => ({
        ...prev,
        sticker_claim_status: 'REQUESTED',
        sticker_shipping_address: {
          ...shippingAddress,
          requestedAt: '2026-11-12',
        },
      }));
      showToast(
        `고유 시리얼 [${user.sticker_serial_number}] 각인 홀로그램 메탈 명예 스티커 무료 발송 신청이 완료되었습니다!`,
        'emerald'
      );
    },
    [showToast, user.sticker_serial_number]
  );

  const lookupGarageByPlate = useCallback(
    (plateQuery: string): Vehicle | null => {
      const normalized = plateQuery.replace(/\s+/g, '').trim();
      if (!normalized) return null;
      return (
        vehicles.find((v) => {
          const clean = v.license_plate.replace(/\s+/g, '');
          return clean.includes(normalized) || v.license_plate === plateQuery;
        }) || null
      );
    },
    [vehicles]
  );

  return (
    <PlateTalkContext.Provider
      value={{
        activeTab,
        setActiveTab,
        user,
        vehicles,
        activeVehicle,
        setActiveVehicleId,
        updateVerificationStatus,
        addSecondaryVehicle,
        scannedVehicles,
        selectedTargetPlate,
        setSelectedTargetPlate,
        isDrivingMode,
        isTtsSpeaking,
        activeHudIncomingMessage,
        dismissHudOverlayCard,
        toggleDrivingMode,
        drivingMessages,
        sendDrivingMessage,
        triggerSimulatedIncomingAlert,
        acknowledgeHelpfulMessage,
        restoreArchivedMessage,
        communityPosts,
        createCommunityPost,
        togglePostLike,
        addPostComment,
        giftCatalog: GIFT_CATALOG,
        giftTransactions,
        quickGiftModal,
        openQuickGiftModal,
        closeQuickGiftModal,
        sendGiftByPlate,
        redeemReceivedGift,
        claimHonorSticker,
        addHonorPoints,
        lookupGarageByPlate,
        toastBanner,
        showToast,
      }}
    >
      {children}
    </PlateTalkContext.Provider>
  );
}

export function usePlateTalk() {
  const ctx = useContext(PlateTalkContext);
  if (!ctx) {
    throw new Error('usePlateTalk must be used within a PlateTalkProvider');
  }
  return ctx;
}
