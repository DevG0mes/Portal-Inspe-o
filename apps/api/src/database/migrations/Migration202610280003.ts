import { Migration } from '@mikro-orm/migrations';

export class Migration202610280003 extends Migration {
  override up(): void {
    this.addSql(`create table inspection (
      id uuid primary key, created_at timestamptz not null, updated_at timestamptz not null,
      unit_id uuid not null constraint inspection_unit_id_foreign references organization_unit(id) on delete restrict,
      sector_id uuid not null constraint inspection_sector_id_foreign references organization_sector(id) on delete restrict,
      assignment_id uuid null constraint inspection_assignment_id_foreign references inspection_assignment(id) on delete restrict,
      created_by_id uuid not null constraint inspection_created_by_id_foreign references portal_user(id) on delete restrict,
      form_version_id uuid not null constraint inspection_form_version_id_foreign references form_version(id) on delete restrict,
      state text check(state in ('DRAFT', 'COMPLETED')) not null default 'DRAFT',
      revision int not null default 1, cycle int not null default 1, answers jsonb not null,
      constraint inspection_assignment_id_unique unique(assignment_id)
    );`);
    for (const column of ['unit_id', 'sector_id', 'created_by_id', 'form_version_id']) {
      this.addSql(`create index inspection_${column}_index on inspection(${column});`);
    }
    this.addSql(`create table inspection_submission (
      id uuid primary key, created_at timestamptz not null, updated_at timestamptz not null,
      inspection_id uuid not null constraint inspection_submission_inspection_id_foreign references inspection(id) on delete restrict,
      cycle int not null, source_revision int not null, completed_at timestamptz not null,
      completed_by_id uuid not null constraint inspection_submission_completed_by_id_foreign references portal_user(id) on delete restrict,
      answers jsonb not null, nonconformities jsonb not null,
      constraint inspection_submission_inspection_id_cycle_unique unique(inspection_id,cycle)
    );`);
    this.addSql(
      'create index inspection_submission_completed_by_id_index on inspection_submission(completed_by_id);',
    );
    this.addSql(
      `create function reject_inspection_submission_mutation() returns trigger language plpgsql as $$ begin raise exception 'Inspection submissions are immutable'; end; $$;`,
    );
    this.addSql(
      'create trigger inspection_submission_immutable before update or delete on inspection_submission for each row execute function reject_inspection_submission_mutation();',
    );
    this.addSql(
      'create trigger inspection_submission_no_truncate before truncate on inspection_submission for each statement execute function reject_inspection_submission_mutation();',
    );
  }
  override down(): void {
    this.addSql('drop table inspection_submission;');
    this.addSql('drop table inspection;');
    this.addSql('drop function reject_inspection_submission_mutation();');
  }
}
