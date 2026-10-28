import { expect, it } from 'vitest';
import { Unit } from './unit.entity.js';
import { Sector } from './sector.entity.js';
import { UnitMembership, SectorMembership } from './membership.entity.js';
import { User } from '../identity/user.entity.js';
import {
  sectorSummary,
  unitMembershipSummary,
  sectorMembershipSummary,
} from './organization.mappers.js';
it('provides organization labels without exposing persistence or credentials', () => {
  const unit = new Unit();
  unit.name = 'Unidade Norte';
  const sector = new Sector();
  sector.name = 'Pátio';
  sector.unit = unit;
  const user = new User();
  const parent = new UnitMembership();
  parent.user = user;
  parent.unit = unit;
  const grant = new SectorMembership();
  grant.unitMembership = parent;
  grant.sector = sector;
  expect(sectorSummary(sector)).toHaveProperty('unitName', unit.name);
  expect(unitMembershipSummary(parent)).toHaveProperty('unitName', unit.name);
  expect(sectorMembershipSummary(grant)).toHaveProperty('sectorName', sector.name);
});
