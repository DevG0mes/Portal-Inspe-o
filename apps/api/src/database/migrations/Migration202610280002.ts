import { Migration } from '@mikro-orm/migrations';
export class Migration202610280002 extends Migration {
  override up(): void {
    this.addSql(
      `create table inspection_schedule (id uuid primary key,created_at timestamptz not null,updated_at timestamptz not null,name varchar(160) not null,unit_id uuid not null constraint inspection_schedule_unit_id_foreign references organization_unit(id) on delete restrict,sector_id uuid not null constraint inspection_schedule_sector_id_foreign references organization_sector(id) on delete restrict,form_id uuid not null constraint inspection_schedule_form_id_foreign references form_template(id) on delete restrict,created_by_id uuid not null constraint inspection_schedule_created_by_id_foreign references portal_user(id) on delete restrict,frequency text check(frequency in ('ONCE','DAILY','WEEKLY','MONTHLY')) not null,start_date varchar(10) not null,time varchar(5) not null,end_date varchar(10) null,deadline_hours int not null check(deadline_hours between 1 and 8760),is_active boolean not null default true,revision int not null default 1,next_occurrence_at timestamptz null,suspension_reason text null);`,
    );
    for (const column of ['unit_id', 'sector_id', 'form_id', 'created_by_id'])
      this.addSql(
        `create index inspection_schedule_${column}_index on inspection_schedule(${column});`,
      );
    this.addSql(
      'create index inspection_schedule_is_active_next_occurrence_at_index on inspection_schedule(is_active,next_occurrence_at);',
    );
    this.addSql(
      `create table schedule_responsible(id uuid primary key,created_at timestamptz not null,updated_at timestamptz not null,schedule_id uuid not null constraint schedule_responsible_schedule_id_foreign references inspection_schedule(id) on delete restrict,user_id uuid not null constraint schedule_responsible_user_id_foreign references portal_user(id) on delete restrict,constraint schedule_responsible_schedule_id_user_id_unique unique(schedule_id,user_id));`,
    );
    this.addSql(
      'create index schedule_responsible_user_id_index on schedule_responsible(user_id);',
    );
    this.addSql(
      `create table inspection_assignment(id uuid primary key,created_at timestamptz not null,updated_at timestamptz not null,schedule_id uuid not null constraint inspection_assignment_schedule_id_foreign references inspection_schedule(id) on delete restrict,form_version_id uuid not null constraint inspection_assignment_form_version_id_foreign references form_version(id) on delete restrict,occurrence_at timestamptz not null,due_at timestamptz not null,status text check(status in ('PLANNED','CANCELLED')) not null default 'PLANNED',constraint inspection_assignment_schedule_id_occurrence_at_unique unique(schedule_id,occurrence_at));`,
    );
    this.addSql(
      'create index inspection_assignment_form_version_id_index on inspection_assignment(form_version_id);',
    );
    this.addSql(
      'create index inspection_assignment_due_at_index on inspection_assignment(due_at);',
    );
    this.addSql(
      `create table assignment_responsible(id uuid primary key,created_at timestamptz not null,updated_at timestamptz not null,assignment_id uuid not null constraint assignment_responsible_assignment_id_foreign references inspection_assignment(id) on delete restrict,user_id uuid not null constraint assignment_responsible_user_id_foreign references portal_user(id) on delete restrict,constraint assignment_responsible_assignment_id_user_id_unique unique(assignment_id,user_id));`,
    );
    this.addSql(
      'create index assignment_responsible_user_id_index on assignment_responsible(user_id);',
    );
    this
      .addSql(`create function check_schedule_configuration() returns trigger language plpgsql as $$ begin
      if (select unit_id from organization_sector where id=new.sector_id) is distinct from new.unit_id then raise exception 'Invalid schedule sector';end if;
      if TG_OP='UPDATE' and row(old.unit_id,old.sector_id,old.form_id,old.created_by_id,old.frequency,old.start_date,old.time,old.end_date,old.deadline_hours) is distinct from row(new.unit_id,new.sector_id,new.form_id,new.created_by_id,new.frequency,new.start_date,new.time,new.end_date,new.deadline_hours) then raise exception 'Schedule configuration is immutable';end if;return new;end;$$;`);
    this.addSql(
      'create trigger schedule_configuration before insert or update on inspection_schedule for each row execute function check_schedule_configuration();',
    );
  }
  override down(): void {
    this.addSql(
      'drop table assignment_responsible;drop table inspection_assignment;drop table schedule_responsible;drop table inspection_schedule;drop function check_schedule_configuration();',
    );
  }
}
