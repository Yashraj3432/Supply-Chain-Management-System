"""Supply Chain Management System - Django project package.

If mysqlclient is not installed, fall back to PyMySQL so the MySQL backend
still works (PyMySQL is pure Python and installs anywhere).
"""
try:
    import MySQLdb  # noqa: F401  (provided by mysqlclient)
except ImportError:  # pragma: no cover
    try:
        import pymysql

        pymysql.install_as_MySQLdb()
    except ImportError:
        pass
