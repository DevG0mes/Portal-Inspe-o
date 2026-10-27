import { Migration } from '@mikro-orm/migrations';

export class Migration202610270002 extends Migration {
  override up(): void {
    this.addSql(`create table "portal_user" (
      "id" uuid primary key, "created_at" timestamptz not null, "updated_at" timestamptz not null,
      "email" varchar(254) not null, "name" varchar(160) not null, "password_hash" varchar(255) not null,
      "role" text check ("role" in ('COLLABORATOR', 'MANAGER', 'ADMIN')) not null default 'COLLABORATOR',
      "is_active" boolean not null default true, "must_change_password" boolean not null default true,
      "failed_login_attempts" int not null default 0, "locked_until" timestamptz null,
      constraint "portal_user_email_unique" unique ("email")
    );`);
    this.addSql(`create table "auth_session" (
      "id" uuid primary key, "created_at" timestamptz not null, "updated_at" timestamptz not null,
      "user_id" uuid not null, "token_hash" varchar(64) not null,
      "expires_at" timestamptz not null, "revoked_at" timestamptz null,
      constraint "auth_session_token_hash_unique" unique ("token_hash"),
      constraint "auth_session_user_id_foreign" foreign key ("user_id") references "portal_user" ("id") on delete restrict
    );`);
    this.addSql(
      'create index "auth_session_user_id_revoked_at_index" on "auth_session" ("user_id", "revoked_at");',
    );
    this.addSql('create index "auth_session_expires_at_index" on "auth_session" ("expires_at");');
  }

  override down(): void {
    this.addSql('drop table "auth_session";');
    this.addSql('drop table "portal_user";');
  }
}
