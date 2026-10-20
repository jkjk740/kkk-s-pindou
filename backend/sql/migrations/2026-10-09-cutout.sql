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
ALTER TABLE bead_works ADD COLUMN cutout_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;
