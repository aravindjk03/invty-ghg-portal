import Decimal from 'decimal.js';

export interface CEMSTelemetryInput {
  stackId: string;
  stackName: string;
  flueGasVelocityMs: number;
  volumetricFlowNm3h: number;
  temperatureCelsius: number;
  o2Percentage: number;
  co2Percentage: number;
  coMgNm3: number;
  so2MgNm3: number;
  noxMgNm3: number;
  pmMgNm3: number;
  timestamp?: string;
}

export interface CEMSTelemetryRecord extends CEMSTelemetryInput {
  id: string;
  timestamp: string;
  calculatedCo2MassRateTonnePerHour: number;
  status: 'NORMAL' | 'SPIKE_WARNING' | 'FLATLINE_ERROR' | 'O2_DRIFT';
  anomalyNote?: string;
}

// In-memory stack telemetry ring buffer
const telemetryHistory: CEMSTelemetryRecord[] = [];

// Seed recent 12 hours of realistic industrial telemetry
function seedInitialTelemetry() {
  const stacks = [
    { id: 'STACK-01', name: 'Blast Furnace Off-Gas Stack #1', baseFlow: 145000, baseCo2: 24.5, baseO2: 2.1 },
    { id: 'STACK-02', name: 'Re-heating Furnace Exhaust #2', baseFlow: 62000, baseCo2: 12.8, baseO2: 4.2 },
    { id: 'STACK-03', name: 'Captive Thermal Boiler #3', baseFlow: 98000, baseCo2: 14.1, baseO2: 3.5 },
  ];

  const now = Date.now();
  for (let i = 24; i >= 0; i--) {
    const time = new Date(now - i * 30 * 60 * 1000).toISOString();
    stacks.forEach((s) => {
      const jitterFlow = s.baseFlow + (Math.sin(i + s.id.length) * 4500);
      const jitterCo2 = s.baseCo2 + (Math.cos(i) * 0.4);
      const jitterO2 = s.baseO2 + (Math.sin(i) * 0.2);

      // Density of CO2 at standard conditions = 1.96 kg/Nm3
      const massRateTco2 = new Decimal(jitterFlow)
        .times(jitterCo2 / 100)
        .times(1.96)
        .dividedBy(1000)
        .toDecimalPlaces(2)
        .toNumber();

      telemetryHistory.push({
        id: `cems-${s.id}-${i}`,
        stackId: s.id,
        stackName: s.name,
        timestamp: time,
        flueGasVelocityMs: Number((18.5 + Math.sin(i) * 0.8).toFixed(1)),
        volumetricFlowNm3h: Math.round(jitterFlow),
        temperatureCelsius: Math.round(165 + Math.sin(i) * 5),
        o2Percentage: Number(jitterO2.toFixed(2)),
        co2Percentage: Number(jitterCo2.toFixed(2)),
        coMgNm3: Math.round(35 + Math.cos(i) * 8),
        so2MgNm3: Math.round(180 + Math.sin(i) * 15),
        noxMgNm3: Math.round(240 + Math.cos(i) * 20),
        pmMgNm3: Math.round(22 + Math.sin(i) * 3),
        calculatedCo2MassRateTonnePerHour: massRateTco2,
        status: 'NORMAL',
      });
    });
  }
}

seedInitialTelemetry();

export const cemsService = {
  ingestTelemetry(reading: CEMSTelemetryInput): CEMSTelemetryRecord {
    // Standard CO2 mass flow calculation: Flow (Nm3/h) * (CO2% / 100) * 1.96 kg/Nm3 / 1000
    const massRate = new Decimal(reading.volumetricFlowNm3h)
      .times(reading.co2Percentage / 100)
      .times(1.96)
      .dividedBy(1000)
      .toDecimalPlaces(2)
      .toNumber();

    // Automated Anomaly Detection
    let status: CEMSTelemetryRecord['status'] = 'NORMAL';
    let anomalyNote: string | undefined = undefined;

    if (reading.co2Percentage > 28.0 || massRate > 85.0) {
      status = 'SPIKE_WARNING';
      anomalyNote = `Sudden CO2 concentration surge (${reading.co2Percentage}% > 28.0% limit). Check flue gas dampers.`;
    } else if (reading.o2Percentage > 16.0 && reading.volumetricFlowNm3h > 10000) {
      status = 'O2_DRIFT';
      anomalyNote = `Unusual excess oxygen (${reading.o2Percentage}%). High risk of tramp air ingress or sensor calibration drift.`;
    } else if (reading.volumetricFlowNm3h < 500) {
      status = 'FLATLINE_ERROR';
      anomalyNote = 'Zero or negligible flue gas volumetric flow detected during scheduled operating shift.';
    }

    const record: CEMSTelemetryRecord = {
      ...reading,
      id: `cems-${reading.stackId}-${Date.now()}`,
      timestamp: reading.timestamp || new Date().toISOString(),
      calculatedCo2MassRateTonnePerHour: massRate,
      status,
      anomalyNote,
    };

    telemetryHistory.push(record);
    if (telemetryHistory.length > 500) {
      telemetryHistory.shift();
    }

    return record;
  },

  getRecentTelemetry(stackId?: string, limit = 50): CEMSTelemetryRecord[] {
    let filtered = telemetryHistory;
    if (stackId) {
      filtered = filtered.filter((r) => r.stackId === stackId);
    }
    return filtered.slice(-limit);
  },

  getStackSummaries(scope1FuelBurnTco2e = 165.47) {
    const stacks = ['STACK-01', 'STACK-02', 'STACK-03'];
    return stacks.map((id) => {
      const records = telemetryHistory.filter((r) => r.stackId === id);
      const latest = records[records.length - 1];
      const avgFlow = records.length > 0
        ? Math.round(records.reduce((a, b) => a + b.volumetricFlowNm3h, 0) / records.length)
        : 0;

      // Cumulative CO2 over 24h period (sum of hourly mass rate * 0.5h step)
      const cumulativeCo2 = Number(
        records.reduce((a, b) => a + b.calculatedCo2MassRateTonnePerHour * 0.5, 0).toFixed(1)
      );

      // Mass balance deviation against Scope 1 fuel records
      const delta = Math.abs(cumulativeCo2 - (scope1FuelBurnTco2e / 3));
      const fuelMassBalanceDeviationPercent = Number(((delta / (scope1FuelBurnTco2e / 3)) * 100).toFixed(1));

      return {
        stackId: id,
        stackName: latest?.stackName || id,
        totalOperatingHours: 24,
        cumulativeCo2Tco2e: cumulativeCo2,
        averageFlowNm3h: avgFlow,
        activeAlerts: records.filter((r) => r.status !== 'NORMAL').length,
        fuelMassBalanceDeviationPercent,
      };
    });
  },
};
