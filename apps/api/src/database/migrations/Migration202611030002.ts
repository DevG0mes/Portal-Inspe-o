import { Migration } from '@mikro-orm/migrations';
export class Migration202611030002 extends Migration {
  override up(): void {
    this.addSql(
      'alter table customer_location add column city varchar(160) null, alter column name type varchar(320);',
    );
  }
  override down(): void {
    this.addSql(
      "do $$ begin if exists (select 1 from customer_location where city is not null or length(name) > 160) then raise exception 'Address records prevent downgrade'; end if; end $$;",
    );
    this.addSql(
      'alter table customer_location drop column city, alter column name type varchar(160);',
    );
  }
}
