export async function checkReservation(courseSeq: string, visitDt: string, visitTm: string): Promise<CourseResponse> {
  const response = await fetch('/api/reservation/coursePersonAjax.do', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      courseSeq,
      visitDt,
      visitTm,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch reservation data');
  }

  return response.json();
}