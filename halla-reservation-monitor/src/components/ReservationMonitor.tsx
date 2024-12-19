'use client'
import { useState, useEffect } from 'react';
import { checkReservation } from '../utils/api';
import { ReservationStatus } from '../types/types';

interface CourseInfo {
  courseSeq: string;
  name: string;
}

interface DateInfo {
  date: string;
  display: string;
}

export default function ReservationMonitor() {
  const [statuses, setStatuses] = useState<Record<string, Record<string, ReservationStatus>>>({});
  const [error, setError] = useState<string>('');
  const [isFlashing, setIsFlashing] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [flashCards, setFlashCards] = useState(false);

  const courses: CourseInfo[] = [
    { courseSeq: '244', name: '관음사' },
    { courseSeq: '242', name: '성판악' },
  ];

  const dates: DateInfo[] = [
    { date: '2024.12.28', display: '12월 28일' },
    { date: '2024.12.29', display: '12월 29일' },
    { date: '2024.12.30', display: '12월 30일' },
    { date: '2024.12.31', display: '12월 31일' },
  ];

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ko-KR', { 
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false 
    });
  };

  const checkAvailability = async () => {
    if (isLoading) return;
    
    try {
      setIsLoading(true);
      setLastCheckTime(formatTime(new Date()));
      
      const newStatuses: Record<string, Record<string, ReservationStatus>> = {};

      for (const date of dates) {
        newStatuses[date.date] = {};
        
        const results = await Promise.all(
          courses.map(async (course) => {
            const response = await checkReservation(
              course.courseSeq,
              date.date,
              'TIME1'
            );
            
            const isAvailable = 
              parseInt(response.coursePerson.reserveCnt) < 
              parseInt(response.coursePerson.limitCnt);

            if (isAvailable) {
              setIsFlashing(true);
              alert(`${course.name} ${date.display} 예약 가능합니다!`);
              setTimeout(() => setIsFlashing(false), 5000);
            }

            return {
              courseSeq: course.courseSeq,
              name: course.name,
              isAvailable,
              limitCnt: response.coursePerson.limitCnt,
              reserveCnt: response.coursePerson.reserveCnt,
            };
          })
        );

        results.forEach(result => {
          newStatuses[date.date][result.courseSeq] = result;
        });
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
  }, []);

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
          <h1 className="text-3xl font-bold text-gray-800 mb-2">째히와 윤도리의 한라산 예약 대작전</h1>
          <h2 className="text-xl font-bold text-gray-800 mb-2">예약 가능한 날짜가 나오면 초록색으로 표시되고 알림이 떠요!</h2>
          <h2 className="text-xl font-bold text-blue-800 mb-2">첫타임인 05시만을 관찰합니다.</h2>
          
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <div className="flex justify-center items-center space-x-8 mb-3">
              <div className="text-gray-600">
                <span className="font-medium">마지막 확인: </span>
                <span className="text-blue-600">{lastCheckTime}</span>
              </div>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full progress-bar" />
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

        {dates.map(date => (
          <div key={date.date} className="mb-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">{date.display}</h2>
            <div className="grid gap-6 md:grid-cols-2">
              {courses.map((course) => {
                const status = statuses[date.date]?.[course.courseSeq];
                if (!status) return null;

                return (
                  <div
                    key={`${date.date}-${course.courseSeq}`}
                    className={`
                      p-6 rounded-lg shadow-lg transition-all duration-300
                      ${status.isAvailable ? 'bg-green-50 border-2 border-green-500' : 'bg-white border border-gray-200'}
                      ${flashCards ? 'flash-animation' : ''}
                    `}
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-gray-800">{status.name}</h3>
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
                      <div className="flex justify-between items-center text-gray-600">
                        <span>총 정원</span>
                        <span className="font-medium">{status.limitCnt}명</span>
                      </div>
                      <div className="flex justify-between items-center text-gray-600">
                        <span>예약 인원</span>
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