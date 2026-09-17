"""Text cleaning for untrusted strings. Standard library only, so both the
request schema and the output guard can import it without a cycle."""
from __future__ import annotations

import re
import unicodedata

# Zero-width, joiner and bidirectional control characters used to hide text.
_INVISIBLE = re.compile("[​-‏‪-‮⁠-⁩﻿]")
_URL = re.compile(r"(?i)\b(?:https?://|www\.)\S+")
_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")

# Runs of angle brackets. The prompt fences visitor text with <<< >>> markers,
# so visitor text must not be able to produce one and close its own fence.
FENCE_CHARS = re.compile(r"<{2,}|>{2,}")


def strip_hidden(text: str) -> str:
    """NFKC-normalise and drop control, zero-width and bidi-override characters."""
    text = unicodedata.normalize("NFKC", text)
    text = _INVISIBLE.sub("", text)
    return "".join(ch for ch in text if ch in "\n\t" or unicodedata.category(ch)[0] != "C")


def clean_visitor_text(text: str) -> str:
    """Normalise visitor input before it is validated, cached or sent to a model."""
    text = strip_hidden(text)
    text = FENCE_CHARS.sub(" ", text)
    return " ".join(text.split())


def clean_output_text(text: str, cap: int) -> str:
    """Model output made safe to display: hidden characters removed, links and
    e-mail addresses removed, whitespace collapsed, length capped."""
    text = strip_hidden(text)
    text = _URL.sub("[link removed]", text)
    text = _EMAIL.sub("[address removed]", text)
    text = " ".join(text.split())
    return text if len(text) <= cap else text[: cap - 1].rstrip() + "…"
