-- ============================================================================
-- PlateTalk (플레이트톡) - 차량 번호판 기반 실시간 운전자 소통 및 명예 커뮤니티 플랫폼
-- Database Schema Migration (Supabase / PostgreSQL)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- [REVIEW] postgis는 사용처가 없어 제거 (5km 브로드캐스트를 geography로 구현할 때 다시 추가)

-- ============================================================================
-- 1. ENUM Types
-- ============================================================================

-- 명예 등급 (Honor Tier)
CREATE TYPE honor_tier_enum AS ENUM (
  'ROOKIE',           -- 루키 드라이버 (0 ~ 299 pts)
  'GUARDIAN',         -- 세이프티 가디언 (300 ~ 999 pts)
  'MASTER',           -- 로드 마스터 (1000 ~ 2999 pts)
  'HONOR_SOCIETY'     -- 아너 소사이어티 (3000+ pts, 상위 1%)
);

-- 실물 명예 스티커(엠블럼) 신청 및 배송 상태
CREATE TYPE sticker_claim_status_enum AS ENUM (
  'LOCKED',           -- 등급 미달 (신청 불가)
  'ELIGIBLE',         -- 신청 가능 (세이프티 가디언 이상 달성)
  'REQUESTED',        -- 배송 신청 완료 (시리얼 각인 중)
  'SHIPPED',          -- 발송 완료
  'DELIVERED'         -- 배송 완료 및 차량 부착 인증 대기
);

-- 차량 소유주 인증 상태 (3단계 인증 파이프라인)
CREATE TYPE verification_status_enum AS ENUM (
  'UNVERIFIED',       -- 미인증 (읽기/눈팅 전용)
  'PENDING',          -- OCR 교차 검증 및 심사중
  'VERIFIED',         -- 인증 완료 (모든 기능 해금)
  'REJECTED'          -- 반려 (번호판-등록증 불일치 또는 판독 불가)
);

-- 차량 운전자 권한 유형 (본인 소유 vs 가족/법인 공동 운전자)
CREATE TYPE ownership_role_enum AS ENUM (
  'PRIMARY_OWNER',    -- 자동차등록증 상 본 소유주
  'CO_DRIVER',        -- 가족/배우자 공동 운전자 (소유주 승인 완료)
  'CORPORATE_LEASE'   -- 법인/리스/장기렌트 실운전자
);

-- 주행 중 실시간 소통 메시지 유형
CREATE TYPE driving_message_type_enum AS ENUM (
  'DEFECT_ALERT',     -- [1-1] 차량 이상 공유 (브레이크등 고장, 주유구 열림, 타이어 공기압 등)
  'OVERLOAD_WARN',    -- [1-2] 화물/트럭 과적 및 낙하물 위험 고지 (반경 5km 브로드캐스트 연동)
  'COMPLIMENT',       -- [1-3] 차량 칭찬 (드레스업, 색상, 매너 운전 칭찬)
  'TUNING_ASK',       -- [1-3] 튜닝/장착 부품 정보 문의 (휠, 루프박스, 배기 등)
  'YIELD_THANKS'      -- [1-5] 끼어들기 양보 감사 인사
);

-- 커뮤니티 게시글 카테고리
CREATE TYPE community_category_enum AS ENUM (
  'MY_CAR_SHOW',      -- [1-4] 내 차 자랑 및 인증 쇼룸
  'TUNING_INFO',      -- [1-3/1-4] 튜닝 스펙 공유 및 Q&A
  'ROAD_ISSUE'        -- 실시간 도로 제보 및 안전 이슈
);

-- 인앱 기프트샵 결제 및 쿠폰 상태
CREATE TYPE payment_status_enum AS ENUM (
  'PENDING',
  'PAID',
  'REDEEMED',
  'CANCELLED',
  'REFUNDED'
);

-- ============================================================================
-- 2. Core Tables
-- ============================================================================

-- 2.1 users: 사용자 및 명예 포인트/스티커 상태 관리
CREATE TABLE public.users (
  -- [REVIEW] 기존 uuid_generate_v4() 기본값은 auth.uid()와 절대 일치하지 않아 RLS가 전부 실패했음
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  auth_provider VARCHAR(32) NOT NULL DEFAULT 'KAKAO', -- KAKAO, GOOGLE, APPLE
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(32) UNIQUE NOT NULL,
  real_name VARCHAR(100) NOT NULL,                    -- PASS 본인인증 실명 (등록증 교차검증용)
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,      -- 본인 명의 휴대폰 PASS/SMS 인증 여부
  nickname VARCHAR(60) UNIQUE NOT NULL,
  avatar_url TEXT,
  honor_points INTEGER NOT NULL DEFAULT 100 CHECK (honor_points >= 0),
  honor_tier honor_tier_enum NOT NULL DEFAULT 'ROOKIE',
  sticker_claim_status sticker_claim_status_enum NOT NULL DEFAULT 'LOCKED',
  sticker_serial_number VARCHAR(40) UNIQUE,           -- 예: PT-2026-KR-000842
  sticker_shipping_address JSONB,                     -- 수령자 주소 및 연락처 정보
  default_payment_method VARCHAR(64) DEFAULT 'KAKAOPAY',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.2 vehicles: 차량 번호판, 차대번호(VIN), OCR 검증 상태 및 내 차고(My Garage) 스펙
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- [REVIEW] 전역 UNIQUE 제거: 타인이 남의 번호판을 PENDING으로 선점(squatting)해 실소유주 등록을
  -- 막는 공격과, 공동운전자가 같은 차량을 등록하지 못하는 문제가 있었음.
  -- → VERIFIED 상태의 PRIMARY_OWNER에 대해서만 부분 유니크 인덱스로 강제 (아래 인덱스 참고)
  license_plate VARCHAR(24) NOT NULL,                 -- 예: '123가 4568', 공백 제거 정규화 후 저장
  vin VARCHAR(32) NOT NULL,                           -- 차대번호 17자리 (예: KMHL341CBNP012345)
  registered_owner_name VARCHAR(100) NOT NULL,        -- 등록증에서 OCR 추출된 소유주 성명
  ownership_role ownership_role_enum NOT NULL DEFAULT 'PRIMARY_OWNER',
  primary_owner_consent_phone VARCHAR(32),            -- 공동 운전자 등록 시 본 소유주 승인 번호
  brand VARCHAR(64) NOT NULL,                         -- 현대, 기아, 제네시스, BMW, 포르쉐 등
  model VARCHAR(100) NOT NULL,                        -- 쏘나타 디 엣지, GV80, 911 Carrera 등
  model_year INTEGER DEFAULT 2025,
  color VARCHAR(40) NOT NULL,                         -- 글레시어 화이트, 우유니 화이트, 매트 블랙 등
  tuning_specs JSONB NOT NULL DEFAULT '{}'::jsonb,    -- 휠, 타이어, 서스펜션, 루프박스, 랩핑, 배기 등 상세 스펙
  garage_bio TEXT,                                    -- 내 차고 한줄 소개
  car_wash_logs JSONB NOT NULL DEFAULT '[]'::jsonb,   -- 세차 일지 및 관리 히스토리
  verification_status verification_status_enum NOT NULL DEFAULT 'UNVERIFIED',
  ocr_confidence_score NUMERIC(5,2),                  -- OCR 교차검증 신뢰도 점수 (0.00 ~ 100.00)
  plate_photo_url TEXT,                               -- 차량 전면/후면 번호판 노출 사진 URL
  registration_doc_url TEXT,                          -- 자동차등록증 또는 리스/렌트 계약서 URL
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vehicles_license_plate ON public.vehicles(license_plate);
CREATE INDEX idx_vehicles_user_id ON public.vehicles(user_id);
CREATE INDEX idx_vehicles_verification_status ON public.vehicles(verification_status);

-- 2.3 driving_messages: 주행 중 실시간 음성/원터치 소통 및 브로드캐스트 메시지
CREATE TABLE public.driving_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  sender_plate_snapshot VARCHAR(24) NOT NULL,         -- 발신 차량 번호판 스냅샷
  sender_Vehicle_summary VARCHAR(100),                -- 예: '뒤따르는 어비스 블랙 아이오닉 6'
  receiver_plate VARCHAR(24) NOT NULL,                -- 미가입 차량에게도 발송 후 추후 가입 시 열람 가능
  message_type driving_message_type_enum NOT NULL,
  raw_voice_transcript TEXT,                          -- 운전자 원문 발화 (STT)
  content TEXT NOT NULL,                              -- AI 안전 필터링 및 정중하게 정제된 최종 메시지
  ai_sanitized BOOLEAN NOT NULL DEFAULT TRUE,         -- AI 욕설/공격성 문맥 순화 적용 여부
  voice_url TEXT,                                     -- TTS 또는 정제 음성 브리핑 오디오 URL
  location_lat DOUBLE PRECISION NOT NULL,
  location_lng DOUBLE PRECISION NOT NULL,
  broadcast_radius_km NUMERIC(4,1) DEFAULT 0,         -- OVERLOAD_WARN일 경우 반경 5.0km 브로드캐스트
  helpful_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,-- 수신자가 '도움 됐어요(감사 표시)' 클릭 여부
  honor_points_awarded INTEGER NOT NULL DEFAULT 0,    -- 이 메시지로 적립된 명예 포인트
  is_read BOOLEAN NOT NULL DEFAULT FALSE,             -- 주행 중 TTS 브리핑 완료 여부
  is_dismissed BOOLEAN NOT NULL DEFAULT FALSE,        -- 시동 종료/주행 해제 후 알림 센터 자동 말소 여부
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_driving_messages_receiver_plate ON public.driving_messages(receiver_plate);
CREATE INDEX idx_driving_messages_sender_vehicle ON public.driving_messages(sender_vehicle_id);
CREATE INDEX idx_driving_messages_type_created ON public.driving_messages(message_type, created_at DESC);
CREATE INDEX idx_driving_messages_active ON public.driving_messages(receiver_plate, is_dismissed, created_at DESC);

-- 2.4 community_posts: 내 차 자랑 쇼룸, 튜닝 Q&A, 실시간 도로 이슈 피드
CREATE TABLE public.community_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  category community_category_enum NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  masked_plate_display VARCHAR(24) NOT NULL,          -- 앞자리 마스킹 표시 (예: '***가 4568')
  verified_owner_badge BOOLEAN NOT NULL DEFAULT TRUE, -- 인증된 오너(Verified Owner) 배지 표시
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  tuning_tags TEXT[] NOT NULL DEFAULT '{}',           -- 예: ARRAY['BBS 19인치', '툴레 루프박스', '에어서스']
  likes_count INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  comments_count INTEGER NOT NULL DEFAULT 0 CHECK (comments_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_community_posts_category ON public.community_posts(category, created_at DESC);
CREATE INDEX idx_community_posts_vehicle_id ON public.community_posts(vehicle_id);

-- 2.5 gift_transactions: 번호판 기반 인앱 기프트샵 선물 거래 내역
CREATE TABLE public.gift_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_plate VARCHAR(24) NOT NULL,                -- 전화번호/실명 없이 차량 번호판만으로 선물 발송
  item_id VARCHAR(64) NOT NULL,                       -- 예: 'GIFT_FUEL_10000', 'GIFT_COFFEE_ICE', 'GIFT_WASH_PREMIUM'
  item_name VARCHAR(120) NOT NULL,
  item_category VARCHAR(40) NOT NULL,                 -- FUEL, COFFEE, CAR_WASH, AIR_FRESHENER
  item_price INTEGER NOT NULL CHECK (item_price > 0),
  message_id UUID REFERENCES public.driving_messages(id) ON DELETE SET NULL, -- 답례 대상 메시지 연결
  thank_you_note TEXT,
  -- [REVIEW] 기본값이 'PAID'라 결제 검증 없이 INSERT만으로 쿠폰이 발급되는 구조였음.
  -- PG 웹훅(서버, service_role)이 결제 확인 후 PAID 전환 + coupon_code 발급하도록 변경
  payment_status payment_status_enum NOT NULL DEFAULT 'PENDING',
  coupon_code VARCHAR(64) UNIQUE,                     -- 바코드/핀번호 (결제 확정 후 서버에서 발급)
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gift_transactions_receiver_plate ON public.gift_transactions(receiver_plate, created_at DESC);
CREATE INDEX idx_gift_transactions_sender_user ON public.gift_transactions(sender_user_id);

-- ============================================================================
-- 3. Business Logic Functions & Triggers
-- ============================================================================

-- 3.1 명예 포인트 변동 시 자동으로 등급(Honor Tier)과 스티커 신청 자격(Sticker Claim Status) 갱신
CREATE OR REPLACE FUNCTION public.sync_user_honor_tier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.honor_points >= 3000 THEN
    NEW.honor_tier := 'HONOR_SOCIETY';
  ELSIF NEW.honor_points >= 1000 THEN
    NEW.honor_tier := 'MASTER';
  ELSIF NEW.honor_points >= 300 THEN
    NEW.honor_tier := 'GUARDIAN';
  ELSE
    NEW.honor_tier := 'ROOKIE';
  END IF;

  -- 세이프티 가디언(300점) 이상 달성 시 LOCKED 상태면 ELIGIBLE로 자동 해금
  IF NEW.honor_points >= 300 AND OLD.sticker_claim_status = 'LOCKED' THEN
    NEW.sticker_claim_status := 'ELIGIBLE';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_user_honor_tier
BEFORE UPDATE OF honor_points ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_honor_tier();

-- 3.2 주행 종료(드라이빙 모드 해제) 시 읽은 메시지 자동 말소(Auto-Archiving) RPC 함수
-- [REVIEW] SECURITY DEFINER가 RLS를 우회하는데 target_plate 소유 검증이 없어
-- 누구나 임의 번호판의 알림을 말소할 수 있었음. 호출자 소유 VERIFIED 차량으로 제한하고
-- search_path 하이재킹 방지를 위해 search_path를 고정.
CREATE OR REPLACE FUNCTION public.dismiss_read_driving_messages(target_plate VARCHAR)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.license_plate = target_plate
      AND v.user_id = auth.uid()
      AND v.verification_status = 'VERIFIED'
  ) THEN
    RAISE EXCEPTION 'not the verified owner of plate %', target_plate
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.driving_messages
  SET is_dismissed = TRUE
  WHERE receiver_plate = target_plate
    AND is_read = TRUE
    AND is_dismissed = FALSE;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_read_driving_messages(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_read_driving_messages(VARCHAR) TO authenticated;

-- 3.3 메시지 INSERT 서버측 정합성 강제
-- [REVIEW] 클라이언트가 sender_plate_snapshot 위조, honor_points_awarded / helpful_acknowledged
-- 자가 설정(포인트 셀프 파밍), 자기 자신에게 발송, 동일 대상 스팸이 모두 가능했음.
CREATE OR REPLACE FUNCTION public.guard_driving_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  sender_plate VARCHAR;
BEGIN
  SELECT v.license_plate INTO sender_plate
  FROM public.vehicles v WHERE v.id = NEW.sender_vehicle_id;

  NEW.sender_plate_snapshot := sender_plate;           -- 발신 번호판은 서버가 결정
  NEW.helpful_acknowledged := FALSE;                   -- 수신자만 변경 가능
  NEW.honor_points_awarded := 0;                       -- 포인트는 수신자 감사 시 서버가 지급
  NEW.is_read := FALSE;
  NEW.is_dismissed := FALSE;
  NEW.broadcast_radius_km := CASE WHEN NEW.message_type = 'OVERLOAD_WARN' THEN 5.0 ELSE 0 END;
  NEW.created_at := NOW();

  IF NEW.receiver_plate = sender_plate THEN
    RAISE EXCEPTION 'cannot send a message to your own vehicle' USING ERRCODE = '22023';
  END IF;

  -- 동일 대상 60초 쿨다운 (보복성 연속 발송/스팸 방지)
  IF EXISTS (
    SELECT 1 FROM public.driving_messages m
    WHERE m.sender_vehicle_id = NEW.sender_vehicle_id
      AND m.receiver_plate = NEW.receiver_plate
      AND m.created_at > NOW() - INTERVAL '60 seconds'
  ) THEN
    RAISE EXCEPTION 'rate limited: wait before messaging this vehicle again' USING ERRCODE = '54000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_driving_message_insert
BEFORE INSERT ON public.driving_messages
FOR EACH ROW
EXECUTE FUNCTION public.guard_driving_message_insert();

-- ============================================================================
-- 4. Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driving_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_transactions ENABLE ROW LEVEL SECURITY;

-- 누구나 인증 쇼룸 및 커뮤니티 게시글 열람 가능 (미인증 가입자 눈팅 허용)
CREATE POLICY "Allow public read on community_posts"
  ON public.community_posts FOR SELECT
  USING (true);

-- VERIFIED 차량 소유주만 커뮤니티 게시글 작성 가능
CREATE POLICY "Allow verified owners to insert community_posts"
  ON public.community_posts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = community_posts.vehicle_id
        AND v.user_id = auth.uid()
        AND v.verification_status = 'VERIFIED'
    )
  );

-- VERIFIED 차량 소유주만 주행 메시지 발송 가능
CREATE POLICY "Allow verified owners to send driving_messages"
  ON public.driving_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = driving_messages.sender_vehicle_id
        AND v.user_id = auth.uid()
        AND v.verification_status = 'VERIFIED'
    )
  );

-- ============================================================================
-- 5. [REVIEW] 누락됐던 RLS 정책 & 컬럼 권한
-- RLS를 켜놓고 SELECT/UPDATE 정책이 없어 본인 프로필·수신 메시지·선물함 조회가 전부 막혀 있었고,
-- 반대로 UPDATE를 열 경우 사용자가 honor_points / verification_status 를 직접 조작할 수 있었음.
-- ============================================================================

-- 5.1 users: 본인 행만 조회/수정. 포인트·등급·스티커 상태는 서버(service_role)만 변경
CREATE POLICY "Users read own profile"
  ON public.users FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users update own profile"
  ON public.users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

REVOKE UPDATE ON public.users FROM authenticated, anon;
GRANT UPDATE (nickname, avatar_url, default_payment_method, sticker_shipping_address)
  ON public.users TO authenticated;

-- 5.2 vehicles: 본인 차량 CRUD. 인증 상태/OCR 점수는 OCR 검증 서버만 변경 가능
CREATE POLICY "Owners read own vehicles"
  ON public.vehicles FOR SELECT
  USING (user_id = auth.uid());

-- 신규 등록은 반드시 미인증 상태로만 (VERIFIED는 OCR 검증 서버만 부여)
CREATE POLICY "Insert own vehicle as unverified"
  ON public.vehicles FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND verification_status IN ('UNVERIFIED', 'PENDING')
  );

CREATE POLICY "Owners update own vehicles"
  ON public.vehicles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE UPDATE ON public.vehicles FROM authenticated, anon;
GRANT UPDATE (brand, model, model_year, color, tuning_specs, garage_bio, car_wash_logs,
              is_primary, plate_photo_url, registration_doc_url)
  ON public.vehicles TO authenticated;

-- 공개 차고(쇼룸) 뷰: VIN·소유주 실명·등록증 URL을 노출하지 않음
CREATE OR REPLACE VIEW public.public_garages
WITH (security_invoker = false) AS
SELECT
  v.id,
  regexp_replace(v.license_plate, '^\d{2,3}', '***') AS masked_plate,
  v.license_plate,                                   -- 정확 일치 검색용 (부분검색 API 제공 금지)
  v.brand, v.model, v.model_year, v.color,
  v.tuning_specs, v.garage_bio, v.car_wash_logs, v.plate_photo_url,
  u.nickname AS owner_nickname,
  u.honor_tier AS owner_honor_tier
FROM public.vehicles v
JOIN public.users u ON u.id = v.user_id
WHERE v.verification_status = 'VERIFIED';

GRANT SELECT ON public.public_garages TO anon, authenticated;

-- 5.3 driving_messages: 수신 번호판의 VERIFIED 소유주 + 발신자만 조회
CREATE POLICY "Receivers read messages to their verified plates"
  ON public.driving_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.license_plate = driving_messages.receiver_plate
        AND v.user_id = auth.uid()
        AND v.verification_status = 'VERIFIED'
    )
  );

CREATE POLICY "Senders read own sent messages"
  ON public.driving_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = driving_messages.sender_vehicle_id
        AND v.user_id = auth.uid()
    )
  );

CREATE POLICY "Receivers update read/ack state"
  ON public.driving_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.license_plate = driving_messages.receiver_plate
        AND v.user_id = auth.uid()
        AND v.verification_status = 'VERIFIED'
    )
  );

REVOKE UPDATE ON public.driving_messages FROM authenticated, anon;
GRANT UPDATE (is_read, is_dismissed, helpful_acknowledged)
  ON public.driving_messages TO authenticated;

-- 5.4 gift_transactions: 보낸 사람 / 받는 번호판 VERIFIED 소유주만 조회.
-- INSERT는 PENDING 상태로만 가능, PAID 전환·쿠폰 발급은 결제 서버(service_role) 전용
CREATE POLICY "Senders and receivers read gifts"
  ON public.gift_transactions FOR SELECT
  USING (
    sender_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.license_plate = gift_transactions.receiver_plate
        AND v.user_id = auth.uid()
        AND v.verification_status = 'VERIFIED'
    )
  );

CREATE POLICY "Senders create pending gifts"
  ON public.gift_transactions FOR INSERT
  WITH CHECK (
    sender_user_id = auth.uid()
    AND payment_status = 'PENDING'
    AND coupon_code IS NULL
  );

REVOKE UPDATE ON public.gift_transactions FROM authenticated, anon;
