import { Migration } from '@mikro-orm/migrations';
export class Migration202610280004 extends Migration {
  override up(): void {
    this.addSql("alter table inspection add column notes jsonb not null default '[]'::jsonb;");
    this.addSql(
      "alter table inspection_submission add column notes jsonb not null default '[]'::jsonb, add column evidence jsonb not null default '[]'::jsonb;",
    );
    this.addSql(`create table evidence_artifact (
      id uuid primary key, created_at timestamptz not null, updated_at timestamptz not null,
      inspection_id uuid not null constraint evidence_artifact_inspection_id_foreign references inspection(id) on delete restrict,
      owner_id uuid not null constraint evidence_artifact_owner_id_foreign references portal_user(id) on delete restrict,
      question_id uuid not null, filename varchar(160) not null, mime varchar(80) not null, size int not null, sha256 varchar(64) null,
      status text check(status in ('PENDING','UPLOADED','READY','CLEANED')) not null default 'PENDING',
      temp_key varchar(200) not null, final_key varchar(200) not null, temp_cleaned boolean not null default false,
      expires_at timestamptz not null, detached_at timestamptz null, source_revision int null, attached_revision int null,
      constraint evidence_artifact_temp_key_unique unique(temp_key), constraint evidence_artifact_final_key_unique unique(final_key)
    );`);
    this.addSql(
      'create index evidence_artifact_inspection_id_index on evidence_artifact(inspection_id);',
    );
    this.addSql('create index evidence_artifact_owner_id_index on evidence_artifact(owner_id);');
    this.addSql(
      'create index evidence_artifact_status_expires_at_index on evidence_artifact(status, expires_at);',
    );
  }
  override down(): void {
    this.addSql('drop table evidence_artifact;');
    this.addSql('alter table inspection_submission drop column notes, drop column evidence;');
    this.addSql('alter table inspection drop column notes;');
  }
}
