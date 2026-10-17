"""Run pip-compile (pip-tools) with a fix for its PyPI JSON API URL.

pip-tools 7.6.x turns the index URL https://pypi.org/simple into the JSON base https://pypi.org/
and requests https://pypi.org/<name>/json, which is a 404. It then falls back to downloading every
distribution file of every pinned version to hash it locally (gigabytes for ruff/mypy). With the
correct base (https://pypi.org/pypi/) it reads the same SHA-256 digests from PyPI's JSON API.

Usage (from backend/, ideally on Linux like CI and the image):
    python requirements/pip_compile.py --generate-hashes --allow-unsafe --strip-extras \
        -o requirements/dev.txt requirements/dev.in
Drop this wrapper once pip-tools fixes the URL.
"""

import sys

from piptools.repositories import pypi
from piptools.scripts.compile import cli

_original_base = pypi._get_true_base_from_index_url


def _json_api_base(url: str) -> str:
    base = _original_base(url)
    if base.rstrip("/") in {"https://pypi.org", "https://test.pypi.org"}:
        return base.rstrip("/") + "/pypi/"
    return base


pypi._get_true_base_from_index_url = _json_api_base

if __name__ == "__main__":
    sys.exit(cli())
