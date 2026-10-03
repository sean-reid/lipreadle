import { ApiError, checkGuess, fetchPuzzle, fetchStats, postResult, revealAnswer } from "./api";
import { percentile, render as renderHistogram } from "./histogram";
import { GAVE_UP, GIVE_UP_AFTER } from "../shared/api";
import { MATCH_PHRASES } from "../shared/feedback";
import { guessOrder } from "./order";
import { share, shareText } from "./share";
import {
  averageGuesses,
  loadState,
  loadStats,
  loadTheme,
  recordGiveUp,
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
const giveUpButton = $<HTMLButtonElement>("give-up");
const yesterday = $<HTMLParagraphElement>("yesterday");

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

// Once the word is known the clip plays with sound; a restored game needs this tap to unmute.
$("clip-tap").addEventListener("click", () => {
  if (state?.solved || state?.gaveUp) video.muted = false;
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

// The newest guess is pinned above the ranked list once there is a list to rank it in.
function renderGuesses(s: GameState): void {
  const lastIndex = s.guesses.length - 1;
  const row = (i: number, extra = ""): HTMLLIElement => {
    const hit = s.solved && i === lastIndex;
    const li = document.createElement("li");
    li.className = [hit ? "hit" : "", i === lastIndex ? "recent" : "", extra].join(" ").trim();
    const w = document.createElement("span");
    w.className = "word";
    w.textContent = s.guesses[i] ?? "";
    const v = document.createElement("span");
    v.className = "verdict";
    v.textContent = hit ? "yes" : MATCH_PHRASES[s.matches[i] ?? 0];
    li.append(w, v);
    return li;
  };
  const ranked = guessOrder(s.matches).map((i) => row(i));
  const pin = s.guesses.length >= 2 && !over(s) ? [row(lastIndex, "latest")] : [];
  guessList.replaceChildren(...pin, ...ranked);
}

function over(s: GameState): boolean {
  return s.solved || s.gaveUp;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state || over(state) || busy) return;
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
      await finish(state);
    } else {
      renderGuesses(state);
      saveState(state);
      updateGiveUp();
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

// The give-up link appears after enough wrong guesses and asks twice.
let armTimer: ReturnType<typeof setTimeout> | undefined;
function updateGiveUp(): void {
  const show = !!state && !over(state) && state.guesses.length >= GIVE_UP_AFTER;
  giveUpButton.hidden = !show;
  if (!show) disarmGiveUp();
}

function disarmGiveUp(): void {
  clearTimeout(armTimer);
  giveUpButton.classList.remove("armed");
  giveUpButton.textContent = "Give up";
}

giveUpButton.addEventListener("click", async () => {
  if (!state || over(state) || busy) return;
  if (!giveUpButton.classList.contains("armed")) {
    giveUpButton.classList.add("armed");
    giveUpButton.textContent = "Show the answer?";
    armTimer = setTimeout(disarmGiveUp, 4000);
    return;
  }
  disarmGiveUp();
  busy = true;
  try {
    const { word } = await revealAnswer(state.number);
    state.gaveUp = true;
    state.answer = word;
    answer = word;
    saveState(state);
    renderGuesses(state);
    await finish(state);
  } catch {
    say("Couldn't fetch the answer. Try again.");
  } finally {
    busy = false;
  }
});

async function finish(s: GameState, fresh = true): Promise<void> {
  const n = s.guesses.length;
  const mine = s.gaveUp ? GAVE_UP : n;
  input.value = answer ?? "";
  input.disabled = true;
  renderSlots();
  form.classList.add(s.gaveUp ? "gave-up" : "solved");
  intro.hidden = true;
  giveUpButton.hidden = true;
  resultTitle.hidden = s.gaveUp;
  resultTitle.textContent = s.gaveUp ? "" : n === 1 ? "Solved in one." : `Solved in ${n}.`;
  result.hidden = false;
  if (fresh) {
    video.muted = false;
    playFromStart();
  }
  tickCountdown();
  try {
    const stats = fresh ? await postResult(s.number, mine) : await fetchStats(s.number);
    renderHistogram(histogram, stats.counts, mine);
    const p = percentile(stats.counts, mine);
    const players = stats.total === 1 ? "player" : "players";
    histogramNote.textContent =
      p === null
        ? `${stats.total} ${players} so far today.`
        : `${stats.total} ${players} so far today. You did at least as well as ${p}% of them.`;
  } catch {
    histogramNote.textContent = "Today's numbers aren't available right now.";
  }
  if (fresh)
    saveStats(s.gaveUp ? recordGiveUp(loadStats()) : recordSolve(loadStats(), s.number, n));
}

shareButton.addEventListener("click", async () => {
  if (!state) return;
  const outcome = await share(
    shareText(state.number, state.guesses.length, location.origin, state.gaveUp),
  );
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
    ["Played", String(s.played)],
    ["Solved", String(s.solved)],
    ["Gave up", String(s.gaveUp)],
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
    if (puzzle.yesterday) {
      yesterday.textContent = `Yesterday: ${puzzle.yesterday}`;
      yesterday.hidden = false;
    }
    if (state.guesses.length > 0) intro.hidden = true;
    if (state.solved) {
      answer = state.guesses[state.guesses.length - 1] ?? null;
      await finish(state, false);
    } else if (state.gaveUp) {
      answer = state.answer ?? null;
      await finish(state, false);
    } else {
      updateGiveUp();
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
