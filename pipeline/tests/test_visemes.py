from lipreadle_pipeline.visemes import phones_to_visemes, spelling_to_visemes


def test_phones_collapse_to_shapes():
    assert phones_to_visemes(["B", "R", "EY1", "V"]) == "mref"
    assert phones_to_visemes(["M", "AE1", "CH"]) == phones_to_visemes(["B", "AE1", "CH"])


def test_repeated_shapes_merge():
    assert phones_to_visemes(["P", "B", "AA1"]) == "ma"
    assert spelling_to_visemes("bomb") == "mom"
