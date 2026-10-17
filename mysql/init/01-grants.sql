-- Runs once when the MySQL volume is first created.
-- Lets the app user create the throwaway test database used by `python manage.py test`.
GRANT ALL PRIVILEGES ON `test_scm_db`.* TO 'scm_user'@'%';
FLUSH PRIVILEGES;
