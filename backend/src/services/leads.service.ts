import crypto from 'crypto';
import { dbService } from '../db/database';

export interface CustomerLeadRecord {
  id: string;
  name: string;
  workEmail: string;
  companyName: string;
  sector: string;
  phone?: string;
  primaryNeed: string;
  /** What the visitor was doing when asked. 'premium' is an upgrade request. */
  requestedAction?: string;
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

// No demonstration records live here. Two were appended to every response and
// to the aggregate stats, so a fresh install reported two leads it did not
// have, with named companies, and every sector breakdown started out wrong.

export const leadsService = {
  createLead(data: Omit<CustomerLeadRecord, 'id' | 'capturedAt'>, ip?: string): CustomerLeadRecord {
    const lead: CustomerLeadRecord = {
      ...data,
      id: `lead-${crypto.randomBytes(6).toString('hex')}`,
      capturedAt: new Date().toISOString(),
      ipAddress: ip || 'client-direct',
    };

    dbService.insertLead(lead);
    return lead;
  },

  getAllLeads(): CustomerLeadRecord[] {
    return dbService.allLeads() as CustomerLeadRecord[];
  },

  getLeadStats() {
    const leadsStore = this.getAllLeads();
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
