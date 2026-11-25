<?php
// Data acuan untuk "Tambah Data" mode sederhana (hanya membaca, tidak menyimpan).
//   GET  → daftar kota/kabupaten per lokasi pada dataset aktif
//   POST {"items":[{"location","city","date"}]} → untuk tiap baris: baris terakhir lokasi itu sebelum tanggal,
//        baris contoh kota/kabupaten (sumber kolom tetap seperti populasi, luas, koordinat), dan populasi tiap kota.
require __DIR__ . '/../lib/bootstrap.php';
$method = allow_methods('GET', 'POST');

$pdo = db();
$ds = require_active_dataset($pdo);
$dsId = (int) $ds['id'];
$fields = covid_fields();
$pick = function ($row) use ($fields): ?array {
    if (!$row) {
        return null;
    }
    $o = [];
    foreach ($fields as $f) {
        $o[$f] = $row[$f] ?? null;
    }
    return $o;
};

if ($method === 'GET') {
    $st = $pdo->prepare('SELECT location, city_or_regency FROM covid_records WHERE dataset_id = ? AND city_or_regency IS NOT NULL GROUP BY location, city_or_regency ORDER BY location, city_or_regency');
    $st->execute([$dsId]);
    $cities = [];
    foreach ($st->fetchAll() as $r) {
        $cities[$r['location']][] = $r['city_or_regency'];
    }
    ok(['cities' => (object) $cities]);
}

$in = read_json();
$items = $in['items'] ?? null;
if (!is_array($items) || count($items) === 0 || count($items) > 1000) {
    throw new ApiException(422, 'Kirim 1–1000 baris.');
}
$prevSt = $pdo->prepare('SELECT * FROM covid_records WHERE dataset_id = ? AND location = ? AND record_date < ? ORDER BY record_date DESC, id DESC LIMIT 1');
$citySt = $pdo->prepare('SELECT * FROM covid_records WHERE dataset_id = ? AND location = ? AND city_or_regency = ? ORDER BY record_date DESC, id DESC LIMIT 1');
$locSt = $pdo->prepare('SELECT * FROM covid_records WHERE dataset_id = ? AND location = ? ORDER BY record_date DESC, id DESC LIMIT 1');
$popSt = $pdo->prepare("SELECT city_or_regency AS city, MAX(population) AS pop FROM covid_records WHERE dataset_id = ? AND location = ? AND location_level = 'Province' AND city_or_regency IS NOT NULL GROUP BY city_or_regency");
$one = function (PDOStatement $st, array $params): ?array {
    $st->execute($params);
    $r = $st->fetch();
    $st->closeCursor();
    return $r ?: null;
};

$pops = [];
$out = [];
foreach ($items as $it) {
    $loc = is_array($it) ? trim((string) ($it['location'] ?? '')) : '';
    $city = is_array($it) ? trim((string) ($it['city'] ?? '')) : '';
    $date = is_array($it) ? normalize_date($it['date'] ?? '') : null;
    if ($loc === '' || $date === null) {
        $out[] = ['prev' => null, 'template' => null, 'city_pops' => (object) []];
        continue;
    }
    $prev = $one($prevSt, [$dsId, $loc, $date]);
    $tpl = $city !== '' ? $one($citySt, [$dsId, $loc, $city]) : ($prev ?? $one($locSt, [$dsId, $loc]));
    if (!isset($pops[$loc])) {
        $popSt->execute([$dsId, $loc]);
        $m = [];
        foreach ($popSt->fetchAll() as $r) {
            $m[$r['city']] = (int) $r['pop'];
        }
        $pops[$loc] = $m;
    }
    $out[] = ['prev' => $pick($prev), 'template' => $pick($tpl), 'city_pops' => (object) $pops[$loc]];
}
ok(['items' => $out]);
