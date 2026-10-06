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


class ProductRouteRequiredError(GhgCoreError):
    """A product carbon factor was requested without a production route.

    Ammonia by steam reforming and by coal gasification are different products
    with the same name, and their footprints differ several-fold. So do BF-BOF
    and scrap-EAF steel, primary and secondary aluminium, virgin PET and rPET.
    Resolving a material without its route would silently hand back whichever
    row happened to be first. Refusing is the point.
    """


class AmbiguousBoundaryError(GhgCoreError):
    """A product lookup matched rows spanning more than one system boundary.

    cradle-to-gate and cradle-to-grave are not the same measurement. Picking
    one for the caller would be a guess, so the caller must say which.
    """


class IncomparableFactorsError(GhgCoreError):
    """Factors were compared across incompatible system boundaries or
    allocation methods.

    A cradle-to-gate BEV ranked against a cradle-to-grave ICE car misleads
    every reader, because the use phase is where an ICE vehicle spends its
    carbon. Two EPDs using different co-product allocation are likewise not
    comparable. Ranking them is a presentation error with numerical
    consequences, so it raises rather than warns.
    """
