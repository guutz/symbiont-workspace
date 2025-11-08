CREATE  INDEX "idx_pages_meta" on
  "public"."pages" using gin ("meta");
