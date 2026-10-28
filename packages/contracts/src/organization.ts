export interface UnitSummary {
  id: string;
  name: string;
  isActive: boolean;
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
