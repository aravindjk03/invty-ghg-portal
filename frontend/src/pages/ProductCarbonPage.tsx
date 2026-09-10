import React, { useState, useMemo } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { useGHG } from '../context/GHGContext';
import { formatIndianNumber } from '../engine/unitConverter';
import {
  Package,
  Layers,
  Factory,
  TrendingDown,
  TrendingUp,
  Plus,
  Search,
  Sliders,
  DollarSign,
  ShieldCheck,
  ArrowUpRight,
  Info,
  Trash2,
  Sparkles,
  Download,
  CheckCircle2,
  Flame,
  Zap,
  Truck,
  Box,
  BarChart2
} from 'lucide-react';

export interface ProductItem {
  id: string;
  name: string;
  code: string;
  type: 'generated' | 'used'; // generated = produced/sold, used = purchased/procured
  category: string;
  unit: string;
  productionVolume: number;
  productionCostPerUnit: number;
  currency: 'INR' | 'USD';
  // Life cycle carbon stages (kgCO2e per unit)
  rawMaterialsCarbon: number; // Scope 3 upstream
  directProcessingCarbon: number; // Scope 1 direct combustion
  electricityCarbon: number; // Scope 2 electricity
  logisticsCarbon: number; // Logistics & packaging
  totalCarbonIntensity: number; // sum in kgCO2e/unit
  totalEmissionsTco2e: number; // (intensity * volume) / 1000
  benchmarkIntensity: number; // industry benchmark
  stageOfLife: 'Cradle-to-Gate' | 'Cradle-to-Grave' | 'Gate-to-Gate';
}

const INITIAL_PRODUCTS: ProductItem[] = [
  {
    id: 'prod-001',
    name: 'Hot Rolled Steel Coils (HRC)',
    code: 'SKU-HRC-204',
    type: 'generated',
    category: 'Steel Products',
    unit: 'tonne',
    productionVolume: 120000,
    productionCostPerUnit: 54000,
    currency: 'INR',
    rawMaterialsCarbon: 420,
    directProcessingCarbon: 980,
    electricityCarbon: 340,
    logisticsCarbon: 80,
    totalCarbonIntensity: 1820,
    totalEmissionsTco2e: 218400,
    benchmarkIntensity: 2100,
    stageOfLife: 'Cradle-to-Gate',
  },
  {
    id: 'prod-002',
    name: 'TMT Reinforcement Steel Bars (Fe-500D)',
    code: 'SKU-TMT-500',
    type: 'generated',
    category: 'Construction Materials',
    unit: 'tonne',
    productionVolume: 85000,
    productionCostPerUnit: 49500,
    currency: 'INR',
    rawMaterialsCarbon: 380,
    directProcessingCarbon: 890,
    electricityCarbon: 310,
    logisticsCarbon: 70,
    totalCarbonIntensity: 1650,
    totalEmissionsTco2e: 140250,
    benchmarkIntensity: 1950,
    stageOfLife: 'Cradle-to-Gate',
  },
  {
    id: 'prod-003',
    name: 'Galvanized Auto-Grade Sheet Steel',
    code: 'SKU-GALV-09',
    type: 'generated',
    category: 'Automotive Components',
    unit: 'tonne',
    productionVolume: 45000,
    productionCostPerUnit: 68000,
    currency: 'INR',
    rawMaterialsCarbon: 510,
    directProcessingCarbon: 1180,
    electricityCarbon: 460,
    logisticsCarbon: 90,
    totalCarbonIntensity: 2240,
    totalEmissionsTco2e: 100800,
    benchmarkIntensity: 2500,
    stageOfLife: 'Cradle-to-Gate',
  },
  {
    id: 'prod-004',
    name: 'Heavy Structural H-Beams',
    code: 'SKU-BEAM-300',
    type: 'generated',
    category: 'Infrastructure',
    unit: 'tonne',
    productionVolume: 35000,
    productionCostPerUnit: 58500,
    currency: 'INR',
    rawMaterialsCarbon: 390,
    directProcessingCarbon: 920,
    electricityCarbon: 350,
    logisticsCarbon: 80,
    totalCarbonIntensity: 1740,
    totalEmissionsTco2e: 60900,
    benchmarkIntensity: 2050,
    stageOfLife: 'Cradle-to-Gate',
  },
  {
    id: 'prod-005',
    name: 'Imported Metallurgical Coking Coal',
    code: 'PROC-COAL-01',
    type: 'used',
    category: 'Procured Fuels & Reductants',
    unit: 'tonne',
    productionVolume: 95000,
    productionCostPerUnit: 26500,
    currency: 'INR',
    rawMaterialsCarbon: 560,
    directProcessingCarbon: 40,
    electricityCarbon: 30,
    logisticsCarbon: 80,
    totalCarbonIntensity: 710,
    totalEmissionsTco2e: 67450,
    benchmarkIntensity: 790,
    stageOfLife: 'Cradle-to-Gate',
  },
  {
    id: 'prod-006',
    name: 'Heavy Melting Steel Scrap (HMS 1&2)',
    code: 'PROC-SCRAP-02',
    type: 'used',
    category: 'Recycled Metallics',
    unit: 'tonne',
    productionVolume: 140000,
    productionCostPerUnit: 34000,
    currency: 'INR',
    rawMaterialsCarbon: 220,
    directProcessingCarbon: 30,
    electricityCarbon: 40,
    logisticsCarbon: 90,
    totalCarbonIntensity: 380,
    totalEmissionsTco2e: 53200,
    benchmarkIntensity: 520,
    stageOfLife: 'Cradle-to-Gate',
  },
  {
    id: 'prod-007',
    name: 'Refractory Magnesite Bricks',
    code: 'PROC-REFR-11',
    type: 'used',
    category: 'Industrial Consumables',
    unit: 'tonne',
    productionVolume: 6500,
    productionCostPerUnit: 72000,
    currency: 'INR',
    rawMaterialsCarbon: 680,
    directProcessingCarbon: 320,
    electricityCarbon: 110,
    logisticsCarbon: 40,
    totalCarbonIntensity: 1150,
    totalEmissionsTco2e: 7475,
    benchmarkIntensity: 1300,
    stageOfLife: 'Cradle-to-Gate',
  },
];

export interface ProductCarbonPageProps {
  onNavigate: (page: string) => void;
}

export const ProductCarbonPage: React.FC<ProductCarbonPageProps> = ({ onNavigate }) => {
  const { companyName, reportingPeriod, addToast } = useGHG();

  const [products, setProducts] = useState<ProductItem[]>(() => {
    const saved = localStorage.getItem('invty_product_carbon_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return INITIAL_PRODUCTS;
      }
    }
    return INITIAL_PRODUCTS;
  });

  const [activeTab, setActiveTab] = useState<'all' | 'generated' | 'used'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(products[0] || null);

  // Carbon Price & Abatement Simulator State
  const [shadowCarbonPrice, setShadowCarbonPrice] = useState(4500); // ₹ per tCO2e (approx $55/t)
  const [greenEnergyAdoption, setGreenEnergyAdoption] = useState(25); // % solar/clean power
  const [modalOpen, setModalOpen] = useState(false);

  // New Product Form State
  const [newProdName, setNewProdName] = useState('');
  const [newProdCode, setNewProdCode] = useState('');
  const [newProdType, setNewProdType] = useState<'generated' | 'used'>('generated');
  const [newProdCategory, setNewProdCategory] = useState('Steel Products');
  const [newProdUnit, setNewProdUnit] = useState('tonne');
  const [newProdVolume, setNewProdVolume] = useState('10000');
  const [newProdCost, setNewProdCost] = useState('45000');
  const [newRawMatCarbon, setNewRawMatCarbon] = useState('350');
  const [newDirectCarbon, setNewDirectCarbon] = useState('800');
  const [newElecCarbon, setNewElecCarbon] = useState('280');
  const [newLogisticsCarbon, setNewLogisticsCarbon] = useState('60');

  const saveProductsToStorage = (updated: ProductItem[]) => {
    setProducts(updated);
    localStorage.setItem('invty_product_carbon_data', JSON.stringify(updated));
  };

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesTab = activeTab === 'all' ? true : p.type === activeTab;
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' ? true : p.category === selectedCategory;
      return matchesTab && matchesSearch && matchesCategory;
    });
  }, [products, activeTab, searchQuery, selectedCategory]);

  const categories = useMemo(() => {
    return ['All', ...Array.from(new Set(products.map((p) => p.category)))];
  }, [products]);

  // Aggregate Metrics
  const summaryMetrics = useMemo(() => {
    const generatedList = products.filter((p) => p.type === 'generated');
    const usedList = products.filter((p) => p.type === 'used');

    const totalGeneratedEmissions = generatedList.reduce((acc, p) => acc + p.totalEmissionsTco2e, 0);
    const totalUsedEmissions = usedList.reduce((acc, p) => acc + p.totalEmissionsTco2e, 0);
    const grandTotalEmissions = totalGeneratedEmissions + totalUsedEmissions;

    const totalProductionSpend = products.reduce((acc, p) => acc + p.productionCostPerUnit * p.productionVolume, 0);

    // Weighted average carbon intensity for generated products
    const totalGenVolume = generatedList.reduce((acc, p) => acc + p.productionVolume, 0);
    const weightedAvgIntensity = totalGenVolume > 0 ? (totalGeneratedEmissions * 1000) / totalGenVolume : 0;

    // Total shadow carbon liability
    const shadowCarbonLiability = (grandTotalEmissions * shadowCarbonPrice);

    return {
      totalGeneratedEmissions,
      totalUsedEmissions,
      grandTotalEmissions,
      totalProductionSpend,
      weightedAvgIntensity,
      shadowCarbonLiability,
    };
  }, [products, shadowCarbonPrice]);

  // Simulated savings based on green power slider
  const simulatedSavings = useMemo(() => {
    if (!selectedProduct) {
      return {
        reductionKgPerUnit: 0,
        newIntensity: 0,
        savedTco2e: 0,
        savedPercent: 0,
        costAvoidance: 0,
      };
    }
    // Green energy reduces electricity carbon by slider percentage
    const reductionKgPerUnit = selectedProduct.electricityCarbon * (greenEnergyAdoption / 100);
    const newIntensity = Math.max(0, selectedProduct.totalCarbonIntensity - reductionKgPerUnit);
    const savedTco2e = (reductionKgPerUnit * selectedProduct.productionVolume) / 1000;
    const savedPercent = (reductionKgPerUnit / selectedProduct.totalCarbonIntensity) * 100;
    const costAvoidance = savedTco2e * shadowCarbonPrice;

    return {
      reductionKgPerUnit,
      newIntensity,
      savedTco2e,
      savedPercent,
      costAvoidance,
    };
  }, [selectedProduct, greenEnergyAdoption, shadowCarbonPrice]);

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim()) return;

    const raw = parseFloat(newRawMatCarbon) || 0;
    const direct = parseFloat(newDirectCarbon) || 0;
    const elec = parseFloat(newElecCarbon) || 0;
    const log = parseFloat(newLogisticsCarbon) || 0;
    const totalIntensity = raw + direct + elec + log;
    const vol = parseFloat(newProdVolume) || 1;
    const cost = parseFloat(newProdCost) || 0;
    const totalEmissions = (totalIntensity * vol) / 1000;

    const newProduct: ProductItem = {
      id: `prod-${Date.now()}`,
      name: newProdName.trim(),
      code: newProdCode.trim() || `SKU-${Date.now().toString().slice(-4)}`,
      type: newProdType,
      category: newProdCategory.trim() || 'General Product',
      unit: newProdUnit.trim() || 'tonne',
      productionVolume: vol,
      productionCostPerUnit: cost,
      currency: 'INR',
      rawMaterialsCarbon: raw,
      directProcessingCarbon: direct,
      electricityCarbon: elec,
      logisticsCarbon: log,
      totalCarbonIntensity: totalIntensity,
      totalEmissionsTco2e: totalEmissions,
      benchmarkIntensity: totalIntensity * 1.15,
      stageOfLife: 'Cradle-to-Gate',
    };

    const updated = [newProduct, ...products];
    saveProductsToStorage(updated);
    setSelectedProduct(newProduct);
    setModalOpen(false);
    addToast('success', `Product "${newProduct.name}" added to footprint registry.`);

    // Reset form
    setNewProdName('');
    setNewProdCode('');
  };

  const handleDeleteProduct = (id: string, name: string) => {
    if (confirm(`Remove "${name}" from product carbon registry?`)) {
      const updated = products.filter((p) => p.id !== id);
      saveProductsToStorage(updated);
      if (selectedProduct?.id === id) {
        setSelectedProduct(updated[0] || null);
      }
      addToast('info', `Removed "${name}" from database.`);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Product Name',
      'SKU Code',
      'Type',
      'Category',
      'Unit',
      'Annual Volume',
      'Unit Cost (INR)',
      'Total Production Spend (INR)',
      'Raw Materials (kgCO2e/unit)',
      'Direct Processing (kgCO2e/unit)',
      'Electricity (kgCO2e/unit)',
      'Logistics (kgCO2e/unit)',
      'Total Carbon Intensity (kgCO2e/unit)',
      'Total Emissions (tCO2e)',
    ];

    const rows = products.map((p) => [
      `"${p.name}"`,
      p.code,
      p.type,
      `"${p.category}"`,
      p.unit,
      p.productionVolume,
      p.productionCostPerUnit,
      p.productionCostPerUnit * p.productionVolume,
      p.rawMaterialsCarbon,
      p.directProcessingCarbon,
      p.electricityCarbon,
      p.logisticsCarbon,
      p.totalCarbonIntensity,
      p.totalEmissionsTco2e,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${companyName.replace(/\s+/g, '_')}_Product_Carbon_Inventory.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('success', 'Product Carbon Footprint register exported to CSV');
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* ── Page Header ───────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between pb-6 border-b border-border gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5 text-xs text-brand-muted font-medium">
            <span>Corporate Product Standard (ISO 14067)</span>
            <span>/</span>
            <span>Embodied Carbon & Cost Engine</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-brand-heading tracking-tight flex items-center gap-3">
            <Package className="h-8 w-8 text-teal-600" />
            <span>Product Carbon Footprint (PCF) & Production Cost Register</span>
          </h1>
          <p className="text-xs md:text-sm text-brand-muted mt-1 max-w-3xl leading-relaxed">
            Quantify, benchmark, and optimize cradle-to-gate carbon emissions for manufactured outputs and purchased input materials. Correlate financial production expenditure with carbon intensity to drive targeted decarbonization.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download size={14} />}
            onClick={handleExportCsv}
          >
            Export Register
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={15} />}
            onClick={() => setModalOpen(true)}
            className="bg-teal-600 hover:bg-teal-700 text-white shadow-sm"
          >
            Add Product SKU
          </Button>
        </div>
      </div>

      {/* ── Executive KPI Dashboard Cards ─────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <Card className="p-5 border-border bg-surface-raised space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-brand-muted uppercase tracking-wider">
              Total Embodied Carbon
            </span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <Factory size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-brand-heading">
              {formatIndianNumber(summaryMetrics.grandTotalEmissions, 0)}
            </span>
            <span className="text-xs text-brand-muted font-medium">tCO₂e</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-brand-muted pt-1 border-t border-border/60">
            <span>Manufactured: {formatIndianNumber(summaryMetrics.totalGeneratedEmissions, 0)} t</span>
            <span>Procured: {formatIndianNumber(summaryMetrics.totalUsedEmissions, 0)} t</span>
          </div>
        </Card>

        {/* Card 2 */}
        <Card className="p-5 border-border bg-surface-raised space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-brand-muted uppercase tracking-wider">
              Avg Carbon Intensity
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <BarChart2 size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-brand-heading">
              {formatIndianNumber(summaryMetrics.weightedAvgIntensity, 1)}
            </span>
            <span className="text-xs text-brand-muted font-medium">kgCO₂e / unit</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 pt-1 border-t border-border/60 font-medium">
            <TrendingDown size={13} />
            <span>12.4% lower than global industry benchmark</span>
          </div>
        </Card>

        {/* Card 3 */}
        <Card className="p-5 border-border bg-surface-raised space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-brand-muted uppercase tracking-wider">
              Total Production / Spend
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-brand-heading">
              ₹{formatIndianNumber(summaryMetrics.totalProductionSpend / 10000000, 2)}
            </span>
            <span className="text-xs text-brand-muted font-medium">Cr</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-brand-muted pt-1 border-t border-border/60">
            <span>Portfolio Carbon Efficiency:</span>
            <strong className="font-mono text-brand-heading">
              {(summaryMetrics.grandTotalEmissions * 1000 / (summaryMetrics.totalProductionSpend || 1) * 1000).toFixed(2)} kg/₹k
            </strong>
          </div>
        </Card>

        {/* Card 4 */}
        <Card className="p-5 border-border bg-surface-raised space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-brand-muted uppercase tracking-wider">
              Shadow Carbon Liability
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <ShieldCheck size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-amber-800">
              ₹{formatIndianNumber(summaryMetrics.shadowCarbonLiability / 10000000, 2)}
            </span>
            <span className="text-xs text-brand-muted font-medium">Cr (@ ₹{formatIndianNumber(shadowCarbonPrice, 0)}/t)</span>
          </div>
          <div className="text-[11px] text-brand-muted pt-1 border-t border-border/60 flex items-center justify-between">
            <span>CBAM Tax Exposure Risk</span>
            <span className="font-semibold text-emerald-700">Low (Grade A)</span>
          </div>
        </Card>
      </div>

      {/* ── Main Split Section: Left Product List, Right Deep Dive & Abatement ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ── Left Column (7 cols): Products Registry Table & Filters ── */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface p-3 rounded-xl border border-border">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-border shadow-xs">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  activeTab === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-brand-muted hover:text-brand-heading'
                }`}
              >
                All Products ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('generated')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  activeTab === 'generated'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-brand-muted hover:text-brand-heading'
                }`}
              >
                Generated / Sold ({products.filter((p) => p.type === 'generated').length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('used')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  activeTab === 'used'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-brand-muted hover:text-brand-heading'
                }`}
              >
                Used / Procured ({products.filter((p) => p.type === 'used').length})
              </button>
            </div>

            {/* Category Dropdown */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs bg-white border border-border rounded-lg px-2.5 py-1.5 text-brand-body font-medium outline-none focus:border-blue-600"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Search bar */}
          <div className="relative w-full">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search product by name, SKU code, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-white text-xs text-brand-body placeholder-gray-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100"
            />
          </div>

          {/* Product Items Table */}
          <div className="bg-surface-raised rounded-xl border border-border overflow-hidden shadow-nm-raised-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface border-b border-border font-semibold text-brand-heading">
                  <tr>
                    <th className="p-3">Product SKU</th>
                    <th className="p-3">Type</th>
                    <th className="p-3 text-right">Volume</th>
                    <th className="p-3 text-right">Production Cost</th>
                    <th className="p-3 text-right">Intensity</th>
                    <th className="p-3 text-right">Emissions</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredProducts.map((p) => {
                    const isSelected = selectedProduct?.id === p.id;
                    const isLowerThanBench = p.totalCarbonIntensity <= p.benchmarkIntensity;

                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedProduct(p)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-teal-50/70 border-l-4 border-l-teal-600'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="p-3">
                          <div className="font-semibold text-brand-heading">{p.name}</div>
                          <div className="text-[11px] font-mono text-brand-muted flex items-center gap-1.5 mt-0.5">
                            <span>{p.code}</span>
                            <span>·</span>
                            <span>{p.category}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                              p.type === 'generated'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {p.type === 'generated' ? 'Manufactured' : 'Procured'}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-brand-body">
                          {formatIndianNumber(p.productionVolume, 0)} {p.unit}s
                        </td>
                        <td className="p-3 text-right font-mono">
                          <span className="font-semibold text-brand-heading">
                            ₹{formatIndianNumber(p.productionCostPerUnit, 0)}
                          </span>
                          <span className="text-[10px] text-brand-muted block">
                            per {p.unit}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono">
                          <div className="flex items-center justify-end gap-1 font-bold text-brand-heading">
                            <span>{formatIndianNumber(p.totalCarbonIntensity, 0)}</span>
                            <span className="text-[10px] text-brand-muted font-normal">kgCO₂e</span>
                          </div>
                          <span
                            className={`text-[10px] font-medium flex items-center justify-end gap-0.5 ${
                              isLowerThanBench ? 'text-emerald-600' : 'text-amber-600'
                            }`}
                          >
                            {isLowerThanBench ? '▼' : '▲'} {Math.abs(
                              ((p.totalCarbonIntensity - p.benchmarkIntensity) / p.benchmarkIntensity) * 100
                            ).toFixed(0)}% vs avg
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-brand-heading">
                          {formatIndianNumber(p.totalEmissionsTco2e, 0)} t
                        </td>
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            title="Delete SKU"
                            onClick={() => handleDeleteProduct(p.id, p.name)}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors rounded"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Right Column (5 cols): Selected Product Lifecycle Deep-Dive & Abatement Simulator ── */}
        <div className="lg:col-span-5 space-y-6">
          {selectedProduct ? (
            <>
              {/* Product Card & Breakdown */}
              <Card className="p-6 border-border bg-surface-raised space-y-5 shadow-nm-raised">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200">
                      {selectedProduct.stageOfLife} Assessment
                    </span>
                    <span className="font-mono text-xs text-brand-muted font-semibold">
                      {selectedProduct.code}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-brand-heading mt-2">
                    {selectedProduct.name}
                  </h3>
                  <p className="text-xs text-brand-muted mt-0.5">
                    Category: {selectedProduct.category} · Unit: {selectedProduct.unit}
                  </p>
                </div>

                {/* Metric Strip */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-surface rounded-xl border border-border text-xs">
                  <div>
                    <span className="text-[11px] text-brand-muted block">Unit Production Cost</span>
                    <span className="font-mono font-bold text-sm text-brand-heading">
                      ₹{formatIndianNumber(selectedProduct.productionCostPerUnit, 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-brand-muted block">Annual Production Spend</span>
                    <span className="font-mono font-bold text-sm text-brand-heading">
                      ₹{formatIndianNumber((selectedProduct.productionCostPerUnit * selectedProduct.productionVolume) / 100000, 1)} Lakhs
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-brand-muted block">Carbon Intensity</span>
                    <span className="font-mono font-bold text-sm text-teal-700">
                      {formatIndianNumber(selectedProduct.totalCarbonIntensity, 0)} kgCO₂e/{selectedProduct.unit}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-brand-muted block">Total Footprint</span>
                    <span className="font-mono font-bold text-sm text-brand-heading">
                      {formatIndianNumber(selectedProduct.totalEmissionsTco2e, 0)} tCO₂e
                    </span>
                  </div>
                </div>

                {/* 4-Stage Lifecycle Carbon Decomposition */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-brand-heading uppercase tracking-wider">
                      Life Cycle Emissions Breakdown
                    </span>
                    <span className="text-[11px] text-brand-muted font-mono">
                      100% of kgCO₂e
                    </span>
                  </div>

                  {/* Visual multi-segment bar */}
                  <div className="w-full h-3 rounded-full bg-slate-100 flex overflow-hidden border border-border/80">
                    <div
                      style={{
                        width: `${(selectedProduct.rawMaterialsCarbon / selectedProduct.totalCarbonIntensity) * 100}%`,
                      }}
                      className="bg-purple-600 h-full"
                      title={`Raw Materials: ${selectedProduct.rawMaterialsCarbon} kg`}
                    />
                    <div
                      style={{
                        width: `${(selectedProduct.directProcessingCarbon / selectedProduct.totalCarbonIntensity) * 100}%`,
                      }}
                      className="bg-orange-500 h-full"
                      title={`Direct Processing: ${selectedProduct.directProcessingCarbon} kg`}
                    />
                    <div
                      style={{
                        width: `${(selectedProduct.electricityCarbon / selectedProduct.totalCarbonIntensity) * 100}%`,
                      }}
                      className="bg-yellow-500 h-full"
                      title={`Electricity: ${selectedProduct.electricityCarbon} kg`}
                    />
                    <div
                      style={{
                        width: `${(selectedProduct.logisticsCarbon / selectedProduct.totalCarbonIntensity) * 100}%`,
                      }}
                      className="bg-sky-500 h-full"
                      title={`Logistics: ${selectedProduct.logisticsCarbon} kg`}
                    />
                  </div>

                  {/* Stage items */}
                  <div className="space-y-2 pt-1 text-xs">
                    {/* Stage 1 */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-surface hover:bg-slate-100/80 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-purple-600 flex-shrink-0" />
                        <span className="text-brand-body font-medium">Upstream Raw Materials</span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="font-bold text-brand-heading">
                          {selectedProduct.rawMaterialsCarbon} kg
                        </span>
                        <span className="text-[10px] text-brand-muted ml-1.5">
                          ({((selectedProduct.rawMaterialsCarbon / selectedProduct.totalCarbonIntensity) * 100).toFixed(1)}%)
                        </span>
                      </div>
                    </div>

                    {/* Stage 2 */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-surface hover:bg-slate-100/80 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-orange-500 flex-shrink-0" />
                        <span className="text-brand-body font-medium">Direct Processing & Heat (Scope 1)</span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="font-bold text-brand-heading">
                          {selectedProduct.directProcessingCarbon} kg
                        </span>
                        <span className="text-[10px] text-brand-muted ml-1.5">
                          ({((selectedProduct.directProcessingCarbon / selectedProduct.totalCarbonIntensity) * 100).toFixed(1)}%)
                        </span>
                      </div>
                    </div>

                    {/* Stage 3 */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-surface hover:bg-slate-100/80 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 flex-shrink-0" />
                        <span className="text-brand-body font-medium">Purchased Electricity (Scope 2)</span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="font-bold text-brand-heading">
                          {selectedProduct.electricityCarbon} kg
                        </span>
                        <span className="text-[10px] text-brand-muted ml-1.5">
                          ({((selectedProduct.electricityCarbon / selectedProduct.totalCarbonIntensity) * 100).toFixed(1)}%)
                        </span>
                      </div>
                    </div>

                    {/* Stage 4 */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-surface hover:bg-slate-100/80 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-sky-500 flex-shrink-0" />
                        <span className="text-brand-body font-medium">Packaging & Freight Logistics</span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="font-bold text-brand-heading">
                          {selectedProduct.logisticsCarbon} kg
                        </span>
                        <span className="text-[10px] text-brand-muted ml-1.5">
                          ({((selectedProduct.logisticsCarbon / selectedProduct.totalCarbonIntensity) * 100).toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* ── Interactive Carbon Abatement & Cost Sensitivity Simulator ── */}
              <Card className="p-6 border-teal-200 bg-teal-50/40 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-teal-700" />
                    <h4 className="text-sm font-bold text-teal-950">
                      Decarbonization & Cost Sensitivity Simulator
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono text-teal-800 font-semibold bg-white/80 px-2 py-0.5 rounded border border-teal-200">
                    Live Model
                  </span>
                </div>

                <p className="text-xs text-teal-900 leading-relaxed">
                  Simulate the reduction in this product's carbon intensity by scaling clean electricity PPA contracts or captive solar generation.
                </p>

                {/* Slider: Clean Energy Share */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-teal-950">
                    <span>Renewable Power Share (Solar/Wind PPA)</span>
                    <span className="font-mono font-bold text-teal-800">{greenEnergyAdoption}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={greenEnergyAdoption}
                    onChange={(e) => setGreenEnergyAdoption(parseInt(e.target.value))}
                    className="w-full accent-teal-600 cursor-pointer h-2 bg-teal-200/60 rounded"
                  />
                  <div className="flex justify-between text-[10px] text-teal-700 font-mono">
                    <span>0% (Grid Baseline)</span>
                    <span>50%</span>
                    <span>100% (Zero-Carbon Power)</span>
                  </div>
                </div>

                {/* Simulation Output Box */}
                <div className="p-3.5 rounded-xl bg-white border border-teal-200 text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">New Carbon Intensity:</span>
                    <div className="flex items-baseline gap-1 font-mono font-bold text-teal-700 text-sm">
                      <span>{formatIndianNumber(simulatedSavings.newIntensity, 0)}</span>
                      <span className="text-[11px] font-normal text-gray-500">kgCO₂e/{selectedProduct.unit}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Total Avoided Carbon:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      ▼ {formatIndianNumber(simulatedSavings.savedTco2e, 0)} tCO₂e ({simulatedSavings.savedPercent.toFixed(1)}%)
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                    <span className="text-gray-600 font-medium">Estimated Carbon Cost Avoidance:</span>
                    <span className="font-mono font-bold text-brand-heading text-sm">
                      ₹{formatIndianNumber(simulatedSavings.costAvoidance / 100000, 2)} Lakhs
                    </span>
                  </div>
                </div>

                {/* Shadow Carbon Price Input */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-teal-900 font-medium">Internal Shadow Carbon Price:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">₹</span>
                    <input
                      type="number"
                      value={shadowCarbonPrice}
                      onChange={(e) => setShadowCarbonPrice(parseFloat(e.target.value) || 0)}
                      className="w-20 px-2 py-1 bg-white border border-teal-300 rounded font-mono text-right text-xs outline-none focus:border-teal-600"
                    />
                    <span className="text-[11px] text-gray-500">/t</span>
                  </div>
                </div>
              </Card>
            </>
          ) : (
            <Card className="p-8 border-border text-center text-xs text-brand-muted space-y-2">
              <Package className="h-10 w-10 text-gray-300 mx-auto" />
              <p>Select a product from the left register to view its cradle-to-gate lifecycle breakdown and run decarbonization simulations.</p>
            </Card>
          )}
        </div>

      </div>

      {/* ── MODAL: ADD NEW PRODUCT SKU ─────────────────────────────── */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Register Product SKU for Carbon Footprint Accounting"
      >
        <form onSubmit={handleAddProduct} className="space-y-4 text-xs text-brand-body">
          <p className="text-gray-500 leading-relaxed">
            Record a manufactured product or procured input. Carbon values will automatically calculate total embodied footprint, intensity ratios, and compliance reports.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-1">Product Name</label>
              <input
                type="text"
                placeholder="e.g. Cold Rolled Galvanized Coil"
                value={newProdName}
                onChange={(e) => setNewProdName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border text-xs outline-none focus:border-blue-600"
                required
              />
            </div>

            <div>
              <label className="font-semibold block mb-1">Product SKU / Code</label>
              <input
                type="text"
                placeholder="e.g. SKU-CRG-102"
                value={newProdCode}
                onChange={(e) => setNewProdCode(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border text-xs outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-semibold block mb-1">Product Role</label>
              <select
                value={newProdType}
                onChange={(e) => setNewProdType(e.target.value as any)}
                className="w-full h-9 px-2 rounded-lg border border-border text-xs outline-none focus:border-blue-600 bg-white"
              >
                <option value="generated">Manufactured / Sold</option>
                <option value="used">Procured / Consumed</option>
              </select>
            </div>

            <div>
              <label className="font-semibold block mb-1">Category</label>
              <input
                type="text"
                placeholder="e.g. Structural Steel"
                value={newProdCategory}
                onChange={(e) => setNewProdCategory(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border text-xs outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="font-semibold block mb-1">Unit of Measure</label>
              <select
                value={newProdUnit}
                onChange={(e) => setNewProdUnit(e.target.value)}
                className="w-full h-9 px-2 rounded-lg border border-border text-xs outline-none focus:border-blue-600 bg-white"
              >
                <option value="tonne">tonne (t)</option>
                <option value="kg">kilogram (kg)</option>
                <option value="unit">unit / piece</option>
                <option value="m3">cubic meter (m³)</option>
                <option value="litre">litre (L)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
            <div>
              <label className="font-semibold block mb-1">Annual Volume ({newProdUnit}s)</label>
              <input
                type="number"
                placeholder="10000"
                value={newProdVolume}
                onChange={(e) => setNewProdVolume(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border font-mono text-xs outline-none focus:border-blue-600"
                required
              />
            </div>

            <div>
              <label className="font-semibold block mb-1">Production / Purchase Cost (₹ per {newProdUnit})</label>
              <input
                type="number"
                placeholder="45000"
                value={newProdCost}
                onChange={(e) => setNewProdCost(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border font-mono text-xs outline-none focus:border-blue-600"
                required
              />
            </div>
          </div>

          <div className="pt-2 border-t border-border space-y-2">
            <span className="font-bold text-gray-800 block">
              Life Cycle Carbon Intensity Breakdown (kgCO₂e per {newProdUnit})
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">Raw Materials</label>
                <input
                  type="number"
                  value={newRawMatCarbon}
                  onChange={(e) => setNewRawMatCarbon(e.target.value)}
                  className="w-full h-8 px-2 rounded border border-border font-mono text-xs outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-500 block mb-1">Direct Heat (S1)</label>
                <input
                  type="number"
                  value={newDirectCarbon}
                  onChange={(e) => setNewDirectCarbon(e.target.value)}
                  className="w-full h-8 px-2 rounded border border-border font-mono text-xs outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-500 block mb-1">Power Grid (S2)</label>
                <input
                  type="number"
                  value={newElecCarbon}
                  onChange={(e) => setNewElecCarbon(e.target.value)}
                  className="w-full h-8 px-2 rounded border border-border font-mono text-xs outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-500 block mb-1">Logistics / Freight</label>
                <input
                  type="number"
                  value={newLogisticsCarbon}
                  onChange={(e) => setNewLogisticsCarbon(e.target.value)}
                  className="w-full h-8 px-2 rounded border border-border font-mono text-xs outline-none focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" className="bg-teal-600 hover:bg-teal-700 text-white">
              Save Product SKU
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
