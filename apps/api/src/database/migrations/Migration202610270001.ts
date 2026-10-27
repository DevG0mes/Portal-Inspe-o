import { Migration } from '@mikro-orm/migrations';

/** First transactional migration; never run automatic schema updates at application startup. */
export class Migration202610270001 extends Migration {
  override up(): void {
    this.addSql(`create table "audit_event" (
      "id" uuid primary key,
      "created_at" timestamptz not null,
      "updated_at" timestamptz not null,
      "actor_id" uuid null,
      "action" varchar(120) not null,
      "resource" varchar(120) not null,
      "resource_id" varchar(255) not null,
      "request_id" varchar(120) not null,
      "changes" jsonb not null
    );`);
    this.addSql(
      'create index "audit_event_resource_resource_id_created_at_index" on "audit_event" ("resource", "resource_id", "created_at");',
    );
    this.addSql(
      'create index "audit_event_actor_id_created_at_index" on "audit_event" ("actor_id", "created_at");',
    );
    this.addSql('create index "audit_event_request_id_index" on "audit_event" ("request_id");');
    this
      .addSql(`create function reject_audit_event_mutation() returns trigger language plpgsql as $$
      begin raise exception 'Audit events are append-only'; end;
    $$;`);
    this.addSql(`create trigger audit_event_immutable before update or delete on audit_event
      for each row execute function reject_audit_event_mutation();`);
    this.addSql(`create trigger audit_event_no_truncate before truncate on audit_event
      for each statement execute function reject_audit_event_mutation();`);
  }

  override down(): void {
    // Explicit rollback removes the table and its triggers, never mutates retained events.
    this.addSql('drop table "audit_event";');
    this.addSql('drop function reject_audit_event_mutation();');
  }
}
