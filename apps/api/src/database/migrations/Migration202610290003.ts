import { Migration } from '@mikro-orm/migrations';
export class Migration202610290003 extends Migration {
  override up(): void {
    this
      .addSql(`create table report_request(id uuid primary key,created_at timestamptz not null,updated_at timestamptz not null,
      requested_by_id uuid not null constraint report_request_requested_by_id_foreign references portal_user(id) on delete restrict,
      request_id uuid not null,request_hash varchar(64) not null,format text not null check(format in ('PDF','XLSX')),state text not null default 'QUEUED' check(state in ('QUEUED','PROCESSING','READY','FAILED')),
      snapshot jsonb null,attempts int not null default 0,lease_until timestamptz null,object_key varchar(240) null,size int null,sha256 varchar(64) null,completed_at timestamptz null,error_code varchar(40) null,artifact_keys jsonb not null,cleanup_at timestamptz null,
      constraint report_request_requested_by_id_request_id_unique unique(requested_by_id,request_id));`);
    this.addSql(
      'create index report_request_requested_by_id_created_at_index on report_request(requested_by_id,created_at);',
    );
    this.addSql(
      'create index report_request_state_lease_until_index on report_request(state,lease_until);',
    );
    this.addSql('create index report_request_cleanup_at_index on report_request(cleanup_at);');
    this.addSql(
      `create function protect_report_snapshot() returns trigger language plpgsql as $$ begin if (old.snapshot is not null and old.snapshot is distinct from new.snapshot) or old.requested_by_id is distinct from new.requested_by_id or old.request_id is distinct from new.request_id or old.request_hash is distinct from new.request_hash or old.format is distinct from new.format then raise exception 'Report snapshot is immutable'; end if; return new; end; $$;`,
    );
    this.addSql(
      'create trigger report_snapshot_immutable before update on report_request for each row execute function protect_report_snapshot();',
    );
  }
  override down(): void {
    this.addSql('drop table report_request; drop function protect_report_snapshot();');
  }
}
