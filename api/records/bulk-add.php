<?php
// Tambah banyak baris dalam satu transaksi (gagal satu → semua dibatalkan). Body: {"rows": [...]}
require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/manual.php';
allow_methods('POST');

$in = read_json();
if (!isset($in['rows']) || !is_array($in['rows'])) {
    throw new ApiException(422, 'Body harus berisi "rows".');
}
ok(save_manual_rows(db(), $in['rows']), 201);
