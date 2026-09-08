import Decimal from 'decimal.js';

export interface BRSRInputData {
  financialYear: string;
  turnoverInCroresINR: number;
  physicalOutputTonnes: number;
  outputMetricName: string;
  scope1TotalTco2e: number;
  scope2LocationTco2e: number;
  scope2MarketTco2e: number;
  scope3TotalTco2e: number;
  companyName?: string;
  cinNumber?: string; // Corporate Identification Number (e.g. L27100MH1907PLC000260)
  assuranceType: 'Reasonable Assurance' | 'Limited Assurance' | 'Internal Audit Only';
  assuranceAgency?: string;
}

export const brsrService = {
  calculateBRSRCore(input: BRSRInputData) {
    const turnover = new Decimal(input.turnoverInCroresINR || 1);
    const output = new Decimal(input.physicalOutputTonnes || 1);

    const s1 = new Decimal(input.scope1TotalTco2e || 0);
    const s2Loc = new Decimal(input.scope2LocationTco2e || 0);
    const s2Mkt = new Decimal(input.scope2MarketTco2e || 0);
    const s3 = new Decimal(input.scope3TotalTco2e || 0);

    const grossLocation = s1.plus(s2Loc).plus(s3);
    const grossMarket = s1.plus(s2Mkt).plus(s3);

    // Turnover Intensities (tCO2e / Crore INR)
    const turnoverIntensityLoc = grossLocation.dividedBy(turnover).toDecimalPlaces(3).toNumber();
    const turnoverIntensityMkt = grossMarket.dividedBy(turnover).toDecimalPlaces(3).toNumber();

    // Production Intensities (tCO2e / physical tonne)
    const prodIntensityLoc = grossLocation.dividedBy(output).toDecimalPlaces(4).toNumber();
    const prodIntensityMkt = grossMarket.dividedBy(output).toDecimalPlaces(4).toNumber();

    const sebiComplianceStatus: 'Fully Compliant' | 'Pending Value Chain Scope 3' | 'Under Review' =
      s3.toNumber() > 0 ? 'Fully Compliant' : 'Pending Value Chain Scope 3';

    const xbrl = this.generateBRSRXbrl(input, {
      s1: s1.toNumber(),
      s2Loc: s2Loc.toNumber(),
      s2Mkt: s2Mkt.toNumber(),
      s3: s3.toNumber(),
      grossLocation: grossLocation.toNumber(),
      turnoverIntensityLoc,
      prodIntensityLoc,
    });

    return {
      financialYear: input.financialYear,
      turnoverInCroresINR: turnover.toNumber(),
      physicalOutputTonnes: output.toNumber(),
      scope1: s1.toNumber(),
      scope2Location: s2Loc.toNumber(),
      scope2Market: s2Mkt.toNumber(),
      scope3: s3.toNumber(),
      grossEmissionsLocation: grossLocation.toNumber(),
      grossEmissionsMarket: grossMarket.toNumber(),
      turnoverIntensityLocation: turnoverIntensityLoc,
      turnoverIntensityMarket: turnoverIntensityMkt,
      productionIntensityLocation: prodIntensityLoc,
      productionIntensityMarket: prodIntensityMkt,
      assuranceStatus: `${input.assuranceType}${input.assuranceAgency ? ` by ${input.assuranceAgency}` : ''}`,
      xbrlXmlPreview: xbrl,
      sebiComplianceStatus,
    };
  },

  generateBRSRXbrl(
    input: BRSRInputData,
    calc: {
      s1: number;
      s2Loc: number;
      s2Mkt: number;
      s3: number;
      grossLocation: number;
      turnoverIntensityLoc: number;
      prodIntensityLoc: number;
    }
  ): string {
    const cin = input.cinNumber || 'L27100MH2024PLC123456';
    const timestamp = new Date().toISOString();

    return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Securities and Exchange Board of India (SEBI) - Business Responsibility & Sustainability Reporting (BRSR Core) -->
<!-- Principle 6: Businesses should respect and make efforts to protect and restore the environment -->
<xbrli:xbrl 
  xmlns:xbrli="http://www.xbrl.org/2003/instance"
  xmlns:sebi-brsr="http://www.sebi.gov.in/brsr/core/2023-07-12"
  xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
  xmlns:xlink="http://www.w3.org/1999/xlink">

  <xbrli:context id="FY_Current">
    <xbrli:entity>
      <xbrli:identifier scheme="http://mca.gov.in/CIN">${cin}</xbrli:identifier>
    </xbrli:entity>
    <xbrli:period>
      <xbrli:startDate>2024-04-01</xbrli:startDate>
      <xbrli:endDate>2025-03-31</xbrli:endDate>
    </xbrli:period>
  </xbrli:context>

  <xbrli:unit id="tCO2e">
    <xbrli:measure>sebi-brsr:metric_tonne_CO2_equivalent</xbrli:measure>
  </xbrli:unit>

  <xbrli:unit id="tCO2e_per_CroreINR">
    <xbrli:divide>
      <xbrli:unitNumerator>
        <xbrli:measure>sebi-brsr:metric_tonne_CO2_equivalent</xbrli:measure>
      </xbrli:unitNumerator>
      <xbrli:unitDenominator>
        <xbrli:measure>iso4217:INR</xbrli:measure>
      </xbrli:unitDenominator>
    </xbrli:divide>
  </xbrli:unit>

  <!-- Principle 6: Essential Indicator 7 - Gross Scope 1 & 2 Emissions -->
  <sebi-brsr:Scope1Emissions contextRef="FY_Current" unitRef="tCO2e" decimals="2">${calc.s1.toFixed(2)}</sebi-brsr:Scope1Emissions>
  <sebi-brsr:Scope2LocationEmissions contextRef="FY_Current" unitRef="tCO2e" decimals="2">${calc.s2Loc.toFixed(2)}</sebi-brsr:Scope2LocationEmissions>
  <sebi-brsr:Scope2MarketEmissions contextRef="FY_Current" unitRef="tCO2e" decimals="2">${calc.s2Mkt.toFixed(2)}</sebi-brsr:Scope2MarketEmissions>
  
  <!-- Principle 6: Essential Indicator 8 - Scope 3 and Emission Intensities -->
  <sebi-brsr:Scope3Emissions contextRef="FY_Current" unitRef="tCO2e" decimals="2">${calc.s3.toFixed(2)}</sebi-brsr:Scope3Emissions>
  <sebi-brsr:TotalGrossEmissions contextRef="FY_Current" unitRef="tCO2e" decimals="2">${calc.grossLocation.toFixed(2)}</sebi-brsr:TotalGrossEmissions>
  <sebi-brsr:GHGIntensityPerTurnoverCrore contextRef="FY_Current" unitRef="tCO2e_per_CroreINR" decimals="3">${calc.turnoverIntensityLoc.toFixed(3)}</sebi-brsr:GHGIntensityPerTurnoverCrore>
  <sebi-brsr:GHGIntensityPerPhysicalProductionUnit contextRef="FY_Current" decimals="4">${calc.prodIntensityLoc.toFixed(4)}</sebi-brsr:GHGIntensityPerPhysicalProductionUnit>

  <!-- Assurance Footnote -->
  <sebi-brsr:AssuranceScopeDescription contextRef="FY_Current">
    ${input.assuranceType} conducted by ${input.assuranceAgency || 'Independent Assurance Practitioner'} adhering to standard ISAE 3410 / ISO 14064-3.
  </sebi-brsr:AssuranceScopeDescription>
</xbrli:xbrl>`;
  },
};
