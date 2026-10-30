import { Migration } from '@mikro-orm/migrations';
export class Migration202610300001 extends Migration {
  override up(): void {
    this.addSql(
      "alter table form_template add column import_hash varchar(64) null, add column inspection_kind text null check (inspection_kind in ('EPC_GENERAL','WORK_AT_HEIGHT','CONFINED_SPACE','EXCAVATION','WELDING'));",
    );
  }
  override down(): void {
    this.addSql('alter table form_template drop column import_hash, drop column inspection_kind;');
  }
}
