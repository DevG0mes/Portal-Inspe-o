import { Migration } from '@mikro-orm/migrations';
export class Migration202610290001 extends Migration {
  override up(): void {
    this.addSql(`create table action_plan (
      id uuid primary key, created_at timestamptz not null, updated_at timestamptz not null,
      submission_id uuid not null constraint action_plan_submission_id_foreign references inspection_submission(id) on delete restrict,
      question_id uuid not null, unit_id uuid not null constraint action_plan_unit_id_foreign references organization_unit(id) on delete restrict,
      sector_id uuid not null constraint action_plan_sector_id_foreign references organization_sector(id) on delete restrict,
      responsible_id uuid not null constraint action_plan_responsible_id_foreign references portal_user(id) on delete restrict,
      created_by_id uuid not null constraint action_plan_created_by_id_foreign references portal_user(id) on delete restrict,
      description text not null, category varchar(160) not null, priority text check(priority in ('LOW','MEDIUM','HIGH','CRITICAL')) not null,
      due_date varchar(10) not null,due_at timestamptz not null,state text check(state in ('OPEN','IN_PROGRESS','AWAITING_VALIDATION','COMPLETED')) not null default 'OPEN',revision int not null default 1,completed_at timestamptz null,
      constraint action_plan_submission_id_question_id_unique unique(submission_id,question_id)
    );`);
    for (const column of ['unit_id', 'sector_id', 'responsible_id', 'created_by_id'])
      this.addSql(`create index action_plan_${column}_index on action_plan(${column});`);
    this.addSql('create index action_plan_state_due_at_index on action_plan(state,due_at);');
    this.addSql(`create table action_plan_event (
      id uuid primary key,created_at timestamptz not null,updated_at timestamptz not null,
      action_plan_id uuid not null constraint action_plan_event_action_plan_id_foreign references action_plan(id) on delete restrict,
      actor_id uuid not null constraint action_plan_event_actor_id_foreign references portal_user(id) on delete restrict,
      command_id uuid not null,command_hash varchar(64) not null,result_revision int not null,type varchar(30) not null,
      from_state text check(from_state in ('OPEN','IN_PROGRESS','AWAITING_VALIDATION','COMPLETED')) null,
      to_state text check(to_state in ('OPEN','IN_PROGRESS','AWAITING_VALIDATION','COMPLETED')) not null,text text null,evidence jsonb not null,assignment jsonb null,
      constraint action_plan_event_action_plan_id_command_id_unique unique(action_plan_id,command_id)
    );`);
    this.addSql('create index action_plan_event_actor_id_index on action_plan_event(actor_id);');
    this.addSql(
      'create index action_plan_event_action_plan_id_created_at_index on action_plan_event(action_plan_id,created_at);',
    );
    this.addSql(
      `create function reject_action_plan_event_mutation() returns trigger language plpgsql as $$ begin raise exception 'Action plan events are immutable'; end; $$;`,
    );
    this.addSql(
      'create trigger action_plan_event_immutable before update or delete on action_plan_event for each row execute function reject_action_plan_event_mutation();',
    );
    this.addSql(
      'create trigger action_plan_event_no_truncate before truncate on action_plan_event for each statement execute function reject_action_plan_event_mutation();',
    );
    this.addSql(
      'alter table evidence_artifact alter column inspection_id drop not null, add column action_plan_id uuid null constraint evidence_artifact_action_plan_id_foreign references action_plan(id) on delete restrict;',
    );
    this.addSql(
      'alter table evidence_artifact add constraint evidence_artifact_owner_check check ((inspection_id is null) <> (action_plan_id is null));',
    );
    this.addSql(
      'create index evidence_artifact_action_plan_id_index on evidence_artifact(action_plan_id);',
    );
  }
  override down(): void {
    // A destructive downgrade is intentionally refused once corrective files exist.
    this.addSql(
      "do $$ begin if exists(select 1 from evidence_artifact where action_plan_id is not null) then raise exception 'Corrective evidence prevents downgrade'; end if; end $$;",
    );
    this.addSql(
      'alter table evidence_artifact drop constraint evidence_artifact_owner_check, drop column action_plan_id, alter column inspection_id set not null;',
    );
    this.addSql(
      'drop table action_plan_event; drop table action_plan; drop function reject_action_plan_event_mutation();',
    );
  }
}
