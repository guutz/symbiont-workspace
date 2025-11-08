CREATE  INDEX "idx_pages_tags" on
  "public"."pages" using gin ("tags");
