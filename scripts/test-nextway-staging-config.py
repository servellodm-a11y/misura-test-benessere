#!/usr/bin/env python3
"""Static safety checks for the prepared, unlinked NEXTWAY Supabase CLI config."""

from pathlib import Path
import tomllib

config_path = Path("supabase/config.toml")
config = tomllib.loads(config_path.read_text(encoding="utf-8"))

assert config.get("project_id") == "nextway-staging-prepared"
assert "remotes" not in config, "No hosted project may be linked in the committed config."

auth = config.get("auth", {})
assert auth.get("enable_signup") is False
assert auth.get("enable_anonymous_sign_ins") is False
assert auth.get("site_url") == "http://localhost:8000"
redirects = set(auth.get("additional_redirect_urls", []))
assert redirects == {
    "http://localhost:8000/nextway-ai.html",
    "http://localhost:8000/nextway-reset-password.html",
}
assert auth.get("email", {}).get("enable_signup") is False
assert auth.get("email", {}).get("enable_confirmations") is True

assert config.get("studio", {}).get("enabled") is False
assert config.get("analytics", {}).get("enabled") is False
assert config.get("db", {}).get("major_version") is None, (
    "Do not guess the hosted PostgreSQL major version before read-only discovery."
)

serialized = config_path.read_text(encoding="utf-8").lower()
for forbidden in (
    "misura-test-benessere.netlify.app",
    "obqwbtlltxjfeirstsya",
    "service_role",
    "service-role",
    "jwt_secret",
    "password =",
    "secret =",
):
    assert forbidden not in serialized, f"Unexpected production/secret reference: {forbidden}"

print("NEXTWAY staging CLI config: PASS")
print("TOML parses; no hosted project is linked; signups and anonymous sign-ins are disabled; no production URL or secret is present.")
print("No Supabase services were started and no remote project was contacted.")
