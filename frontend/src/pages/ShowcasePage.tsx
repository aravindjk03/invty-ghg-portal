import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { NumberInput } from '../components/ui/NumberInput';
import { Toggle } from '../components/ui/Toggle';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Badge } from '../components/ui/Badge';
import { ScopeBadge } from '../components/ui/ScopeBadge';
import { KPITile } from '../components/ui/KPITile';
import { ProgressRing } from '../components/ui/ProgressRing';
import { Accordion } from '../components/ui/Accordion';
import { Modal } from '../components/ui/Modal';
import { Toast } from '../components/ui/Toast';
import { Tooltip } from '../components/ui/Tooltip';
import { EmptyState } from '../components/ui/EmptyState';
import { ActivityRow } from '../components/ui/ActivityRow';
import { Table, Column } from '../components/ui/Table';
import { ActivityEntry } from '../types/ghg';
import { DEFAULT_FACTORS } from '../services/ghgService';
import { Flame, Sparkles, Check, Download, AlertTriangle } from 'lucide-react';

export const ShowcasePage: React.FC = () => {
  const [toggleState, setToggleState] = useState(true);
  const [segmentState, setSegmentState] = useState('guided');
  const [numberVal, setNumberVal] = useState(45000);
  const [modalOpen, setModalOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(true);

  const [sampleRow, setSampleRow] = useState<ActivityEntry>({
    id: 'showcase-row-1',
    facility: 'Rolling Mill Unit A',
    scope: 'scope-1',
    category: 'stationary_combustion',
    fuelOrSource: 'Diesel (Stationary)',
    amount: 45000,
    unit: 'L',
    emissionFactor: DEFAULT_FACTORS[0],
    calculatedTco2e: 120.89,
    warning: 'This is 8× the typical diesel use for a plant this size — please check the unit.',
    updatedAt: new Date().toISOString(),
  });

  interface DemoRow {
    id: string;
    source: string;
    scope: string;
    val: number;
  }
  const tableData: DemoRow[] = [
    { id: '1', source: 'Captive DG Generation', scope: 'Scope 1', val: 120.9 },
    { id: '2', source: 'Reheating Furnace (Gas)', scope: 'Scope 1', val: 37.5 },
    { id: '3', source: 'Grid Power (CEA 2024)', scope: 'Scope 2', val: 412.4 },
  ];
  const tableCols: Column<DemoRow>[] = [
    { header: 'Emission Source', accessorKey: 'source' },
    { header: 'Scope', accessorKey: 'scope' },
    {
      header: 'Value (tCO₂e)',
      accessorKey: 'val',
      numeric: true,
      cell: (r) => <span className="font-mono tabular-nums">{r.val.toFixed(1)}</span>,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto p-8 space-y-12 select-none">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="info">DESIGN SYSTEM VERIFIER</Badge>
          <span className="text-xs text-brand-muted font-mono">Prompt 0 Specification</span>
        </div>
        <h1 className="text-3xl font-bold text-brand-heading tracking-tight">
          Component Library & Token Showcase
        </h1>
        <p className="text-sm text-brand-muted mt-1 max-w-3xl">
          Complete verification of soft neumorphic dual-shadows, 1px mandatory borders, AA contrast blue text ramp, tabular figures, and interactive component states.
        </p>
      </div>

      {/* 1. Surfaces & Elevation Cards */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-brand-heading border-b border-border pb-2">
          1. Surfaces & Neumorphic Elevation
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card elevation="raised-sm">
            <span className="text-xs font-mono text-brand-muted block mb-2">--nm-raised-sm</span>
            <h4 className="font-semibold text-brand-heading">Raised Small Card</h4>
            <p className="text-xs text-brand-muted mt-1">Subtle 3px elevation for controls & badges.</p>
          </Card>
          <Card elevation="raised">
            <span className="text-xs font-mono text-brand-muted block mb-2">--nm-raised</span>
            <h4 className="font-semibold text-brand-heading">Standard Raised Card</h4>
            <p className="text-xs text-brand-muted mt-1">Default 6px dual-shadow for workspace cards.</p>
          </Card>
          <Card elevation="raised-lg">
            <span className="text-xs font-mono text-brand-muted block mb-2">--nm-raised-lg</span>
            <h4 className="font-semibold text-brand-heading">Raised Large Card</h4>
            <p className="text-xs text-brand-muted mt-1">Prominent 12px depth for modals & summary rail.</p>
          </Card>
          <Card interactive elevation="raised">
            <span className="text-xs font-mono text-brand-muted block mb-2">interactive</span>
            <h4 className="font-semibold text-brand-heading">Interactive Hover Card</h4>
            <p className="text-xs text-brand-muted mt-1">Lifts on hover, presses on click.</p>
          </Card>
        </div>
      </section>

      {/* 2. Buttons in all states */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-brand-heading border-b border-border pb-2">
          2. Buttons (Mandatory 1px Border + Shadow)
        </h2>
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary" leftIcon={<Sparkles size={16} />}>
              Primary Button
            </Button>
            <Button variant="secondary" leftIcon={<Check size={16} />}>
              Secondary Button
            </Button>
            <Button variant="ghost" leftIcon={<Download size={16} />}>
              Ghost Button
            </Button>
            <Button variant="danger" leftIcon={<AlertTriangle size={16} />}>
              Danger Action
            </Button>
            <Button variant="primary" disabled>
              Disabled State
            </Button>
          </div>
          <p className="text-xs text-brand-muted">
            Hard rule: Disabled buttons maintain opacity: 1 and a visible 1px border. Never communicate disabled state by removing shadow alone.
          </p>
        </Card>
      </section>

      {/* 3. Inputs, Selects & Form Controls */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-brand-heading border-b border-border pb-2">
          3. Recessed Form Inputs & Controls
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-5 space-y-4">
            <Input
              label="Standard Text Input"
              placeholder="e.g. Acme Rolling Mill 1"
              helperText="Inputs are sunken wells with --nm-inset-input"
            />
            <Input
              label="Input with Error State"
              defaultValue="Invalid Volume"
              error="Value must be a positive number"
            />
          </Card>

          <Card className="p-5 space-y-4">
            <Select
              label="Dropdown Select"
              options={[
                { value: 'dsl', label: 'Diesel (Stationary) - 2.6865 kgCO2e/L' },
                { value: 'gas', label: 'Natural Gas - 2.0282 kgCO2e/m3' },
              ]}
            />
            <NumberInput
              label="Tabular Number Input"
              value={numberVal}
              onChange={setNumberVal}
              unit="Litres"
            />
          </Card>

          <Card className="p-5 space-y-5">
            <div>
              <span className="text-[13px] font-medium text-brand-body block mb-2">
                Segmented Control
              </span>
              <SegmentedControl
                value={segmentState}
                onChange={setSegmentState}
                options={[
                  { value: 'guided', label: 'Guided' },
                  { value: 'csv', label: 'CSV' },
                  { value: 'quick', label: 'Quick' },
                ]}
              />
            </div>
            <div>
              <span className="text-[13px] font-medium text-brand-body block mb-2">
                Neumorphic Sunken Toggle
              </span>
              <Toggle
                label="Enable biogenic accounting"
                checked={toggleState}
                onChange={setToggleState}
              />
            </div>
          </Card>
        </div>
      </section>

      {/* 4. Badges & Chips */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-brand-heading border-b border-border pb-2">
          4. Semantic Badges & Scope Chips (12% Tint Rule)
        </h2>
        <Card className="p-5 flex flex-wrap items-center gap-3">
          <ScopeBadge scope="scope-1" />
          <ScopeBadge scope="scope-2" />
          <ScopeBadge scope="scope-3" />
          <ScopeBadge scope="biogenic" />
          <Badge variant="success" dot>Grade A Verified</Badge>
          <Badge variant="warning" dot>Audit Anomaly</Badge>
          <Badge variant="danger" dot>Missing Factor</Badge>
        </Card>
      </section>

      {/* 5. Activity Row (Core Component) */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-brand-heading border-b border-border pb-2">
          5. Activity Row (Primary Data Entry Pattern)
        </h2>
        <Card noPadding className="p-4 bg-surface/30">
          <ActivityRow
            entry={sampleRow}
            onUpdate={(up) => setSampleRow({ ...sampleRow, ...up })}
            onDelete={() => console.info('Showcase: Delete row')}
            onDuplicate={() => console.info('Showcase: Duplicate row')}
          />
        </Card>
      </section>

      {/* 6. KPI Tiles & Progress Rings */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-brand-heading border-b border-border pb-2">
          6. KPI Tile & Progress Ring
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <KPITile
            label="Total Emissions"
            value={1617.1}
            unit="tCO₂e"
            tooltipText="Consolidated operational emissions across Scopes 1, 2, and active Scope 3 categories."
            delta={{ value: '-4.2%', isDecrease: true }}
          />
          <KPITile
            label="Data Quality Grade"
            value="Grade C"
            gradeCircle={{ grade: 'C', color: 'var(--grade-c)' }}
            tooltipText="Based on GHG Protocol data quality indicators."
          />
          <Card className="flex items-center justify-between p-5">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-muted">
                Scope 1 Completion
              </span>
              <h4 className="text-xl font-bold text-brand-heading mt-1">6 of 12 entries</h4>
              <p className="text-xs text-brand-muted mt-0.5">~4 minutes remaining</p>
            </div>
            <ProgressRing progress={50} color="var(--scope-1)" size={56} strokeWidth={5} />
          </Card>
        </div>
      </section>

      {/* 7. Dense Data Table */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-brand-heading border-b border-border pb-2">
          7. Dense Data Table (Two-Tier Surface Rule)
        </h2>
        <Card noPadding className="p-4">
          <Table columns={tableCols} data={tableData} keyExtractor={(r) => r.id} />
        </Card>
      </section>

      {/* 8. Accordions, Modal & Toast */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-brand-heading border-b border-border pb-2">
          8. Feedback, Modals & Accordions
        </h2>
        <Accordion
          title="Stationary Combustion"
          description="Boilers, furnaces, DG sets, kilns"
          subtotal={165.5}
          defaultOpen={true}
          icon={<Flame size={20} className="text-scope-1" />}
        >
          <p className="text-sm text-brand-body">
            Expanded accordion body with hairline divider and smooth Framer Motion transition.
          </p>
        </Accordion>

        <div className="flex flex-wrap items-center gap-4">
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            Open Sample Modal
          </Button>

          <Tooltip content="Tooltip explains metrics in one clear sentence">
            <Button variant="ghost">Hover for Tooltip</Button>
          </Tooltip>

          {toastVisible && (
            <Toast
              id="t1"
              type="success"
              title="Inventory autosaved"
              message="Calculations synchronized with local storage and backend."
              onClose={() => setToastVisible(false)}
            />
          )}
        </div>
      </section>

      {/* 9. Empty State */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-brand-heading border-b border-border pb-2">
          9. Empty State
        </h2>
        <EmptyState
          title="No process emissions logged"
          description="Industrial steelmaking facilities report direct calcination from limestone or carbon electrode oxidation."
          onAddFirst={() => console.info('Showcase: Add entry')}
          onUploadCsv={() => console.info('Showcase: Upload CSV')}
        />
      </section>

      {/* Demo Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Emission Factor Details"
        description="DESNZ 2026 / MoPNG - Diesel (Stationary)"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
              Close
            </Button>
            <Button variant="primary" size="sm" onClick={() => setModalOpen(false)}>
              Confirm Factor
            </Button>
          </>
        }
      >
        <p className="text-sm text-brand-body">
          This emission factor applies to heavy industrial diesel engines used for captive electricity generation and furnace start-ups.
        </p>
      </Modal>
    </div>
  );
};
