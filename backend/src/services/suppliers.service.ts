import crypto from 'crypto';

export interface SupplierInvitationRecord {
  id: string;
  /** The account that issued the invitation; only it may list or approve it. */
  ownerId: string;
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

// Starts empty. It used to hold two invitations with their magic-link tokens
// written in this file — published, and valid for weeks from every boot — one
// of them carrying a submission described as "Third-Party Verified by DNV".
const suppliersStore: SupplierInvitationRecord[] = [];

export const suppliersService = {
  createInvitation(ownerId: string, data: {
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
      ownerId,
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

  getAllInvitations(ownerId: string): SupplierInvitationRecord[] {
    return suppliersStore.filter((i) => i.ownerId === ownerId);
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
    // Through the same lookup as the form itself, so an expired link cannot
    // still be submitted to.
    const inv = this.getInvitationByToken(token);
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

  /** `approver` is the signed-in account. It was a free-text field in the request. */
  approveSubmission(ownerId: string, id: string, approver: string): SupplierInvitationRecord | null {
    const inv = suppliersStore.find((i) => i.id === id && i.ownerId === ownerId);
    if (!inv || !inv.submission) return null;

    inv.status = 'APPROVED';
    inv.submission.verifiedBy = approver;
    return inv;
  },
};
