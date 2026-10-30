import { Migration } from '@mikro-orm/migrations';
export class Migration202610300004 extends Migration {
  override up(): void {
    this.addSql(
      'create table form_unit_binding(id uuid primary key,created_at timestamptz not null,updated_at timestamptz not null,form_id uuid not null constraint form_unit_binding_form_id_foreign references form_template(id) on delete restrict,unit_id uuid not null constraint form_unit_binding_unit_id_foreign references organization_unit(id) on delete restrict,is_active boolean not null default true,constraint form_unit_binding_form_id_unit_id_unique unique(form_id,unit_id)); create index form_unit_binding_unit_id_index on form_unit_binding(unit_id);',
    );
  }
  override down(): void {
    this.addSql('drop table form_unit_binding;');
  }
}
