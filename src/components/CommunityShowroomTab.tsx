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
                <span>Verified Owner · {searchedVehicle.masked_plate}</span>
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
                      receiverPlate: searchedVehicle.exact_plate,
                      messageType: 'COMPLIMENT',
                      content: `[쇼룸 방문 칭찬] ${searchedVehicle.model} (${searchedVehicle.color}) 차량 관리 상태와 드레스업이 정말 멋집니다!`,
                    });
                    if (res.ok) {
                      showToast(
                        `[${searchedVehicle.masked_plate}] 차주님께 차량 칭찬 메시지를 발송했습니다!`,
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
                      receiverPlate: searchedVehicle.exact_plate,
                      messageType: 'TUNING_ASK',
                      content: `[쇼룸 튜닝 문의] 장착하신 ${
                        searchedVehicle.tuning_specs.wheels ||
                        searchedVehicle.tuning_specs.roofBox ||
                        '튜닝 파츠'
                      } 실사용 승차감과 장착점이 궁금합니다!`,
                    });
                    if (res.ok) {
                      showToast(
                        `[${searchedVehicle.masked_plate}] 차주님께 튜닝 스펙 문의를 발송했습니다!`,
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
                      searchedVehicle.exact_plate,
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
