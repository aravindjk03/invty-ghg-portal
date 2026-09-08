import crypto from 'crypto';

export interface SupplierInvitationRecord {
  id: string;
  token: string;
  supplierName: string;
  supplierEmail: string;
  scope3CategoryNumber: number;
  categoryName: string;
  requestedItemDescription: string;
  purchaseOrderRef?: string;
  status: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  expiresAt: string;
  createdAt: string;
  submission?: {
    supplierName: string;
    supplierCompanyPanOrEin: string;
    reportingPeriod: string;
    providedQuantity: number;
    providedUnit: string;
    primaryEmissionFactor: number;
    factorUnit: string;
    factorDataSource: string;
    calculatedTco2e: number;
    evidenceFileName?: string;
    submittedAt: string;
    verifiedBy?: string;
  };
}

const suppliersStore: SupplierInvitationRecord[] = [
  {
    id: 'inv-supp-001',
    token: 'tok_ea91b2c45d6f78e0',
    supplierName: 'BlueDart DHL Express Freight',
    supplierEmail: 'sustainability@bluedart-freight.com',
    scope3CategoryNumber: 4,
    categoryName: 'Upstream Transportation & Distribution',
    requestedItemDescription: 'Inbound raw steel coil linehaul freight (FY 2024-25)',
    purchaseOrderRef: 'PO-2024-LOG-8910',
    status: 'SUBMITTED',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    expiresAt: new Date(Date.now() + 86400000 * 25).toISOString(),
    submission: {
      supplierName: 'BlueDart DHL Express Freight Logistics Ltd',
      supplierCompanyPanOrEin: 'AAACB1234F',
      reportingPeriod: 'FY 2024-25',
      providedQuantity: 1250000,
      providedUnit: 't.km',
      primaryEmissionFactor: 0.089,
      factorUnit: 'kgCO2e / t.km',
      factorDataSource: 'ISO 14067 Product Carbon Footprint (Third-Party Verified by DNV)',
      calculatedTco2e: 111.25,
      evidenceFileName: 'BlueDart_Fleet_Carbon_Assurance_2024.pdf',
      submittedAt: new Date(Date.now() - 86400000).toISOString(),
    },
  },
  {
    id: 'inv-supp-002',
    token: 'tok_3f88a109bc4d6211',
    supplierName: 'Jindal Pellet Plant Feedstock',
    supplierEmail: 'carbon.accounting@jindalfeedstock.in',
    scope3CategoryNumber: 1,
    categoryName: 'Purchased Goods and Services',
    requestedItemDescription: 'Direct reduced iron (DRI) pellets grade A',
    purchaseOrderRef: 'PO-2024-RAW-0042',
    status: 'PENDING',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    expiresAt: new Date(Date.now() + 86400000 * 28).toISOString(),
  },
];

export const suppliersService = {
  createInvitation(data: {
    supplierName: string;
    supplierEmail: string;
    scope3CategoryNumber: number;
    categoryName: string;
    requestedItemDescription: string;
    purchaseOrderRef?: string;
  }): SupplierInvitationRecord {
    const token = `tok_${crypto.randomBytes(12).toString('hex')}`;
    const invitation: SupplierInvitationRecord = {
      id: `inv-supp-${crypto.randomBytes(4).toString('hex')}`,
      token,
      supplierName: data.supplierName,
      supplierEmail: data.supplierEmail,
      scope3CategoryNumber: data.scope3CategoryNumber,
      categoryName: data.categoryName,
      requestedItemDescription: data.requestedItemDescription,
      purchaseOrderRef: data.purchaseOrderRef,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(), // 30 days expiry
    };

    suppliersStore.unshift(invitation);
    return invitation;
  },

  getInvitationByToken(token: string): SupplierInvitationRecord | null {
    const inv = suppliersStore.find((i) => i.token === token);
    if (!inv) return null;
    if (new Date(inv.expiresAt) < new Date()) return null;
    return inv;
  },

  getAllInvitations(): SupplierInvitationRecord[] {
    return [...suppliersStore];
  },

  submitSupplierData(
    token: string,
    submission: {
      supplierName: string;
      supplierCompanyPanOrEin: string;
      reportingPeriod: string;
      providedQuantity: number;
      providedUnit: string;
      primaryEmissionFactor: number;
      factorUnit: string;
      factorDataSource: string;
      evidenceFileName?: string;
    }
  ): SupplierInvitationRecord | null {
    const inv = suppliersStore.find((i) => i.token === token);
    if (!inv) return null;

    const calculatedTco2e = Number(
      ((submission.providedQuantity * submission.primaryEmissionFactor) / 1000).toFixed(2)
    );

    inv.status = 'SUBMITTED';
    inv.submission = {
      ...submission,
      calculatedTco2e,
      submittedAt: new Date().toISOString(),
    };

    return inv;
  },

  approveSubmission(id: string, auditorName = 'External GHG Auditor'): SupplierInvitationRecord | null {
    const inv = suppliersStore.find((i) => i.id === id);
    if (!inv || !inv.submission) return null;

    inv.status = 'APPROVED';
    inv.submission.verifiedBy = auditorName;
    return inv;
  },
};
