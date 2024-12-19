export interface CourseResponse {
  result: string;
  coursePerson: {
    limitCnt: string;
    reserveCnt: string;
    fcltySeq?: string;
    courseSeq?: string;
    [key: string]: string | undefined;
  };
}

export interface ReservationStatus {
  courseSeq: string;
  name: string;
  isAvailable: boolean;
  limitCnt: string;
  reserveCnt: string;
}