import { Migration } from '@mikro-orm/migrations';

export class Migration202610270003 extends Migration {
  override up(): void {
    this.addSql(`create table organization_unit (
      id uuid primary key, created_at timestamptz not null, updated_at timestamptz not null,
      name varchar(160) not null, name_key varchar(160) not null, is_active boolean not null default true,
      constraint organization_unit_name_key_unique unique (name_key)
    );`);
    this.addSql(`create table organization_sector (
      id uuid primary key, created_at timestamptz not null, updated_at timestamptz not null,
      unit_id uuid not null, name varchar(160) not null, name_key varchar(160) not null, is_active boolean not null default true,
      constraint organization_sector_unit_id_name_key_unique unique (unit_id, name_key),
      constraint organization_sector_unit_id_foreign foreign key (unit_id) references organization_unit(id) on delete restrict
    );`);
    this.addSql(`create table unit_membership (
      id uuid primary key, created_at timestamptz not null, updated_at timestamptz not null,
      user_id uuid not null, unit_id uuid not null, is_active boolean not null default true,
      constraint unit_membership_user_id_unit_id_unique unique (user_id, unit_id),
      constraint unit_membership_user_id_foreign foreign key (user_id) references portal_user(id) on delete restrict,
      constraint unit_membership_unit_id_foreign foreign key (unit_id) references organization_unit(id) on delete restrict
    );`);
    this.addSql('create index unit_membership_unit_id_index on unit_membership(unit_id);');
    this.addSql(`create table sector_membership (
      id uuid primary key, created_at timestamptz not null, updated_at timestamptz not null,
      unit_membership_id uuid not null, sector_id uuid not null, is_active boolean not null default true,
      constraint sector_membership_unit_membership_id_sector_id_unique unique (unit_membership_id, sector_id),
      constraint sector_membership_unit_membership_id_foreign foreign key (unit_membership_id) references unit_membership(id) on delete restrict,
      constraint sector_membership_sector_id_foreign foreign key (sector_id) references organization_sector(id) on delete restrict
    );`);
    this.addSql('create index sector_membership_sector_id_index on sector_membership(sector_id);');
    this
      .addSql(`create function validate_sector_membership_unit() returns trigger language plpgsql as $$
      declare granted_unit uuid; actual_unit uuid;
      begin
        select unit_id into granted_unit from unit_membership where id = new.unit_membership_id;
        select unit_id into actual_unit from organization_sector where id = new.sector_id;
        if granted_unit is distinct from actual_unit then
          raise exception 'Sector membership must belong to its assigned unit' using errcode = '23514';
        end if;
        return new;
      end;
    $$;`);
    this.addSql(
      'create trigger sector_membership_unit_check before insert on sector_membership for each row execute function validate_sector_membership_unit();',
    );
    this
      .addSql(`create function prevent_organization_reassignment() returns trigger language plpgsql as $$
      begin
        if tg_table_name = 'organization_sector' then
          if new.unit_id is distinct from old.unit_id then raise exception 'Sector cannot be reassigned' using errcode = '23514'; end if;
        elsif tg_table_name = 'unit_membership' then
          if new.unit_id is distinct from old.unit_id or new.user_id is distinct from old.user_id then raise exception 'Unit membership cannot be reassigned' using errcode = '23514'; end if;
        elsif tg_table_name = 'sector_membership' then
          if new.unit_membership_id is distinct from old.unit_membership_id or new.sector_id is distinct from old.sector_id then raise exception 'Sector membership cannot be reassigned' using errcode = '23514'; end if;
        end if;
        return new;
      end;
    $$;`);
    for (const table of ['organization_sector', 'unit_membership', 'sector_membership']) {
      this.addSql(
        `create trigger ${table}_no_reassignment before update on ${table} for each row execute function prevent_organization_reassignment();`,
      );
    }
  }

  override down(): void {
    this.addSql('drop table sector_membership;');
    this.addSql('drop table unit_membership;');
    this.addSql('drop table organization_sector;');
    this.addSql('drop table organization_unit;');
    this.addSql('drop function validate_sector_membership_unit();');
    this.addSql('drop function prevent_organization_reassignment();');
  }
}
