import { Migration } from '@mikro-orm/migrations';
export class Migration202610300003 extends Migration {
  override up(): void {
    for (const table of ['inspection', 'inspection_schedule', 'inspection_assignment'])
      this.addSql(`alter table ${table} add column context jsonb null;`);
    this.addSql(
      "create function protect_inspection_context() returns trigger language plpgsql as $$ begin if old.context is distinct from new.context then raise exception 'Inspection identification is immutable'; end if; return new; end; $$;",
    );
    for (const table of ['inspection', 'inspection_schedule', 'inspection_assignment'])
      this.addSql(
        `create trigger ${table}_context_immutable before update on ${table} for each row execute function protect_inspection_context();`,
      );
  }
  override down(): void {
    this.addSql(
      "do $$ begin if exists(select 1 from inspection where context is not null) or exists(select 1 from inspection_schedule where context is not null) or exists(select 1 from inspection_assignment where context is not null) then raise exception 'Inspection identification prevents downgrade'; end if; end $$;",
    );
    for (const table of ['inspection', 'inspection_schedule', 'inspection_assignment'])
      this.addSql(
        `drop trigger ${table}_context_immutable on ${table}; alter table ${table} drop column context;`,
      );
    this.addSql('drop function protect_inspection_context();');
  }
}
