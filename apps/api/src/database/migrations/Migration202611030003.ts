import { Migration } from '@mikro-orm/migrations';

export class Migration202611030003 extends Migration {
  override up(): void {
    this.addSql('alter table customer_location alter column customer_id drop not null;');
    this.addSql(
      'alter table customer_location add constraint customer_location_site_customer_check check (city is not null or customer_id is not null);',
    );
    this.addSql(
      'create unique index customer_location_shared_address_idx on customer_location (name_key) where customer_id is null;',
    );
  }

  override down(): void {
    this.addSql('drop index customer_location_shared_address_idx;');
    this.addSql(
      'alter table customer_location drop constraint customer_location_site_customer_check, alter column customer_id set not null;',
    );
  }
}
