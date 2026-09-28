export function shareText(number: number, guesses: number, url: string): string {
  const noun = guesses === 1 ? "guess" : "guesses";
  return `Lipreadle No. ${number}, ${guesses} ${noun}\n${url}`;
}

export async function share(text: string): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator.share === "function" && /Mobi|Android/i.test(navigator.userAgent)) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch {
      // fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
