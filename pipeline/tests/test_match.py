import re

from lipreadle_pipeline.channels import Channel
from lipreadle_pipeline.match import find_matches, parse_title

COLLINS = Channel(
    name="collins",
    url="https://example.invalid",
    title=re.compile(
        r"^How to pronounce (?P<word>.+?) in (?P<accent>American|British) English\s*$",
        re.IGNORECASE,
    ),
    accent=None,
    banner_top=0.74,
)


def test_parse_title_extracts_word_and_accent():
    assert parse_title(COLLINS, "How to pronounce BRAVE in American English") == (
        "brave",
        "American",
    )
    assert parse_title(COLLINS, "The Collins Word of the Year") is None


def test_find_matches_filters_length_dictionary_and_duration():
    rows = [
        ("a", 10, "How to pronounce BRAVE in British English"),
        ("b", 10, "How to pronounce BRAVERY in British English"),
        ("c", 10, "How to pronounce ZZZZZ in British English"),
        ("d", 90, "How to pronounce CRANE in British English"),
        ("e", 10, "How to pronounce Résumé in British English"),
    ]
    found = find_matches(COLLINS, rows, {"brave", "crane", "zzzzz"}, min_zipf=2.0)
    assert [m.video for m in found] == ["a"]
    assert found[0].key() == "brave-british"
