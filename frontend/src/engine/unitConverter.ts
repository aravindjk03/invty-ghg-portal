import Decimal from 'decimal.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

// Known fuel densities for volume <-> mass conversion (kg per Litre or kg per m3)
export const FUEL_DENSITIES: Record<string, number> = {
  diesel: 0.832,       // kg/L
  petrol: 0.745,       // kg/L
  furnace_oil: 0.950,  // kg/L
  kerosene: 0.810,     // kg/L
  lpg: 0.540,          // kg/L (liquid)
  natural_gas: 0.800,  // kg/m3 (at STP)
};

/**
 * Bug Guard #7: Accept Indian number formatting ("4,50,000"), Western ("450,000"),
 * currency signs, and whitespace.
 * Bug Guard #4: Empty input is null, not zero.
 */
export function parseIndianNumber(raw: string | number | Decimal | null | undefined): Decimal | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Decimal) return raw;
  if (typeof raw === 'number') {
    if (isNaN(raw)) return null;
    return new Decimal(raw);
  }
  const cleaned = raw.trim().replace(/[,\s₹$Rs]/g, '');
  if (cleaned === '') return null;
  if (!/^[+-]?\d*\.?\d+(?:[eE][+-]?\d+)?$/.test(cleaned)) return null;
  try {
    return new Decimal(cleaned);
  } catch {
    return null;
  }
}

/**
 * Format number to Indian numbering system (lakhs/crores) when applicable
 */
export function formatIndianNumber(val: number | Decimal | null | undefined, decimals = 2): string {
  if (val === null || val === undefined) return '—';
  const num = typeof val === 'number' ? val : val.toNumber();
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Standard unit canonical multipliers
 */
const CANONICAL_CONVERSIONS: Record<string, Record<string, number>> = {
  // Mass -> canonical kg
  mass: {
    g: 0.001,
    kg: 1,
    t: 1000,
    tonne: 1000,
    lb: 0.45359237,
  },
  // Volume -> canonical L
  volume: {
    ml: 0.001,
    l: 1,
    kl: 1000,
    m3: 1000,
    scm: 1000,
    nm3: 1000,
    gal: 3.78541,
  },
  // Energy -> canonical kWh
  energy: {
    kwh: 1,
    units: 1, // Indian colloquial synonym for kWh
    mwh: 1000,
    gwh: 1000000,
    gj: 277.778,
    mmbtu: 293.071,
  },
  // Distance -> canonical km
  distance: {
    km: 1,
    mi: 1.60934,
  },
};

export type UnitDimension = 'mass' | 'volume' | 'energy' | 'distance' | 'count' | 'currency' | 'auto';

export function getUnitDimension(unit: string): UnitDimension {
  const u = unit.toLowerCase().trim();
  if (CANONICAL_CONVERSIONS.mass[u]) return 'mass';
  if (CANONICAL_CONVERSIONS.volume[u]) return 'volume';
  if (CANONICAL_CONVERSIONS.energy[u]) return 'energy';
  if (CANONICAL_CONVERSIONS.distance[u]) return 'distance';
  if (['inr', 'usd', 'eur'].includes(u)) return 'currency';
  if (['head.yr', 'ha', 'night', 'pax.km', 't.km', 'm2.yr', 'm2', 'day', 'toggle'].includes(u)) return 'count';
  if (u === 'auto') return 'auto';
  return 'count';
}

/**
 * Bug Guard #2: Refuses invalid cross-dimensional conversion without explicit fuel density.
 */
export function convertUnit(
  value: Decimal,
  fromUnit: string,
  toUnit: string,
  fuelKey?: string
): Decimal {
  const f = fromUnit.toLowerCase().trim();
  const t = toUnit.toLowerCase().trim();
  if (f === t) return value;

  const dimFrom = getUnitDimension(f);
  const dimTo = getUnitDimension(t);

  if (dimFrom === dimTo && CANONICAL_CONVERSIONS[dimFrom]) {
    const fromFactor = new Decimal(CANONICAL_CONVERSIONS[dimFrom][f] || 1);
    const toFactor = new Decimal(CANONICAL_CONVERSIONS[dimTo][t] || 1);
    // canonical = value * fromFactor
    // target = canonical / toFactor
    return value.times(fromFactor).dividedBy(toFactor);
  }

  // Cross-dimensional: mass <-> volume requires known fuel density
  if ((dimFrom === 'volume' && dimTo === 'mass') || (dimFrom === 'mass' && dimTo === 'volume')) {
    const densityKey = Object.keys(FUEL_DENSITIES).find((k) => fuelKey?.toLowerCase().includes(k));
    if (!densityKey) {
      throw new Error(
        `Cannot convert between mass (${fromUnit}) and volume (${toUnit}) without a verified fuel density for "${fuelKey || 'unknown fuel'}".`
      );
    }
    const density = new Decimal(FUEL_DENSITIES[densityKey]); // kg per L

    if (dimFrom === 'volume' && dimTo === 'mass') {
      // 1) convert fromUnit to L
      const litres = value.times(CANONICAL_CONVERSIONS.volume[f] || 1);
      // 2) mass (kg) = litres * density
      const kg = litres.times(density);
      // 3) convert kg to toUnit
      return kg.dividedBy(CANONICAL_CONVERSIONS.mass[t] || 1);
    } else {
      // mass to volume
      const kg = value.times(CANONICAL_CONVERSIONS.mass[f] || 1);
      const litres = kg.dividedBy(density);
      return litres.dividedBy(CANONICAL_CONVERSIONS.volume[t] || 1);
    }
  }

  // If conversion not supported, return original to avoid NaN / crash
  return value;
}
