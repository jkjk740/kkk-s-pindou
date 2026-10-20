USE bead_island;
ALTER TABLE bead_users ADD COLUMN display_name VARCHAR(24) NULL;
ALTER TABLE bead_works ADD COLUMN origin_public_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;

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
