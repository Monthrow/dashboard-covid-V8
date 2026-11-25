<?php
// Validasi + normalisasi ulang di backend (aturan sama dengan src/lib/record-validation.ts).
declare(strict_types=1);

function is_blank($v): bool
{
    return $v === null || (is_string($v) && trim($v) === '');
}

function clean_spaces(string $s): string
{
    return trim((string) preg_replace('/\s+/u', ' ', $s));
}

function acronyms_of(array $values): array
{
    $out = [];
    foreach ($values as $v) {
        foreach (preg_split('/\s+/u', (string) $v) as $w) {
            if (mb_strlen($w) >= 2 && preg_match('/^[A-Z]+$/', $w)) {
                $out[$w] = true;
            }
        }
    }
    return $out;
}

function title_case(string $s, array $acronyms = []): string
{
    $s = mb_strtolower(clean_spaces($s));
    $s = (string) preg_replace_callback('/(^|[\s\-\/(.])(\p{L})/u', fn($m) => $m[1] . mb_strtoupper($m[2]), $s);
    $words = explode(' ', $s);
    foreach ($words as &$w) {
        if (isset($acronyms[mb_strtoupper($w)])) {
            $w = mb_strtoupper($w);
        }
    }
    return implode(' ', $words);
}

function iso_date(int $y, int $m, int $d): ?string
{
    if ($y < 2019 || $y > 2100 || !checkdate($m, $d, $y)) {
        return null;
    }
    return sprintf('%04d-%02d-%02d', $y, $m, $d);
}

function normalize_date($v): ?string
{
    if ((is_int($v) || is_float($v)) && $v > 20000 && $v < 80000) {
        $ts = (int) round(($v - 25569) * 86400);
        return iso_date((int) gmdate('Y', $ts), (int) gmdate('n', $ts), (int) gmdate('j', $ts));
    }
    $s = trim((string) $v);
    if (preg_match('/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/', $s, $m)) {
        return iso_date((int) $m[1], (int) $m[2], (int) $m[3]);
    }
    if (preg_match('/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/', $s, $m)) {
        return iso_date((int) $m[3], (int) $m[2], (int) $m[1]);
    }
    return null;
}

/** @return int|float|null */
function parse_number($v, bool $integer)
{
    if (is_int($v) || is_float($v)) {
        return is_finite((float) $v) ? $v : null;
    }
    if (is_bool($v) || is_array($v)) {
        return null;
    }
    $s = (string) preg_replace('/\s+/u', '', (string) $v);
    if ($s === '') {
        return null;
    }
    if ($integer && preg_match('/^[-+]?\d{1,3}([.,]\d{3})+$/', $s)) {
        $s = str_replace(['.', ','], '', $s);
    } elseif (str_contains($s, '.') && str_contains($s, ',')) {
        $s = strrpos($s, ',') > strrpos($s, '.')
            ? str_replace(',', '.', str_replace('.', '', $s))
            : str_replace(',', '', $s);
    } elseif (str_contains($s, ',')) {
        $s = preg_replace('/,/', '.', $s, 1);
    }
    if (!preg_match('/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i', (string) $s)) {
        return null;
    }
    $n = (float) $s;
    if (!is_finite($n)) {
        return null;
    }
    return ($integer && floor($n) == $n && abs($n) < 9.0e15) ? (int) $n : $n;
}

function normalize_time_zone(string $s): string
{
    if (preg_match('/^utc\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i', $s, $m)) {
        return sprintf('UTC%s%02d:%s', $m[1], (int) $m[2], $m[3] ?? '00');
    }
    return $s;
}

/** @return array{value: mixed}|array{error: string, hint: string} */
function normalize_cell($raw, array $def): array
{
    $example = $def['example'] ?? '';
    if (is_blank($raw)) {
        return !empty($def['required'])
            ? ['error' => 'wajib diisi', 'hint' => "Isi kolom {$def['header']}, contoh: $example"]
            : ['value' => null];
    }
    switch ($def['kind']) {
        case 'date':
            $d = normalize_date($raw);
            return $d !== null ? ['value' => $d]
                : ['error' => 'format tanggal tidak valid', 'hint' => "Gunakan format YYYY-MM-DD atau DD/MM/YYYY, contoh: $example"];
        case 'int':
        case 'decimal':
            $isInt = $def['kind'] === 'int';
            $n = parse_number($raw, $isInt);
            if ($n === null) {
                return ['error' => 'harus berupa angka', 'hint' => "Isi angka tanpa huruf atau simbol, contoh: $example"];
            }
            if ($isInt && !is_int($n)) {
                return ['error' => 'harus bilangan bulat', 'hint' => "Hilangkan angka desimal, contoh: $example"];
            }
            if ((isset($def['min']) && $n < $def['min']) || (isset($def['max']) && $n > $def['max'])) {
                return ['error' => 'nilai di luar rentang yang diizinkan', 'hint' => "Periksa kembali nilainya, contoh: $example"];
            }
            return ['value' => $isInt ? $n : (float) $n];
        case 'category':
            $s = clean_spaces((string) $raw);
            if ($def['field'] === 'time_zone') {
                $s = normalize_time_zone($s);
            }
            $lower = mb_strtolower($s);
            $hit = null;
            foreach ($def['values'] ?? [] as $v) {
                if (mb_strtolower($v) === $lower) {
                    $hit = $v;
                    break;
                }
            }
            if ($hit === null && mb_strlen($lower) >= 4) {
                $cands = array_values(array_filter($def['values'] ?? [], fn($v) => str_contains(' ' . mb_strtolower($v) . ' ', " $lower ")));
                if (count($cands) === 1) {
                    $hit = $cands[0];
                }
            }
            if ($hit === null) {
                $list = implode(', ', array_slice($def['values'] ?? [], 0, 8));
                return ['error' => "“{$s}” bukan nilai yang dikenal pada dataset", 'hint' => "Pilih salah satu: $list"];
            }
            return ['value' => $hit];
        default:
            $s = clean_spaces((string) $raw);
            if (!empty($def['upper'])) {
                $s = mb_strtoupper($s);
            } elseif (!empty($def['titleCase'])) {
                $known = null;
                foreach ($def['values'] ?? [] as $v) {
                    if (mb_strtolower($v) === mb_strtolower($s)) {
                        $known = $v;
                        break;
                    }
                }
                $s = $known ?? title_case($s, acronyms_of($def['values'] ?? []));
            }
            if (isset($def['maxLength']) && mb_strlen($s) > $def['maxLength']) {
                return ['error' => "terlalu panjang (maks. {$def['maxLength']} karakter)", 'hint' => 'Persingkat teksnya'];
            }
            if ($def['field'] === 'location_iso_code' && !preg_match('/^[A-Z]{2,3}(-[A-Z0-9]{1,3})?$/', $s)) {
                return ['error' => 'format kode ISO tidak valid', 'hint' => "Contoh: $example atau IDN"];
            }
            return ['value' => $s];
    }
}

/** Identitas unik baris: tanggal|lokasi|kota (sama dengan rowIdentity di frontend). */
function row_identity(array $r): string
{
    $city = $r['city_or_regency'] ?? null;
    $c = ($city !== null && ($r['location_level'] ?? null) === 'Province' && !preg_match('/^seluruh/i', trim((string) $city)))
        ? mb_strtolower(trim((string) $city)) : '';
    return $r['record_date'] . '|' . mb_strtolower(trim((string) $r['location'])) . '|' . $c;
}

function row_key(array $r): string
{
    return sha1(row_identity($r));
}

/**
 * Validate + normalise rows.
 * @return array{rows: array<int, array>, errors: array<int, array>}
 */
function validate_rows(array $input, ?array $defs = null): array
{
    $defs ??= covid_columns();
    $rows = [];
    $errors = [];
    $seen = [];
    foreach (array_values($input) as $i => $raw) {
        $rowNo = $i + 1;
        if (!is_array($raw)) {
            $errors[] = ['row' => $rowNo, 'field' => '', 'header' => '—', 'message' => 'format baris tidak valid', 'hint' => 'Kirim baris sebagai objek kolom → nilai'];
            continue;
        }
        $out = [];
        $rowOk = true;
        $allBlank = true;
        foreach ($defs as $d) {
            if (!is_blank($raw[$d['field']] ?? null)) {
                $allBlank = false;
            }
        }
        if ($allBlank) {
            $errors[] = ['row' => $rowNo, 'field' => '', 'header' => '—', 'message' => 'baris masih kosong', 'hint' => 'Isi data pada baris ini atau hapus barisnya'];
            continue;
        }
        foreach ($defs as $d) {
            $r = normalize_cell($raw[$d['field']] ?? null, $d);
            if (isset($r['error'])) {
                $rowOk = false;
                $errors[] = ['row' => $rowNo, 'field' => $d['field'], 'header' => $d['header'], 'message' => $r['error'], 'hint' => $r['hint']];
            } else {
                $out[$d['field']] = $r['value'];
            }
        }
        if ($rowOk) {
            $key = row_identity($out);
            if (isset($seen[$key])) {
                $errors[] = ['row' => $rowNo, 'field' => 'record_date', 'header' => 'Date', 'message' => "duplikat dengan baris {$seen[$key]} (tanggal, lokasi, dan kota sama)", 'hint' => 'Ubah tanggal/lokasi/kota atau hapus salah satu baris'];
            } else {
                $seen[$key] = $rowNo;
            }
            $rows[$rowNo] = $out;
        }
    }
    return ['rows' => $rows, 'errors' => $errors];
}
