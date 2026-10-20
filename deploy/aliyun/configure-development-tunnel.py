#!/usr/bin/env python3
"""Create a fresh, source-restricted SSH account for the Douyu local tunnel.

Run through the existing root SSH connection. This script retains the root
authorized_keys file and does not generate a key, start a tunnel or restart ssh.
If it stops after creating an account, inspect that partial state manually.
"""

import base64
import binascii
import grp
import ipaddress
import os
from pathlib import Path
import pwd
import stat
import subprocess
import sys
import tempfile


ACCOUNT = "douyu-tunnel"
HOME = Path("/var/lib/douyu-tunnel")
ROOT_KEYS = Path("/root/.ssh/authorized_keys")
CONFIG = Path("/etc/ssh/sshd_config")
KEY_COMMENT = "pindou-ecs-deploy-20261019"
MARKER = "PINDOU DEVELOPMENT TUNNEL douyu-tunnel"
SSHD = "/usr/sbin/sshd"
MATCH_BLOCK = f"""
# BEGIN {MARKER}
Match User {ACCOUNT}
    AllowTcpForwarding local
    AllowStreamLocalForwarding no
    PermitOpen 127.0.0.1:3001
    PermitListen none
    AllowAgentForwarding no
    X11Forwarding no
    PermitTTY no
    PermitTunnel no
    ForceCommand /usr/sbin/nologin
# END {MARKER}
"""


class ConfigurationError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise ConfigurationError(message)


def run(command):
    try:
        subprocess.run(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, check=True)
    except (OSError, subprocess.CalledProcessError):
        raise ConfigurationError("A required local administration command failed.") from None


def private_file(path, content, uid=0, gid=0):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as stream:
        os.fchmod(stream.fileno(), 0o600)
        os.fchown(stream.fileno(), uid, gid)
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())


def regular_root_file(path, private=False):
    metadata = path.lstat()
    require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == 0,
            "An administration file is not a regular root-owned file.")
    forbidden = 0o077 if private else 0o022
    require(stat.S_IMODE(metadata.st_mode) & forbidden == 0,
            "An administration file has unsafe permissions.")
    return metadata


def deployment_key(contents):
    matches = []
    for line in contents.decode("utf-8").splitlines():
        fields = line.strip().split()
        if not fields or line.lstrip().startswith("#") or fields[-1] != KEY_COMMENT:
            continue
        require(len(fields) >= 3 and fields[-3] == "ssh-ed25519",
                "The deployment key comment does not identify one Ed25519 key.")
        encoded = fields[-2]
        try:
            decoded = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error):
            raise ConfigurationError("The deployment public key encoding is invalid.") from None
        prefix = b"\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20"
        require(len(decoded) == len(prefix) + 32 and decoded.startswith(prefix),
                "The deployment public key is not an Ed25519 public key.")
        matches.append("ssh-ed25519 " + encoded + " " + KEY_COMMENT)
    require(len(matches) == 1, "The root deployment public key must match exactly once.")
    return matches[0]


def source_address():
    connection = os.environ.get("SSH_CONNECTION", "").split()
    require(len(connection) == 4, "Run through the existing root SSH connection.")
    try:
        source = ipaddress.ip_address(connection[0])
        ipaddress.ip_address(connection[2])
        require(all(1 <= int(port) <= 65535 for port in (connection[1], connection[3])),
                "The SSH connection ports are invalid.")
    except ValueError:
        raise ConfigurationError("The SSH connection address is invalid.") from None
    require(not source.is_unspecified and not source.is_multicast,
            "The SSH source address cannot be used for the tunnel account.")
    return str(source)


def ensure_fresh():
    require(not os.path.lexists(HOME), "The tunnel home already exists; inspect it manually.")
    try:
        pwd.getpwnam(ACCOUNT)
    except KeyError:
        pass
    else:
        raise ConfigurationError("The tunnel account already exists; inspect it manually.")
    try:
        grp.getgrnam(ACCOUNT)
    except KeyError:
        pass
    else:
        raise ConfigurationError("The tunnel group already exists; inspect it manually.")


def replace_config(candidate, metadata):
    os.replace(candidate, CONFIG)
    os.chown(CONFIG, metadata.st_uid, metadata.st_gid)
    os.chmod(CONFIG, stat.S_IMODE(metadata.st_mode))
    directory_fd = os.open(CONFIG.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def configure():
    require(os.geteuid() == 0, "Run this script as root.")
    address = source_address()
    ensure_fresh()
    for directory in (CONFIG.parent, ROOT_KEYS.parent, HOME.parent):
        metadata = directory.lstat()
        require(stat.S_ISDIR(metadata.st_mode) and metadata.st_uid == 0
                and stat.S_IMODE(metadata.st_mode) & 0o022 == 0,
                "An administration parent directory is unsafe.")
    metadata = regular_root_file(CONFIG)
    regular_root_file(ROOT_KEYS, private=True)
    original = CONFIG.read_bytes()
    root_keys = ROOT_KEYS.read_bytes()
    require(MARKER.encode("ascii") not in original,
            "A tunnel configuration marker already exists; inspect it manually.")
    key = deployment_key(root_keys)
    restricted_key = (
        f'from="{address}",no-agent-forwarding,no-X11-forwarding,no-pty,no-user-rc,'
        'permitopen="127.0.0.1:3001" ' + key + "\n"
    ).encode("ascii")
    candidate_contents = original + (b"" if original.endswith(b"\n") else b"\n") + MATCH_BLOCK.encode("ascii")
    backup_directory = Path(tempfile.mkdtemp(prefix=".pindou-tunnel-", dir=CONFIG.parent))
    os.chmod(backup_directory, 0o700)
    private_file(backup_directory / "sshd_config.original", original)
    candidate = backup_directory / "sshd_config.candidate"
    private_file(candidate, candidate_contents)
    run([SSHD, "-t", "-f", str(candidate)])

    run(["/usr/sbin/groupadd", "--system", ACCOUNT])
    run(["/usr/sbin/useradd", "--system", "--gid", ACCOUNT, "--no-create-home",
         "--home-dir", str(HOME), "--shell", "/usr/sbin/nologin", ACCOUNT])
    account = pwd.getpwnam(ACCOUNT)
    HOME.mkdir(mode=0o700)
    os.chown(HOME, account.pw_uid, account.pw_gid)
    os.chmod(HOME, 0o700)
    ssh_directory = HOME / ".ssh"
    ssh_directory.mkdir(mode=0o700)
    os.chown(ssh_directory, account.pw_uid, account.pw_gid)
    os.chmod(ssh_directory, 0o700)
    private_file(ssh_directory / "authorized_keys", restricted_key, account.pw_uid, account.pw_gid)
    require(CONFIG.read_bytes() == original and ROOT_KEYS.read_bytes() == root_keys,
            "An administration file changed during preparation; inspect it manually.")

    replaced = False
    try:
        # Mark the replacement before it starts so a metadata/fsync failure also
        # restores the original contents instead of leaving an unreviewed file.
        replaced = True
        replace_config(candidate, metadata)
        run([SSHD, "-t", "-f", str(CONFIG)])
        run(["/usr/bin/systemctl", "reload", "ssh.service"])
    except (ConfigurationError, OSError):
        if replaced:
            restoration = backup_directory / "sshd_config.restore"
            private_file(restoration, original)
            replace_config(restoration, metadata)
        raise ConfigurationError(
            "SSH configuration was restored; the new account remains for manual inspection."
        ) from None
    print("Configured douyu-tunnel for local forwarding to 127.0.0.1:3001.")
    print("The original root authorized_keys file was retained. Verify the tunnel before revoking root access.")


def main():
    try:
        configure()
    except ConfigurationError as error:
        print("Configuration stopped: " + str(error), file=sys.stderr)
        return 1
    except (OSError, ValueError, UnicodeError, KeyError):
        print("Configuration stopped; inspect the original SSH configuration and any partial account state.",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
