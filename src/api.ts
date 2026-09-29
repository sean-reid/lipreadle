import type { GuessResponse, PuzzleResponse, RevealResponse, StatsResponse } from "../shared/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const fetchPuzzle = (date: string) =>
  request<PuzzleResponse>(`/api/puzzle?date=${encodeURIComponent(date)}`);

export const checkGuess = (number: number, guess: string) =>
  request<GuessResponse>("/api/guess", post({ number, guess }));

export const postResult = (number: number, guesses: number) =>
  request<StatsResponse>("/api/result", post({ number, guesses }));

export const fetchStats = (number: number) => request<StatsResponse>(`/api/stats/${number}`);

export const revealAnswer = (number: number) =>
  request<RevealResponse>("/api/reveal", post({ number }));
