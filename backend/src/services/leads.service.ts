import crypto from 'crypto';

export interface CustomerLeadRecord {
  id: string;
  name: string;
  workEmail: string;
  companyName: string;
  sector: string;
  phone?: string;
  primaryNeed: string;
  referralSource: string;
  annualTurnoverOrProduction?: string;
  inventoryStats?: {
    totalTco2e: number;
    scope1: number;
    scope2: number;
    scope3: number;
    qualityGrade: string;
  };
  capturedAt: string;
  ipAddress?: string;
}

// In-memory lead store with pre-seeded demonstration records
const leadsStore: CustomerLeadRecord[] = [
  {
    id: 'lead-001-tata-corp',
    name: 'Rajesh Sharma',
    workEmail: 'r.sharma@tata-heavy-eng.com',
    companyName: 'Tata Heavy Engineering Ltd',
    sector: 'Manufacturing',
    primaryNeed: 'cbam',
    referralSource: 'portfolio',
    annualTurnoverOrProduction: '2,400 Cr INR / 650,000 tonnes',
    inventoryStats: {
      totalTco2e: 84520.5,
      scope1: 52100.2,
      scope2: 18420.3,
      scope3: 14000.0,
      qualityGrade: 'B',
    },
    capturedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    ipAddress: '103.21.124.5',
  },
  {
    id: 'lead-002-jsw-steels',
    name: 'Ananya Verma',
    workEmail: 'a.verma@jsw-specialty-alloys.in',
    companyName: 'JSW Specialty Alloys Division',
    sector: 'Steel',
    primaryNeed: 'brsr',
    referralSource: 'portfolio',
    annualTurnoverOrProduction: '1,850 Cr INR / 420,000 tonnes',
    inventoryStats: {
      totalTco2e: 61200.0,
      scope1: 41000.0,
      scope2: 11200.0,
      scope3: 9000.0,
      qualityGrade: 'A',
    },
    capturedAt: new Date(Date.now() - 86400000).toISOString(),
    ipAddress: '14.139.128.4',
  },
];

export const leadsService = {
  createLead(data: Omit<CustomerLeadRecord, 'id' | 'capturedAt'>, ip?: string): CustomerLeadRecord {
    const lead: CustomerLeadRecord = {
      ...data,
      id: `lead-${crypto.randomBytes(6).toString('hex')}`,
      capturedAt: new Date().toISOString(),
      ipAddress: ip || 'client-direct',
    };

    leadsStore.unshift(lead);
    return lead;
  },

  getAllLeads(): CustomerLeadRecord[] {
    return [...leadsStore];
  },

  getLeadStats() {
    return {
      totalLeadsCaptured: leadsStore.length,
      topSectors: leadsStore.reduce((acc, curr) => {
        acc[curr.sector] = (acc[curr.sector] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      topNeeds: leadsStore.reduce((acc, curr) => {
        acc[curr.primaryNeed] = (acc[curr.primaryNeed] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      referralBreakdown: leadsStore.reduce((acc, curr) => {
        acc[curr.referralSource || 'direct'] = (acc[curr.referralSource || 'direct'] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  },
};
