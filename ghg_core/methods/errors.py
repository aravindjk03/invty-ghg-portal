"""Errors the methods raise, shared so one `except` catches them all.

Every one of these exists because returning zero would be worse than failing.
A missing factor is not an emission of nothing, and a source reported in the
wrong place is counted twice.
"""


class FactorNotPublished(KeyError):
    """IPCC publishes no Tier 1 factor for this. Not the same as zero.

    Raised where the chapter itself records that there is no default - poultry
    enteric fermentation, titanium slag, the electro-thermic zinc route - so an
    inventory that includes the source has to say it could not be quantified
    rather than reporting nothing for it.
    """


class ReportedElsewhere(KeyError):
    """The source is real, but this is not where the inventory reports it.

    Manure dropped on pasture belongs to managed soils, dung burned as fuel to
    fuel combustion. Counting either here as well would double it.
    """
