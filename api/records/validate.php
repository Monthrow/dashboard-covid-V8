<?php
// Periksa baris tanpa menyimpan: tipe data, normalisasi, dan duplikat terhadap database.
require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/manual.php';
allow_methods('POST');

$in = read_json();
$rows = $in['rows'] ?? null;
if (!is_array($rows) || count($rows) === 0 || count($rows) > 1000) {
    throw new ApiException(422, 'Kirim 1–1000 baris.');
}
$pdo = db();
$ds = require_active_dataset($pdo);
[$valid, $errors] = check_manual_rows($pdo, $rows, $ds);
ok(['valid' => count($errors) === 0, 'errors' => $errors, 'rows' => (object) $valid]);
