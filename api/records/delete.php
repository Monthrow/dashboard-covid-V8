<?php
// Hapus satu baris dari dataset aktif. Body: {"id": 123}
require __DIR__ . '/../lib/bootstrap.php';
allow_methods('POST', 'DELETE');

$in = read_json();
$id = (int) ($in['id'] ?? 0);
if ($id <= 0) {
    throw new ApiException(422, 'Body harus berisi "id".');
}
$pdo = db();
$pdo->beginTransaction();
try {
    $ds = require_active_dataset($pdo, true);
    $st = $pdo->prepare('DELETE FROM covid_records WHERE id = ? AND dataset_id = ?');
    $st->execute([$id, $ds['id']]);
    if ($st->rowCount() !== 1) {
        throw new ApiException(404, 'Baris tidak ditemukan pada dataset aktif.');
    }
    refresh_dataset_stats($pdo, (int) $ds['id']);
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    throw $e;
}
ok(['id' => $id, 'deleted' => true]);
