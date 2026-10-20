CREATE DATABASE IF NOT EXISTS bead_island CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE bead_island;

CREATE TABLE IF NOT EXISTS bead_users (
  id CHAR(66) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  app_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  display_name VARCHAR(24) NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  last_login_at BIGINT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bead_images (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  owner CHAR(66) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  storage_provider VARCHAR(16) NOT NULL,
  storage_key VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  mime_type VARCHAR(32) NOT NULL,
  byte_size BIGINT NOT NULL,
  width INT UNSIGNED NOT NULL,
  height INT UNSIGNED NOT NULL,
  sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE KEY owner_image (owner, id),
  UNIQUE KEY storage_key (storage_key),
  CONSTRAINT images_user FOREIGN KEY (owner) REFERENCES bead_users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bead_works (
  id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  owner CHAR(66) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  client_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_image_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  origin_public_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  cutout_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  pattern JSON NULL,
  completed_rows JSON NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  revision BIGINT UNSIGNED NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY owner_client (owner, client_id),
  KEY owner_source (owner, source_image_id),
  CONSTRAINT works_user FOREIGN KEY (owner) REFERENCES bead_users(id),
  CONSTRAINT works_image FOREIGN KEY (owner, source_image_id) REFERENCES bead_images(owner, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bead_public_works (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  owner CHAR(66) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_work_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_revision BIGINT UNSIGNED NOT NULL,
  title VARCHAR(50) NOT NULL,
  pattern JSON NOT NULL,
  thumbnail_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  download_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  published_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  withdrawn BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY author_source (owner, source_work_id),
  KEY hottest (withdrawn, download_count DESC, published_at DESC, id DESC),
  KEY newest (withdrawn, published_at DESC, id DESC),
  CONSTRAINT public_user FOREIGN KEY (owner) REFERENCES bead_users(id),
  CONSTRAINT public_source FOREIGN KEY (source_work_id) REFERENCES bead_works(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bead_public_downloads (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  public_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  completed_at BIGINT NULL,
  KEY expired_intents (completed_at, expires_at),
  CONSTRAINT download_public FOREIGN KEY (public_id) REFERENCES bead_public_works(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS bead_cutout_inputs (
  owner CHAR(66) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_image_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  input_image_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  version INT NOT NULL DEFAULT 1,
  PRIMARY KEY (owner, source_image_id, version),
  CONSTRAINT cutout_input_source FOREIGN KEY (owner, source_image_id) REFERENCES bead_images(owner, id),
  CONSTRAINT cutout_input_image FOREIGN KEY (owner, input_image_id) REFERENCES bead_images(owner, id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS bead_cutouts (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  owner CHAR(66) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_image_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  input_image_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  mask_image_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  result_image_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  mask_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE KEY cutout_confirmation (owner, request_id),
  CONSTRAINT cutout_owner FOREIGN KEY (owner) REFERENCES bead_users(id),
  CONSTRAINT cutout_source FOREIGN KEY (owner, source_image_id) REFERENCES bead_images(owner, id),
  CONSTRAINT cutout_input FOREIGN KEY (owner, input_image_id) REFERENCES bead_images(owner, id),
  CONSTRAINT cutout_mask FOREIGN KEY (owner, mask_image_id) REFERENCES bead_images(owner, id),
  CONSTRAINT cutout_result FOREIGN KEY (owner, result_image_id) REFERENCES bead_images(owner, id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS bead_cutout_tasks (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  owner CHAR(66) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_image_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  input_image_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status VARCHAR(16) CHARACTER SET ascii NOT NULL,
  mask_image_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  error_code VARCHAR(32) CHARACTER SET ascii NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY cutout_request (owner, request_id),
  KEY cutout_queue (status, created_at),
  KEY cutout_daily (owner, created_at),
  CONSTRAINT cutout_task_owner FOREIGN KEY (owner) REFERENCES bead_users(id),
  CONSTRAINT cutout_task_input FOREIGN KEY (owner, input_image_id) REFERENCES bead_images(owner, id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS bead_cutout_lock (id INT PRIMARY KEY) ENGINE=InnoDB;
INSERT IGNORE INTO bead_cutout_lock (id) VALUES (1);
