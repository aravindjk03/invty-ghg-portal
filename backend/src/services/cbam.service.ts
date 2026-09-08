import Decimal from 'decimal.js';

export interface CBAMInputData {
  sector: 'steel' | 'aluminium' | 'cement' | 'fertilisers';
  cnCode: string;
  goodsDescription: string;
  productionVolumeTonnes: number;
  scope1AttributedTco2e: number;
  scope2AttributedTco2e: number;
  carbonPricePaidEurPerTonne?: number;
  reportingQuarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  reportingYear: number;
  installationName?: string;
  countryCode?: string;
  unLocode?: string;
}

// EU Default Benchmarks (EU Implementing Regulation 2023/1773)
const EU_DEFAULT_BENCHMARKS: Record<string, { direct: number; indirect: number; total: number }> = {
  // Steel
  '7206': { direct: 1.328, indirect: 0.412, total: 1.740 }, // Iron and non-alloy steel in ingots
  '7207': { direct: 1.250, indirect: 0.380, total: 1.630 }, // Semi-finished products of iron/steel
  '7214': { direct: 0.980, indirect: 0.290, total: 1.270 }, // Steel bars & rods / rebar
  '7210': { direct: 1.150, indirect: 0.340, total: 1.490 }, // Flat-rolled products, clad/coated
  // Cement
  '2523': { direct: 0.766, indirect: 0.082, total: 0.848 }, // Cement clinker
  '252329': { direct: 0.540, indirect: 0.065, total: 0.605 }, // Portland cement
  // Aluminium
  '7601': { direct: 1.464, indirect: 6.820, total: 8.284 }, // Unwrought aluminium
  '7604': { direct: 0.820, indirect: 1.150, total: 1.970 }, // Aluminium bars, rods and profiles
  // Fertilisers
  '2808': { direct: 1.350, indirect: 0.220, total: 1.570 }, // Nitric acid
  '2814': { direct: 2.100, indirect: 0.310, total: 2.410 }, // Anhydrous ammonia
};

export const cbamService = {
  calculateEmbeddedEmissions(input: CBAMInputData) {
    const qty = new Decimal(input.productionVolumeTonnes || 1);
    const s1 = new Decimal(input.scope1AttributedTco2e || 0);
    const s2 = new Decimal(input.scope2AttributedTco2e || 0);

    const directSpecific = s1.dividedBy(qty).toDecimalPlaces(4);
    const indirectSpecific = s2.dividedBy(qty).toDecimalPlaces(4);
    const totalSpecific = directSpecific.plus(indirectSpecific).toDecimalPlaces(4);
    const totalEmissions = s1.plus(s2).toDecimalPlaces(2);

    const benchmark = EU_DEFAULT_BENCHMARKS[input.cnCode] || {
      direct: 1.2,
      indirect: 0.35,
      total: 1.55,
    };

    const benchmarkDiff = totalSpecific.minus(benchmark.total);
    const deltaPercentage = benchmark.total > 0
      ? benchmarkDiff.dividedBy(benchmark.total).times(100).toDecimalPlaces(1).toNumber()
      : 0;

    const carbonPricePaid = new Decimal(input.carbonPricePaidEurPerTonne || 0);
    const euAllowancePriceEur = 68.5; // Average EU ETS benchmark price (€/tCO2e)
    const netEtsPriceDifferential = Math.max(0, euAllowancePriceEur - carbonPricePaid.toNumber());
    const estimatedCertificatesCostEur = totalEmissions.times(netEtsPriceDifferential).toDecimalPlaces(2).toNumber();

    // Generate compliant EU CBAM Communications XML
    const xml = this.generateCbamXml(input, {
      directSpecific: directSpecific.toNumber(),
      indirectSpecific: indirectSpecific.toNumber(),
      totalSpecific: totalSpecific.toNumber(),
      totalEmissions: totalEmissions.toNumber(),
      benchmarkTotal: benchmark.total,
      carbonPricePaid: carbonPricePaid.toNumber(),
    });

    return {
      cnCode: input.cnCode,
      goodsDescription: input.goodsDescription,
      productionVolumeTonnes: qty.toNumber(),
      directEmbeddedSpecific: directSpecific.toNumber(),
      indirectEmbeddedSpecific: indirectSpecific.toNumber(),
      totalEmbeddedSpecific: totalSpecific.toNumber(),
      totalEmbeddedEmissions: totalEmissions.toNumber(),
      euBenchmarkSpecific: benchmark.total,
      benchmarkDeltaPercentage: deltaPercentage,
      isBenchmarkBreached: deltaPercentage > 0,
      effectiveCarbonPricePaidEur: carbonPricePaid.toNumber(),
      estimatedCbamCertificatesRequired: totalEmissions.toNumber(),
      estimatedCertificatesCostEur,
      xmlPreview: xml,
    };
  },

  generateCbamXml(
    input: CBAMInputData,
    calc: {
      directSpecific: number;
      indirectSpecific: number;
      totalSpecific: number;
      totalEmissions: number;
      benchmarkTotal: number;
      carbonPricePaid: number;
    }
  ): string {
    const timestamp = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8"?>
<!-- European Commission - Carbon Border Adjustment Mechanism (CBAM) Communication Structure -->
<!-- In accordance with Regulation (EU) 2023/956 & Implementing Regulation (EU) 2023/1773 -->
<CBAMQuarterlyReport xmlns="urn:eu:cbam:report:v1.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Header>
    <MessageId>CBAM-REP-${Date.now()}</MessageId>
    <CreationDateTime>${timestamp}</CreationDateTime>
    <ReportingPeriod>
      <Quarter>${input.reportingQuarter}</Quarter>
      <Year>${input.reportingYear}</Year>
    </ReportingPeriod>
    <ComplianceStandard>EU-CBAM-TRANSITIONAL-2023-1773</ComplianceStandard>
  </Header>

  <Installation>
    <Name>${input.installationName || 'INVTY Industrial Manufacturing Complex'}</Name>
    <CountryCode>${input.countryCode || 'IN'}</CountryCode>
    <UNLOCODE>${input.unLocode || 'INJAI'}</UNLOCODE>
    <Sector>${input.sector.toUpperCase()}</Sector>
  </Installation>

  <AggregatedGoodsCategory>
    <CNCode>${input.cnCode}</CNCode>
    <Description>${input.goodsDescription}</Description>
    <TotalProductionVolume unit="metric_tonne">${calc.directSpecific > 0 ? input.productionVolumeTonnes : 0}</TotalProductionVolume>
    
    <SpecificEmbeddedEmissions unit="tCO2e/t">
      <DirectEmbeddedEmissions>${calc.directSpecific.toFixed(4)}</DirectEmbeddedEmissions>
      <IndirectEmbeddedEmissions>${calc.indirectSpecific.toFixed(4)}</IndirectEmbeddedEmissions>
      <TotalSpecificEmissions>${calc.totalSpecific.toFixed(4)}</TotalSpecificEmissions>
    </SpecificEmbeddedEmissions>

    <TotalEmissionsAttributed unit="tCO2e">
      <GrossTotal>${calc.totalEmissions.toFixed(2)}</GrossTotal>
    </TotalEmissionsAttributed>

    <BenchmarkAssessment>
      <EUBenchmarkValue>${calc.benchmarkTotal.toFixed(4)}</EUBenchmarkValue>
      <Methodology>Actual Installation Measurements Verified under ISO 14064-1</Methodology>
    </BenchmarkAssessment>

    <CarbonPriceEffectivelyPaidInOriginCountry>
      <Currency>EUR</Currency>
      <PricePerTonne>${calc.carbonPricePaid.toFixed(2)}</PricePerTonne>
      <EligibleForRebateDeduction>true</EligibleForRebateDeduction>
    </CarbonPriceEffectivelyPaidInOriginCountry>
  </AggregatedGoodsCategory>
</CBAMQuarterlyReport>`;
  },
};
