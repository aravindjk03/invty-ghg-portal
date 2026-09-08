"""Typed errors. Every one of these exists so a failure is LOUD, never silent."""


class GhgCoreError(Exception):
    """Base for everything raised by this package."""


class FactorNotFoundError(GhgCoreError):
    """No emission factor could be resolved.

    This is deliberately fatal. A missing factor must NEVER become zero:
    zero is a claim that no emissions occurred; unknown is a fact that must
    be surfaced to the user and listed in the report's exclusions table.
    """


class UnknownUnitError(GhgCoreError):
    """The unit is not in the registry. Never guess a conversion."""


class IncompatibleUnitsError(GhgCoreError):
    """Conversion across dimensions without the physical property to bridge them."""


class FuelPropertyRequiredError(IncompatibleUnitsError):
    """Volume<->mass or mass<->energy needs a dated, sourced fuel property.

    Converting litres of diesel to kilograms is not a units problem, it is a
    physics problem with a dated coefficient. Refusing here is the point.
    """


class GasReferenceMismatchError(GhgCoreError):
    """A gas volume unit (scm/Nm3) was paired with a density measured at a
    different reference condition. Roughly a 5% silent error if allowed."""


class EfBasisMismatchError(GhgCoreError):
    """An energy-basis factor was applied to a physical-basis activity, or
    vice versa. Silently allowing this is a ~40x error."""


class GwpNotFoundError(GhgCoreError):
    """No GWP for this gas in the selected assessment report set."""


class DoubleCountError(GhgCoreError):
    """A configuration that would double count (e.g. both Scope 2 figures in
    the grand total, or steel carbon-balance plus its component fuels)."""
