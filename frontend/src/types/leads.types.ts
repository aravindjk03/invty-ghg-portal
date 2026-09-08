export interface CustomerLead {
  id: string;
  name: string;
  workEmail: string;
  companyName: string;
  sector: string;
  phone?: string;
  primaryNeed: 'cbam' | 'brsr' | 'scope3' | 'netzero' | 'audit' | 'general';
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

export interface LeadSubmissionPayload {
  name: string;
  workEmail: string;
  companyName: string;
  sector: string;
  phone?: string;
  primaryNeed: string;
  referralSource?: string;
  annualTurnoverOrProduction?: string;
  inventoryStats?: {
    totalTco2e: number;
    scope1: number;
    scope2: number;
    scope3: number;
    qualityGrade: string;
  };
}

export interface LeadResponse {
  success: boolean;
  leadId: string;
  message: string;
}
