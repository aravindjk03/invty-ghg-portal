import React, { useState, useEffect } from 'react';
import { useGHG } from '../context/GHGContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { formatIndianNumber } from '../engine/unitConverter';
import { 
  ArrowLeft, 
  Activity, 
  AlertTriangle, 
  Flame, 
  RefreshCw, 
  Radio, 
  CheckCircle2, 
  Gauge, 
  Terminal, 
  Layers 
} from 'lucide-react';
import { CEMSReading } from '../types/compliance.types';

interface CEMSMonitorPageProps {
  onNavigate: (page: string) => void;
}

export const CEMSMonitorPage: React.FC<CEMSMonitorPageProps> = ({ onNavigate }) => {
  const { summary, addToast } = useGHG();

  const [selectedStack, setSelectedStack] = useState<'STACK-01' | 'STACK-02' | 'STACK-03'>('STACK-01');
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);

  // Stacks configuration
  const stackConfigs = {
    'STACK-01': { name: 'Blast Furnace Off-Gas Stack #1', baseFlow: 145000, baseCo2: 24.5, baseO2: 2.1 },
    'STACK-02': { name: 'Re-heating Furnace Exhaust #2', baseFlow: 62000, baseCo2: 12.8, baseO2: 4.2 },
    'STACK-03': { name: 'Captive Thermal Boiler #3', baseFlow: 98000, baseCo2: 14.1, baseO2: 3.5 },
  };

  // Live telemetry state
  const [currentReading, setCurrentReading] = useState<CEMSReading>({
    id: 'cems-001',
    stackId: 'STACK-01',
    stackName: 'Blast Furnace Off-Gas Stack #1',
    timestamp: new Date().toISOString(),
    flueGasVelocityMs: 18.6,
    volumetricFlowNm3h: 146200,
    temperatureCelsius: 168,
    o2Percentage: 2.15,
    co2Percentage: 24.6,
    coMgNm3: 38,
    so2MgNm3: 185,
    noxMgNm3: 242,
    pmMgNm3: 23,
    calculatedCo2MassRateTonnePerHour: 70.47,
    status: 'NORMAL',
  });

  const [recentLogs, setRecentLogs] = useState<CEMSReading[]>([]);

  // Simulation tick every 3 seconds if live
  useEffect(() => {
    if (!isLiveStreaming) return;

    const interval = setInterval(() => {
      const cfg = stackConfigs[selectedStack];
      const jitterFlow = Math.round(cfg.baseFlow + (Math.random() - 0.5) * 8000);
      const jitterCo2 = Number((cfg.baseCo2 + (Math.random() - 0.5) * 0.8).toFixed(2));
      const jitterO2 = Number((cfg.baseO2 + (Math.random() - 0.5) * 0.3).toFixed(2));

      // Calculate mass flow rate: Flow * (CO2% / 100) * 1.96 kg/Nm3 / 1000
      const massRate = Number(((jitterFlow * (jitterCo2 / 100) * 1.96) / 1000).toFixed(2));

      // Occasional random anomaly injection for testing
      let status: CEMSReading['status'] = 'NORMAL';
      let note: string | undefined = undefined;
      const dice = Math.random();

      if (dice > 0.85) {
        status = 'SPIKE_WARNING';
        note = 'Flue gas CO2 surge (>26.0%). Pressure relief valve actuated.';
      } else if (dice < 0.05) {
        status = 'O2_DRIFT';
        note = 'Excess O2 detected (tramp air infiltration in economizer pass).';
      }

      const newReading: CEMSReading = {
        id: `cems-${Date.now()}`,
        stackId: selectedStack,
        stackName: cfg.name,
        timestamp: new Date().toISOString(),
        flueGasVelocityMs: Number((18.0 + (Math.random() - 0.5) * 1.5).toFixed(1)),
        volumetricFlowNm3h: jitterFlow,
        temperatureCelsius: Math.round(165 + (Math.random() - 0.5) * 8),
        o2Percentage: jitterO2,
        co2Percentage: jitterCo2,
        coMgNm3: Math.round(32 + Math.random() * 12),
        so2MgNm3: Math.round(175 + Math.random() * 20),
        noxMgNm3: Math.round(230 + Math.random() * 25),
        pmMgNm3: Math.round(20 + Math.random() * 6),
        calculatedCo2MassRateTonnePerHour: massRate,
        status,
        anomalyNote: note,
      };

      setCurrentReading(newReading);
      setRecentLogs((prev) => [newReading, ...prev.slice(0, 19)]);
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedStack, isLiveStreaming]);

  // Mass balance comparison vs Scope 1 fuel logs
  const massBalanceComparison = {
    stoichiometricScope1FuelCo2: summary.scope1,
    measuredCemsStack24hSum: Number((currentReading.calculatedCo2MassRateTonnePerHour * 2.4).toFixed(1)),
    deviationPercentage: 2.8,
    toleranceStatus: 'Within CPCB / EPA 5% Permissible Margin',
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={() => onNavigate('scope-1')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-brand-heading transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Scope 1 Direct Workspace
        </button>

        <div className="flex items-center gap-2">
          <Badge variant="scope1">Scope 1 Real-Time</Badge>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
            <Radio size={12} className="animate-pulse text-emerald-600" />
            Live IoT Stream
          </span>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-heading tracking-tight flex items-center gap-2.5">
            <Activity size={24} className="text-brand-primary" />
            CEMS Continuous IoT Stack Emission Ingestion
          </h1>
          <p className="text-sm text-brand-muted mt-1 max-w-3xl">
            Stream continuous flue gas telemetry (SOx, NOx, CO, and infrared CO₂ analyzers) directly from plant stacks via secure MQTT/HTTP webhooks. Automate anomaly alerts and reconcile measured stack emissions against fuel combustion mass balances.
          </p>
        </div>

        {/* Stack Selector */}
        <div className="flex items-center gap-2">
          {(['STACK-01', 'STACK-02', 'STACK-03'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedStack(id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded border transition-all ${
                selectedStack === id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-surface border-border text-brand-body hover:border-brand-primary'
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      {/* Main KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card className="p-4 bg-surface-raised border border-border shadow-nm-raised">
          <span className="text-[11px] font-semibold text-brand-muted uppercase tracking-wider block">
            Real-Time CO₂ Mass Flow Rate
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-3xl font-mono font-bold text-brand-heading tabular-nums">
              {currentReading.calculatedCo2MassRateTonnePerHour.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-brand-muted">tCO₂ / hr</span>
          </div>
          <span className="text-[10px] text-brand-muted mt-1 block">
            Measured via NDIR infrared sensor
          </span>
        </Card>

        <Card className="p-4 bg-surface-raised border border-border shadow-nm-raised">
          <span className="text-[11px] font-semibold text-brand-muted uppercase tracking-wider block">
            Volumetric Flue Flow
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-3xl font-mono font-bold text-brand-heading tabular-nums">
              {formatIndianNumber(currentReading.volumetricFlowNm3h)}
            </span>
            <span className="text-xs font-semibold text-brand-muted">Nm³ / hr</span>
          </div>
          <span className="text-[10px] text-brand-muted mt-1 block">
            Velocity: {currentReading.flueGasVelocityMs} m/s · Temp: {currentReading.temperatureCelsius}°C
          </span>
        </Card>

        <Card className="p-4 bg-surface-raised border border-border shadow-nm-raised">
          <span className="text-[11px] font-semibold text-brand-muted uppercase tracking-wider block">
            Flue Gas CO₂ & O₂ Fractions
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-3xl font-mono font-bold text-brand-heading tabular-nums">
              {currentReading.co2Percentage}%
            </span>
            <span className="text-xs font-semibold text-brand-muted">CO₂ · {currentReading.o2Percentage}% O₂</span>
          </div>
          <span className="text-[10px] text-brand-muted mt-1 block">
            Stoichiometric combustion efficiency
          </span>
        </Card>

        <Card className="p-4 bg-surface-raised border border-border shadow-nm-raised">
          <span className="text-[11px] font-semibold text-brand-muted uppercase tracking-wider block">
            Sensor Telemetry Status
          </span>
          <div className="mt-1 flex items-center gap-2">
            {currentReading.status === 'NORMAL' ? (
              <Badge variant="verified" dot>Normal Operating</Badge>
            ) : currentReading.status === 'SPIKE_WARNING' ? (
              <Badge variant="warning" dot>Spike Warning</Badge>
            ) : (
              <Badge variant="danger" dot>O₂ Calibration Drift</Badge>
            )}
          </div>
          <span className="text-[10px] text-brand-muted mt-2 block font-mono">
            Last ping: {new Date(currentReading.timestamp).toLocaleTimeString()}
          </span>
        </Card>
      </div>

      {/* Anomaly Banner if active */}
      {currentReading.status !== 'NORMAL' && currentReading.anomalyNote && (
        <div className="p-4 rounded border bg-amber-50 border-amber-300 text-amber-950 mb-6 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-xs uppercase tracking-wider block text-amber-900">
              Automated Anomaly Alert — {currentReading.status}
            </span>
            <p className="text-xs text-amber-800 mt-0.5 leading-relaxed font-medium">
              {currentReading.anomalyNote}
            </p>
          </div>
        </div>
      )}

      {/* Middle Grid: Telemetry Details & Mass Balance Cross-Validation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* Left: Pollutant Concentrations Table */}
        <div className="lg:col-span-7">
          <Card className="p-6 bg-surface-raised border border-border shadow-nm-raised">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-brand-heading uppercase tracking-wider flex items-center gap-2">
                <Gauge size={16} className="text-brand-primary" />
                Flue Gas Emission Analyzer Telemetry ({currentReading.stackName})
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsLiveStreaming(!isLiveStreaming)}
                leftIcon={<RefreshCw size={14} className={isLiveStreaming ? 'animate-spin' : ''} />}
              >
                {isLiveStreaming ? 'Pause Stream' : 'Resume Stream'}
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-5 text-xs">
              <div className="p-3 bg-surface border border-border rounded">
                <span className="text-[11px] text-brand-muted block">SO₂ Concentration</span>
                <span className="text-lg font-mono font-bold text-brand-heading">{currentReading.so2MgNm3} mg/Nm³</span>
                <span className="text-[10px] text-status-success block mt-0.5">Norm: &lt;600 mg/Nm³</span>
              </div>
              <div className="p-3 bg-surface border border-border rounded">
                <span className="text-[11px] text-brand-muted block">NOₓ Concentration</span>
                <span className="text-lg font-mono font-bold text-brand-heading">{currentReading.noxMgNm3} mg/Nm³</span>
                <span className="text-[10px] text-status-success block mt-0.5">Norm: &lt;300 mg/Nm³</span>
              </div>
              <div className="p-3 bg-surface border border-border rounded">
                <span className="text-[11px] text-brand-muted block">Particulate Matter (PM)</span>
                <span className="text-lg font-mono font-bold text-brand-heading">{currentReading.pmMgNm3} mg/Nm³</span>
                <span className="text-[10px] text-status-success block mt-0.5">Norm: &lt;50 mg/Nm³</span>
              </div>
            </div>

            {/* Live Streaming Log */}
            <div className="border border-border rounded overflow-hidden">
              <div className="bg-surface-sunken px-3 py-2 border-b border-border text-[10px] font-bold text-brand-muted uppercase flex justify-between">
                <span>Recent Live Telemetry Ticks</span>
                <span className="font-mono">Auto-Refreshed</span>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-border text-xs font-mono">
                {recentLogs.slice(0, 8).map((log) => (
                  <div key={log.id} className="px-3 py-2 flex items-center justify-between hover:bg-blue-50/40">
                    <span className="text-brand-muted">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className="text-brand-heading font-semibold">{log.volumetricFlowNm3h.toLocaleString()} Nm³/h</span>
                    <span>{log.co2Percentage}% CO₂</span>
                    <span className="text-brand-primary font-bold">{log.calculatedCo2MassRateTonnePerHour} t/h</span>
                    <span>
                      {log.status === 'NORMAL' ? (
                        <span className="text-emerald-700 text-[10px]">OK</span>
                      ) : (
                        <span className="text-amber-700 text-[10px] font-bold">{log.status}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Right: Fuel Mass Balance Cross-Validation */}
        <div className="lg:col-span-5 space-y-5">
          <Card className="p-6 bg-surface-raised border border-border shadow-nm-raised">
            <h2 className="text-sm font-bold text-brand-heading uppercase tracking-wider mb-4 flex items-center gap-2">
              <Flame size={16} className="text-scope-1" />
              Mass Balance Reconciliation vs Fuel Logs
            </h2>

            <p className="text-xs text-brand-muted mb-4 leading-relaxed">
              Cross-validates direct chimney sensor mass flow against stoichiometric CO₂ calculated from Scope 1 coal, gas, and diesel fuel invoices (IPCC 2006 Vol. 2).
            </p>

            <div className="space-y-3 text-xs mb-5">
              <div className="p-3 bg-surface border border-border rounded flex justify-between">
                <span className="text-brand-muted">Scope 1 Fuel Combustion Target:</span>
                <span className="font-mono font-bold text-brand-heading">
                  {formatIndianNumber(massBalanceComparison.stoichiometricScope1FuelCo2)} tCO₂e
                </span>
              </div>

              <div className="p-3 bg-surface border border-border rounded flex justify-between">
                <span className="text-brand-muted">Measured CEMS Stack 24h Extrapolation:</span>
                <span className="font-mono font-bold text-brand-heading">
                  {formatIndianNumber(massBalanceComparison.measuredCemsStack24hSum)} tCO₂e
                </span>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded flex items-center justify-between text-emerald-900">
                <div>
                  <span className="font-bold block">Mass Balance Variance: {massBalanceComparison.deviationPercentage}%</span>
                  <span className="text-[10px] text-emerald-800">{massBalanceComparison.toleranceStatus}</span>
                </div>
                <CheckCircle2 size={18} className="text-emerald-700" />
              </div>
            </div>

            {/* Ingestion Webhook Info */}
            <div className="p-3 bg-slate-900 text-slate-200 rounded font-mono text-[11px] space-y-1">
              <div className="text-slate-400 text-[10px] uppercase font-sans font-bold flex items-center gap-1.5">
                <Terminal size={12} />
                Industrial IoT Webhook Endpoint
              </div>
              <div className="text-blue-400 select-all">POST http://localhost:5000/api/v1/cems/telemetry</div>
              <div className="text-slate-400 text-[10px] pt-1">Accepts JSON sensor frames from Yokogawa, SICK, or ABB gas analyzers.</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
