# PlateTalk (플레이트톡)

> **차량 번호판(License Plate) 기반 실시간 운전자 핸즈프리 소통 및 명예 커뮤니티 플랫폼**

핵심 가치:
1. **운전 중 완벽한 핸즈프리(Hands-free) 안전 소통** — 전방 카메라/블랙박스 실시간 번호판 객체 탐지(ALPR) + 웨이크워드 음성 제어(STT) + AI 욕설/난폭 발화 정중 템플릿 변환 + 수신 메시지 자동 음성 브리핑(TTS) 및 주행 종료 시 자동 말소(Auto-Archiving)
2. **철저한 번호판 소유주 3단계 인증을 통한 신뢰 기반 커뮤니티** — 소셜 로그인 + PASS 본인인증 실명 + 차량 사진 & 자동차등록증(차량번호·17자리 차대번호 VIN·소유주 성명) Vision OCR 교차 검증 (`VERIFIED` 오너만 발신·작성 가능, 미인증 가입자는 눈팅 전용)

---

## 주요 기능 및 아키텍처

### 1. 3단계 차량 소유주 인증 및 다중 차량 관리 (`src/lib/ocrEngine.ts`, `src/components/GarageAuthTab.tsx`)
- **1단계:** 카카오 / 구글 / 애플 소셜 로그인 연동 및 PASS 본인 명의 휴대폰 실명 인증
- **2단계:** 차량 전면/후면 번호판 노출 사진 + 자동차등록증 Vision OCR 교차 대조 (`차량번호`, `17자리 차대번호 VIN`, `소유주 성명`)
- **3단계:** `PENDING(심사중)` → `VERIFIED(인증완료 - 모든 기능 해금)` → `REJECTED(반려)` 상태 관리, 가족/법인 차량 공동 운전자(소유주 SMS 전자서명 승인) 등록, 미인증 가입자 눈팅(읽기) 전용 제한

### 2. 운전 중 핸즈프리 HUD & 음성 소통 (`src/lib/voiceAiEngine.ts`, `src/components/DrivingHudTab.tsx`)
- **실시간 ALPR & 3분 로컬 버퍼:** 전방 차량 번호판 바운딩 박스 오버레이 및 최근 3분 내 마주친 차량 리스트(차종·색상·거리·OCR 신뢰도) 자동 저장
- **웨이크워드("헤이 플레이트") STT & AI 안전 필터링:** 자유 발화 내 거친 표현·욕설을 AI가 분석하여 정중한 안전 템플릿으로 자동 순화하거나 순수 위협 발언을 원천 차단
- **TTS 자동 브리핑 & 주행 종료 자동 말소:** 주행 중 수신 메시지를 Web Speech API TTS로 즉시 읽어주고, 시동 종료(드라이빙 모드 해제) 시 읽은 메시지를 알림 센터에서 자동 말소(아카이브 이동)

### 3. 6대 세부 소통 & 명예/기프트 커머스
- **[1-1] 차량 이상 공유 (`DEFECT_ALERT`):** 브레이크등/미등 고장, 타이어 공기압 부족, 주유구/트렁크 열림 원터치·음성 알림
- **[1-2] 화물 과적·낙하 위험 경고 (`OVERLOAD_WARN`):** 당사자 화물차 경고 + 반경 5km 내 주행 차량 실시간 방어운전 브로드캐스트
- **[1-3] 차량 칭찬 및 튜닝 문의 (`COMPLIMENT`, `TUNING_ASK`):** 드레스업 칭찬 및 장착 휠/루프박스 모델명 비대면 Q&A
- **[1-4] 내 차 자랑 및 인증 쇼룸 (`src/components/CommunityShowroomTab.tsx`):** 번호판으로 오너 차고(Garage) 검색, 앞자리 번호판 자동 마스킹(`**라 3466`) 및 `Verified Owner` 배지 피드
- **[1-5] 명예 점수 및 실물 명예 스티커 (`src/components/HonorHubTab.tsx`):** `루키 드라이버` → `세이프티 가디언` → `로드 마스터` → `아너 소사이어티(상위 1%)` 등급제 및 고유 시리얼 넘버 각인 홀로그램/티타늄 실물 엠블럼 무료 배송 신청
- **[1-6] 인앱 기프트샵 및 번호판 선물하기 (`src/components/AlertsAndGiftsTab.tsx`, `src/components/QuickGiftModal.tsx`):** 전화번호 없이 차량 번호판만으로 주유권·세차권·커피·방향제 선물 발송 및 원클릭 감사 답례

---

## 데이터베이스 스키마 (`supabase/schema.sql`)
- `users`: 사용자 정보, PASS 실명인증 여부, 명예 포인트(`honor_points`), 명예 등급(`honor_tier`), 실물 스티커 발급 상태(`sticker_claim_status`)
- `vehicles`: 차량 번호판(`license_plate` Unique Index), 차대번호(`vin`), 차종/색상, 튜닝 스펙(`tuning_specs` JSONB), OCR 검증 상태(`verification_status`)
- `driving_messages`: 주행 실시간 소통 메시지, AI 정제 여부, GPS 좌표, 반경 5km 브로드캐스트 범위, 읽음(`is_read`) 및 자동 말소(`is_dismissed`) 상태
- `community_posts`: 내 차 자랑 쇼룸, 튜닝 Q&A, 앞자리 마스킹 번호판, `Verified Owner` 배지
- `gift_transactions`: 번호판 기반 기프티콘 선물 결제 및 바코드 쿠폰(`coupon_code`) 상태

---

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속하여 5개 탭(드라이빙 HUD, 알림 & 기프트샵, 쇼룸 & 커뮤니티, 명예의 전당, 마이 개러지 OCR 인증)을 모두 체험할 수 있습니다.
