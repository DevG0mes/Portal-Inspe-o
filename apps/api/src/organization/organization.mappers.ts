import type {
  SectorMembershipSummary,
  SectorSummary,
  UnitMembershipSummary,
  UnitSummary,
} from '@portal/contracts';
import type { Sector } from './sector.entity.js';
import type { UnitMembership, SectorMembership } from './membership.entity.js';

export const unitSummary = (unit: UnitSummary): UnitSummary => ({
  id: unit.id,
  name: unit.name,
  isActive: unit.isActive,
});
export const sectorSummary = (sector: Sector): SectorSummary => ({
  ...unitSummary(sector),
  unitId: sector.unit.id,
  unitName: sector.unit.name,
});
export const unitMembershipSummary = (membership: UnitMembership): UnitMembershipSummary => ({
  id: membership.id,
  userId: membership.user.id,
  unitId: membership.unit.id,
  unitName: membership.unit.name,
  isActive: membership.isActive,
});
export const sectorMembershipSummary = (membership: SectorMembership): SectorMembershipSummary => ({
  id: membership.id,
  userId: membership.unitMembership.user.id,
  unitId: membership.unitMembership.unit.id,
  unitName: membership.unitMembership.unit.name,
  sectorId: membership.sector.id,
  sectorName: membership.sector.name,
  unitMembershipId: membership.unitMembership.id,
  isActive: membership.isActive,
});
