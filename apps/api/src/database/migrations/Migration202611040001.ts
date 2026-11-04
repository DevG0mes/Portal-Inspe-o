import { Migration } from '@mikro-orm/migrations';

export class Migration202611040001 extends Migration {
  override up(): void {
    this.addSql(`create table qssma_historical_inspection (
      protocol text primary key,
      inspection_date date not null,
      unit text not null,
      form_type text not null,
      inspector text,
      customer text,
      location text
    );`);
    this.addSql(
      'create index qssma_historical_inspection_date_idx on qssma_historical_inspection(inspection_date);',
    );
    this.addSql(`create table qssma_historical_deviation (
      source_id text primary key,
      protocol text not null references qssma_historical_inspection(protocol),
      question text not null,
      answer text,
      action text,
      source_status text not null,
      priority text not null,
      category text
    );`);
    this.addSql(
      'create index qssma_historical_deviation_protocol_idx on qssma_historical_deviation(protocol);',
    );
  }

  override down(): void {
    this.addSql('drop table qssma_historical_deviation;');
    this.addSql('drop table qssma_historical_inspection;');
  }
}
