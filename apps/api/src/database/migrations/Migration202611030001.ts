import { Migration } from '@mikro-orm/migrations';
export class Migration202611030001 extends Migration {
  override up(): void {
    this.addSql(
      'alter table form_template add column inspection_type_id uuid null, add column deleted_at timestamptz null;',
    );
    this.addSql(
      'alter table form_template add constraint form_template_inspection_type_id_foreign foreign key (inspection_type_id) references organization_sector(id) on delete restrict;',
    );
  }
  override down(): void {
    this.addSql(
      "do $$ begin if exists(select 1 from form_template where inspection_type_id is not null or deleted_at is not null) then raise exception 'Form type links or removed models prevent downgrade'; end if; end $$;",
    );
    this.addSql(
      'alter table form_template drop column inspection_type_id, drop column deleted_at;',
    );
  }
}
