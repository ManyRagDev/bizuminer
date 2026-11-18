begin;
set local lock_timeout='5s';

-- Earlier extension imports recorded browser provenance but predate the explicit
-- surface field. Treat them conservatively as listing observations, never PDP or
-- API lookups. Keep the captured price, option and original observation time.
update garimpa.price_observation o
set offer_evidence=o.offer_evidence || jsonb_build_object(
  'observationMethod','listing','observationMethodOrigin','legacy_extension_listing')
from garimpa.product p
where p.tenant_id=o.tenant_id and p.id=o.product_id
  and p.marketplace in ('amazon','mercadolivre','aliexpress')
  and o.capture_source='extension'
  and o.offer_evidence#>>'{source,method}'='browser'
  and o.offer_evidence#>>'{source,marketplace}'=p.marketplace
  and not (o.offer_evidence ? 'observationMethod')
  and o.source_page_url ~ '^https://(www[.])?(amazon[.]com[.]br|mercadolivre[.]com[.]br|pt[.]aliexpress[.]com)/'
  and o.offer_evidence#>>'{source,url}'=p.product_url;

commit;
