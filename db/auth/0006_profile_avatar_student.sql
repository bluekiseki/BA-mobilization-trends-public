-- Optional per-profile avatar: the Blue Archive student id whose portrait is shown
-- as the profile picture. NULL means "not set" (the UI falls back to a default student).
ALTER TABLE user_profiles ADD COLUMN avatar_student_id INTEGER;
