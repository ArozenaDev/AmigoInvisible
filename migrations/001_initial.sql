-- Initial PostgreSQL schema. Run explicitly against the intended database;
-- the application does not execute migrations automatically at startup.

CREATE TABLE groups (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  access_password_hash text NOT NULL,
  suggested_budget_amount numeric CHECK (suggested_budget_amount >= 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE participants (
  id text PRIMARY KEY,
  group_id text NOT NULL REFERENCES groups(id),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
  alias text,
  access_pin_hash text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (group_id, id)
);

CREATE TABLE participant_exclusions (
  group_id text NOT NULL REFERENCES groups(id),
  first_participant_id text NOT NULL,
  second_participant_id text NOT NULL,
  PRIMARY KEY (group_id, first_participant_id, second_participant_id),
  FOREIGN KEY (group_id, first_participant_id) REFERENCES participants(group_id, id),
  FOREIGN KEY (group_id, second_participant_id) REFERENCES participants(group_id, id),
  CHECK (first_participant_id COLLATE "C" < second_participant_id COLLATE "C")
);

CREATE TABLE gift_ideas (
  id text PRIMARY KEY,
  group_id text NOT NULL,
  participant_id text NOT NULL,
  title text NOT NULL,
  affiliate_url text NOT NULL,
  image_url text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (group_id, participant_id) REFERENCES participants(group_id, id)
);

-- Edition details stay together so assignment and reveal history are updated
-- atomically. The server validates the document's domain invariants.
CREATE TABLE editions (
  id text PRIMARY KEY,
  group_id text NOT NULL REFERENCES groups(id),
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 9999),
  status text NOT NULL CHECK (status IN ('inactive', 'active', 'closed')),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  UNIQUE (group_id, year),
  CHECK (document->>'id' IS NOT DISTINCT FROM id),
  CHECK (document->>'groupId' IS NOT DISTINCT FROM group_id),
  CHECK (document->>'status' IS NOT DISTINCT FROM status),
  CHECK ((document->>'year')::integer IS NOT DISTINCT FROM year)
);

CREATE UNIQUE INDEX one_active_edition_per_group ON editions(group_id) WHERE status = 'active';

CREATE TABLE sessions (
  id text PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('admin', 'group')),
  group_id text REFERENCES groups(id),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK ((type = 'admin' AND group_id IS NULL) OR (type = 'group' AND group_id IS NOT NULL))
);

CREATE INDEX sessions_expiry ON sessions(expires_at);

-- Only a one-way digest of the scope is kept, never PINs, names or IPs.
CREATE TABLE security_attempts (
  attempt_key text PRIMARY KEY,
  started_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0)
);
