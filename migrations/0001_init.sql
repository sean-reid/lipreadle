CREATE TABLE puzzles (
  number INTEGER PRIMARY KEY,
  word TEXT NOT NULL,
  clip TEXT NOT NULL,
  accent TEXT NOT NULL,
  source TEXT NOT NULL
);

CREATE TABLE results (
  number INTEGER NOT NULL,
  guesses INTEGER NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (number, guesses)
);
