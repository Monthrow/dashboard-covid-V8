# Roadmap

- [x] Migrate dashboard, heatmap per provinsi, drill-down Indonesia → Pulau → Provinsi → Kota
- [x] Admin login (single admin, username + password, show/hide) with "Apa Itu COVID-19?" panel
- [x] Landing page: admin identity, logout with confirm, website description, Dashboard + ETL cards, contributors
- [x] ETL page: Extract (upload/drag-drop/preview/columns), Transform (before/after summary), Load (save to Cloud, history, no duplicates)
- [x] Dashboard reads latest ETL load, shows last-updated date, back-to-landing button
- [x] Protect all internal pages; verify full flow

## Migration to Lovable
- [x] Copy app code, images, map boundaries, tests into the Lovable project
- [x] Admin login details saved as project secrets
- [x] Verify login, ETL load and dashboard pages end to end

## MySQL (XAMPP) + PHP Native edition
- [x] SQL file for phpMyAdmin: db_covid_indonesia with covid_records (actual Excel columns) + dataset_metadata
- [x] PHP Native API (PDO, prepared statements, JSON, CORS): dataset upload/get/metadata, records add/bulk-add/update/delete/validate
- [x] ETL Load writes to MySQL (no duplicates, no new dataset when the active one is identical); dashboard reads from MySQL
- [x] "Tambah Data" spreadsheet modal on the Load step (between Buka Dashboard and ETL baru)
- [x] Validation + auto-normalisation on OK; Selesai enabled only when valid; backend re-validates in a transaction
- [x] Dashboard refreshes after save; data survives browser refresh / restart
- [x] Tests for validation/normalisation rules; run API against a local MySQL
- [x] "Tambah Data" simple mode: 6 columns typed, other columns derived from the previous stored row
