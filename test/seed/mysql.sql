-- Seed data for the MySQL and MariaDB test containers (database: datadock_test).
CREATE TABLE users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(255) NOT NULL UNIQUE,
  name        VARCHAR(120),
  active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  user_id   INT NOT NULL,
  title     VARCHAR(200) NOT NULL,
  body      TEXT,
  CONSTRAINT posts_user_fk FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX posts_user_id_idx ON posts (user_id);

INSERT INTO users (email, name, active) VALUES
  ('alice@example.com', 'Alice', 1),
  ('bob@example.com',   'Bob',   1),
  ('carol@example.com', 'Carol', 0);

INSERT INTO posts (user_id, title, body) VALUES
  (1, 'Hello world', 'first post'),
  (1, 'Second post', 'more text'),
  (2, 'Bob writes',  'bob body');
