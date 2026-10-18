"""Tests for the code-rule checker that every carrier's CI runs."""

import importlib.util
import json
from pathlib import Path

import pytest

SCRIPT = Path(__file__).parent.parent / ".github" / "scripts" / "check_code_rules.py"
spec = importlib.util.spec_from_file_location("check_code_rules", SCRIPT)
rules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rules)


def _repo(tmp_path, source: str, hacs: str = "2024.12.0") -> Path:
    package = tmp_path / "custom_components" / "demo"
    package.mkdir(parents=True)
    (package / "mod.py").write_text(source)
    (tmp_path / "hacs.json").write_text(json.dumps({"homeassistant": hacs}))
    return tmp_path


def _run(root: Path, monkeypatch, capsys) -> tuple[int, str]:
    monkeypatch.chdir(root)
    monkeypatch.setenv("DOMAIN", "demo")
    code = rules.main()
    return code, capsys.readouterr().out


def test_clean_repo_passes(tmp_path, monkeypatch, capsys):
    root = _repo(tmp_path, "from zoneinfo import ZoneInfo\nTZ = ZoneInfo('Europe/Rome')\n")
    assert _run(root, monkeypatch, capsys)[0] == 0


def test_zoneinfo_inside_a_function_is_flagged(tmp_path, monkeypatch, capsys):
    root = _repo(
        tmp_path,
        "from zoneinfo import ZoneInfo\n\n\ndef f():\n    return ZoneInfo('Europe/Rome')\n",
    )
    code, out = _run(root, monkeypatch, capsys)
    assert code == 1
    assert "mod.py:5" in out and "ZoneInfo" in out


def test_zoneinfo_marker_allows_it(tmp_path, monkeypatch, capsys):
    root = _repo(
        tmp_path,
        "from zoneinfo import ZoneInfo\n\n\ndef f():\n"
        "    # suite: allow zoneinfo (preloaded by the coordinator)\n"
        "    return ZoneInfo('Europe/Rome')\n",
    )
    assert _run(root, monkeypatch, capsys)[0] == 0


def test_browser_user_agent_is_flagged_and_marker_allows_it(tmp_path, monkeypatch, capsys):
    ua = '"Mozilla/5.0 (X11) Chrome/130.0 Safari/537.36"'
    flagged = _repo(tmp_path / "a", f"UA = (\n    {ua}\n)\n")
    code, out = _run(flagged, monkeypatch, capsys)
    assert code == 1 and "User-Agent" in out

    allowed = _repo(
        tmp_path / "b",
        f"# suite: allow browser user-agent (the CDN refuses a plain client)\nUA = (\n    {ua}\n)\n",
    )
    assert _run(allowed, monkeypatch, capsys)[0] == 0


@pytest.mark.parametrize(
    "source",
    [
        "raise UpdateFailed('x', retry_after=3)\n",
        "raise UpdateFailed(\n    'x',\n    retry_after=3,\n)\n",
    ],
)
def test_retry_after_needs_2025_12(tmp_path, monkeypatch, capsys, source):
    low = _repo(tmp_path / "low", source)
    code, out = _run(low, monkeypatch, capsys)
    assert code == 1 and "2025.12.0" in out

    ok = _repo(tmp_path / "ok", source, hacs="2025.12.0")
    assert _run(ok, monkeypatch, capsys)[0] == 0


def test_missing_declared_minimum_fails(tmp_path, monkeypatch, capsys):
    root = _repo(tmp_path, "X = 1\n")
    (root / "hacs.json").write_text("{}")
    code, out = _run(root, monkeypatch, capsys)
    assert code == 1 and "no `homeassistant` minimum" in out


def test_sync_get_time_zone_inside_a_function_is_flagged(tmp_path, monkeypatch, capsys):
    root = _repo(
        tmp_path,
        "from homeassistant.util import dt as dt_util\n\n\ndef f(name):\n"
        "    return dt_util.get_time_zone(name)\n",
    )
    code, out = _run(root, monkeypatch, capsys)
    assert code == 1 and "mod.py:5" in out


def test_async_get_time_zone_is_fine(tmp_path, monkeypatch, capsys):
    root = _repo(
        tmp_path,
        "from homeassistant.util import dt as dt_util\n\n\nasync def f(name):\n"
        "    return await dt_util.async_get_time_zone(name)\n",
    )
    assert _run(root, monkeypatch, capsys)[0] == 0
