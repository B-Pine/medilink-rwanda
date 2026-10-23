"""Malware scanner interface (contract §2.4): `ClamdScanner` in deployments, `FakeScanner` in
tests and development (`check --deploy` refuses it)."""

from __future__ import annotations

import socket
import struct
from dataclasses import dataclass
from typing import BinaryIO, Literal, Protocol

from medilink.uploads.conf import upload_settings

Verdict = Literal["clean", "infected", "error"]

# The standard antivirus test string (not malware): https://www.eicar.org/download-anti-malware-testfile/
EICAR = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"

_CHUNK = 64 * 1024


@dataclass(frozen=True)
class ScanVerdict:
    verdict: Verdict
    signature: str = ""
    engine_version: str = ""


class Scanner(Protocol):
    def scan(self, stream: BinaryIO) -> ScanVerdict: ...


class FakeScanner:
    """Reports the EICAR test string as infected, everything else as clean."""

    engine_version = "fake-1"

    def scan(self, stream: BinaryIO) -> ScanVerdict:
        tail = b""
        while chunk := stream.read(_CHUNK):
            if EICAR in tail + chunk:
                return ScanVerdict("infected", "Eicar-Test-Signature", self.engine_version)
            tail = chunk[-len(EICAR) :]
        return ScanVerdict("clean", "", self.engine_version)


class ClamdScanner:
    """Minimal clamd client: INSTREAM over TCP (zINSTREAM, length-prefixed chunks)."""

    def __init__(self, host: str, port: int, timeout: float = 30.0) -> None:
        self.host = host
        self.port = port
        self.timeout = timeout

    def _connect(self) -> socket.socket:
        return socket.create_connection((self.host, self.port), timeout=self.timeout)

    def _command(self, command: bytes) -> bytes:
        with self._connect() as conn:
            conn.sendall(b"z" + command + b"\x00")
            return _read_reply(conn)

    def version(self) -> str:
        return self._command(b"VERSION").decode("utf-8", "replace").strip()

    def scan(self, stream: BinaryIO) -> ScanVerdict:
        try:
            with self._connect() as conn:
                conn.sendall(b"zINSTREAM\x00")
                while chunk := stream.read(_CHUNK):
                    conn.sendall(struct.pack("!L", len(chunk)) + chunk)
                conn.sendall(struct.pack("!L", 0))
                reply = _read_reply(conn).decode("utf-8", "replace").strip()
        except OSError as exc:
            return ScanVerdict("error", type(exc).__name__)
        # "stream: OK" | "stream: Eicar-Signature FOUND" | "... ERROR"
        _, _, result = reply.partition(": ")
        if result == "OK":
            return ScanVerdict("clean", "", "clamd")
        if result.endswith(" FOUND"):
            return ScanVerdict("infected", result.removesuffix(" FOUND")[:200], "clamd")
        return ScanVerdict("error", result[:200], "clamd")


def _read_reply(conn: socket.socket) -> bytes:
    data = b""
    while not data.endswith(b"\x00"):
        chunk = conn.recv(4096)
        if not chunk:
            break
        data += chunk
    return data.rstrip(b"\x00")


def get_scanner() -> Scanner:
    conf = upload_settings()
    if conf.scanner == "clamd":
        return ClamdScanner(conf.clamd_host, conf.clamd_port, conf.clamd_timeout)
    if conf.scanner == "fake":
        return FakeScanner()
    raise ValueError(f"Unknown UPLOADS_SCANNER {conf.scanner!r}")
