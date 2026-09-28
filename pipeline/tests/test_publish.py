from lipreadle_pipeline.publish import choose_per_word, schedule


def test_choose_per_word_is_deterministic_and_one_per_word():
    approved = ["brave-american", "brave-british", "crane-british"]
    a = choose_per_word(approved)
    b = choose_per_word(list(reversed(approved)))
    assert a == b
    assert set(a) == {"brave", "crane"}
    assert a["brave"] in {"brave-american", "brave-british"}


def test_schedule_is_a_seeded_permutation_from_start():
    words = ["brave", "crane", "grave", "light"]
    rows = schedule(words, start=10, batch=10)
    assert [n for n, _ in rows] == [10, 11, 12, 13]
    assert sorted(w for _, w in rows) == sorted(words)
    assert rows == schedule(list(reversed(words)), start=10, batch=10)
