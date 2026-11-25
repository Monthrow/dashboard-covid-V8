<?php
// Ubah satu baris. Body: {"id": 123, "row": {"new_cases": 10, ...}} (kolom yang tidak dikirim tetap).
require __DIR__ . '/../lib/bootstrap.php';
allow_methods('POST', 'PUT');

$in = read_json();
$id = (int) ($in['id'] ?? 0);
$patch = $in['row'] ?? null;
if ($id <= 0 || !is_array($patch) || !$patch) {
    throw new ApiException(422, 'Body harus berisi "id" dan "row".');
}
$fields = covid_fields();
$unknown = array_diff(array_keys($patch), $fields);
if ($unknown) {
    throw new ApiException(422, 'Kolom tidak dikenal: ' . implode(', ', $unknown));
}
$pdo = db();
$pdo->beginTransaction();
try {
    $ds = require_active_dataset($pdo, true);
    $st = $pdo->prepare('SELECT * FROM covid_records WHERE id = ? AND dataset_id = ? FOR UPDATE');
    $st->execute([$id, $ds['id']]);
    $cur = $st->fetch();
    if (!$cur) {
        throw new ApiException(404, 'Baris tidak ditemukan pada dataset aktif.');
    }
    $merged = array_intersect_key(array_merge($cur, $patch), array_flip($fields));
    $res = validate_rows([$merged], columns_for_dataset($pdo, (int) $ds['id']));
    if ($res['errors']) {
        throw new ApiException(422, 'Validasi backend gagal: ' . errors_summary($res['errors']), ['errors' => $res['errors']]);
    }
    $row = $res['rows'][1];
    $key = row_key($row);
    $dup = $pdo->prepare('SELECT id FROM covid_records WHERE dataset_id = ? AND row_key = ? AND id <> ?');
    $dup->execute([$ds['id'], $key, $id]);
    if ($dup->fetch()) {
        throw new ApiException(409, 'Sudah ada baris lain dengan tanggal, lokasi, dan kota yang sama.');
    }
    $set = implode(', ', array_map(fn($f) => "`$f` = ?", $fields));
    $params = array_map(fn($f) => $row[$f] ?? null, $fields);
    $pdo->prepare("UPDATE covid_records SET $set, row_key = ? WHERE id = ?")->execute(array_merge($params, [$key, $id]));
    refresh_dataset_stats($pdo, (int) $ds['id']);
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    throw $e;
}
ok(['id' => $id, 'row' => $row]);
