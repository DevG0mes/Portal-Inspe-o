import { Migration } from '@mikro-orm/migrations';
export class Migration202610290002 extends Migration {
  override up(): void {
    this
      .addSql(`create table notification(id uuid primary key,created_at timestamptz not null,updated_at timestamptz not null,
      recipient_id uuid not null constraint notification_recipient_id_foreign references portal_user(id) on delete restrict,
      event_key varchar(240) not null,kind varchar(40) not null,resource_type varchar(20) not null,resource_id uuid not null,read_at timestamptz null,
      constraint notification_recipient_id_event_key_unique unique(recipient_id,event_key));`);
    this.addSql(
      'create index notification_recipient_id_read_at_created_at_index on notification(recipient_id,read_at,created_at);',
    );
  }
  override down(): void {
    this.addSql('drop table notification;');
  }
}
