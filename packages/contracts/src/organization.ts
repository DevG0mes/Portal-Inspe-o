export interface UnitSummary {
  id: string;
  name: string;
  isActive: boolean;
}
export interface CustomerSummary extends UnitSummary {
  revision: number;
  unitIds: string[];
  units: { id: string; name: string; isActive: boolean }[];
}
export interface CustomerLocationSummary extends UnitSummary {
  revision: number;
  customerId: string;
  customerName: string;
  city?: string | null;
}
export interface InspectionContext {
  customerId: string;
  customerName: string;
  locationId: string;
  locationName: string;
  locationKind?: 'substation' | 'address';
  participants: string[];
}
export interface SectorSummary extends UnitSummary {
  unitId: string;
  unitName: string;
}
export interface UnitMembershipSummary {
  id: string;
  userId: string;
  unitId: string;
  unitName: string;
  isActive: boolean;
}
export interface SectorMembershipSummary extends UnitMembershipSummary {
  unitMembershipId: string;
  sectorId: string;
  sectorName: string;
}
