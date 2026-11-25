-- =====================================================================
-- Database Dashboard COVID-19 Indonesia (MySQL / MariaDB XAMPP)
-- Impor file ini lewat phpMyAdmin: tab "Import" → pilih file → "Go".
-- Struktur covid_records mengikuti 38 kolom asli file
-- covid_19_indonesia_cleaned.xlsx (urutan sama), ditambah kolom internal.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `db_covid_indonesia`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `db_covid_indonesia`;

-- ---------------------------------------------------------------------
-- Metadata dataset (satu dataset aktif menjadi sumber dashboard)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `dataset_metadata` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `dataset_name`  VARCHAR(150) NOT NULL,
  `source_file`   VARCHAR(255) NOT NULL,
  `file_hash`     CHAR(64)     NULL COMMENT 'SHA-256 file terakhir yang dimuat',
  `file_size`     BIGINT UNSIGNED NULL,
  `row_count`     INT UNSIGNED NOT NULL DEFAULT 0,
  `column_count`  SMALLINT UNSIGNED NOT NULL DEFAULT 38,
  `period_start`  DATE NULL,
  `period_end`    DATE NULL,
  `status`        ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `uploaded_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Riwayat proses Load (ETL) dan Tambah Data
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `etl_load_history` (
  `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `dataset_id`         INT UNSIGNED NULL,
  `source`             ENUM('etl','manual') NOT NULL DEFAULT 'etl',
  `file_name`          VARCHAR(255) NOT NULL,
  `file_hash`          CHAR(64) NULL,
  `file_size`          BIGINT UNSIGNED NULL,
  `status`             ENUM('loading','success','skipped','failed') NOT NULL DEFAULT 'loading',
  `rows_read`          INT UNSIGNED NOT NULL DEFAULT 0,
  `rows_valid`         INT UNSIGNED NOT NULL DEFAULT 0,
  `rows_invalid`       INT UNSIGNED NOT NULL DEFAULT 0,
  `duplicates_removed` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'duplikat di dalam file (Transform)',
  `rows_existing`      INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'baris yang sudah ada di database (dilewati)',
  `rows_loaded`        INT UNSIGNED NOT NULL DEFAULT 0,
  `column_count`       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `period_start`       DATE NULL,
  `period_end`         DATE NULL,
  `summary`            LONGTEXT NULL COMMENT 'laporan Transform (JSON)',
  `message`            TEXT NULL,
  `created_at`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at`        DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_dataset` (`dataset_id`),
  CONSTRAINT `fk_history_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `dataset_metadata` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Data utama: satu baris = satu baris Excel
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `covid_records` (
  `id`                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `dataset_id`               INT UNSIGNED NOT NULL,
  `load_id`                  INT UNSIGNED NULL COMMENT 'proses Load yang menyimpan baris ini',
  `row_key`                  CHAR(40) NOT NULL COMMENT 'SHA1(tanggal|lokasi|kota) — identitas unik baris',
  `record_date`              DATE NOT NULL                COMMENT 'Date',
  `location_iso_code`        VARCHAR(10)  NULL            COMMENT 'Location ISO Code',
  `location`                 VARCHAR(100) NOT NULL        COMMENT 'Location',
  `new_cases`                INT NOT NULL                 COMMENT 'New Cases',
  `new_deaths`               INT NOT NULL                 COMMENT 'New Deaths',
  `new_recovered`            INT NOT NULL                 COMMENT 'New Recovered',
  `new_active_cases`         INT NULL                     COMMENT 'New Active Cases',
  `total_cases`              INT NOT NULL                 COMMENT 'Total Cases',
  `total_deaths`             INT NOT NULL                 COMMENT 'Total Deaths',
  `total_recovered`          INT NOT NULL                 COMMENT 'Total Recovered',
  `total_active_cases`       INT NOT NULL                 COMMENT 'Total Active Cases',
  `location_level`           VARCHAR(20)  NOT NULL        COMMENT 'Location Level (Country/Province)',
  `city_or_regency`          VARCHAR(100) NULL            COMMENT 'City or Regency',
  `province`                 VARCHAR(100) NULL            COMMENT 'Province',
  `country`                  VARCHAR(60)  NULL            COMMENT 'Country',
  `continent`                VARCHAR(30)  NULL            COMMENT 'Continent',
  `island`                   VARCHAR(60)  NULL            COMMENT 'Island',
  `time_zone`                VARCHAR(30)  NULL            COMMENT 'Time Zone',
  `special_status`           VARCHAR(60)  NULL            COMMENT 'Special Status',
  `total_regencies`          INT NULL                     COMMENT 'Total Regencies',
  `total_cities`             INT NULL                     COMMENT 'Total Cities',
  `total_districts`          INT NULL                     COMMENT 'Total Districts',
  `total_urban_villages`     INT NULL                     COMMENT 'Total Urban Villages',
  `total_rural_villages`     INT NULL                     COMMENT 'Total Rural Villages',
  `area_km2`                 DOUBLE NULL                  COMMENT 'Area (km2)',
  `population`               BIGINT NULL                  COMMENT 'Population',
  `population_density`       DOUBLE NULL                  COMMENT 'Population Density',
  `longitude`                DOUBLE NULL                  COMMENT 'Longitude',
  `latitude`                 DOUBLE NULL                  COMMENT 'Latitude',
  `new_cases_per_million`    DOUBLE NULL                  COMMENT 'New Cases per Million',
  `total_cases_per_million`  DOUBLE NULL                  COMMENT 'Total Cases per Million',
  `new_deaths_per_million`   DOUBLE NULL                  COMMENT 'New Deaths per Million',
  `total_deaths_per_million` DOUBLE NULL                  COMMENT 'Total Deaths per Million',
  `total_deaths_per_100k`    DOUBLE NULL                  COMMENT 'Total Deaths per 100rb',
  `case_fatality_rate`       DOUBLE NULL                  COMMENT 'Case Fatality Rate',
  `case_recovered_rate`      DOUBLE NULL                  COMMENT 'Case Recovered Rate',
  `growth_factor_new_cases`  DOUBLE NULL                  COMMENT 'Growth Factor of New Cases',
  `growth_factor_new_deaths` DOUBLE NULL                  COMMENT 'Growth Factor of New Deaths',
  `created_at`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dataset_row` (`dataset_id`, `row_key`),
  KEY `idx_dataset_date` (`dataset_id`, `record_date`),
  KEY `idx_load` (`load_id`),
  CONSTRAINT `fk_records_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `dataset_metadata` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
