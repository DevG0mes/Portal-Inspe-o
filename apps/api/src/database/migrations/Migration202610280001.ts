import { Migration } from '@mikro-orm/migrations';

export class Migration202610280001 extends Migration {
  override up(): void {
    this.addSql(`create table form_template (
      id uuid primary key, created_at timestamptz not null, updated_at timestamptz not null,
      name varchar(160) not null, name_key text not null,
      state text check (state in ('DRAFT', 'PUBLISHED', 'ARCHIVED')) not null default 'DRAFT',
      revision int not null default 1, latest_version int not null default 0, draft_snapshot jsonb null,
      constraint form_template_name_key_unique unique(name_key)
    );`);
    this.addSql(`create table form_version (
      id uuid primary key, created_at timestamptz not null, updated_at timestamptz not null,
      template_id uuid not null, number int not null, snapshot jsonb not null, content_hash varchar(64) not null,
      published_by_id uuid not null, published_at timestamptz not null,
      constraint form_version_template_id_number_unique unique(template_id, number),
      constraint form_version_template_id_foreign foreign key(template_id) references form_template(id) on delete restrict,
      constraint form_version_published_by_id_foreign foreign key(published_by_id) references portal_user(id) on delete restrict
    );`);
    this.addSql(
      'create index form_version_published_by_id_index on form_version(published_by_id);',
    );
    this
      .addSql(`create function reject_form_version_mutation() returns trigger language plpgsql as $$
      begin raise exception 'Published form versions are immutable'; end;
    $$;`);
    this.addSql(
      'create trigger form_version_immutable before update or delete on form_version for each row execute function reject_form_version_mutation();',
    );
    this.addSql(
      'create trigger form_version_no_truncate before truncate on form_version for each statement execute function reject_form_version_mutation();',
    );
  }
  override down(): void {
    this.addSql('drop table form_version;');
    this.addSql('drop table form_template;');
    this.addSql('drop function reject_form_version_mutation();');
  }
}
