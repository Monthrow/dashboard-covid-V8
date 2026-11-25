<?php
// Baca baris dataset aktif per halaman: get.php?offset=0&limit=5000
require __DIR__ . '/../lib/bootstrap.php';
allow_methods('GET');

$pdo = db();
$offset = max(0, (int) ($_GET['offset'] ?? 0));
$limit = min(10000, max(1, (int) ($_GET['limit'] ?? 5000)));
$ds = active_dataset($pdo);
$fields = covid_fields();
if (!$ds) {
    ok(['dataset' => null, 'columns' => $fields, 'rows' => [], 'total' => 0, 'offset' => 0]);
}
$cols = implode(', ', array_map(fn($f) => "`$f`", array_merge(['id'], $fields)));
$st = $pdo->prepare("SELECT $cols FROM covid_records WHERE dataset_id = ? ORDER BY id LIMIT $limit OFFSET $offset");
$st->execute([$ds['id']]);
$rows = [];
while ($r = $st->fetch(PDO::FETCH_NUM)) {
    $rows[] = $r;
}
ok([
    'dataset' => dataset_to_run($ds),
    'columns' => array_merge(['id'], $fields),
    'rows' => $rows,
    'total' => (int) $ds['row_count'],
    'offset' => $offset,
]);
