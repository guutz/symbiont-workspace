#!/bin/bash
# Fix syntax errors (double commas)
sed -i 's/, ,/,/g' registry.test.ts

# Fix execute calls - replace context objects with just page
# Pattern: execute('event', { page: X, config: Y, logger: Z }) -> execute('event', X)
sed -i 's/await registry\.execute(\([^,]*\), {$/await registry.execute(\1, {} as any);/g' registry.test.ts
sed -i '/await registry\.execute/,/});/{
  /page:/! d
  s/.*page: \([^,]*\),$/\1/
  s/await registry\.execute(\([^,]*\),$/await registry.execute(\1,/
}' registry.test.ts
