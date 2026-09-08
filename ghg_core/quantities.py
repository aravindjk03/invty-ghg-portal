"""Decimal arithmetic setup.

Rule 1 of the project: money and emissions arithmetic uses Decimal, never float.
0.1 + 0.2 != 0.3 in binary floating point, and across a few hundred line items
that drift becomes visible in a report.
"""
from __future__ import annotations

from decimal import Decimal, getcontext, ROUND_HALF_EVEN, localcontext
from typing import Union

getcontext().prec = 28
getcontext().rounding = ROUND_HALF_EVEN

Number = Union[int, str, Decimal, float]

ZERO = Decimal(0)


def D(value: Number) -> Decimal:
    """Coerce to Decimal safely.

    float goes through str() so that D(0.1) is Decimal('0.1') and not the
    binary expansion 0.1000000000000000055511151231257827.
    """
    if isinstance(value, Decimal):
        return value
    if isinstance(value, float):
        return Decimal(str(value))
    return Decimal(value)


def round_sig(value: Decimal, sig: int = 3) -> Decimal:
    """Round to significant figures for DISPLAY only.

    Never used inside the engine. Reporting 1,616.4372 tCO2e from spend-based
    data is false precision and a credibility wound.
    """
    if value == 0:
        return Decimal(0)
    with localcontext() as ctx:
        ctx.prec = sig
        ctx.rounding = ROUND_HALF_EVEN
        return +value
