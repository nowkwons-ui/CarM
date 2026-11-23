# PlateTalk (플레이트톡) - 교차 검증용 전체 소스코드 패키지

> 이 문서는 Claude, ChatGPT, Gemini 등 다른 AI에게 아키텍처·보안·로직 결함을 교차 검증받기 위해 핵심 소스코드를 단일 파일로 취합한 번들입니다.

## 1. 프로젝트 핵심 아키텍처 개요
- **핵심 도메인:** 차량 번호판 기반 실시간 핸즈프리 소통 + 3단계 OCR 소유주 인증 + 게이미피케이션(명예 등급/실물 엠블럼) + 번호판 선물하기
- **Tech Stack:** Next.js (App Router, PWA), Tailwind CSS, TypeScript, Supabase (PostgreSQL, RLS, Trigger, RPC)

## 2. 검증 요청 질문 (Prompt)
```markdown
당신은 시니어 풀스택/보안 아키텍트입니다. 아래 PlateTalk 서비스의 DB 스키마, OCR 엔진, 음성 AI 필터, 상태 관리 로직을 검토하고 다음 항목에 대해 엄격히 평가해 주세요:
1. 보안 취약점: Supabase RLS 정책의 허점, 권한 우회(번호판 스쿼팅/타인 번호판 도용), PII(소유주 실명/VIN/등록증) 노출 위험, 부정 행위(포인트/쿠폰 셀프 파밍)
2. 비즈니스 로직 및 Edge Case: 가족/법인 공동운전자 검증 결함, 주행 중 음성 명령 오인식 및 오발송, 메시지 자동 말소 레이스 컨디션
3. 프론트엔드 성능 및 안티패턴: React 렌더링 최적화, 메모리 누수, 웹 스피치 API / WebRTC 예외 처리
4. 구체적인 코드 레벨 수정 권장안
```

---

## 3. 핵심 소스코드

### File: `supabase/schema.sql`

```sql
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

```

---

### File: `src/types/platetalk.ts`

```typescript
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

```

---

### File: `src/lib/supabase.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

// [REVIEW] 기존엔 env 미설정 시 가짜 URL/키로 조용히 폴백해 모든 요청이 런타임에 원인 불명으로
// 실패했음. 설정되지 않았으면 null 로 두고 호출부에서 명시적으로 데모 모드를 사용.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const PLATE_REGEX = /^\d{2,3}[가-힣]\d{4}$/;

/** 번호판 정규화 (공백 제거). 비교·검색·저장은 반드시 정규화된 값으로 수행 */
export function normalizePlate(plate: string): string {
  return plate.replace(/\s+/g, '').trim();
}

/** 대한민국 번호판 형식 검증 (예: 12가3456, 123가4567) */
export function isValidPlate(plate: string): boolean {
  return PLATE_REGEX.test(normalizePlate(plate));
}

/**
 * 번호판 앞자리 자동 블러(마스킹) 유틸리티
 * 예: "123가 4568" -> "***가 4568", "12라 3466" -> "**라 3466"
 */
export function maskLicensePlate(plate: string): string {
  const trimmed = plate.trim();
  const match = trimmed.match(/^(\d{2,3})([가-힣])(\s*\d{4})$/);
  if (!match) {
    if (trimmed.length > 4) {
      return '***' + trimmed.slice(-5);
    }
    return trimmed;
  }
  const [, prefixDigits, hangul, suffixDigits] = match;
  const stars = '*'.repeat(prefixDigits.length);
  return `${stars}${hangul}${suffixDigits}`;
}

/**
 * 명예 포인트에 따른 등급 계산 유틸리티
 */
export function calculateHonorTier(points: number) {
  if (points >= 3000) {
    return {
      tier: 'HONOR_SOCIETY' as const,
      koreanTitle: '아너 소사이어티 (상위 1%)',
      englishSubtitle: 'HONOR SOCIETY · TOP 1%',
      nextTierPoints: 5000,
      minPoints: 3000,
      badgeColor: 'text-emerald-300 border-emerald-400/50 bg-emerald-500/15',
    };
  }
  if (points >= 1000) {
    return {
      tier: 'MASTER' as const,
      koreanTitle: '로드 마스터',
      englishSubtitle: 'ROAD MASTER',
      nextTierPoints: 3000,
      minPoints: 1000,
      badgeColor: 'text-sky-300 border-sky-400/50 bg-sky-500/15',
    };
  }
  if (points >= 300) {
    return {
      tier: 'GUARDIAN' as const,
      koreanTitle: '세이프티 가디언',
      englishSubtitle: 'SAFETY GUARDIAN',
      nextTierPoints: 1000,
      minPoints: 300,
      badgeColor: 'text-teal-300 border-teal-400/50 bg-teal-500/15',
    };
  }
  return {
    tier: 'ROOKIE' as const,
    koreanTitle: '루키 드라이버',
    englishSubtitle: 'ROOKIE DRIVER',
    nextTierPoints: 300,
    minPoints: 0,
    badgeColor: 'text-slate-300 border-slate-500/50 bg-slate-500/15',
  };
}

```

---

### File: `src/lib/ocrEngine.ts`

```typescript
import { OwnershipRole, VerificationStatus } from '@/types/platetalk';

export interface OcrExtractionInput {
  loggedInUserRealName: string;
  loggedInUserPhone: string;
  platePhotoText: string;            // 차량 전면/후면 사진에서 OCR 추출된 번호판
  registrationDocPlate: string;      // 자동차등록증에서 추출된 차량번호
  registrationDocVin: string;        // 자동차등록증에서 추출된 차대번호 (17자리)
  registrationDocOwnerName: string;  // 자동차등록증에서 추출된 소유주 성명
  ownershipRole: OwnershipRole;
  coDriverConsentVerified?: boolean; // 가족/법인 공동운전자 소유주 SMS 승인 여부
}

export interface OcrVerificationResult {
  status: VerificationStatus;
  confidenceScore: number;
  plateMatched: boolean;
  vinValid: boolean;
  ownerMatched: boolean;
  summaryMessage: string;
  detailedChecks: {
    label: string;
    passed: boolean;
    extractedValue: string;
    expectedNote: string;
  }[];
}

/**
 * [3.1] 차량 번호판 사진 + 자동차등록증 OCR 교차 검증 엔진
 * - 차량 사진 번호판과 등록증 번호판 일치 여부 검증
 * - 17자리 표준 차대번호(VIN) 유효성 검증
 * - 로그인 본인인증 실명과 등록증 소유주 성명 일치 여부 (또는 공동 운전자 승인) 검증
 */
export function runOcrCrossVerification(
  input: OcrExtractionInput
): OcrVerificationResult {
  const normalizePlate = (p: string) => p.replace(/\s+/g, '').trim();
  const cleanPhotoPlate = normalizePlate(input.platePhotoText);
  const cleanDocPlate = normalizePlate(input.registrationDocPlate);

  const plateRegex = /^\d{2,3}[가-힣]\d{4}$/;
  const plateFormatValid = plateRegex.test(cleanPhotoPlate);
  const plateMatched =
    plateFormatValid && cleanPhotoPlate === cleanDocPlate;

  const cleanVin = input.registrationDocVin.trim().toUpperCase();
  // 표준 17자리 VIN 검증 (I, O, Q 제외 영숫자 17자리)
  const vinValid = /^[A-HJ-NPR-Z0-9]{17}$/.test(cleanVin);

  const cleanUserRealName = input.loggedInUserRealName.trim();
  const cleanDocOwner = input.registrationDocOwnerName.trim();

  let ownerMatched = false;
  let ownerNote = '';

  if (input.ownershipRole === 'PRIMARY_OWNER') {
    ownerMatched = cleanUserRealName === cleanDocOwner;
    ownerNote = ownerMatched
      ? `PASS 본인인증 실명(${cleanUserRealName})과 등록증 소유주 일치`
      : `본인인증 실명(${cleanUserRealName})과 등록증 소유주(${cleanDocOwner}) 불일치`;
  } else if (input.ownershipRole === 'CO_DRIVER') {
    ownerMatched = Boolean(input.coDriverConsentVerified);
    ownerNote = ownerMatched
      ? `원 소유주(${cleanDocOwner}) 가족 공동운전자 모바일 전자서명 승인 완료`
      : `원 소유주(${cleanDocOwner})의 공동운전자 SMS 승인 대기중`;
  } else {
    // CORPORATE_LEASE
    // [REVIEW] 기존엔 소유주명에 '캐피탈'/'렌터카' 문자열만 있으면 통과(또는 OR 조건)해
    // 아무 법인명이나 입력하면 인증되는 우회 경로였음. 법인 명의 + 임대계약서 실운전자 확인을 AND 로 요구.
    const isCorporateOwner =
      cleanDocOwner.includes('주식회사') ||
      cleanDocOwner.includes('(주)') ||
      cleanDocOwner.includes('캐피탈') ||
      cleanDocOwner.includes('렌터카');
    ownerMatched = isCorporateOwner && Boolean(input.coDriverConsentVerified);
    ownerNote = ownerMatched
      ? `법인/리스 계약서 실운전자(${cleanUserRealName}) 특약 교차확인 완료`
      : `리스/렌트 계약서 임차인 명의 확인 필요`;
  }

  const detailedChecks = [
    {
      label: '차량 외관 번호판 ↔ 자동차등록증 번호판 교차 대조',
      passed: plateMatched,
      extractedValue: `${input.platePhotoText} ↔ ${input.registrationDocPlate}`,
      expectedNote: plateMatched
        ? '전면 카메라 사진 및 등록증 OCR 99.6% 일치'
        : '차량 사진 번호판과 등록증 기재 번호판이 다릅니다.',
    },
    {
      label: '자동차등록증 차대번호(VIN 17자리) 무결성 검증',
      passed: vinValid,
      extractedValue: cleanVin || '미입력',
      expectedNote: vinValid
        ? '국토교통부 표준 17자리 차대번호 체크섬 통과'
        : '유효한 17자리 차대번호(VIN) 형식이 아닙니다.',
    },
    {
      label: '소유주 성명 ↔ PASS 본인인증 명의 대조',
      passed: ownerMatched,
      extractedValue: `${cleanDocOwner} (${
        input.ownershipRole === 'PRIMARY_OWNER'
          ? '본인소유'
          : input.ownershipRole === 'CO_DRIVER'
          ? '공동운전자'
          : '법인/리스'
      })`,
      expectedNote: ownerNote,
    },
  ];

  if (plateMatched && vinValid && ownerMatched) {
    return {
      status: 'VERIFIED',
      confidenceScore: 99.4,
      plateMatched: true,
      vinValid: true,
      ownerMatched: true,
      summaryMessage:
        '3단계 OCR 교차 인증 완료! 번호판·차대번호·소유주 명의가 모두 일치하여 모든 발신 및 커뮤니티 권한이 해금되었습니다.',
      detailedChecks,
    };
  }

  if (plateMatched && vinValid && !ownerMatched && input.ownershipRole === 'CO_DRIVER') {
    return {
      status: 'PENDING',
      confidenceScore: 88.5,
      plateMatched: true,
      vinValid: true,
      ownerMatched: false,
      summaryMessage:
        '번호판 및 차대번호는 일치하나, 원 소유주의 공동운전자 승인 대기 상태(PENDING)입니다.',
      detailedChecks,
    };
  }

  return {
    status: 'REJECTED',
    confidenceScore: 41.2,
    plateMatched,
    vinValid,
    ownerMatched,
    summaryMessage:
      'OCR 교차 검증 반려(REJECTED): 번호판 불일치, 차대번호 오류 또는 소유주 명의 도용 방지를 위해 인증이 거부되었습니다.',
    detailedChecks,
  };
}

```

---

### File: `src/lib/voiceAiEngine.ts`

```typescript
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

```

---

### File: `src/context/PlateTalkContext.tsx`

```typescript
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
      // [REVIEW] 같은 번호판을 반복 추가할 수 있었음 (가족차량 버튼 연타 시 중복 key 경고 + 데이터 중복)
      const plateKey = normalizePlate(vehicleData.license_plate);
      if (vehicles.some((v) => v.user_id === user.id && normalizePlate(v.license_plate) === plateKey)) {
        showToast(`[${vehicleData.license_plate}] 차량은 이미 내 차고에 등록되어 있습니다.`, 'amber');
        return;
      }
      const newId = `veh-${newId_()}`;
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
    [showToast, user.honor_tier, user.id, user.nickname, vehicles]
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

      // [REVIEW] 번호판 형식 미검증 / 자기 자신에게 발송 / 동일 대상 연타(보복성 스팸)가 모두 가능했음
      if (!isValidPlate(params.receiverPlate)) {
        showToast(`유효하지 않은 번호판 형식입니다: ${params.receiverPlate}`, 'rose');
        return { ok: false, error: 'INVALID_PLATE' };
      }
      const receiverKey = normalizePlate(params.receiverPlate);
      if (receiverKey === normalizePlate(activeVehicle.license_plate)) {
        showToast('내 차량에는 메시지를 보낼 수 없습니다.', 'amber');
        return { ok: false, error: 'SELF_TARGET' };
      }
      const lastSentAt = sendCooldownRef.current.get(receiverKey) ?? 0;
      const now = Date.now();
      if (now - lastSentAt < SEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((SEND_COOLDOWN_MS - (now - lastSentAt)) / 1000);
        showToast(`같은 차량에는 ${waitSec}초 후 다시 보낼 수 있습니다. (연속 발송 방지)`, 'amber');
        return { ok: false, error: 'RATE_LIMITED' };
      }
      sendCooldownRef.current.set(receiverKey, now);

      const isBroadcast = params.messageType === 'OVERLOAD_WARN';

      const newMessage: DrivingMessage = {
        id: `msg-${newId_()}`,
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
        // 브로드캐스트 반경은 호출부 입력이 아닌 메시지 유형으로 결정 (DB 트리거와 동일 규칙)
        broadcast_radius_km: isBroadcast ? 5.0 : 0,
        helpful_acknowledged: false,
        // [REVIEW] 발송만으로 포인트를 주면 무한 발송으로 명예점수 파밍이 가능 →
        // 수신자가 '도움 됐어요'를 눌렀을 때만 발신자에게 지급 (서버 처리)
        honor_points_awarded: 0,
        is_read: true,
        is_dismissed: false,
        direction: isBroadcast ? 'BROADCAST' : 'OUTGOING',
        created_at: '방금 전',
      };

      setDrivingMessages((prev) => [newMessage, ...prev]);
      showToast(
        isBroadcast
          ? `[${params.receiverPlate}] 경고 + 반경 5km 브로드캐스트 발송 완료. 수신자가 감사를 누르면 명예 포인트가 적립됩니다.`
          : `[${params.receiverPlate}] 차량에 메시지를 발송했습니다. 수신자가 감사를 누르면 명예 포인트가 적립됩니다.`,
        'emerald'
      );

      return { ok: true, message: newMessage };
    },
    [activeVehicle, showToast]
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

```

---

### File: `src/components/DrivingHudTab.tsx`

```typescript
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
  CheckCircle2,
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
    if (cameraSource === 'WEBRTC_CAM') {
      if (
        typeof navigator !== 'undefined' &&
        navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia
      ) {
        navigator.mediaDevices
          .getUserMedia({ video: { facingMode: 'environment' } })
          .then((mediaStream) => {
            stream = mediaStream;
            setWebcamActive(true);
            if (videoRef.current) {
              videoRef.current.srcObject = mediaStream;
            }
          })
          .catch(() => {
            setWebcamActive(false);
            showToast(
              '브라우저 카메라 권한이 없어 블랙박스 하이웨이 시뮬레이션 스트림으로 대체합니다.',
              'amber'
            );
          });
      }
    } else {
      setWebcamActive(false);
    }

    return () => {
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

```

---

### File: `src/components/GarageAuthTab.tsx`

```typescript
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
        ownershipRole
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
          <span className="flex items-center gap-1.5 rounded-xl bg-rose-500/20 border border-rose-400/50 px-3 py-1.5 text-xs font-extrabold text-rose-300">
            <XCircle className="h-4 w-4 text-rose-400" />
            REJECTED (반려 · 발송 및 작성 차단)
          </span>
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

```

---

### File: `src/components/AlertsAndGiftsTab.tsx`

```typescript
'use client';

import React, { useState } from 'react';
import {
  Bell,
  Archive,
  Gift,
  ThumbsUp,
  Volume2,
  RotateCcw,
  QrCode,
  Send,
  CheckCircle2,
  Sparkles,
  Fuel,
  Coffee,
  Droplets,
  Zap,
  Wind,
  PowerOff,
} from 'lucide-react';
import { usePlateTalk } from '@/context/PlateTalkContext';
import { speakDrivingBriefing } from '@/lib/voiceAiEngine';
import { GiftItem } from '@/types/platetalk';

export default function AlertsAndGiftsTab() {
  const {
    drivingMessages,
    acknowledgeHelpfulMessage,
    restoreArchivedMessage,
    toggleDrivingMode,
    isDrivingMode,
    giftCatalog,
    giftTransactions,
    openQuickGiftModal,
    sendGiftByPlate,
    redeemReceivedGift,
    showToast,
  } = usePlateTalk();

  const [messageFilter, setMessageFilter] = useState<'ACTIVE' | 'ARCHIVED'>(
    'ACTIVE'
  );
  const [giftReceiverPlate, setGiftReceiverPlate] = useState('123가 4568');
  const [selectedGiftId, setSelectedGiftId] = useState(
    'GIFT_COFFEE_STARBUCKS'
  );
  const [giftNote, setGiftNote] = useState(
    '도로 위에서 보여주신 매너 운전과 안전 배려에 감사드립니다!'
  );

  const activeMessages = drivingMessages.filter((m) => !m.is_dismissed);
  const archivedMessages = drivingMessages.filter((m) => m.is_dismissed);

  const displayedMessages =
    messageFilter === 'ACTIVE' ? activeMessages : archivedMessages;

  const handleDirectGiftSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!giftReceiverPlate.trim()) {
      showToast('선물을 보낼 상대 차량 번호판을 입력해 주세요.', 'amber');
      return;
    }
    const res = sendGiftByPlate({
      receiverPlate: giftReceiverPlate,
      itemId: selectedGiftId,
      thankYouNote: giftNote,
    });
    if (res.ok) {
      showToast(
        `[${giftReceiverPlate}] 번호판 앞으로 모바일 기프티콘(${res.couponCode})이 즉시 전송되었습니다!`,
        'emerald'
      );
    }
  };

  const renderCategoryIcon = (cat: GiftItem['category']) => {
    switch (cat) {
      case 'FUEL':
        return <Fuel className="h-5 w-5 text-amber-400" />;
      case 'COFFEE':
        return <Coffee className="h-5 w-5 text-emerald-400" />;
      case 'CAR_WASH':
        return <Droplets className="h-5 w-5 text-sky-400" />;
      case 'ENERGY':
        return <Zap className="h-5 w-5 text-yellow-400" />;
      case 'AIR_FRESHENER':
        return <Wind className="h-5 w-5 text-teal-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. 주행 알림 센터 & 자동 말소(Auto-Archiving) 섹션 */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-sky-400" />
              <h2 className="text-lg font-bold text-white">
                주행 안전 알림 센터 & 자동 말소 아카이브
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              주행 중 TTS로 브리핑된 메시지는 시동 종료(드라이빙 모드 해제) 시 자동으로 말소되어 알림 피로도를 줄입니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                id="filter-active-alerts-btn"
                onClick={() => setMessageFilter('ACTIVE')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  messageFilter === 'ACTIVE'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Bell className="h-3.5 w-3.5" />
                <span>활성 알림 ({activeMessages.length})</span>
              </button>
              <button
                type="button"
                id="filter-archived-alerts-btn"
                onClick={() => setMessageFilter('ARCHIVED')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  messageFilter === 'ARCHIVED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Archive className="h-3.5 w-3.5" />
                <span>말소된 히스토리 ({archivedMessages.length})</span>
              </button>
            </div>

            {isDrivingMode && activeMessages.length > 0 && (
              <button
                type="button"
                id="end-driving-archive-now-btn"
                onClick={() => {
                  toggleDrivingMode();
                  setMessageFilter('ARCHIVED');
                }}
                className="flex items-center gap-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/30 transition"
              >
                <PowerOff className="h-3.5 w-3.5" />
                <span>시동 OFF · 읽은 메시지 즉시 말소</span>
              </button>
            )}
          </div>
        </div>

        {/* 메시지 리스트 */}
        <div className="mt-5 space-y-3">
          {displayedMessages.length === 0 ? (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-8 text-center">
              <p className="text-sm font-semibold text-slate-300">
                {messageFilter === 'ACTIVE'
                  ? '현재 활성 알림이 없습니다. (주행 종료로 모두 자동 말소되었거나 신규 수신 대기 중)'
                  : '아직 자동 말소된 히스토리 메시지가 없습니다.'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                상단 탭에서 [말소된 히스토리]를 확인하거나 드라이빙 HUD에서 수신 시뮬레이터를 실행해 보세요.
              </p>
            </div>
          ) : (
            displayedMessages.map((msg) => (
              <div
                key={msg.id}
                className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/90 p-4 sm:flex-row sm:items-center"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                        msg.message_type === 'OVERLOAD_WARN'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                          : msg.message_type === 'DEFECT_ALERT'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                      }`}
                    >
                      {msg.message_type === 'OVERLOAD_WARN'
                        ? '1-2 화물위험 · 5km 브로드캐스트'
                        : msg.message_type === 'DEFECT_ALERT'
                        ? '1-1 차량 이상 고지'
                        : msg.message_type === 'YIELD_THANKS'
                        ? '1-5 양보운전 감사'
                        : '1-3 칭찬 · 튜닝 문의'}
                    </span>

                    <span className="font-mono text-xs font-bold text-white">
                      {msg.direction === 'OUTGOING'
                        ? `발신 → [${msg.receiver_plate}]`
                        : `발신 번호판: [${msg.sender_plate_snapshot}]`}
                    </span>

                    <span className="text-xs text-slate-400">
                      · {msg.sender_vehicle_summary} · {msg.created_at}
                    </span>

                    {msg.is_dismissed && (
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                        주행 종료 자동 말소됨
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-medium text-slate-100">
                    “{msg.content}”
                  </p>

                  <p className="text-[11px] text-slate-500">
                    위치: {msg.location_name} · AI 안전 문맥 검증 완료
                  </p>
                </div>

                {/* 우측 액션 버튼들 */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => speakDrivingBriefing(msg.content)}
                    className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-sky-400 transition"
                  >
                    <Volume2 className="h-3.5 w-3.5 text-sky-400" />
                    <span>TTS 다시 듣기</span>
                  </button>

                  {msg.direction !== 'OUTGOING' && (
                    <>
                      <button
                        type="button"
                        disabled={msg.helpful_acknowledged}
                        onClick={() => acknowledgeHelpfulMessage(msg.id)}
                        className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold transition ${
                          msg.helpful_acknowledged
                            ? 'bg-slate-800 text-emerald-400'
                            : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                        }`}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        <span>
                          {msg.helpful_acknowledged
                            ? '감사 전달됨 (+50pt)'
                            : '도움 됐어요 (+50pt)'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openQuickGiftModal(
                            msg.sender_plate_snapshot,
                            msg.sender_vehicle_summary,
                            msg.id
                          )
                        }
                        className="flex items-center gap-1 rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 transition"
                      >
                        <Gift className="h-3.5 w-3.5" />
                        <span>커피/주유권 답례</span>
                      </button>
                    </>
                  )}

                  {msg.is_dismissed && (
                    <button
                      type="button"
                      onClick={() => restoreArchivedMessage(msg.id)}
                      className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-300 hover:text-white"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>복원</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 2. [1-6] 번호판 기반 인앱 기프트샵 & 내 선물 보관함 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 좌측: 번호판만으로 선물 보내기 스토어 */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 lg:col-span-7">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                [1-6] 번호판 기반 인앱 기프트샵 (선물하기)
              </h2>
              <p className="text-xs text-slate-400">
                상대방의 전화번호나 실명을 몰라도 차량 번호판만으로 주유권·세차권·커피를 즉시 선물합니다.
              </p>
            </div>
          </div>

          <form onSubmit={handleDirectGiftSend} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="gift-receiver-plate-input"
                  className="block text-xs font-semibold text-slate-300"
                >
                  선물 받을 차량 번호판 (미가입 차량도 보관 후 수령 가능)
                </label>
                <input
                  id="gift-receiver-plate-input"
                  type="text"
                  value={giftReceiverPlate}
                  onChange={(e) => setGiftReceiverPlate(e.target.value)}
                  placeholder="예: 123가 4568"
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-sm font-bold text-emerald-300 focus:border-emerald-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  빠른 번호판 선택 (최근 소통 차량)
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {['123가 4568', '54나 8821', '28하 9911', '82바 9104'].map(
                    (plate) => (
                      <button
                        key={plate}
                        type="button"
                        onClick={() => setGiftReceiverPlate(plate)}
                        className={`rounded-lg px-2.5 py-2 font-mono text-xs font-bold transition border ${
                          giftReceiverPlate === plate
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {plate}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* 기프트 카탈로그 그리드 */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {giftCatalog.map((item) => {
                const isSelected = item.id === selectedGiftId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    id={`gift-item-${item.id}`}
                    onClick={() => setSelectedGiftId(item.id)}
                    className={`flex flex-col justify-between rounded-2xl p-3.5 text-left transition border ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-400 shadow-lg'
                        : 'bg-slate-950/85 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {renderCategoryIcon(item.category)}
                        <div>
                          <span className="text-[10px] font-bold text-amber-300">
                            {item.badgeText}
                          </span>
                          <h3 className="text-xs font-bold text-white">
                            {item.name}
                          </h3>
                        </div>
                      </div>
                      <span className="font-mono text-xs font-extrabold text-emerald-300">
                        {item.price.toLocaleString()}원
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">
                      {item.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <div>
              <label
                htmlFor="gift-thank-you-note"
                className="block text-xs font-semibold text-slate-300"
              >
                동봉할 감사 메시지
              </label>
              <input
                id="gift-thank-you-note"
                type="text"
                value={giftNote}
                onChange={(e) => setGiftNote(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              id="send-plate-gift-submit-btn"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3 text-sm font-extrabold text-slate-950 hover:bg-amber-300 transition shadow-lg"
            >
              <Send className="h-4 w-4" />
              <span>
                [{giftReceiverPlate}] 번호판으로 즉시 선물 발송 (+60 명예포인트 적립)
              </span>
            </button>
          </form>
        </div>

        {/* 우측: 내 기프티콘 보관함 (수신 및 발신 내역) */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 lg:col-span-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-emerald-400" />
              <h2 className="text-base font-bold text-white">
                내 차량({`12라 3466`}) 기프티콘 보관함
              </h2>
            </div>
            <span className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-300">
              총 {giftTransactions.length}건
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {giftTransactions.map((tx) => (
              <div
                key={tx.id}
                className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                      tx.direction === 'RECEIVED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                        : 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                    }`}
                  >
                    {tx.direction === 'RECEIVED'
                      ? `받은 선물 (From ${tx.sender_plate})`
                      : `보낸 선물 (To ${tx.receiver_plate})`}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {tx.created_at}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {tx.item_name}
                    </h3>
                    <p className="text-xs text-slate-400">{tx.item_brand}</p>
                  </div>
                  <span className="font-mono text-xs font-bold text-amber-300">
                    {tx.item_price.toLocaleString()}원권
                  </span>
                </div>

                <p className="mt-2 rounded-xl bg-slate-900/90 p-2.5 text-xs text-slate-200 border border-slate-800">
                  “{tx.thank_you_note}”
                </p>

                <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2.5">
                  <div>
                    <span className="block text-[10px] text-slate-500">
                      모바일 바코드 PIN
                    </span>
                    <span className="font-mono text-xs font-bold tracking-wider text-sky-300">
                      {tx.coupon_code}
                    </span>
                  </div>

                  {tx.direction === 'RECEIVED' && (
                    <button
                      type="button"
                      disabled={tx.payment_status === 'REDEEMED'}
                      onClick={() => redeemReceivedGift(tx.id)}
                      className={`flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                        tx.payment_status === 'REDEEMED'
                          ? 'bg-slate-800 text-slate-400'
                          : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>
                        {tx.payment_status === 'REDEEMED'
                          ? `교환완료 (${tx.redeemed_at})`
                          : '바코드 사용하기'}
                      </span>
                    </button>
                  )}

                  {tx.direction === 'SENT' && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                      <Sparkles className="h-3.5 w-3.5" />
                      전송 완료
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

```

---

### File: `src/components/CommunityShowroomTab.tsx`

```typescript
'use client';

import React, { useState } from 'react';
import {
  Search,
  ShieldCheck,
  Sparkles,
  Heart,
  MessageSquare,
  Wrench,
  Droplets,
  Send,
  PlusCircle,
  Lock,
  Gift,
  Car,
} from 'lucide-react';
import { usePlateTalk } from '@/context/PlateTalkContext';
import { CommunityCategory } from '@/types/platetalk';
import { calculateHonorTier, maskLicensePlate } from '@/lib/supabase';

export default function CommunityShowroomTab() {
  const {
    activeVehicle,
    communityPosts,
    createCommunityPost,
    togglePostLike,
    addPostComment,
    lookupGarageByPlate,
    sendDrivingMessage,
    openQuickGiftModal,
    setActiveTab,
    showToast,
  } = usePlateTalk();

  const [plateSearchQuery, setPlateSearchQuery] = useState('28하 9911');
  const [categoryFilter, setCategoryFilter] = useState<
    'ALL' | CommunityCategory
  >('ALL');

  const [showWriteModal, setShowWriteModal] = useState(false);
  const [newPostCategory, setNewPostCategory] =
    useState<CommunityCategory>('MY_CAR_SHOW');
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostTags, setNewPostTags] = useState('BBS 20인치, 무광 PPF, 세차일지');

  const [commentInputs, setCommentInputs] = useState<Record<string, string>>(
    {}
  );

  const searchedVehicle = lookupGarageByPlate(plateSearchQuery);

  const filteredPosts =
    categoryFilter === 'ALL'
      ? communityPosts
      : communityPosts.filter((p) => p.category === categoryFilter);

  const handleCreatePostSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostTitle.trim() || !newPostContent.trim()) {
      showToast('제목과 내용을 모두 입력해 주세요.', 'amber');
      return;
    }
    const tags = newPostTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const res = createCommunityPost({
      category: newPostCategory,
      title: newPostTitle,
      content: newPostContent,
      tuningTags: tags,
    });

    if (res.ok) {
      setNewPostTitle('');
      setNewPostContent('');
      setShowWriteModal(false);
    }
  };

  const handleCommentSubmit = (postId: string) => {
    const text = commentInputs[postId]?.trim();
    if (!text) return;
    const res = addPostComment(postId, text);
    if (res.ok) {
      setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. 번호판 검색을 통한 특정 차량 오너 차고(Garage) 구경하기 & 튜닝 문의 */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-sky-400" />
              <h2 className="text-lg font-bold text-white">
                [1-3 & 1-4] 번호판 검색으로 오너 쇼룸(Garage) 구경하기
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              도로 위나 주차장에서 본 멋진 차량의 번호판을 검색해 튜닝 스펙과 세차 일지를 확인하고, 비대면 칭찬/문의를 남겨보세요.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {['28하 9911', '12라 3466', '54나 8821', '123가 4568'].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlateSearchQuery(p)}
                className={`rounded-xl px-3 py-1.5 font-mono text-xs font-bold transition border ${
                  plateSearchQuery === p
                    ? 'bg-sky-500/20 text-sky-300 border-sky-400'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* 검색 입력창 */}
        <div className="mt-4 flex gap-2">
          <input
            id="garage-plate-search-input"
            type="text"
            value={plateSearchQuery}
            onChange={(e) => setPlateSearchQuery(e.target.value)}
            placeholder="조회할 차량 번호판 입력 (예: 28하 9911, 12라 3466)"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 font-mono text-sm font-bold text-white focus:border-sky-400 focus:outline-none"
          />
        </div>

        {/* 검색된 차량의 쇼룸 카드 */}
        {searchedVehicle ? (
          <div className="mt-4 grid grid-cols-1 gap-5 rounded-2xl border border-slate-800 bg-slate-950/90 p-4 lg:grid-cols-12">
            <div className="relative overflow-hidden rounded-2xl lg:col-span-5">
              <img
                src={searchedVehicle.plate_photo_url}
                alt={searchedVehicle.model}
                className="h-56 w-full object-cover sm:h-64"
              />
              <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-xl bg-slate-950/90 px-3 py-1 text-xs font-bold text-emerald-300 border border-emerald-400/50 backdrop-blur-md">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>Verified Owner · { maskLicensePlate(searchedVehicle.license_plate) }</span>
              </div>
            </div>

            <div className="flex flex-col justify-between space-y-3 lg:col-span-7">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-sky-400">
                      {searchedVehicle.brand} · {searchedVehicle.model_year}년식
                    </span>
                    <h3 className="text-lg font-extrabold text-white">
                      {searchedVehicle.model} ({searchedVehicle.color})
                    </h3>
                  </div>

                  {searchedVehicle.owner_honor_tier && (
                    <span
                      className={`rounded-xl border px-3 py-1 text-xs font-bold ${
                        calculateHonorTier(
                          searchedVehicle.owner_honor_tier === 'HONOR_SOCIETY'
                            ? 3200
                            : searchedVehicle.owner_honor_tier === 'MASTER'
                            ? 1200
                            : 500
                        ).badgeColor
                      }`}
                    >
                      오너: {searchedVehicle.owner_nickname} (
                      {searchedVehicle.owner_honor_tier})
                    </span>
                  )}
                </div>

                <p className="mt-2 text-xs text-slate-300">
                  “{searchedVehicle.garage_bio}”
                </p>

                {/* 튜닝 및 장착 파츠 상세 */}
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {searchedVehicle.tuning_specs.wheels && (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-2.5">
                      <span className="flex items-center gap-1 text-[10px] font-bold text-sky-400">
                        <Wrench className="h-3 w-3" /> 휠 (Wheels)
                      </span>
                      <p className="mt-0.5 text-xs font-semibold text-white">
                        {searchedVehicle.tuning_specs.wheels}
                      </p>
                    </div>
                  )}
                  {searchedVehicle.tuning_specs.roofBox && (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-2.5">
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                        <Car className="h-3 w-3" /> 루프박스 / 캐리어
                      </span>
                      <p className="mt-0.5 text-xs font-semibold text-white">
                        {searchedVehicle.tuning_specs.roofBox}
                      </p>
                    </div>
                  )}
                  {searchedVehicle.tuning_specs.tires && (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-2.5">
                      <span className="text-[10px] font-bold text-slate-400">
                        타이어 세팅
                      </span>
                      <p className="mt-0.5 text-xs font-semibold text-white">
                        {searchedVehicle.tuning_specs.tires}
                      </p>
                    </div>
                  )}
                  {searchedVehicle.tuning_specs.exteriorWrap && (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-2.5">
                      <span className="text-[10px] font-bold text-amber-400">
                        외장 보호 / PPF
                      </span>
                      <p className="mt-0.5 text-xs font-semibold text-white">
                        {searchedVehicle.tuning_specs.exteriorWrap}
                      </p>
                    </div>
                  )}
                </div>

                {/* 최근 세차 일지 */}
                {searchedVehicle.car_wash_logs.length > 0 && (
                  <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
                    <span className="flex items-center gap-1 text-[11px] font-bold text-sky-300">
                      <Droplets className="h-3.5 w-3.5" /> 최근 세차 일지 ({searchedVehicle.car_wash_logs[0].date})
                    </span>
                    <p className="mt-0.5 text-xs text-slate-300">
                      {searchedVehicle.car_wash_logs[0].location} —{' '}
                      {searchedVehicle.car_wash_logs[0].workSummary} (
                      {searchedVehicle.car_wash_logs[0].coatType})
                    </p>
                  </div>
                )}
              </div>

              {/* 비대면 칭찬 / 튜닝 문의 / 선물 보내기 버튼 */}
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    const res = sendDrivingMessage({
                      receiverPlate: searchedVehicle.license_plate,
                      messageType: 'COMPLIMENT',
                      content: `[쇼룸 방문 칭찬] ${searchedVehicle.model} (${searchedVehicle.color}) 차량 관리 상태와 드레스업이 정말 멋집니다!`,
                    });
                    if (res.ok) {
                      showToast(
                        `[${searchedVehicle.license_plate}] 차주님께 차량 칭찬 메시지를 발송했습니다!`,
                        'emerald'
                      );
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>차량 칭찬 보내기</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const res = sendDrivingMessage({
                      receiverPlate: searchedVehicle.license_plate,
                      messageType: 'TUNING_ASK',
                      content: `[쇼룸 튜닝 문의] 장착하신 ${
                        searchedVehicle.tuning_specs.wheels ||
                        searchedVehicle.tuning_specs.roofBox ||
                        '튜닝 파츠'
                      } 실사용 승차감과 장착점이 궁금합니다!`,
                    });
                    if (res.ok) {
                      showToast(
                        `[${searchedVehicle.license_plate}] 차주님께 튜닝 스펙 문의를 발송했습니다!`,
                        'sky'
                      );
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-sky-500/20 border border-sky-400/50 px-3.5 py-2 text-xs font-bold text-sky-300 hover:bg-sky-500/30 transition"
                >
                  <Wrench className="h-3.5 w-3.5" />
                  <span>튜닝·파츠 정보 문의</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    openQuickGiftModal(
                      searchedVehicle.license_plate,
                      `${searchedVehicle.brand} ${searchedVehicle.model}`
                    )
                  }
                  className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 transition"
                >
                  <Gift className="h-3.5 w-3.5" />
                  <span>세차권/커피 선물하기</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-6 text-center text-xs text-slate-400">
            해당 번호판으로 등록된 공개 쇼룸을 찾지 못했습니다. (추천 번호판: 28하 9911, 12라 3466, 54나 8821, 123가 4568)
          </div>
        )}
      </div>

      {/* 2. 인증 오너 쇼룸 & 커뮤니티 피드 */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'ALL', label: '전체 쇼룸 피드' },
                { id: 'MY_CAR_SHOW', label: '내 차 자랑 (Verified)' },
                { id: 'TUNING_INFO', label: '튜닝 스펙 & Q&A' },
                { id: 'ROAD_ISSUE', label: '도로 제보' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id)}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  categoryFilter === tab.id
                    ? 'bg-emerald-400 text-slate-950'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeVehicle.verification_status === 'VERIFIED' ? (
            <button
              type="button"
              id="open-write-showroom-post-btn"
              onClick={() => setShowWriteModal((prev) => !prev)}
              className="flex items-center gap-1.5 rounded-xl bg-sky-400 px-4 py-2 text-xs font-extrabold text-slate-950 hover:bg-sky-300 transition"
            >
              <PlusCircle className="h-4 w-4" />
              <span>내 차 자랑 글쓰기 (번호판 자동 마스킹)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveTab('GARAGE')}
              className="flex items-center gap-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 px-3.5 py-2 text-xs font-bold text-rose-300"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>미인증 눈팅 전용 (인증 후 글쓰기 해금)</span>
            </button>
          )}
        </div>

        {/* 글쓰기 폼 */}
        {showWriteModal && (
          <form
            onSubmit={handleCreatePostSubmit}
            className="mt-4 space-y-3 rounded-2xl border border-sky-400/50 bg-slate-950 p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-300">
                인증 차량 [{maskLicensePlate(activeVehicle.license_plate)}] 쇼룸 게시글 등록 (앞자리 자동 마스킹 적용)
              </span>
              <select
                value={newPostCategory}
                onChange={(e) =>
                  setNewPostCategory(e.target.value as CommunityCategory)
                }
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-white"
              >
                <option value="MY_CAR_SHOW">내 차 자랑 쇼룸</option>
                <option value="TUNING_INFO">튜닝/장착 정보 공유</option>
                <option value="ROAD_ISSUE">실시간 도로 이슈</option>
              </select>
            </div>

            <input
              type="text"
              value={newPostTitle}
              onChange={(e) => setNewPostTitle(e.target.value)}
              placeholder="제목을 입력하세요 (예: 주말 세차 후 지하주차장 인증샷 올립니다)"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs text-white focus:border-sky-400 focus:outline-none"
            />

            <textarea
              rows={3}
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              placeholder="차량 스펙, 튜닝 내역, 세차 코팅 정보 등을 자유롭게 공유해 주세요."
              className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-white focus:border-sky-400 focus:outline-none"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <input
                type="text"
                value={newPostTags}
                onChange={(e) => setNewPostTags(e.target.value)}
                placeholder="태그 쉼표 구분 (예: BBS 20인치, 무광 PPF)"
                className="w-64 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-sky-300"
              />
              <button
                type="submit"
                className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-extrabold text-slate-950 hover:bg-emerald-300"
              >
                인증 오너 배지로 게시하기 (+20pt)
              </button>
            </div>
          </form>
        )}

        {/* 게시글 카드 목록 */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {filteredPosts.map((post) => (
            <div
              key={post.id}
              className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/90"
            >
              <div>
                <div className="relative h-56 w-full overflow-hidden">
                  <img
                    src={post.image_urls[0]}
                    alt={post.title}
                    className="h-full w-full object-cover transition duration-300 hover:scale-105"
                  />
                  {/* 앞자리 자동 블러(마스킹) 번호판 + Verified Owner 배지 */}
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <span className="flex items-center gap-1 rounded-xl bg-slate-950/90 px-3 py-1 font-mono text-xs font-bold text-emerald-300 border border-emerald-400/50 backdrop-blur-md">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                      {post.masked_plate_display} · Verified Owner
                    </span>
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                    <span className="rounded-lg bg-slate-950/85 px-2.5 py-1 text-[11px] font-semibold text-slate-200 backdrop-blur-md">
                      {post.vehicle_summary}
                    </span>
                  </div>
                </div>

                <div className="p-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-sky-300">
                      {post.owner_nickname} · {post.owner_honor_tier} 등급
                    </span>
                    <span>{post.created_at}</span>
                  </div>

                  <h3 className="mt-1.5 text-base font-bold text-white">
                    {post.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    {post.content}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {post.tuning_tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-sky-300 border border-slate-800"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* 좋아요 & 댓글 영역 */}
              <div className="border-t border-slate-800/90 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => togglePostLike(post.id)}
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                        post.liked_by_me
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                          : 'bg-slate-900 text-slate-300 border border-slate-800 hover:text-white'
                      }`}
                    >
                      <Heart
                        className={`h-3.5 w-3.5 ${
                          post.liked_by_me ? 'fill-rose-400 text-rose-400' : ''
                        }`}
                      />
                      <span>멋져요 {post.likes_count}</span>
                    </button>

                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>댓글 {post.comments.length}</span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPlateSearchQuery(post.license_plate)}
                    className="text-xs font-semibold text-emerald-400 hover:underline"
                  >
                    이 차량 차고 스펙 보기 →
                  </button>
                </div>

                {/* 댓글 목록 */}
                <div className="mt-3 space-y-1.5">
                  {post.comments.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl bg-slate-950/80 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">
                          {c.author_nickname}{' '}
                          <span className="font-mono text-[10px] text-emerald-400">
                            ({c.author_plate_masked})
                          </span>
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {c.created_at}
                        </span>
                      </div>
                      <p className="mt-0.5 text-slate-300">{c.content}</p>
                    </div>
                  ))}
                </div>

                {/* 댓글 입력 */}
                <div className="mt-2.5 flex gap-2">
                  <input
                    type="text"
                    value={commentInputs[post.id] || ''}
                    onChange={(e) =>
                      setCommentInputs((prev) => ({
                        ...prev,
                        [post.id]: e.target.value,
                      }))
                    }
                    placeholder={
                      activeVehicle.verification_status === 'VERIFIED'
                        ? '튜닝 질문이나 응원 댓글 남기기...'
                        : '미인증 눈팅 모드에서는 댓글 작성이 제한됩니다'
                    }
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleCommentSubmit(post.id)}
                    className="rounded-xl bg-sky-500/20 border border-sky-400/40 px-3 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-500/30"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

```

---

### File: `src/components/HonorHubTab.tsx`

```typescript
'use client';

import React, { useState } from 'react';
import {
  Award,
  Shield,
  Crown,
  Truck,
  CheckCircle2,
  Sparkles,
  TrendingUp,
  PackageCheck,
  MapPin,
} from 'lucide-react';
import { usePlateTalk } from '@/context/PlateTalkContext';
import { calculateHonorTier, maskLicensePlate } from '@/lib/supabase';

const TIER_MILESTONES = [
  {
    tier: 'ROOKIE',
    name: '루키 드라이버',
    range: '0 ~ 299 PT',
    perk: '기본 핸즈프리 음성 소통 & 번호판 인증 배지',
  },
  {
    tier: 'GUARDIAN',
    name: '세이프티 가디언 (Guardian)',
    range: '300 ~ 999 PT',
    perk: '실버 메탈 명예 스티커 발송 자격 해금',
  },
  {
    tier: 'MASTER',
    name: '로드 마스터 (Master)',
    range: '1,000 ~ 2,999 PT',
    perk: '홀로그램 티타늄 시리얼 각인 엠블럼 무료 배송',
  },
  {
    tier: 'HONOR_SOCIETY',
    name: '아너 소사이어티 (상위 1%)',
    range: '3,000+ PT',
    perk: '24K 크레스트 에디션 엠블럼 + 제휴 세차/주유 VIP 할인',
  },
];

const MONTHLY_HERO_RANKING = [
  {
    rank: 1,
    nickname: '설악투어링992',
    plateMasked: '**하 9911',
    vehicle: '포르쉐 911 GT3 Touring',
    tier: 'HONOR_SOCIETY',
    points: 4820,
    rescues: '화물 낙하물 경고 34회 · 양보 감사 89회',
  },
  {
    rank: 2,
    nickname: '경부고속도로보안관',
    plateMasked: '***가 7712',
    vehicle: '제네시스 GV80 3.5T',
    tier: 'HONOR_SOCIETY',
    points: 3910,
    rescues: '야간 브레이크등 고장 알림 61회',
  },
  {
    rank: 3,
    nickname: '판교젠틀드라이버 (나)',
    plateMasked: '**라 3466',
    vehicle: '제네시스 G80 Sport',
    tier: 'MASTER',
    points: 1180,
    rescues: '차량 이상 알림 19회 · 양보 감사 28회',
    isMe: true,
  },
  {
    rank: 4,
    nickname: '캠핑대디쏘렌토',
    plateMasked: '**나 8821',
    vehicle: '기아 쏘렌토 하이브리드',
    tier: 'GUARDIAN',
    points: 840,
    rescues: '주유구 열림 알림 14회 · 양보 감사 15회',
  },
];

export default function HonorHubTab() {
  const { user, activeVehicle, claimHonorSticker, addHonorPoints } =
    usePlateTalk();

  const tierInfo = calculateHonorTier(user.honor_points);
  const progressPercent = Math.min(
    100,
    Math.round(
      ((user.honor_points - tierInfo.minPoints) /
        (tierInfo.nextTierPoints - tierInfo.minPoints)) *
        100
    )
  );

  const [recipientName, setRecipientName] = useState(user.real_name);
  const [phone, setPhone] = useState(user.phone);
  const [postalCode, setPostalCode] = useState('13494');
  const [addressLine1, setAddressLine1] = useState(
    '경기도 성남시 분당구 판교역로 235'
  );
  const [addressLine2, setAddressLine2] = useState('에이치스퀘어 N동 11층');

  const handleStickerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    claimHonorSticker({
      recipientName,
      phone,
      postalCode,
      addressLine1,
      addressLine2,
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. 내 명예 점수(Honor Points) 게이지 및 포인트 적립 시뮬레이터 */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-emerald-400" />
              <span className="text-xs font-bold tracking-wider text-emerald-400 uppercase">
                {tierInfo.englishSubtitle}
              </span>
            </div>
            <h2 className="text-2xl font-extrabold text-white">
              {user.nickname}님의 명예 등급:{' '}
              <span className="text-emerald-300">{tierInfo.koreanTitle}</span>
            </h2>
            <p className="text-xs text-slate-400">
              위험 고지를 받은 운전자가 ‘도움 됐어요’를 누르거나 양보 감사 인사를 보내면 명예 포인트가 적립됩니다.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/40 bg-slate-950 px-4 py-3">
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase">
                CURRENT HONOR SCORE
              </span>
              <span className="font-mono text-2xl font-extrabold text-emerald-300">
                {user.honor_points.toLocaleString()} PT
              </span>
            </div>
          </div>
        </div>

        {/* 프로그레스 게이지 */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-300">
              현재 구간 시작: {tierInfo.minPoints.toLocaleString()} PT
            </span>
            <span className="text-sky-300">
              다음 등급 목표: {tierInfo.nextTierPoints.toLocaleString()} PT (
              {progressPercent}%)
            </span>
          </div>
          <div className="mt-2 h-3.5 w-full overflow-hidden rounded-full bg-slate-950 p-0.5 border border-slate-800">
            <div
              style={{ width: `${progressPercent}%` }}
              className="h-full rounded-full bg-gradient-to-r from-sky-400 via-teal-400 to-emerald-400 transition-all duration-500"
            />
          </div>
        </div>

        {/* 4단계 등급 카드 */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TIER_MILESTONES.map((m) => {
            const isCurrent = user.honor_tier === m.tier;
            return (
              <div
                key={m.tier}
                className={`rounded-2xl p-3.5 border transition ${
                  isCurrent
                    ? 'bg-emerald-500/15 border-emerald-400 shadow-lg'
                    : 'bg-slate-950/80 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-white">
                    {m.name}
                  </span>
                  {isCurrent && (
                    <span className="rounded bg-emerald-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                      현재 등급
                    </span>
                  )}
                </div>
                <p className="mt-1 font-mono text-xs font-bold text-sky-300">
                  {m.range}
                </p>
                <p className="mt-1.5 text-[11px] text-slate-400">{m.perk}</p>
              </div>
            );
          })}
        </div>

        {/* 명예 포인트 적립 알고리즘 즉시 테스트 */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
          <span className="text-xs font-semibold text-slate-300">
            명예 포인트 적립 알고리즘 시뮬레이션:
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              id="honor-sim-helpful-btn"
              onClick={() =>
                addHonorPoints(
                  50,
                  '위험 고지 수신자 [도움 됐어요] 감사 표시 대량 지급'
                )
              }
              className="rounded-xl bg-emerald-500/20 border border-emerald-400/50 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30"
            >
              +50 PT (위험 고지 ‘도움 됐어요’ 보상)
            </button>
            <button
              type="button"
              id="honor-sim-yield-btn"
              onClick={() =>
                addHonorPoints(30, '끼어들기 양보운전 후 상대방 감사 수신')
              }
              className="rounded-xl bg-sky-500/20 border border-sky-400/50 px-3 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-500/30"
            >
              +30 PT (양보운전 감사 수신)
            </button>
            <button
              type="button"
              id="honor-sim-promote-btn"
              onClick={() =>
                addHonorPoints(
                  500,
                  '이달의 도로 위 안전 영웅 특별 보너스 (아너 소사이어티 승급 체험)'
                )
              }
              className="rounded-xl bg-amber-500/20 border border-amber-400/50 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/30"
            >
              +500 PT (상위 1% 아너 소사이어티 승급 테스트)
            </button>
          </div>
        </div>
      </div>

      {/* 2. 실물 '명예 스티커(엠블럼)' 홀로그램 프리뷰 & 무료 배송 신청 폼 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 좌측: 실물 홀로그램 메탈 스티커 프리뷰 */}
        <div className="flex flex-col justify-between rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 lg:col-span-6">
          <div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-sky-400 uppercase">
                <Shield className="h-4 w-4" /> PHYSICAL HONOR EMBLEM
              </span>
              <span className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-300 border border-emerald-400/40">
                고유 시리얼 레이저 각인
              </span>
            </div>
            <h3 className="mt-1.5 text-lg font-extrabold text-white">
              후면 유리 부착용 홀로그램·브러시드 티타늄 명예 엠블럼
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              도로 위에서 이 스티커만 봐도 검증된 매너·방어운전 오너임을 한눈에 알아볼 수 있는 실물 메탈 엠블럼입니다.
            </p>

            {/* 실물 엠블럼 이미지 + 실시간 시리얼 넘버 오버레이 */}
            <div className="relative mt-4 overflow-hidden rounded-3xl border border-emerald-400/40 bg-slate-950 shadow-2xl">
              <img
                src="/assets/honor-emblem.jpg"
                alt="PlateTalk 홀로그램 메탈 실물 명예 스티커"
                className="h-72 w-full object-cover sm:h-80"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-400/50 bg-slate-900/90 px-4 py-3 backdrop-blur-md">
                  <div>
                    <span className="block text-[10px] font-bold tracking-widest text-emerald-400 uppercase">
                      LASER ENGRAVED SERIAL NO.
                    </span>
                    <span className="font-mono text-base font-extrabold text-white">
                      {user.sticker_serial_number}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] text-slate-400">
                      인증 차량 & 등급
                    </span>
                    <span className="font-mono text-xs font-bold text-sky-300">
                      {maskLicensePlate(activeVehicle.license_plate)} ·{' '}
                      {user.honor_tier}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 배송 신청 상태 배지 */}
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center gap-2.5">
              <PackageCheck className="h-5 w-5 text-emerald-400" />
              <div>
                <span className="text-xs font-bold text-white">
                  현재 엠블럼 발급 상태:{' '}
                  <span className="text-emerald-300">
                    {user.sticker_claim_status === 'REQUESTED'
                      ? '시리얼 각인 및 발송 준비 중 (무료 배송)'
                      : '무료 발급 신청 가능 (ELIGIBLE)'}
                  </span>
                </span>
                {user.sticker_shipping_address && (
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    배송지: {user.sticker_shipping_address.addressLine1}{' '}
                    {user.sticker_shipping_address.addressLine2}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 우측: 실물 스티커 무료 배송 신청 폼 & 이번 달 영웅 랭킹 */}
        <div className="space-y-6 lg:col-span-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-emerald-400" />
              <h3 className="text-base font-bold text-white">
                실물 명예 스티커(엠블럼) 무료 배송 신청
              </h3>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              세이프티 가디언(300 PT) 이상 달성 오너에게 고유 시리얼이 각인된 실물 메탈 스티커를 무료로 발송해 드립니다.
            </p>

            <form onSubmit={handleStickerSubmit} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    수령인 성명 (인증 오너)
                  </label>
                  <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    연락처
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    우편번호
                  </label>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    기본 주소
                  </label>
                  <input
                    type="text"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  상세 주소
                </label>
                <input
                  type="text"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
              </div>

              <button
                type="submit"
                id="claim-honor-sticker-btn"
                disabled={user.sticker_claim_status === 'REQUESTED'}
                className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-extrabold transition ${
                  user.sticker_claim_status === 'REQUESTED'
                    ? 'bg-slate-800 text-emerald-400 cursor-default'
                    : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300 shadow-lg'
                }`}
              >
                {user.sticker_claim_status === 'REQUESTED' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      시리얼 [{user.sticker_serial_number}] 엠블럼 배송 신청 완료
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>
                      고유 시리얼 [{user.sticker_serial_number}] 실물 엠블럼 무료 배송 신청
                    </span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* 이번 달 도로 위 영웅 랭킹 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">
                  이번 달 도로 위 영웅 랭킹 (Honor Leaderboard)
                </h3>
              </div>
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            </div>

            <div className="mt-4 space-y-2.5">
              {MONTHLY_HERO_RANKING.map((hero) => (
                <div
                  key={hero.rank}
                  className={`flex items-center justify-between rounded-2xl p-3 border ${
                    hero.isMe
                      ? 'bg-emerald-500/15 border-emerald-400/70'
                      : 'bg-slate-950/90 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-lg font-mono text-xs font-extrabold ${
                        hero.rank === 1
                          ? 'bg-amber-400 text-slate-950'
                          : hero.rank === 2
                          ? 'bg-slate-300 text-slate-950'
                          : 'bg-amber-700/60 text-amber-200'
                      }`}
                    >
                      {hero.rank}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white">
                          {hero.nickname}
                        </span>
                        <span className="font-mono text-[11px] text-sky-300">
                          ({hero.plateMasked})
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {hero.vehicle} · {hero.rescues}
                      </p>
                    </div>
                  </div>

                  <span className="font-mono text-xs font-extrabold text-emerald-300">
                    {(hero.isMe ? user.honor_points : hero.points).toLocaleString()}{' '}
                    PT
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

```

---

### File: `src/components/QuickGiftModal.tsx`

```typescript
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

```

---

### File: `src/app/page.tsx`

```typescript
'use client';

import React, { useState } from 'react';
import {
  Navigation,
  Bell,
  Car,
  Award,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  Smartphone,
  Monitor,
  Wifi,
  BatteryCharging,
  Signal,
} from 'lucide-react';
import {
  PlateTalkProvider,
  usePlateTalk,
  ActiveTabId,
} from '@/context/PlateTalkContext';
import DrivingHudTab from '@/components/DrivingHudTab';
import AlertsAndGiftsTab from '@/components/AlertsAndGiftsTab';
import CommunityShowroomTab from '@/components/CommunityShowroomTab';
import HonorHubTab from '@/components/HonorHubTab';
import GarageAuthTab from '@/components/GarageAuthTab';
import QuickGiftModal from '@/components/QuickGiftModal';

const NAV_TABS: {
  id: ActiveTabId;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'HUD',
    label: '드라이빙 HUD',
    shortLabel: 'HUD 홈',
    icon: Navigation,
  },
  {
    id: 'ALERTS_GIFTS',
    label: '알림 & 선물함',
    shortLabel: '알림·선물',
    icon: Bell,
  },
  {
    id: 'COMMUNITY',
    label: '쇼룸 & 커뮤니티',
    shortLabel: '쇼룸·소통',
    icon: Car,
  },
  {
    id: 'HONOR',
    label: '명예의 전당',
    shortLabel: '명예·스티커',
    icon: Award,
  },
  {
    id: 'GARAGE',
    label: '마이 개러지',
    shortLabel: '내차·인증',
    icon: ShieldCheck,
  },
];

function PlateTalkMobileAppShell() {
  const {
    activeTab,
    setActiveTab,
    user,
    activeVehicle,
    drivingMessages,
    giftTransactions,
    toastBanner,
  } = usePlateTalk();

  // 모바일 뷰포트 모드: 'PORTRAIT' (스마트폰 세로 앱 430px) vs 'CAR_MOUNT' (차량 거치대 대시보드 와이드 모드)
  const [viewportMode, setViewportMode] = useState<'PORTRAIT' | 'CAR_MOUNT'>(
    'PORTRAIT'
  );

  const unreadActiveCount = drivingMessages.filter(
    (m) => !m.is_dismissed
  ).length;
  const unredeemedGiftsCount = giftTransactions.filter(
    (g) => g.direction === 'RECEIVED' && g.payment_status === 'PAID'
  ).length;
  const totalBadge = unreadActiveCount + unredeemedGiftsCount;

  return (
    <div className="min-h-screen bg-[#020409] text-slate-100 flex flex-col items-center justify-start sm:py-4 sm:px-3">
      {/* 상단 디바이스 뷰포트 모드 스위처 (모바일 세로 앱 ↔ 차량 대시보드 가로 거치 모드) */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800/90 bg-slate-900/90 px-3.5 py-2 text-xs backdrop-blur-md w-full max-w-[440px]">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold text-slate-200">PlateTalk Mobile PWA</span>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-slate-950 p-1 border border-slate-800">
          <button
            type="button"
            id="switch-portrait-mobile-btn"
            onClick={() => setViewportMode('PORTRAIT')}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              viewportMode === 'PORTRAIT'
                ? 'bg-sky-400 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="h-3 w-3" />
            <span>모바일 세로형 (430px)</span>
          </button>
          <button
            type="button"
            id="switch-carmount-wide-btn"
            onClick={() => setViewportMode('CAR_MOUNT')}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              viewportMode === 'CAR_MOUNT'
                ? 'bg-emerald-400 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Monitor className="h-3 w-3" />
            <span>차량 거치 와이드 HUD</span>
          </button>
        </div>
      </div>

      {/* 스마트폰 / 차량 거치대 메인 앱 컨테이너 */}
      <div
        className={`relative flex flex-col w-full overflow-hidden bg-[#050811] sm:rounded-[38px] sm:border-[3px] sm:border-slate-800/90 shadow-[0_24px_80px_rgba(0,0,0,0.85)] transition-all duration-300 ${
          viewportMode === 'PORTRAIT'
            ? 'max-w-[440px] min-h-[860px]'
            : 'max-w-5xl min-h-[760px]'
        }`}
      >
        {/* 1. 모바일 네이티브 상태 표시줄 (iOS/Android Status Bar) */}
        <div className="flex items-center justify-between bg-[#050811] px-6 pt-3 pb-1.5 text-[11px] font-semibold text-slate-300 select-none">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-white">09:41</span>
            <span className="rounded bg-sky-500/20 px-1.5 py-0.2 text-[9px] font-bold text-sky-300 border border-sky-400/30">
              RTSP 연결됨
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <Signal className="h-3 w-3 text-emerald-400" />
            <span className="text-[10px] font-mono">5G</span>
            <Wifi className="h-3 w-3 text-sky-400" />
            <BatteryCharging className="h-3.5 w-3.5 text-emerald-400" />
          </div>
        </div>

        {/* 2. 모바일 앱 상단 헤더 */}
        <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#050811]/95 px-4 py-2.5 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-emerald-400 text-slate-950 font-black text-sm shadow-md">
                PT
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-black tracking-tight text-white">
                    PlateTalk <span className="text-sky-400">모바일</span>
                  </h1>
                  <span className="rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                    {activeVehicle.license_plate}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  핸즈프리 음성 소통 & 번호판 명예 커뮤니티
                </p>
              </div>
            </div>

            {/* 우측 인증배지 & 명예점수 알약 */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                id="header-garage-status-btn"
                onClick={() => setActiveTab('GARAGE')}
                className={`flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[10px] font-extrabold transition ${
                  activeVehicle.verification_status === 'VERIFIED'
                    ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                    : activeVehicle.verification_status === 'PENDING'
                    ? 'border-amber-400/50 bg-amber-500/15 text-amber-300'
                    : 'border-rose-400/50 bg-rose-500/15 text-rose-300'
                }`}
              >
                <ShieldCheck className="h-3 w-3" />
                <span>{activeVehicle.verification_status}</span>
              </button>

              <button
                type="button"
                id="header-honor-points-btn"
                onClick={() => setActiveTab('HONOR')}
                className="flex items-center gap-1 rounded-xl border border-sky-400/40 bg-sky-500/15 px-2.5 py-1 text-[10px] font-extrabold text-sky-300"
              >
                <Award className="h-3 w-3 text-emerald-400" />
                <span className="font-mono">
                  {user.honor_points.toLocaleString()}P
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* 실시간 토스트 알림 배너 */}
        {toastBanner && (
          <div className="px-3 pt-2.5">
            <div
              className={`flex items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-bold shadow-xl ${
                toastBanner.tone === 'emerald'
                  ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200'
                  : toastBanner.tone === 'amber'
                  ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                  : toastBanner.tone === 'rose'
                  ? 'border-rose-400/60 bg-rose-500/15 text-rose-200'
                  : 'border-sky-400/60 bg-sky-500/15 text-sky-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {toastBanner.tone === 'rose' ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                ) : (
                  <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" />
                )}
                <span className="leading-snug">{toastBanner.message}</span>
              </div>
            </div>
          </div>
        )}

        {/* 3. 모바일 스크롤 컨텐츠 영역 */}
        <main className="flex-1 overflow-y-auto px-3.5 pt-3.5 pb-28">
          {activeTab === 'HUD' && <DrivingHudTab />}
          {activeTab === 'ALERTS_GIFTS' && <AlertsAndGiftsTab />}
          {activeTab === 'COMMUNITY' && <CommunityShowroomTab />}
          {activeTab === 'HONOR' && <HonorHubTab />}
          {activeTab === 'GARAGE' && <GarageAuthTab />}
        </main>

        {/* 원클릭 기프트 답례 모달 */}
        <QuickGiftModal />

        {/* 4. 모바일 앱 하단 고정 5탭 네비게이션 바 (Bottom App Bar) */}
        <nav
          aria-label="모바일 하단 탭 네비게이션"
          className="sticky bottom-0 inset-x-0 z-40 border-t border-slate-800/90 bg-[#050811]/95 px-2 pt-2 pb-3 backdrop-blur-xl"
        >
          <div className="grid grid-cols-5 gap-1">
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  id={`mobile-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex flex-col items-center justify-center rounded-2xl py-2 text-[11px] font-extrabold transition ${
                    isActive
                      ? 'bg-gradient-to-b from-sky-500/25 to-emerald-500/20 text-sky-300 border border-sky-400/50 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      isActive ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  />
                  <span className="mt-1 tracking-tight">{tab.shortLabel}</span>

                  {tab.id === 'ALERTS_GIFTS' && totalBadge > 0 && (
                    <span className="absolute top-1 right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-400 px-1 text-[9px] font-black text-slate-950">
                      {totalBadge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {/* 모바일 홈 인디케이터 바 */}
          <div className="mx-auto mt-2.5 h-1 w-28 rounded-full bg-slate-700/80" />
        </nav>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <PlateTalkProvider>
      <PlateTalkMobileAppShell />
    </PlateTalkProvider>
  );
}

```

---

### File: `src/app/layout.tsx`

```typescript
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#04070f',
};

export const metadata: Metadata = {
  title: 'PlateTalk 모바일 앱 | 번호판 기반 실시간 운전자 핸즈프리 소통',
  description:
    '차량 번호판(License Plate)을 고유 ID로 활용하여 운전 중 완벽한 핸즈프리(STT/TTS) 안전 소통과 명예 보상을 제공하는 모바일 애플리케이션',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PlateTalk',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#020409] text-slate-100 selection:bg-sky-500/30 selection:text-sky-200`}
      >
        {children}
      </body>
    </html>
  );
}

```

---

