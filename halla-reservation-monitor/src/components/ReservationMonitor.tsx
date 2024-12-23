'use client'
import { useState, useEffect } from 'react';
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
  lastAlertTime?: number;
}

export default function ReservationMonitor() {
  const [statuses, setStatuses] = useState<Record<string, Record<string, ReservationStatus>>>({});
  const [error, setError] = useState<string>('');
  const [isFlashing, setIsFlashing] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [flashCards, setFlashCards] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedDisplay, setSelectedDisplay] = useState<string>('');
  const [monitoringItems, setMonitoringItems] = useState<MonitoringItem[]>([]);

  const courses: CourseInfo[] = [
    { courseSeq: '244', name: '관음사' },
    { courseSeq: '242', name: '성판악' },
  ];

  const generateDateOptions = () => {
    const options = [];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    for (let i = 0; i < 14; i++) {
      const date = new Date(tomorrow);
      date.setDate(date.getDate() + i);
      
      const dateString = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
      const displayString = `${date.getMonth() + 1}월 ${date.getDate()}일`;
      
      options.push({
        date: dateString,
        display: displayString
      });
    }
    return options;
  };

  const dateOptions = generateDateOptions();

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ko-KR', { 
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false 
    });
  };

  const handleDateSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const option = dateOptions.find(opt => opt.date === event.target.value);
    if (option) {
      setSelectedDate(option.date);
      setSelectedDisplay(option.display);
    }
  };

  const handleDeleteMonitoring = (date: string, courseSeq: string) => {
    setMonitoringItems(prev => prev.filter(item => 
      !(item.date === date && item.courseSeq === courseSeq)
    ));
  };

  const handleCourseSelect = (courseSeq: string) => {
    if (selectedDate && !monitoringItems.some(item => 
      item.date === selectedDate && item.courseSeq === courseSeq
    )) {
      setMonitoringItems(prev => [...prev, {
        date: selectedDate,
        display: selectedDisplay,
        courseSeq
      }]);
      setSelectedDate('');
      setSelectedDisplay('');
    }
  };

  const checkAvailability = async () => {
    if (isLoading || monitoringItems.length === 0) return;
    
    try {
      setIsLoading(true);
      setLastCheckTime(formatTime(new Date()));
      
      const newStatuses: Record<string, Record<string, ReservationStatus>> = {};
      const currentTime = Date.now();

      for (const item of monitoringItems) {
        if (!newStatuses[item.date]) {
          newStatuses[item.date] = {};
        }
        
        const response = await checkReservation(
          item.courseSeq,
          item.date,
          'TIME1'
        );
        
        const isAvailable = 
          parseInt(response.coursePerson.reserveCnt) < 
          parseInt(response.coursePerson.limitCnt);

        if (isAvailable && (!item.lastAlertTime || (currentTime - item.lastAlertTime) > 300000)) {
          setIsFlashing(true);
          const courseName = courses.find(c => c.courseSeq === item.courseSeq)?.name;
          alert(`${courseName} ${item.display} 예약 가능합니다!`);
          
          setMonitoringItems(prev => prev.map(prevItem => 
            prevItem.date === item.date && prevItem.courseSeq === item.courseSeq
              ? { ...prevItem, lastAlertTime: currentTime }
              : prevItem
          ));
          
          setTimeout(() => setIsFlashing(false), 5000);
        }

        const courseName = courses.find(c => c.courseSeq === item.courseSeq)?.name;
        newStatuses[item.date][item.courseSeq] = {
          courseSeq: item.courseSeq,
          name: courseName || '',
          isAvailable,
          limitCnt: response.coursePerson.limitCnt,
          reserveCnt: response.coursePerson.reserveCnt,
        };
      }

      setFlashCards(true);
      setTimeout(() => setFlashCards(false), 1000);
      
      setStatuses(newStatuses);
      setError('');
    } catch (err) {
      setError('예약 상태 확인 중 오류가 발생했습니다');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAvailability();
    const intervalId = setInterval(checkAvailability, 10000);
    return () => clearInterval(intervalId);
  }, [monitoringItems]);

  return (
    <div 
      className={`min-h-screen bg-gray-50 ${isFlashing ? 'animate-[pulse_1s_ease-in-out_infinite]' : ''}`}
    >
      <style jsx>{`
        @keyframes progressBar {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        
        @keyframes cardFlash {
          0% { transform: scale(1); }
          50% { transform: scale(1.02); opacity: 0.8; }
          100% { transform: scale(1); }
        }
        
        .progress-bar {
          animation: progressBar 10s linear infinite;
        }
        
        .flash-animation {
          animation: cardFlash 1s ease-in-out;
        }
      `}</style>

      <div className="max-w-6xl mx-auto p-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-black mb-2">째히와 윤도리의 한라산 예약 대작전</h1>
          <h2 className="text-xl font-bold text-black mb-2">예약 가능한 날짜가 나오면 초록색으로 표시되고 알림이 떠요!</h2>
          <h2 className="text-xl font-bold text-blue-900 mb-2">첫타임인 05시만을 관찰합니다.</h2>
          
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <div className="flex justify-center items-center space-x-8 mb-3">
              <div className="text-gray-900">
                <span className="font-medium">마지막 확인: </span>
                <span className="text-blue-900">{lastCheckTime}</span>
              </div>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full progress-bar" />
            </div>
          </div>

          {/* Date and Course Selection */}
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <div className="max-w-sm mx-auto">
              <div className="mb-6">
                <h3 className="text-lg text-black font-bold mb-2">날짜 선택</h3>
                <select
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  value={selectedDate}
                  onChange={handleDateSelect}
                >
                  <option value="">날짜를 선택하세요</option>
                  {dateOptions.map(option => (
                    <option key={option.date} value={option.date}>
                      {option.display}
                    </option>
                  ))}
                </select>
              </div>

              {selectedDate && (
                <div>
                  <h3 className="text-lg text-black font-bold mb-2">코스 선택 ({selectedDisplay})</h3>
                  <div className="flex justify-center gap-4">
                    {courses.map(course => (
                      <button
                        key={course.courseSeq}
                        onClick={() => handleCourseSelect(course.courseSeq)}
                        className="flex-1 px-6 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors text-black font-medium"
                      >
                        {course.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <a 
            href="https://visithalla.jeju.go.kr/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-colors duration-300 mb-6"
          >
            예약하러 가기
          </a>
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6 text-center">
            {error}
          </div>
        )}

        {/* Monitoring Cards */}
        {Object.entries(
          monitoringItems.reduce((acc, item) => {
            if (!acc[item.date]) {
              acc[item.date] = {
                display: item.display,
                items: []
              };
            }
            acc[item.date].items.push(item);
            return acc;
          }, {} as Record<string, { display: string; items: MonitoringItem[] }>)
        ).map(([date, { display, items }]) => (
          <div key={date} className="mb-8">
            <h2 className="text-xl font-bold text-black mb-4">{display}</h2>
            <div className="grid gap-6 md:grid-cols-2">
              {items.map(item => {
                const status = statuses[item.date]?.[item.courseSeq];
                if (!status) return null;

                return (
                  <div
                    key={`${item.date}-${item.courseSeq}`}
                    className={`
                      p-6 rounded-lg shadow-lg transition-all duration-300 relative
                      {status.isAvailable ? 'bg-green-50 border-2 border-green-500' : 'bg-white border border-gray-200'}
                      ${flashCards ? 'flash-animation' : ''}
                    `}
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-black">{status.name}</h3>
                      <span 
                        className={`
                          px-4 py-1 rounded-full text-sm font-semibold
                          ${status.isAvailable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
                        `}
                      >
                        {status.isAvailable ? '예약가능' : '마감'}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-gray-900">
                        <span className="font-medium">총 정원</span>
                        <span className="font-medium">{status.limitCnt}명</span>
                      </div>
                      <div className="flex justify-between items-center text-gray-900">
                        <span className="font-medium">예약 인원</span>
                        <span className="font-medium">{status.reserveCnt}명</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full mt-2">
                        <div 
                          className={`h-2 rounded-full transition-all duration-300 ${
                            status.isAvailable ? 'bg-green-500' : 'bg-red-500'
                          }`}
                          style={{
                            width: `${(parseInt(status.reserveCnt) / parseInt(status.limitCnt)) * 100}%`
                          }}
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={() => handleDeleteMonitoring(item.date, item.courseSeq)}
                        className="px-4 py-2 text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        모니터링 삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}