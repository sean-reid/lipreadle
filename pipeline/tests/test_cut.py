import numpy as np

from lipreadle_pipeline.cut import find_takes


def test_find_takes_splits_two_utterances_and_ignores_blips():
    hop = 0.02
    rms = np.full(500, 0.01)
    rms[80:150] = 0.3
    rms[300:360] = 0.25
    rms[420] = 0.5
    takes = find_takes(rms, hop)
    assert len(takes) == 2
    assert abs(takes[0][0] - 1.6) < 0.05 and abs(takes[0][1] - 3.0) < 0.05
    assert abs(takes[1][0] - 6.0) < 0.05


def test_find_takes_merges_a_short_gap():
    rms = np.full(300, 0.01)
    rms[50:80] = 0.3
    rms[85:120] = 0.3
    assert len(find_takes(rms, 0.02)) == 1
