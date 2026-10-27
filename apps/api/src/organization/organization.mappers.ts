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
});
export const unitMembershipSummary = (membership: UnitMembership): UnitMembershipSummary => ({
  id: membership.id,
  userId: membership.user.id,
  unitId: membership.unit.id,
  isActive: membership.isActive,
});
export const sectorMembershipSummary = (membership: SectorMembership): SectorMembershipSummary => ({
  id: membership.id,
  userId: membership.unitMembership.user.id,
  unitId: membership.unitMembership.unit.id,
  sectorId: membership.sector.id,
  unitMembershipId: membership.unitMembership.id,
  isActive: membership.isActive,
});
