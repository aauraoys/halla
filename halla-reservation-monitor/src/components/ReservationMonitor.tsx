'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { checkReservation } from '../utils/api';
import { ReservationStatus } from '../types/types';

interface CourseInfo {
  courseSeq: string;
  name: string;
}

interface MonitoringItem {
  date: string;
  display: string;
  courseSeq: string;
  visitTm: string;
  visitLabel: string;
  lastAlertTime?: number;
}

const POLL_INTERVAL = 10_000; // ms
const ALERT_COOLDOWN = 5 * 60 * 1000; // ms

const courses: CourseInfo[] = [
  { courseSeq: '244', name: '성판악' },
  { courseSeq: '242', name: '관음사' },
];

const timeOptions = [
  { code: 'TIME1', label: '1회차 · 05:00 입산' },
  { code: 'TIME8', label: '2회차 · 08:00 입산' },
];

const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

function formatTime(date: Date) {
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function playBeep() {
  try {
    const AudioCtx =
      (window.AudioContext as typeof AudioContext | undefined) ||
      ((window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext as typeof AudioContext | undefined);
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (err) {
    console.error('Audio play failed', err);
  }
}

function pushDesktopNotification(title: string, body: string) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  new Notification(title, {
    body,
    icon: '/globe.svg',
    silent: false,
  });
}

export default function ReservationMonitor() {
  const [statuses, setStatuses] = useState<Record<string, ReservationStatus>>({});
  const [error, setError] = useState<string>('');
  const [lastCheckTime, setLastCheckTime] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [flashCards, setFlashCards] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedDisplay, setSelectedDisplay] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [selectedTimeLabel, setSelectedTimeLabel] = useState<string>('');
  const [monitoringItems, setMonitoringItems] = useState<MonitoringItem[]>([]);
  const [countdown, setCountdown] = useState<number>(POLL_INTERVAL / 1000);
  const [enableSound, setEnableSound] = useState<boolean>(true);
  const [enableDesktop, setEnableDesktop] = useState<boolean>(false);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null
  );
  const monitoringItemsRef = useRef<MonitoringItem[]>([]);
  const isCheckingRef = useRef(false);

  const dateOptions = useMemo(() => {
    const options: { date: string; display: string; isWeekend: boolean }[] = [];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    for (let i = 0; i < 30; i++) {
      const date = new Date(tomorrow);
      date.setDate(date.getDate() + i);

      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      if (!isWeekend) continue; // 평일은 제외

      const dateString = `${date.getFullYear()}.${String(
        date.getMonth() + 1
      ).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
      const displayString = `${date.getMonth() + 1}월 ${date.getDate()}일 (${
        dayNames[dayOfWeek]
      })`;

      options.push({
        date: dateString,
        display: displayString,
        isWeekend,
      });
    }
    return options;
  }, []);

  const handleDateSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const option = dateOptions.find((opt) => opt.date === event.target.value);
    if (option) {
      setSelectedDate(option.date);
      setSelectedDisplay(option.display);
      setSelectedTime('');
      setSelectedTimeLabel('');
    } else {
      setSelectedDate('');
      setSelectedDisplay('');
      setSelectedTime('');
      setSelectedTimeLabel('');
    }
  };

  const handleTimeSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const option = timeOptions.find((opt) => opt.code === event.target.value);
    if (option) {
      setSelectedTime(option.code);
      setSelectedTimeLabel(option.label);
    } else {
      setSelectedTime('');
      setSelectedTimeLabel('');
    }
  };

  const handleDeleteMonitoring = (date: string, courseSeq: string) => {
    setMonitoringItems((prev) =>
      prev.filter(
        (item) => !(item.date === date && item.courseSeq === courseSeq)
      )
    );
  };

  const handleCourseSelect = (courseSeq: string) => {
    if (
      selectedDate &&
      selectedTime &&
      !monitoringItems.some(
        (item) =>
          item.date === selectedDate &&
          item.courseSeq === courseSeq &&
          item.visitTm === selectedTime
      )
    ) {
      setMonitoringItems((prev) => [
        ...prev,
        {
          date: selectedDate,
          display: selectedDisplay,
          courseSeq,
          visitTm: selectedTime,
          visitLabel: selectedTimeLabel,
        },
      ]);
      setSelectedDate('');
      setSelectedDisplay('');
      setSelectedTime('');
      setSelectedTimeLabel('');
    }
  };

  const showToast = (message: string) => {
    const id = Date.now();
    setToast({ id, message });
    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 5000);
  };

  const checkAvailability = useCallback(async () => {
    const itemsSnapshot = monitoringItemsRef.current;
    if (isCheckingRef.current || itemsSnapshot.length === 0) return;

    try {
      isCheckingRef.current = true;
      setIsLoading(true);
      setLastCheckTime(formatTime(new Date()));
      setCountdown(POLL_INTERVAL / 1000);

      const newStatuses: Record<string, ReservationStatus> = {};
      const currentTime = Date.now();

      for (const item of itemsSnapshot) {
        const response = await checkReservation(
          item.courseSeq,
          item.date,
          item.visitTm
        );

        const limit = Number(response.coursePerson.limitCnt || 0);
        const reserve = Number(response.coursePerson.reserveCnt || 0);
        const isAvailable = reserve < limit;

        const courseName =
          courses.find((c) => c.courseSeq === item.courseSeq)?.name ?? '';

        if (
          isAvailable &&
          (!item.lastAlertTime ||
            currentTime - item.lastAlertTime > ALERT_COOLDOWN)
        ) {
          setFlashCards(true);
          const message = `${item.display} ${courseName} ${item.visitLabel} 예약 가능 (${reserve}/${limit})`;

          if (enableSound) playBeep();
          if (enableDesktop) pushDesktopNotification('한라산 예약 오픈', message);
          showToast(message);

          setMonitoringItems((prev) =>
            prev.map((prevItem) =>
              prevItem.date === item.date && prevItem.courseSeq === item.courseSeq
                ? { ...prevItem, lastAlertTime: currentTime }
                : prevItem
            )
          );

          setTimeout(() => setFlashCards(false), 1500);
        }

        const statusKey = `${item.date}-${item.courseSeq}-${item.visitTm}`;
        newStatuses[statusKey] = {
          courseSeq: item.courseSeq,
          name: courseName,
          isAvailable,
          limitCnt: String(limit),
          reserveCnt: String(reserve),
        };
      }

      setStatuses(newStatuses);
      setError('');
    } catch (err) {
      console.error(err);
      setError('예약 현황을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
      isCheckingRef.current = false;
    }
  }, [enableDesktop, enableSound]);

  useEffect(() => {
    monitoringItemsRef.current = monitoringItems;
  }, [monitoringItems]);

  useEffect(() => {
    if (enableDesktop && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [enableDesktop]);

  useEffect(() => {
    if (monitoringItems.length === 0) return;
    checkAvailability();
    const intervalId = setInterval(checkAvailability, POLL_INTERVAL);
    return () => clearInterval(intervalId);
  }, [checkAvailability, monitoringItems.length]);

  useEffect(() => {
    if (monitoringItems.length === 0) {
      setCountdown(POLL_INTERVAL / 1000);
      return;
    }
    setCountdown(POLL_INTERVAL / 1000);
    const id = setInterval(
      () =>
        setCountdown((prev) =>
          prev <= 1 ? POLL_INTERVAL / 1000 : prev - 1
        ),
      1000
    );
    return () => clearInterval(id);
  }, [monitoringItems, lastCheckTime]);

  const sortedMonitoringGroups = Object.entries(
    monitoringItems.reduce((acc, item) => {
      if (!acc[item.date]) {
        acc[item.date] = {
          display: item.display,
          items: [],
        };
      }
      acc[item.date].items.push(item);
      return acc;
    }, {} as Record<string, { display: string; items: MonitoringItem[] }>)
  ).sort(([dateA], [dateB]) => dateA.localeCompare(dateB));

  return (
    <div className="min-h-screen bg-white text-[#00114D]">
      <style jsx>{`
        @keyframes cardFlash {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.02);
            opacity: 0.92;
          }
          100% {
            transform: scale(1);
          }
        }
        .flash-animation {
          animation: cardFlash 1s ease-in-out;
        }
        @keyframes fadeInUp {
          0% { transform: translateY(16px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .animate-fadeInUp { animation: fadeInUp 0.6s ease forwards; }
        .orb {
          position: absolute;
          width: 220px;
          height: 220px;
          border-radius: 50%;
          filter: blur(70px);
          opacity: 0.35;
        }
        @keyframes aurora {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        .aurora {
          background: linear-gradient(
            120deg,
            rgba(0, 17, 77, 0.25),
            rgba(0, 192, 255, 0.18),
            rgba(0, 17, 77, 0.25)
          );
          background-size: 200% 200%;
          animation: aurora 16s ease-in-out infinite;
        }
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        .shimmer {
          background-image: linear-gradient(
            120deg,
            rgba(255, 255, 255, 0.05),
            rgba(255, 255, 255, 0.35),
            rgba(255, 255, 255, 0.05)
          );
          background-size: 200% 200%;
          animation: shimmer 2.4s linear infinite;
        }
      `}</style>

      <div className="max-w-6xl mx-auto px-4 py-10">
        <header className="relative overflow-hidden rounded-3xl bg-[#00114D] text-white shadow-2xl p-6 mb-8">
          <div className="absolute inset-0 aurora pointer-events-none" />
          <div className="relative flex flex-col gap-3 text-center sm:text-left sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-white/70">
                DaoReum Mountaineering Club
              </p>
              <h1 className="text-3xl sm:text-4xl font-semibold text-white mt-1 drop-shadow-lg">
                다오름 회원을 위한 한라산 탐방예약 모니터링 시스템
              </h1>
              <p className="text-white/90 mt-1">
                성판악 · 관음사 좌석을 10초마다 자동 스캔하고, 빈자리 알림까지 한 번에.
              </p>
              <p className="inline-block mt-2 px-3 py-1 rounded-full bg-white/10 border border-white/30 text-sm font-semibold shimmer">
                05시 · 08시 회차 실시간 추적
              </p>
            </div>
            <div className="flex items-center gap-3 justify-center sm:justify-end">
              <div className="text-right">
                <p className="text-xs text-white/70">마지막 확인</p>
                <p className="text-lg font-semibold text-white drop-shadow">
                  {lastCheckTime || '대기 중'}
                </p>
              </div>
              <div className="w-20 h-20 rounded-2xl bg-white/10 border border-white/40 grid place-items-center shadow-lg">
                <span className="text-2xl font-bold text-white">
                  {countdown}
                </span>
                <span className="text-[11px] text-white/80">다음 확인</span>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <button
              onClick={() => checkAvailability()}
              className="w-full bg-white text-[#00114D] font-semibold py-3 px-4 rounded-xl transition-colors hover:bg-white/90 shadow-md"
            >
              {isLoading ? '확인 중...' : '수동 새로고침'}
            </button>
            <div className="flex items-center justify-between gap-2 bg-white/15 border border-white/30 rounded-xl px-4 py-3">
              <span className="text-sm">알림음</span>
              <button
                onClick={() => setEnableSound((v) => !v)}
                className={`px-3 py-1 rounded-lg text-sm font-semibold ${
                  enableSound
                    ? 'bg-white text-[#00114D]'
                    : 'bg-white/15 text-white'
                }`}
              >
                {enableSound ? '켜짐' : '꺼짐'}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 bg-white/15 border border-white/30 rounded-xl px-4 py-3">
              <div className="flex flex-col">
                <span className="text-sm">데스크톱 알림</span>
                <span className="text-[11px] text-white/80">
                  브라우저 알림 허용 필요
                </span>
              </div>
              <button
                onClick={() => setEnableDesktop((v) => !v)}
                className={`px-3 py-1 rounded-lg text-sm font-semibold ${
                  enableDesktop
                    ? 'bg-white text-[#00114D]'
                    : 'bg-white/15 text-white'
                }`}
              >
                {enableDesktop ? '켜짐' : '꺼짐'}
              </button>
            </div>
          </div>
        </header>

        <section className="relative overflow-hidden rounded-2xl border border-[#00114D]/15 bg-white shadow-lg mb-8">
          <div className="absolute inset-0 pointer-events-none aurora opacity-20" />
          <div className="absolute -top-10 -left-8 orb bg-[#00114D]" />
          <div className="absolute -bottom-10 -right-8 orb bg-[#00c0ff]" />
          <div className="relative p-6 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#00114D]">제주도 한라산 · 다오름 원정</p>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#00114D] leading-tight">
                  한라산 백록담 (2박 3일)
                </h2>
                <p className="text-sm sm:text-base text-[#00114D]/85 leading-snug">
                  한국 3대 명산 정상찍기 두 번째 프로젝트 ‘한라산’ — 2박 3일의 여행 같은 산행
                </p>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#00114D] text-white text-xs sm:text-sm font-semibold shadow-md whitespace-nowrap">
                다오름 회원 전용 원정
              </div>
            </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center text-sm font-semibold text-[#00114D]">
                {[
                  { label: '소요시간', value: '8시간', delay: '0s' },
                  { label: '거리', value: '18km', delay: '0.1s' },
                  { label: '일정', value: '4/10(금)~4/12(일)', delay: '0.2s' },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-xl border border-[#00114D]/20 bg-[#00114D]/05 px-3 py-2"
                  >
                  <div className="text-xs text-[#00114D]/70">{metric.label}</div>
                  <div className="text-base sm:text-lg">{metric.value}</div>
                </div>
              ))}
            </div>

            <div className="relative">
              <div className="hidden sm:block absolute left-5 top-0 bottom-0 w-[2px] bg-gradient-to-b from-[#00114D] via-[#00114D]/40 to-transparent" />
              <div className="space-y-4 sm:space-y-3">
                {[
                  {
                    day: 'Day 1',
                    title: '숙소 개별 집결 및 O.T',
                    detail: '금요일 저녁 제주도 숙소(미정)에서 집결',
                  },
                  {
                    day: 'Day 2',
                    title: '한라산 산행 (관음사 ▶ 성판악)',
                    detail: '하산 후 숙소에서 저녁식사 · 회복 타임',
                  },
                  {
                    day: 'Day 3',
                    title: '자유여행 후 공항 이동',
                    detail: '세부 일정은 참석자 협의로 탄력 운영',
                  },
                ].map((item, idx) => (
                  <div
                    key={item.day}
                    className="relative sm:ml-10 rounded-2xl border border-[#00114D]/15 bg-white shadow-md p-4 animate-fadeInUp"
                    style={{ animationDelay: `${idx * 0.12}s` }}
                  >
                    <span className="absolute sm:-left-8 -top-3 sm:top-4 h-10 w-10 sm:h-11 sm:w-11 rounded-full bg-[#00114D] text-white grid place-items-center font-bold shadow-lg text-[11px] sm:text-sm tracking-tight whitespace-nowrap">
                      {item.day}
                    </span>
                    <div className="text-base sm:text-lg font-semibold text-[#00114D] pt-6 sm:pt-0 leading-snug">
                      {item.title}
                    </div>
                    <div className="text-sm sm:text-base text-[#00114D]/80 leading-snug">
                      {item.detail}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 text-sm text-[#00114D]">
              <div className="space-y-2">
                <div className="font-semibold">집결장소</div>
                <div>금요일 저녁 제주도 숙소(미정)</div>
              </div>
              <div className="space-y-1">
                <div className="font-semibold">모집인원</div>
                <div>인원 제한 없음 · 다오름 가입회원만 참여</div>
                <div className="text-xs text-red-600 mt-1">
                  ※ 2월 13일 모집 마감 / 동호회 지침에 따라 변동 가능
                </div>
                <div className="text-xs text-[#00114D]/80 mt-1">
                  ※ 4월 입산 예약 및 모니터링은 3월 3일 09시부터 가능합니다.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white border border-[#00114D]/20 rounded-3xl p-6 shadow-lg mb-10">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-lg font-semibold text-[#00114D] mb-2">날짜 선택</h3>
                <select
                  className="w-full px-4 py-3 rounded-xl bg-white border border-[#00114D]/30 text-[#00114D] focus:outline-none focus:ring-2 focus:ring-[#00114D]"
                  value={selectedDate}
                  onChange={handleDateSelect}
                >
                  <option value="">날짜를 선택하세요</option>
                  {dateOptions.map((option) => (
                    <option
                      key={option.date}
                      value={option.date}
                      style={{
                        color: option.isWeekend ? '#d1436c' : '#00114D',
                        fontWeight: option.isWeekend ? 700 : 500,
                      }}
                    >
                      {option.display}
                    </option>
                  ))}
                </select>
              <p className="text-xs text-[#00114D]/60 mt-1">평일은 제외하고 주말만 선택할 수 있습니다.</p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-[#00114D] mb-2">입산 회차</h3>
              <select
                className="w-full px-4 py-3 rounded-xl bg-white border border-[#00114D]/30 text-[#00114D] focus:outline-none focus:ring-2 focus:ring-[#00114D]"
                value={selectedTime}
                onChange={handleTimeSelect}
                disabled={!selectedDate}
              >
                <option value="">회차를 선택하세요</option>
                {timeOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[#00114D]/70 mt-2">
                계절·운영정책에 따라 회차가 달라질 수 있으니 현장 공지와 함께 확인하세요.
              </p>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-semibold text-[#00114D] mb-2">
              코스 선택 {selectedDisplay && `(${selectedDisplay})`}
            </h3>
            <div className="flex gap-3">
              {courses.map((course) => (
                <button
                  key={course.courseSeq}
                  onClick={() => handleCourseSelect(course.courseSeq)}
                  disabled={!selectedDate || !selectedTime}
                  className={`flex-1 px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${
                    selectedDate && selectedTime
                      ? 'border-[#00114D] bg-white text-[#00114D] hover:bg-[#00114D] hover:text-white'
                      : 'border-[#00114D]/20 bg-gray-50 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {course.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#00114D]/70 mt-2">
              날짜와 회차를 먼저 고른 후 코스를 추가하세요. 같은 날짜·코스·회차 조합은 중복 추가되지 않습니다.
            </p>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <span className="text-sm text-[#00114D]/70">
            10초마다 자동 확인 · 알림 쿨타임 5분 · 회차별 별도 모니터링
          </span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-center">
            {error}
          </div>
        )}

        {monitoringItems.length === 0 && (
          <div className="bg-gray-50 border border-[#00114D]/15 rounded-2xl p-6 text-center text-[#00114D]/70">
            모니터링할 날짜와 코스를 추가하세요.
          </div>
        )}

        {sortedMonitoringGroups.map(([date, { display, items }]) => (
          <div key={date} className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-2 h-8 rounded-full bg-[#00114D]" />
              <h2 className="text-xl font-semibold text-[#00114D]">{display}</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              {items.map((item) => {
                const statusKey = `${item.date}-${item.courseSeq}-${item.visitTm}`;
                const status = statuses[statusKey];
                if (!status) {
                  return (
                    <div
                      key={`${item.date}-${item.courseSeq}-${item.visitTm}-loading`}
                      className="p-6 rounded-2xl border border-[#00114D]/20 bg-gray-50 text-[#00114D]"
                    >
                      데이터를 불러오는 중입니다...
                    </div>
                  );
                }

                const ratio =
                  Number(status.limitCnt || 0) === 0
                    ? 0
                    : (Number(status.reserveCnt || 0) /
                        Number(status.limitCnt || 1)) *
                      100;
                return (
                  <div
                    key={`${item.date}-${item.courseSeq}-${item.visitTm}`}
                    className={`p-6 rounded-2xl border shadow-lg transition-all duration-300 relative ${
                      status.isAvailable
                        ? 'border-[#00114D] bg-[#00114D]/5'
                        : 'border-[#00114D]/15 bg-white'
                      } ${flashCards ? 'flash-animation' : ''}`}
                  >
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-lg font-semibold text-[#00114D]">
                        {status.name}
                      </h3>
                      <span
                        className={`px-4 py-1 rounded-full text-sm font-semibold ${
                          status.isAvailable
                            ? 'bg-[#00114D] text-white'
                            : 'bg-gray-100 text-[#00114D]'
                        }`}
                      >
                        {status.isAvailable ? '예약 가능' : '마감'}
                      </span>
                    </div>

                    <div className="space-y-2 text-[#00114D]">
                      <div className="flex justify-between text-sm">
                        <span>회차</span>
                        <span className="font-semibold">{item.visitLabel}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>총 정원</span>
                        <span className="font-semibold">{status.limitCnt}명</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>예약 인원</span>
                        <span className="font-semibold">
                          {status.reserveCnt}명
                        </span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            status.isAvailable ? 'bg-[#00114D]' : 'bg-red-400'
                          } transition-all`}
                          style={{ width: `${Math.min(ratio, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex justify-between items-center text-sm text-[#00114D]/80">
                      <span>다음 자동 확인까지 {countdown}초</span>
                      <button
                        onClick={() =>
                          handleDeleteMonitoring(item.date, item.courseSeq)
                        }
                        className="text-red-600 hover:text-red-500 font-semibold"
                      >
                        모니터링 삭제
                      </button>
                    </div>

                    {status.isAvailable && (
                      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <p className="text-sm font-semibold text-[#00114D]">
                          지금 바로 예약하세요!
                        </p>
                        <a
                          href="https://visithalla.jeju.go.kr/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#00114D] text-white font-semibold hover:bg-[#00114D]/90 transition-colors shadow-md"
                        >
                          예약하러 가기
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 left-6 sm:left-auto sm:max-w-md">
          <div className="rounded-xl bg-[#00114D] border border-[#00114D] shadow-2xl px-4 py-3 text-white animate-[fadeIn_0.25s_ease]">
            <p className="text-sm font-semibold text-white/90">예약 가능!</p>
            <p className="text-sm">{toast.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
