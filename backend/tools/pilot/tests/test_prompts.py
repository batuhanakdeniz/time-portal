import prompts
from pilot_common import BUCKETS, PLACES


def test_every_place_and_bucket_has_a_scene():
    for p in PLACES:
        for b in BUCKETS:
            assert (p.id, b.id) in prompts.SCENES


def test_prompt_excludes_people_and_starts_with_erp_trigger():
    c = prompts.compose("trabzon-merkez", "roma")
    assert c["prompt"].startswith(prompts.ERP_TRIGGER)
    assert "no people" in c["prompt"] and "no human figures" in c["prompt"]
    assert "people" in c["negative"] and "human figures" in c["negative"]
    assert c["confidence"] == "yorum"
    assert not prompts.compose("konya-cumra", "neolitik", erp_trigger=False)["prompt"].startswith("Fill")


def test_neolithic_is_fiction_label():
    assert prompts.compose("konya-cumra", "neolitik")["confidence"] == "kurgu"
