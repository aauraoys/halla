export interface CourseResponse {
  result: string;
  coursePerson: {
    limitCnt: string;
    reserveCnt: string;
    [key: string]: any;
  };
}

export interface ReservationStatus {
  courseSeq: string;
  isAvailable: boolean;
  limitCnt: string;
  reserveCnt: string;
}