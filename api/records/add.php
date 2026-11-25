<?php
// Tambah satu baris ke dataset aktif. Body: {"row": {...}}
require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/manual.php';
allow_methods('POST');

$in = read_json();
if (!isset($in['row']) || !is_array($in['row'])) {
    throw new ApiException(422, 'Body harus berisi "row".');
}
ok(save_manual_rows(db(), [$in['row']]), 201);
