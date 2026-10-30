import { Migration } from '@mikro-orm/migrations';
export class Migration202610300002 extends Migration {
  override up(): void {
    this.addSql(
      'create table inspection_customer(id uuid primary key, created_at timestamptz not null,updated_at timestamptz not null,name varchar(160) not null,name_key text not null constraint inspection_customer_name_key_unique unique,is_active boolean not null default true,revision int not null default 1);',
    );
    this.addSql(
      'create table customer_unit(id uuid primary key,created_at timestamptz not null,updated_at timestamptz not null,customer_id uuid not null constraint customer_unit_customer_id_foreign references inspection_customer(id) on delete restrict,unit_id uuid not null constraint customer_unit_unit_id_foreign references organization_unit(id) on delete restrict,is_active boolean not null default true, constraint customer_unit_customer_id_unit_id_unique unique(customer_id,unit_id));',
    );
    this.addSql('create index customer_unit_scope_idx on customer_unit(unit_id,is_active);');
    this.addSql(
      'create table customer_location(id uuid primary key,created_at timestamptz not null,updated_at timestamptz not null,customer_id uuid not null constraint customer_location_customer_id_foreign references inspection_customer(id) on delete restrict,name varchar(160) not null,name_key text not null,is_active boolean not null default true,revision int not null default 1, constraint customer_location_customer_id_name_key_unique unique(customer_id,name_key));',
    );
  }
  override down(): void {
    this.addSql(
      'drop table customer_location; drop table customer_unit; drop table inspection_customer;',
    );
  }
}
