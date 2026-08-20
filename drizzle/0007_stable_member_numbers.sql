CREATE TABLE IF NOT EXISTS member_id_assignments (
  member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  assigned_number INTEGER NOT NULL UNIQUE,
  basis_date TEXT NOT NULL,
  basis_source TEXT NOT NULL CHECK (basis_source IN ('square', 'discord', 'member_created')),
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS member_id_sequence (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  next_number INTEGER NOT NULL CHECK (next_number >= 1)
);

UPDATE members
SET public_member_id = 'MIG-' || id;

WITH
operator_square_history(email, basis_date) AS (
  VALUES
    ('marina.yamasawa@gmail.com', '2025-08-12'),
    ('xinohenggang@gmail.com', '2025-03-22'),
    ('flagsregister@gmail.com', '2024-10-13'),
    ('koronbinu0827@gmail.com', '2024-04-13'),
    ('rikoriko12241120@gmail.com', '2024-04-13'),
    ('n.lucky-flower.k@ezweb.ne.jp', '2024-04-13'),
    ('eguchi.work0419@gmail.com', '2024-04-13'),
    ('sp.8723.cregao@gmail.com', '2024-04-13'),
    ('u-b.m.l-721-yuu51@docomo.ne.jp', '2024-04-13'),
    ('k1998915n@gmail.com', '2026-01-03')
),
subscription_basis AS (
  SELECT member_id, MIN(subscription_started_at) AS basis_date
  FROM member_subscriptions
  WHERE member_id IS NOT NULL AND subscription_started_at IS NOT NULL
  GROUP BY member_id
),
numbering_basis AS (
  SELECT
    m.id,
    CASE
      WHEN s.basis_date IS NOT NULL AND o.basis_date IS NOT NULL
        THEN MIN(s.basis_date, o.basis_date)
      ELSE COALESCE(s.basis_date, o.basis_date, m.discord_joined_at, m.created_at)
    END AS basis_date,
    CASE
      WHEN s.basis_date IS NOT NULL OR o.basis_date IS NOT NULL THEN 'square'
      WHEN m.discord_joined_at IS NOT NULL THEN 'discord'
      ELSE 'member_created'
    END AS basis_source,
    CASE
      WHEN m.account_status = 'active' AND (
        m.access_role IN ('club_leader', 'operator', 'admin')
        OR m.role IN ('operator', 'admin')
        OR EXISTS (
          SELECT 1 FROM member_subscriptions active_subscription
          WHERE active_subscription.member_id = m.id
            AND active_subscription.access_status IN ('active', 'grace')
        )
      ) THEN 0
      WHEN m.account_status = 'active' THEN 1
      ELSE 2
    END AS member_priority,
    LOWER(m.email) AS email_sort
  FROM members m
  LEFT JOIN subscription_basis s ON s.member_id = m.id
  LEFT JOIN operator_square_history o ON o.email = LOWER(m.email)
),
numbered AS (
  SELECT
    id,
    basis_date,
    basis_source,
    ROW_NUMBER() OVER (
      ORDER BY member_priority, basis_date, email_sort, id
    ) AS assigned_number
  FROM numbering_basis
)
INSERT INTO member_id_assignments
  (member_id, assigned_number, basis_date, basis_source, assigned_at)
SELECT id, assigned_number, basis_date, basis_source, CURRENT_TIMESTAMP
FROM numbered;

UPDATE members
SET public_member_id = (
  SELECT printf('IRO%04d', assignment.assigned_number)
  FROM member_id_assignments assignment
  WHERE assignment.member_id = members.id
);

INSERT INTO member_id_sequence (singleton, next_number)
VALUES (
  1,
  COALESCE((SELECT MAX(assigned_number) + 1 FROM member_id_assignments), 1)
)
ON CONFLICT(singleton) DO UPDATE SET
  next_number = MAX(member_id_sequence.next_number, excluded.next_number);

CREATE TRIGGER IF NOT EXISTS trg_members_assign_public_member_id
AFTER INSERT ON members
WHEN NEW.public_member_id IS NULL OR NEW.public_member_id = ''
BEGIN
  UPDATE member_id_sequence
  SET next_number = next_number + 1
  WHERE singleton = 1;

  UPDATE members
  SET public_member_id = printf(
    'IRO%04d',
    (SELECT next_number - 1 FROM member_id_sequence WHERE singleton = 1)
  )
  WHERE id = NEW.id;

  INSERT INTO member_id_assignments
    (member_id, assigned_number, basis_date, basis_source, assigned_at)
  VALUES (
    NEW.id,
    (SELECT next_number - 1 FROM member_id_sequence WHERE singleton = 1),
    COALESCE(NEW.created_at, CURRENT_TIMESTAMP),
    'member_created',
    CURRENT_TIMESTAMP
  );
END;

UPDATE system_metadata
SET value = '8', updated_at = CURRENT_TIMESTAMP
WHERE key = 'platform_schema_version';

PRAGMA optimize;
