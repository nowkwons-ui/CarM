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
