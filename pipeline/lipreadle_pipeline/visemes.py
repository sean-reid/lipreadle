"""Maps words to viseme strings via the CMU pronouncing dictionary.

A viseme is a mouth shape. Several phonemes share one, which is what makes
lipreading ambiguous, and it is exactly that ambiguity the guess feedback
measures. Each class gets one letter so a word becomes a short string.
"""

import re

import cmudict

PHONE_TO_VISEME = {
    # lips closed
    "P": "m",
    "B": "m",
    "M": "m",
    # lower lip on upper teeth
    "F": "f",
    "V": "f",
    # tongue between teeth
    "TH": "t",
    "DH": "t",
    # lips slightly open, tongue behind teeth
    "T": "d",
    "D": "d",
    "N": "d",
    "L": "l",
    "S": "s",
    "Z": "s",
    # lips pushed forward
    "CH": "c",
    "JH": "c",
    "SH": "c",
    "ZH": "c",
    # open, little lip cue
    "K": "k",
    "G": "k",
    "NG": "k",
    "HH": "k",
    "Y": "i",
    # rounded
    "W": "w",
    "R": "r",
    "UW": "w",
    "UH": "w",
    "OW": "o",
    "AO": "o",
    "OY": "o",
    # wide
    "IY": "i",
    "IH": "i",
    "EY": "e",
    "EH": "e",
    "AE": "e",
    # open
    "AA": "a",
    "AH": "a",
    "AY": "a",
    "AW": "a",
    "ER": "r",
}

STRESS = re.compile(r"\d")

# Rough spelling fallback for words the dictionary lacks.
LETTER_TO_VISEME = {
    "p": "m", "b": "m", "m": "m",
    "f": "f", "v": "f",
    "t": "d", "d": "d", "n": "d", "l": "l", "s": "s", "z": "s",
    "c": "k", "k": "k", "g": "k", "h": "k", "q": "k", "x": "s", "j": "c",
    "w": "w", "r": "r", "o": "o", "u": "w",
    "i": "i", "e": "e", "y": "i", "a": "a",
}  # fmt: skip


def phones_to_visemes(phones: list[str]) -> str:
    out = []
    for p in phones:
        v = PHONE_TO_VISEME.get(STRESS.sub("", p))
        if v and (not out or out[-1] != v):
            out.append(v)
    return "".join(out)


def spelling_to_visemes(word: str) -> str:
    out = []
    for ch in word:
        v = LETTER_TO_VISEME.get(ch)
        if v and (not out or out[-1] != v):
            out.append(v)
    return "".join(out)


def build_table(words: list[str]) -> dict[str, str]:
    d = cmudict.dict()
    table = {}
    for w in words:
        prons = d.get(w)
        table[w] = phones_to_visemes(prons[0]) if prons else spelling_to_visemes(w)
    return table


def write_table(path, table: dict[str, str]) -> None:
    with open(path, "w") as f:
        for w in sorted(table):
            f.write(f"{w} {table[w]}\n")
