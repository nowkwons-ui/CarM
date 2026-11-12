export type HonorTier = 'ROOKIE' | 'GUARDIAN' | 'MASTER' | 'HONOR_SOCIETY';

export type StickerClaimStatus =
  | 'LOCKED'
  | 'ELIGIBLE'
  | 'REQUESTED'
  | 'SHIPPED'
  | 'DELIVERED';

export type VerificationStatus =
  | 'UNVERIFIED'
  | 'PENDING'
  | 'VERIFIED'
  | 'REJECTED';

export type OwnershipRole =
  | 'PRIMARY_OWNER'
  | 'CO_DRIVER'
  | 'CORPORATE_LEASE';

export type DrivingMessageType =
  | 'DEFECT_ALERT'   // [1-1] 차량 이상 공유 (브레이크등, 타이어, 주유구, 트렁크)
  | 'OVERLOAD_WARN'  // [1-2] 화물/트럭 과적 및 낙하물 위험 고지 (5km 브로드캐스트)
  | 'COMPLIMENT'     // [1-3] 차량 칭찬
  | 'TUNING_ASK'     // [1-3] 튜닝/장착 정보 문의
  | 'YIELD_THANKS';  // [1-5] 양보운전 감사

export type CommunityCategory =
  | 'MY_CAR_SHOW'
  | 'TUNING_INFO'
  | 'ROAD_ISSUE';

export type PaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'REDEEMED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface UserProfile {
  id: string;
  auth_provider: 'KAKAO' | 'GOOGLE' | 'APPLE';
  email: string;
  phone: string;
  real_name: string;
  phone_verified: boolean;
  nickname: string;
  honor_points: number;
  honor_tier: HonorTier;
  sticker_claim_status: StickerClaimStatus;
  sticker_serial_number: string;
  sticker_shipping_address?: {
    recipientName: string;
    phone: string;
    postalCode: string;
    addressLine1: string;
    addressLine2: string;
    requestedAt: string;
  };
  default_payment_method: 'KAKAOPAY' | 'TOSSPAY' | 'NAVERPAY' | 'HYUNDAI_CARD';
  created_at: string;
}

export interface TuningSpecs {
  wheels?: string;
  tires?: string;
  suspension?: string;
  roofBox?: string;
  exhaust?: string;
  exteriorWrap?: string;
  dashcamModel?: string;
}

export interface CarWashLog {
  id: string;
  date: string;
  location: string;
  workSummary: string;
  coatType: string;
}

export interface Vehicle {
  id: string;
  user_id: string;
  license_plate: string; // 고유 ID (예: "12라 3466")
  vin: string;           // 17자리 차대번호
  registered_owner_name: string;
  ownership_role: OwnershipRole;
  primary_owner_consent_phone?: string;
  brand: string;
  model: string;
  model_year: number;
  color: string;
  tuning_specs: TuningSpecs;
  garage_bio: string;
  car_wash_logs: CarWashLog[];
  verification_status: VerificationStatus;
  ocr_confidence_score: number;
  plate_photo_url: string;
  registration_doc_url: string;
  is_primary: boolean;
  owner_nickname?: string;
  owner_honor_tier?: HonorTier;
}

export interface ScannedBufferVehicle {
  id: string;
  license_plate: string;
  brand: string;
  model: string;
  color: string;
  vehicleType: 'SEDAN' | 'SUV' | 'CARGO_TRUCK' | 'SPORTS';
  lane: 'LEFT' | 'CENTER' | 'RIGHT';
  distanceMeters: number;
  ocrConfidence: number;
  detectedAt: string; // ISO string (최근 3분 버퍼 유지)
  bbox: {
    topPercent: number;
    leftPercent: number;
    widthPercent: number;
    heightPercent: number;
  };
  suspectedIssue?: string;
  tuningHighlight?: string;
}

export interface DrivingMessage {
  id: string;
  sender_vehicle_id: string;
  sender_plate_snapshot: string;
  sender_vehicle_summary: string;
  receiver_plate: string;
  message_type: DrivingMessageType;
  raw_voice_transcript?: string;
  content: string;
  ai_sanitized: boolean;
  voice_url?: string;
  location_lat: number;
  location_lng: number;
  location_name: string;
  broadcast_radius_km: number;
  helpful_acknowledged: boolean;
  honor_points_awarded: number;
  is_read: boolean;
  is_dismissed: boolean; // 주행 종료 시 자동 말소 여부
  direction: 'INCOMING' | 'OUTGOING' | 'BROADCAST';
  created_at: string;
}

export interface CommunityPost {
  id: string;
  vehicle_id: string;
  license_plate: string;
  masked_plate_display: string;
  owner_nickname: string;
  owner_honor_tier: HonorTier;
  vehicle_summary: string;
  verified_owner_badge: boolean;
  category: CommunityCategory;
  title: string;
  content: string;
  image_urls: string[];
  tuning_tags: string[];
  likes_count: number;
  comments_count: number;
  liked_by_me?: boolean;
  comments: {
    id: string;
    author_nickname: string;
    author_plate_masked: string;
    content: string;
    created_at: string;
  }[];
  created_at: string;
}

export interface GiftItem {
  id: string;
  name: string;
  brand: string;
  category: 'FUEL' | 'CAR_WASH' | 'COFFEE' | 'ENERGY' | 'AIR_FRESHENER';
  price: number;
  description: string;
  badgeText: string;
}

export interface GiftTransaction {
  id: string;
  sender_user_id: string;
  sender_plate: string;
  receiver_plate: string;
  item_id: string;
  item_name: string;
  item_brand: string;
  item_category: GiftItem['category'];
  item_price: number;
  message_id?: string;
  thank_you_note: string;
  payment_status: PaymentStatus;
  coupon_code: string;
  direction: 'RECEIVED' | 'SENT';
  redeemed_at?: string;
  created_at: string;
}
