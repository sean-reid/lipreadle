import { ApiError, checkGuess, fetchPuzzle, fetchStats, postResult } from "./api";
import { percentile, render as renderHistogram } from "./histogram";
import { MATCH_PHRASES } from "../shared/feedback";
import { guessOrder } from "./order";
import { share, shareText } from "./share";
import {
  averageGuesses,
  loadState,
  loadStats,
  loadTheme,
  recordSolve,
  saveState,
  saveStats,
  saveTheme,
  type GameState,
} from "./storage";
import { formatCountdown, formatIssueDate, localDate, msUntilMidnight } from "./time";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const video = $<HTMLVideoElement>("clip");
const notice = $<HTMLParagraphElement>("notice");
const issue = $<HTMLParagraphElement>("issue");
const intro = $<HTMLParagraphElement>("intro");
const form = $<HTMLFormElement>("guess-form");
const input = $<HTMLInputElement>("guess-input");
const slots = Array.from($<HTMLDivElement>("slots").children) as HTMLSpanElement[];
const feedback = $<HTMLParagraphElement>("feedback");
const guessList = $<HTMLOListElement>("guesses");
const result = $<HTMLElement>("result");
const resultTitle = $<HTMLHeadingElement>("result-title");
const histogram = $<HTMLDivElement>("histogram");
const histogramNote = $<HTMLParagraphElement>("histogram-note");
const shareButton = $<HTMLButtonElement>("share");
const shareDone = $<HTMLSpanElement>("share-done");
const next = $<HTMLParagraphElement>("next");

let state: GameState | null = null;
let answer: string | null = null;
let busy = false;

const LOOP_PAUSE_MS = 700;
let loopTimer: ReturnType<typeof setTimeout> | undefined;
const tapLabel = $<HTMLSpanElement>("clip-tap-label");

// Browsers that refuse autoplay reject play(); the label tells the player to tap.
function tryPlay(): void {
  void video.play().then(
    () => (tapLabel.hidden = true),
    () => (tapLabel.hidden = false),
  );
}

function playFromStart(): void {
  clearTimeout(loopTimer);
  video.currentTime = 0;
  tryPlay();
}

video.addEventListener("ended", () => {
  clearTimeout(loopTimer);
  loopTimer = setTimeout(playFromStart, LOOP_PAUSE_MS);
});

video.addEventListener("playing", () => (tapLabel.hidden = true));

const AUTOPLAY_GRACE_MS = 1500;

// iOS Safari sometimes ignores the muted attribute and defers loading until
// play is requested, so set both from script, load explicitly, and fall back to
// the tap label if nothing is playing shortly after the source is set.
function loadClip(src: string): void {
  video.muted = true;
  video.defaultMuted = true;
  video.src = src;
  video.load();
  const attempt = () => video.paused && tryPlay();
  video.addEventListener("loadedmetadata", attempt, { once: true });
  video.addEventListener("canplay", attempt, { once: true });
  setTimeout(() => {
    if (video.paused) tapLabel.hidden = false;
  }, AUTOPLAY_GRACE_MS);
}

// Once solved the clip plays with sound; a restored solve needs this tap to unmute.
$("clip-tap").addEventListener("click", () => {
  if (state?.solved) video.muted = false;
  playFromStart();
});

const slow = $<HTMLButtonElement>("slow");
slow.addEventListener("click", () => {
  const on = slow.getAttribute("aria-pressed") !== "true";
  slow.setAttribute("aria-pressed", String(on));
  video.playbackRate = on ? 0.5 : 1;
});

function showNotice(text: string): void {
  notice.textContent = text;
  notice.hidden = false;
  video.hidden = true;
}

function renderSlots(): void {
  const value = input.value
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, 5);
  if (value !== input.value) input.value = value;
  slots.forEach((slot, i) => {
    slot.textContent = value[i] ?? "";
    slot.classList.toggle("filled", i < value.length);
    slot.classList.toggle("current", i === value.length && document.activeElement === input);
  });
}

input.addEventListener("input", renderSlots);
input.addEventListener("focus", renderSlots);
input.addEventListener("blur", renderSlots);

function say(text: string): void {
  feedback.textContent = text;
}

function shake(): void {
  form.classList.remove("shake");
  void form.offsetWidth;
  form.classList.add("shake");
}

function renderGuesses(s: GameState): void {
  const lastIndex = s.guesses.length - 1;
  guessList.replaceChildren(
    ...guessOrder(s.matches).map((i) => {
      const hit = s.solved && i === lastIndex;
      const li = document.createElement("li");
      li.className = hit ? "hit" : "";
      const w = document.createElement("span");
      w.className = "word";
      w.textContent = s.guesses[i] ?? "";
      const v = document.createElement("span");
      v.className = "verdict";
      v.textContent = hit ? "yes" : MATCH_PHRASES[s.matches[i] ?? 0];
      li.append(w, v);
      return li;
    }),
  );
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state || state.solved || busy) return;
  const guess = input.value.toLowerCase();
  if (guess.length !== 5) {
    shake();
    say("Five letters.");
    return;
  }
  if (state.guesses.includes(guess)) {
    shake();
    say("Already tried that one.");
    return;
  }
  busy = true;
  try {
    const res = await checkGuess(state.number, guess);
    if (!res.valid) {
      shake();
      say("Not in the word list.");
      return;
    }
    say("");
    intro.hidden = true;
    state.guesses.push(guess);
    state.matches.push(res.match);
    if (res.correct) {
      state.solved = true;
      answer = guess;
      renderGuesses(state);
      saveState(state);
      await solved(state);
    } else {
      renderGuesses(state);
      saveState(state);
      if (input.value.toLowerCase() === guess) input.value = "";
      renderSlots();
      playFromStart();
    }
  } catch (err) {
    shake();
    say(
      err instanceof ApiError && err.status === 429
        ? "Too fast. Take a breath."
        : "Couldn't check that. Try again.",
    );
  } finally {
    busy = false;
  }
});

async function solved(s: GameState, fresh = true): Promise<void> {
  const n = s.guesses.length;
  input.value = answer ?? s.guesses[n - 1] ?? "";
  input.disabled = true;
  renderSlots();
  form.classList.add("solved");
  intro.hidden = true;
  resultTitle.textContent = n === 1 ? "Solved in one." : `Solved in ${n}.`;
  result.hidden = false;
  if (fresh) {
    video.muted = false;
    playFromStart();
  }
  tickCountdown();
  try {
    const stats = fresh ? await postResult(s.number, n) : await fetchStats(s.number);
    renderHistogram(histogram, stats.counts, n);
    const p = percentile(stats.counts, n);
    const players = stats.total === 1 ? "player" : "players";
    histogramNote.textContent =
      p === null
        ? `${stats.total} ${players} so far today.`
        : `${stats.total} ${players} so far today. You did at least as well as ${p}% of them.`;
  } catch {
    histogramNote.textContent = "Today's numbers aren't available right now.";
  }
  if (fresh) saveStats(recordSolve(loadStats(), s.number, n));
}

shareButton.addEventListener("click", async () => {
  if (!state) return;
  const outcome = await share(shareText(state.number, state.guesses.length, location.origin));
  shareDone.textContent =
    outcome === "copied" ? "Copied." : outcome === "failed" ? "Couldn't copy." : "";
});

let countdownTimer: ReturnType<typeof setTimeout> | undefined;
function tickCountdown(): void {
  clearTimeout(countdownTimer);
  const ms = msUntilMidnight();
  next.textContent = `Next word in ${formatCountdown(ms)}.`;
  countdownTimer = setTimeout(tickCountdown, Math.min(60_000, ms + 500));
  if (ms < 1000) location.reload();
}

const themeButton = $<HTMLButtonElement>("theme");
function applyTheme(): void {
  const t = loadTheme();
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const dark = getComputedStyle(document.documentElement).colorScheme.includes("dark");
  themeButton.textContent = dark ? "Light" : "Dark";
}
themeButton.addEventListener("click", () => {
  const dark = getComputedStyle(document.documentElement).colorScheme.includes("dark");
  saveTheme(dark ? "light" : "dark");
  applyTheme();
});
applyTheme();

const howDialog = $<HTMLDialogElement>("how-dialog");
$("how").addEventListener("click", () => howDialog.showModal());

const statsDialog = $<HTMLDialogElement>("stats-dialog");
$("stats-button").addEventListener("click", () => {
  const s = loadStats();
  const rows: [string, string][] = [
    ["Solved", String(s.played)],
    ["Average guesses", averageGuesses(s)],
    ["Current streak", String(s.streak)],
    ["Best streak", String(s.bestStreak)],
  ];
  $("stats").replaceChildren(
    ...rows.flatMap(([k, v]) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      return [dt, dd];
    }),
  );
  statsDialog.showModal();
});

async function start(): Promise<void> {
  const date = localDate();
  try {
    const puzzle = await fetchPuzzle(date);
    issue.textContent = `No. ${puzzle.number} · ${formatIssueDate(date)}`;
    state = loadState(puzzle.number);
    loadClip(puzzle.clip);
    renderGuesses(state);
    if (state.guesses.length > 0) intro.hidden = true;
    if (state.solved) {
      answer = state.guesses[state.guesses.length - 1] ?? null;
      await solved(state, false);
    } else {
      input.focus({ preventScroll: true });
    }
  } catch (err) {
    issue.textContent = formatIssueDate(date);
    if (err instanceof ApiError && err.status === 404) {
      showNotice("No word today. Come back tomorrow.");
    } else {
      showNotice("Couldn't load today's clip.");
    }
    input.disabled = true;
    intro.hidden = true;
  }
}

void start();
