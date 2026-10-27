export interface UnitSummary {
  id: string;
  name: string;
  isActive: boolean;
}
export interface SectorSummary extends UnitSummary {
  unitId: string;
}
export interface UnitMembershipSummary {
  id: string;
  userId: string;
  unitId: string;
  isActive: boolean;
}
export interface SectorMembershipSummary extends UnitMembershipSummary {
  unitMembershipId: string;
  sectorId: string;
}
