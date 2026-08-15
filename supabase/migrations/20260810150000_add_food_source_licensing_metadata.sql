alter table public.food_sources
  add column if not exists license_name text,
  add column if not exists license_url text,
  add column if not exists attribution_text text,
  add column if not exists bulk_import_status text,
  add column if not exists reuse_notes text;

alter table public.food_sources
  drop constraint if exists food_sources_bulk_import_status_check;

alter table public.food_sources
  add constraint food_sources_bulk_import_status_check check (
    bulk_import_status is null
    or bulk_import_status in (
      'enabled',
      'on_demand_only',
      'authorization_required',
      'first_party',
      'disabled'
    )
  );

alter table public.food_sources
  drop constraint if exists food_sources_license_name_not_blank;

alter table public.food_sources
  add constraint food_sources_license_name_not_blank check (
    license_name is null or char_length(trim(license_name)) > 0
  );

alter table public.food_sources
  drop constraint if exists food_sources_license_url_not_blank;

alter table public.food_sources
  add constraint food_sources_license_url_not_blank check (
    license_url is null or char_length(trim(license_url)) > 0
  );

alter table public.food_sources
  drop constraint if exists food_sources_attribution_text_not_blank;

alter table public.food_sources
  add constraint food_sources_attribution_text_not_blank check (
    attribution_text is null or char_length(trim(attribution_text)) > 0
  );

alter table public.food_sources
  drop constraint if exists food_sources_reuse_notes_not_blank;

alter table public.food_sources
  add constraint food_sources_reuse_notes_not_blank check (
    reuse_notes is null or char_length(trim(reuse_notes)) > 0
  );

update public.food_sources
set
  license_name = 'ONE UP internal / first-party',
  license_url = null,
  attribution_text = 'ONE UP verified data.',
  bulk_import_status = 'first_party',
  reuse_notes = 'First-party or manually verified internal catalog data.'
where code = 'ONEUP_VERIFIED';

update public.food_sources
set
  license_name = 'CC0 1.0 Universal',
  license_url = 'https://fdc.nal.usda.gov/api-guide',
  attribution_text = 'Source: USDA FoodData Central.',
  bulk_import_status = 'enabled',
  reuse_notes = 'USDA FoodData Central data are reusable; attribution is recommended.'
where code in ('USDA_FDC', 'USDA_FOUNDATION', 'USDA_FNDDS', 'USDA_BRANDED');

update public.food_sources
set
  license_name = 'Open Database License (ODbL)',
  license_url = 'https://wiki.openfoodfacts.org/Reusing_Open_Food_Facts_Data',
  attribution_text = 'Contains Open Food Facts data.',
  bulk_import_status = 'on_demand_only',
  reuse_notes = 'Reuse requires attribution and ODbL compliance. ONE UP currently uses exact-barcode, on-demand imports only.'
where code = 'OPEN_FOOD_FACTS';

update public.food_sources
set
  license_name = null,
  license_url = 'https://i.fnri.dost.gov.ph/fct/library',
  attribution_text = 'Philippine Food Composition Tables / DOST-FNRI.',
  bulk_import_status = 'authorization_required',
  reuse_notes = 'Online access exists, but bulk redistribution and scraping permissions are not assumed. Import only from an authorized reusable export.'
where code = 'PHILFCT';
