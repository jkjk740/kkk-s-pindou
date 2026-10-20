#!/usr/bin/env python3
"""Prepare one fresh Douyu deployment; never start services or replace data.

Run as root on Ubuntu 24.04 after installing MySQL 8 and /opt/node24.
If any step fails, inspect the partial installation manually. Do not rerun
after deleting its safety checks or automatically removing existing state.
"""

import argparse
import json
import os
from pathlib import Path
import pwd
import grp
import re
import shutil
import stat
import subprocess
import sys


MYSQL = "/usr/bin/mysql"
DATABASE = "bead_island"
DB_ACCOUNT = "'bead_island_app'@'127.0.0.1'"
TABLE_GRANTS = {
    "bead_users": "SELECT, INSERT, UPDATE",
    "bead_images": "SELECT, INSERT",
    "bead_works": "SELECT, INSERT, UPDATE",
    "bead_public_works": "SELECT, INSERT, UPDATE",
    "bead_public_downloads": "SELECT, INSERT, UPDATE, DELETE",
    "bead_cutout_inputs": "SELECT, INSERT",
    "bead_cutouts": "SELECT, INSERT",
    "bead_cutout_tasks": "SELECT, INSERT, UPDATE",
    "bead_cutout_lock": "SELECT, UPDATE",
}


class InstallError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise InstallError(message)


def exists(path):
    """Include dangling links in all no-overwrite checks."""
    return os.path.lexists(path)


def run(command, *, payload=None, input_file=None, capture=False):
    try:
        result = subprocess.run(
            command,
            input=payload,
            stdin=input_file,
            stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        raise InstallError("A required local administration command failed.") from None
    return result.stdout if capture else None


def mysql(*, sql=None, dump=None, database=None, capture=False):
    command = [MYSQL, "--no-defaults", "--protocol=socket", "--user=root",
               "--default-character-set=utf8mb4", "--batch", "--skip-column-names", "--raw"]
    if database:
        command.append("--database=" + database)
    if dump is not None:
        with dump.open("rb") as stream:
            return run(command, input_file=stream, capture=capture)
    return run(command, payload=sql.encode("utf-8"), capture=capture)


def check_tree(path):
    """Only copy regular files and directories from the unpacked bundle."""
    require(exists(path), "A required bundle file or directory is missing.")
    for directory, names, files in os.walk(path, followlinks=False):
        for candidate in [Path(directory)] + [Path(directory) / n for n in names + files]:
            mode = candidate.lstat().st_mode
            require(stat.S_ISDIR(mode) or stat.S_ISREG(mode),
                    "The bundle contains a link or special file.")


def read_environment(path):
    require(path.stat().st_size <= 65536, "The environment file is unexpectedly large.")
    values = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        match = re.fullmatch(r"([A-Z][A-Z0-9_]*)=(.*)", raw)
        require(match is not None, "The environment file has an unsupported format.")
        key, value = match.groups()
        require(key not in values and "\x00" not in value,
                "The environment file contains an invalid or duplicate setting.")
        values[key] = value
    expected = {
        "NODE_ENV": "production", "HOST": "127.0.0.1", "PORT": "3001",
        "TRUST_PROXY_LOOPBACK": "true",
        "DB_HOST": "127.0.0.1", "DB_PORT": "3306", "DB_NAME": DATABASE,
        "DB_USER": "bead_island_app", "UPLOAD_DIR": "/var/lib/douyu/private-images",
        "CUTOUT_AI_ENABLED": "false",
    }
    require(all(values.get(key) == value for key, value in expected.items()),
            "The environment file does not match the fresh deployment target.")
    require(re.fullmatch(r"[a-fA-F0-9]{64}", values.get("DB_PASSWORD", "")) is not None,
            "The production database password must be 64 hexadecimal characters.")
    return values


def secure_copy_file(source, target, mode, uid=0, gid=0):
    with source.open("rb") as incoming:
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
        with os.fdopen(fd, "wb") as outgoing:
            shutil.copyfileobj(incoming, outgoing)
            os.fchmod(outgoing.fileno(), mode)
            os.fchown(outgoing.fileno(), uid, gid)


def copy_tree(source, target, uid=0, gid=0, directory_mode=0o755, file_mode=0o644):
    target.mkdir(mode=directory_mode)
    os.chown(target, uid, gid)
    os.chmod(target, directory_mode)
    for entry in source.iterdir():
        destination = target / entry.name
        if entry.is_dir():
            copy_tree(entry, destination, uid, gid, directory_mode, file_mode)
        else:
            secure_copy_file(entry, destination, file_mode, uid, gid)


def root_directory(path):
    if not exists(path):
        path.mkdir(mode=0o755)
    require(path.is_dir() and not path.is_symlink() and path.stat().st_uid == 0,
            "A deployment parent directory is unsafe or has an unexpected owner.")
    os.chmod(path, 0o755)


def install(bundle, release_id):
    require(os.geteuid() == 0, "Run this installer as root.")
    require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,63}", release_id) is not None,
            "The release ID must contain only letters, digits and hyphens.")
    require(bundle.is_dir() and not bundle.is_symlink(), "The bundle root must be a directory.")
    bundle = bundle.resolve(strict=True)
    backend = bundle / "release/backend"
    data = bundle / "persistent-data"
    dump = bundle / "migration/database.sql"
    manifest = bundle / "migration/source-manifest.json"
    environment = bundle / "private/backend.env"
    unit = bundle / "deploy/aliyun/douyu-backend.service"
    require(backend.is_dir() and data.is_dir(), "The bundle layout is incomplete.")
    for item in (backend, data, bundle / "migration", bundle / "private", bundle / "deploy"):
        check_tree(item)
    for item in (backend / "package.json", backend / "package-lock.json", dump,
                 manifest, environment, unit):
        require(item.is_file(), "A required bundle file is missing.")
    require((backend / "src/server.cjs").is_file() and (backend / "sql").is_dir(),
            "The backend source or SQL directory is missing.")
    require((data / "private-images").is_dir() and (data / "community-thumbnails").is_dir(),
            "The persistent image directories are missing.")
    for forbidden in (".env", "node_modules", "data"):
        require(not exists(backend / forbidden), "The source bundle contains a forbidden local artifact.")
    require(dump.stat().st_size > 0, "The database dump is empty.")
    with manifest.open("r", encoding="utf-8") as stream:
        require(isinstance(json.load(stream), dict), "The source manifest is invalid.")
    # The source is a trusted mysqldump without --databases or destructive DDL.
    # Refuse accidental DROP/TRUNCATE/USE statements before creating anything.
    with dump.open("rb") as stream:
        for line in stream:
            require(re.match(rb"(?i)^\s*(?:/\*!\d+\s*)?(?:DROP|TRUNCATE|USE)\b", line) is None,
                    "The database dump contains an unsupported destructive or database-selection statement.")
    values = read_environment(environment)
    require(Path(MYSQL).is_file() and os.access(MYSQL, os.X_OK), "The MySQL client is not installed.")
    require(os.access("/opt/node24/bin/node", os.X_OK), "Node 24 is not installed at the expected path.")

    release = Path("/opt/douyu/releases") / release_id
    protected = [Path("/opt/douyu/current"), Path("/var/lib/douyu"),
                 Path("/etc/douyu/backend.env"), release,
                 Path("/etc/systemd/system/douyu-backend.service"),
                 Path("/run/systemd/system/douyu-backend.service"),
                 Path("/usr/lib/systemd/system/douyu-backend.service"),
                 Path("/lib/systemd/system/douyu-backend.service")]
    require(not any(exists(path) for path in protected),
            "Existing deployment or partial installation found; inspect it manually.")
    for parent in (Path("/opt"), Path("/var/lib"), Path("/etc"), Path("/opt/douyu"),
                   Path("/opt/douyu/releases"), Path("/etc/douyu")):
        if exists(parent):
            require(parent.is_dir() and not parent.is_symlink() and parent.stat().st_uid == 0,
                    "A deployment parent directory is unsafe or has an unexpected owner.")
    try:
        pwd.getpwnam("douyu")
    except KeyError:
        pass
    else:
        raise InstallError("The douyu service account already exists; inspect it manually.")
    try:
        grp.getgrnam("douyu")
    except KeyError:
        pass
    else:
        raise InstallError("The douyu service group already exists; inspect it manually.")
    version = mysql(sql="SELECT VERSION();\n", capture=True).decode("ascii").strip()
    require(version.startswith("8."), "This installer requires MySQL 8.")
    state = mysql(sql=(
        "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='bead_island';\n"
        "SELECT COUNT(*) FROM mysql.user WHERE User='bead_island_app' AND Host='127.0.0.1';\n"
    ), capture=True)
    require(state.split() == [b"0", b"0"],
            "The target database or application account already exists; inspect it manually.")

    # From here onward, failure deliberately leaves partial state for inspection.
    run(["/usr/sbin/groupadd", "--system", "douyu"])
    run(["/usr/sbin/useradd", "--system", "--gid", "douyu", "--no-create-home",
         "--home-dir", "/var/lib/douyu", "--shell", "/usr/sbin/nologin", "douyu"])
    account = pwd.getpwnam("douyu")
    for parent in (Path("/opt/douyu"), Path("/opt/douyu/releases")):
        root_directory(parent)
    release.mkdir(mode=0o755)
    os.chmod(release, 0o755)
    destination_backend = release / "backend"
    destination_backend.mkdir(mode=0o755)
    os.chmod(destination_backend, 0o755)
    for directory in ("src", "sql"):
        copy_tree(backend / directory, destination_backend / directory)
    for filename in ("package.json", "package-lock.json"):
        secure_copy_file(backend / filename, destination_backend / filename, 0o644)
    copy_tree(data, Path("/var/lib/douyu"), account.pw_uid, account.pw_gid, 0o700, 0o600)
    Path("/etc/douyu").mkdir(mode=0o700, exist_ok=True)
    os.chmod("/etc/douyu", 0o700)
    secure_copy_file(environment, Path("/etc/douyu/backend.env"), 0o600)

    mysql(sql="CREATE DATABASE `bead_island` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;\n")
    mysql(dump=dump, database=DATABASE)
    imported_tables = mysql(sql=(
        "SELECT TABLE_NAME FROM information_schema.TABLES "
        "WHERE TABLE_SCHEMA='bead_island' ORDER BY TABLE_NAME;\n"
    ), capture=True).decode("ascii").split()
    require(imported_tables == sorted(TABLE_GRANTS),
            "The imported table list does not match the required nine tables; inspect it manually.")
    statements = [f"CREATE USER {DB_ACCOUNT} IDENTIFIED WITH caching_sha2_password BY '{values['DB_PASSWORD']}';"]
    statements.extend(f"GRANT {privileges} ON `bead_island`.`{table}` TO {DB_ACCOUNT};"
                      for table, privileges in TABLE_GRANTS.items())
    mysql(sql="\n".join(statements) + "\n")

    (destination_backend / "data").symlink_to("/var/lib/douyu", target_is_directory=True)
    Path("/opt/douyu/current").symlink_to(release, target_is_directory=True)
    secure_copy_file(unit, Path("/etc/systemd/system/douyu-backend.service"), 0o644)
    run(["/usr/bin/systemctl", "daemon-reload"])
    print(f"Prepared release {release_id}. No service was started or enabled.")
    print("Install Linux production dependencies and verify the migration before starting the backend.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle-root", type=Path, required=True)
    parser.add_argument("--release-id", required=True)
    args = parser.parse_args()
    try:
        install(args.bundle_root, args.release_id)
    except InstallError as error:
        print("Installation stopped: " + str(error), file=sys.stderr)
        return 1
    except (OSError, ValueError, UnicodeError, KeyError):
        print("Installation stopped because a local file or configuration operation failed.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
