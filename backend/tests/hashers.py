"""Test-only Argon2id hasher: same algorithm (argon2id), much lower cost, to keep tests fast."""

from django.contrib.auth.hashers import Argon2PasswordHasher


class FastArgon2PasswordHasher(Argon2PasswordHasher):
    time_cost = 1
    memory_cost = 1024
    parallelism = 1
