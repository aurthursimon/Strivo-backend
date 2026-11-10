#!/usr/bin/env python3
"""Non-destructive end-to-end security checks for the deployed API.

This script intentionally avoids brute force, destructive payloads, and load
tests. It creates temporary users, validates auth boundaries, then soft-deletes
those users through the public API.
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
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


DEFAULT_API_BASE_URL = "http://localhost:3000"
DEFAULT_ALLOWED_ORIGIN = "http://localhost:5173"
DEFAULT_EVIL_ORIGIN = "https://evil.example"


@dataclass
class Response:
    status: int
    headers: dict[str, list[str]]
    body: bytes
    error: str | None = None

    def header(self, name: str) -> str | None:
        values = self.headers.get(name.lower())
        if not values:
            return None
        return ", ".join(values)

    def json(self) -> Any:
        return json.loads(self.body.decode("utf-8"))

    def text(self) -> str:
        return self.body.decode("utf-8", errors="replace")


class SecurityE2E:
    def __init__(
        self,
        api_base_url: str,
        allowed_origin: str,
        evil_origin: str,
        direct_ec2_ip: str | None,
        allow_public_docs: bool,
        profile: str,
    ) -> None:
        self.api_base_url = api_base_url.rstrip("/")
        self.allowed_origin = allowed_origin
        self.evil_origin = evil_origin
        self.direct_ec2_ip = direct_ec2_ip
        self.allow_public_docs = allow_public_docs
        self.profile = profile
        self.failures = 0
        self.warnings = 0
        self.ssl_context = ssl.create_default_context()
        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookie_jar),
            urllib.request.HTTPSHandler(context=self.ssl_context),
        )

    def request(
        self,
        method: str,
        path_or_url: str,
        *,
        json_body: Any | None = None,
        raw_body: bytes | None = None,
        headers: dict[str, str] | None = None,
        token: str | None = None,
        timeout: float = 10,
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
        except Exception as exc:  # network failures are meaningful for direct IP tests
            return Response(status=0, headers={}, body=b"", error=str(exc))

    @staticmethod
    def normalize_headers(headers: Any) -> dict[str, list[str]]:
        normalized: dict[str, list[str]] = {}
        for key, value in headers.items():
            normalized.setdefault(key.lower(), []).append(value)
        return normalized

    def pass_(self, name: str, detail: str = "") -> None:
        suffix = f" - {detail}" if detail else ""
        print(f"PASS {name}{suffix}")

    def warn(self, name: str, detail: str = "") -> None:
        self.warnings += 1
        suffix = f" - {detail}" if detail else ""
        print(f"WARN {name}{suffix}")

    def fail(self, name: str, detail: str = "") -> None:
        self.failures += 1
        suffix = f" - {detail}" if detail else ""
        print(f"FAIL {name}{suffix}")

    def expect(self, condition: bool, name: str, detail: str = "") -> None:
        if condition:
            self.pass_(name, detail)
        else:
            self.fail(name, detail)

    def contains_sensitive_error(self, res: Response) -> bool:
        body = res.text().lower()
        needles = [
            "prisma",
            "stack",
            "trace",
            "exception",
            "database_url",
            "jwt_access_secret",
            "jwt_refresh_secret",
            "revenuecat_secret_api_key",
            "revenuecat_webhook_signing_secret",
            "gemini_api_key",
            "openai_api_key",
        ]
        return any(needle in body for needle in needles)

    def profile_at_least_heavy(self) -> bool:
        return self.profile in ("heavy", "paranoid")

    def profile_is_paranoid(self) -> bool:
        return self.profile == "paranoid"

    def extract_token(self, res: Response) -> str | None:
        try:
            payload = res.json()
            data = payload.get("data", payload) if isinstance(payload, dict) else {}
            token = data.get("accessToken") if isinstance(data, dict) else None
            return token if isinstance(token, str) and token else None
        except Exception:
            return None

    def cookie_value(self, name: str) -> str | None:
        for cookie in self.cookie_jar:
            if cookie.name == name:
                return cookie.value
        return None

    def b64url_json(self, value: dict[str, Any]) -> str:
        raw = json.dumps(value, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")

    def tamper_jwt_payload(self, token: str, updates: dict[str, Any]) -> str | None:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        try:
            padded = parts[1] + "=" * (-len(parts[1]) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
            payload.update(updates)
            return f"{parts[0]}.{self.b64url_json(payload)}.{parts[2]}"
        except Exception:
            return None

    def register_user(self, label: str, use_cookies: bool = True) -> tuple[str | None, str]:
        email = f"security-e2e-{label}-{int(time.time() * 1000)}@example.com"
        res = self.request(
            "POST",
            "/api/auth/register",
            json_body={"email": email, "name": f"Security {label}", "password": "Teste12345!"},
            use_cookies=use_cookies,
        )
        token = self.extract_token(res)
        self.expect(res.status == 201 and bool(token), f"auth register {label}", f"status={res.status}")
        return token, email

    def cleanup_user(self, token: str | None, label: str) -> None:
        if not token:
            return
        res = self.request("DELETE", "/api/users/me", token=token)
        if res.status == 204:
            self.pass_(f"cleanup user {label}")
        else:
            self.warn(f"cleanup user {label}", f"status={res.status}")

    def run_transport_and_headers(self) -> None:
        parsed = urllib.parse.urlparse(self.api_base_url)
        self.expect(parsed.scheme == "https", "api uses https", self.api_base_url)

        res = self.request("GET", "/api/health")
        self.expect(res.status == 200, "health endpoint", f"status={res.status}")
        if res.status == 200:
            try:
                data = res.json().get("data", {})
                db_status = data.get("details", {}).get("database", {}).get("status")
                self.expect(db_status == "up", "health database status", str(db_status))
            except Exception as exc:
                self.fail("health response parse", str(exc))

        x_powered_by = res.header("x-powered-by")
        self.expect(not x_powered_by, "x-powered-by hidden", x_powered_by or "")

        required_headers = [
            "strict-transport-security",
            "x-content-type-options",
            "x-frame-options",
            "referrer-policy",
            "content-security-policy",
        ]
        missing = [header for header in required_headers if not res.header(header)]
        self.expect(not missing, "security headers present", ", ".join(missing))

        if self.direct_ec2_ip:
            direct = self.request(
                "GET",
                f"http://{self.direct_ec2_ip}:3000/api/health",
                timeout=5,
            )
            self.expect(
                direct.status != 200,
                "direct EC2 port 3000 not public",
                direct.error or f"status={direct.status}",
            )

    def run_cors_tests(self) -> None:
        allowed_headers = {
            "Origin": self.allowed_origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization,Content-Type",
        }
        allowed_preflight = self.request("OPTIONS", "/api/users/me", headers=allowed_headers)
        self.expect(
            allowed_preflight.status == 204
            and allowed_preflight.header("access-control-allow-origin") == self.allowed_origin,
            "cors allowed preflight",
            f"status={allowed_preflight.status}",
        )

        evil_headers = {
            "Origin": self.evil_origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization,Content-Type",
        }
        evil_preflight = self.request("OPTIONS", "/api/users/me", headers=evil_headers)
        self.expect(
            evil_preflight.header("access-control-allow-origin") is None,
            "cors rejects untrusted preflight origin",
            f"status={evil_preflight.status}",
        )

        evil_get = self.request("GET", "/api/health", headers={"Origin": self.evil_origin})
        self.expect(
            evil_get.header("access-control-allow-origin") is None,
            "cors rejects untrusted GET origin",
            f"status={evil_get.status}",
        )

    def run_public_surface_tests(self) -> None:
        docs = self.request("GET", "/api/docs")
        docs_json = self.request("GET", "/api/docs-json")
        if self.allow_public_docs:
            self.warn("swagger docs public by explicit override", f"docs={docs.status} json={docs_json.status}")
        else:
            self.expect(docs.status != 200, "swagger ui not public", f"status={docs.status}")
            self.expect(docs_json.status != 200, "openapi json not public", f"status={docs_json.status}")

    def run_paranoid_public_probe_tests(self) -> None:
        probes = [
            "/.env",
            "/api/.env",
            "/api/admin",
            "/admin",
            "/api/metrics",
            "/metrics",
            "/actuator/health",
            "/server-status",
            "/api/swagger",
            "/swagger",
            "/api/graphql",
            "/graphql",
            "/api/debug",
            "/debug",
        ]
        for path in probes:
            res = self.request("GET", path)
            self.expect(res.status != 200, f"public probe closed {path}", f"status={res.status}")
            self.expect(not self.contains_sensitive_error(res), f"public probe no internals {path}")

    def run_paranoid_auth_matrix_tests(self) -> None:
        protected_routes = [
            ("GET", "/api/users/me", None),
            ("PATCH", "/api/users/me", {"name": "No Auth"}),
            ("DELETE", "/api/users/me", None),
            ("GET", "/api/meals", None),
            ("POST", "/api/meals", {"type": "LUNCH", "items": []}),
            ("GET", "/api/goals/active", None),
            ("POST", "/api/goals", {"type": "MAINTAIN", "dailyCalories": 2000}),
            ("PATCH", "/api/goals/not-real", {"dailyCalories": 2000}),
            ("GET", "/api/billing/status", None),
            ("GET", "/api/notification-preferences", None),
            ("PATCH", "/api/notification-preferences", {"breakfast": False}),
            ("POST", "/api/notification-preferences/push-subscription", {"subscription": {}}),
            ("GET", "/api/streaks", None),
            ("GET", "/api/achievements", None),
            ("GET", "/api/referrals/me", None),
            ("GET", "/api/analytics/weekly", None),
            ("GET", "/api/analytics/weight-trend", None),
            ("GET", "/api/daily-log/today", None),
            ("POST", "/api/daily-log/weight", {"weightKg": 80}),
            ("POST", "/api/daily-log/water", {"amountMl": 250}),
            ("DELETE", "/api/daily-log/water/not-real", None),
        ]
        for method, path, body in protected_routes:
            res = self.request(method, path, json_body=body)
            self.expect(res.status == 401, f"auth matrix {method} {path}", f"status={res.status}")

    def run_paranoid_auth_header_tests(self, token_a: str | None) -> None:
        if not token_a:
            self.fail("paranoid auth header setup", "missing token")
            return

        cases = [
            ("auth lowercase bearer rejected", {"Authorization": f"bearer {token_a}"}),
            ("auth basic scheme rejected", {"Authorization": "Basic dXNlcjpwYXNz"}),
            ("auth bearer extra token part rejected", {"Authorization": f"Bearer {token_a} extra"}),
            ("auth empty bearer rejected", {"Authorization": "Bearer "}),
            ("auth alternate token header ignored", {"X-Access-Token": token_a}),
        ]
        for name, headers in cases:
            res = self.request("GET", "/api/users/me", headers=headers, use_cookies=False)
            self.expect(res.status == 401, name, f"status={res.status}")

    def run_auth_and_validation_tests(self) -> tuple[str | None, str | None]:
        no_auth = self.request("GET", "/api/users/me")
        self.expect(no_auth.status == 401, "protected route rejects missing jwt", f"status={no_auth.status}")

        bogus = self.request("GET", "/api/users/me", token="abc.def.ghi")
        self.expect(bogus.status == 401, "protected route rejects invalid jwt", f"status={bogus.status}")

        refresh = self.request("POST", "/api/auth/refresh")
        self.expect(refresh.status == 401, "refresh rejects missing cookie", f"status={refresh.status}")

        invalid_register = self.request(
            "POST",
            "/api/auth/register",
            json_body={"email": "bad", "name": "x", "password": "short", "role": "ADMIN"},
        )
        self.expect(invalid_register.status == 400, "validation rejects invalid register", f"status={invalid_register.status}")
        self.expect(
            not self.contains_sensitive_error(invalid_register),
            "validation error does not leak internals",
        )

        malformed_json = self.request(
            "POST",
            "/api/auth/register",
            raw_body=b'{"email":',
            headers={"Content-Type": "application/json"},
        )
        self.expect(malformed_json.status == 400, "malformed json rejected", f"status={malformed_json.status}")
        self.expect(
            not self.contains_sensitive_error(malformed_json),
            "malformed json error does not leak internals",
        )

        sqlish = self.request("GET", "/api/foods/search?q=%27%20OR%201%3D1%20--&limit=3")
        self.expect(sqlish.status == 200, "sql-like search payload stays handled", f"status={sqlish.status}")
        self.expect(not self.contains_sensitive_error(sqlish), "sql-like search does not leak internals")

        token_a, email_a = self.register_user("a")
        if token_a:
            duplicate = self.request(
                "POST",
                "/api/auth/register",
                json_body={"email": email_a, "name": "Security A", "password": "Teste12345!"},
            )
            self.expect(duplicate.status == 409, "duplicate register rejected", f"status={duplicate.status}")

            set_cookie = self.cookie_set_headers()
            self.expect("HttpOnly" in set_cookie, "refresh cookie httponly")
            self.expect("Secure" in set_cookie, "refresh cookie secure")
            self.expect("SameSite=Strict" in set_cookie, "refresh cookie samesite strict")

            refresh_with_cookie = self.request("POST", "/api/auth/refresh")
            self.expect(refresh_with_cookie.status == 200, "refresh with cookie succeeds", f"status={refresh_with_cookie.status}")
            refreshed = self.extract_token(refresh_with_cookie)
            if refreshed:
                token_a = refreshed

            me = self.request("GET", "/api/users/me", token=token_a)
            self.expect(me.status == 200, "valid jwt accesses users/me", f"status={me.status}")

        return token_a, email_a

    def cookie_set_headers(self) -> str:
        parts: list[str] = []
        for cookie in self.cookie_jar:
            parts.append(
                "; ".join(
                    [
                        f"{cookie.name}={cookie.value}",
                        "HttpOnly" if cookie.has_nonstandard_attr("HttpOnly") else "",
                        "Secure" if cookie.secure else "",
                        f"SameSite={cookie.get_nonstandard_attr('SameSite')}"
                        if cookie.has_nonstandard_attr("SameSite")
                        else "",
                    ]
                )
            )
        return "\n".join(parts)

    def run_idor_tests(self, token_a: str | None) -> str | None:
        if not token_a:
            self.fail("idor setup user a", "missing token")
            return None

        token_b, _email_b = self.register_user("b", use_cookies=False)
        if not token_b:
            self.fail("idor setup user b", "missing token")
            return None

        meal_body = {
            "type": "LUNCH",
            "items": [
                {
                    "name": "Security test meal",
                    "portionG": 100,
                    "calories": 120,
                    "proteinG": 5,
                    "carbsG": 20,
                    "fatG": 2,
                }
            ],
        }
        created = self.request("POST", "/api/meals", json_body=meal_body, token=token_a)
        meal_id = None
        try:
            payload = created.json()
            data = payload.get("data", payload)
            meal_id = data.get("id") if isinstance(data, dict) else None
        except Exception:
            pass

        self.expect(created.status == 201 and bool(meal_id), "idor setup meal create", f"status={created.status}")
        if not meal_id:
            self.cleanup_user(token_b, "b")
            return token_b

        other_get = self.request("GET", f"/api/meals/{meal_id}", token=token_b)
        self.expect(other_get.status in (403, 404), "idor other user cannot read meal", f"status={other_get.status}")

        other_delete = self.request("DELETE", f"/api/meals/{meal_id}", token=token_b)
        if other_delete.status in (403, 404):
            self.pass_("idor other user cannot delete meal", f"status={other_delete.status}")
        elif other_delete.status == 200:
            owner_get = self.request("GET", f"/api/meals/{meal_id}", token=token_a)
            if owner_get.status == 200:
                self.warn("idor delete returns 200 for non-owner but does not delete", "prefer 404/403")
            else:
                self.fail("idor non-owner delete removed/blocked owner meal", f"owner_status={owner_get.status}")
        else:
            self.fail("idor other user delete unexpected status", f"status={other_delete.status}")

        self.cleanup_user(token_b, "b")
        return token_b

    def run_heavy_payload_tests(self, token_a: str | None) -> None:
        if not token_a:
            self.fail("heavy setup token", "missing primary token")
            return

        update_payloads = [
            (
                "mass assignment user protected fields",
                {
                    "name": "Security Hardened",
                    "email": "attacker@example.com",
                    "provider": "GOOGLE",
                    "role": "ADMIN",
                    "deletedAt": "2020-01-01T00:00:00.000Z",
                    "compedAccess": True,
                },
            ),
            (
                "prototype pollution payload",
                {
                    "name": "Security Hardened",
                    "__proto__": {"isAdmin": True},
                    "constructor": {"prototype": {"isAdmin": True}},
                },
            ),
            (
                "invalid numeric bounds user profile",
                {"heightCm": 99999, "weightKg": -10, "activityLevel": "ROOT"},
            ),
        ]
        for name, payload in update_payloads:
            res = self.request("PATCH", "/api/users/me", json_body=payload, token=token_a)
            self.expect(res.status == 400, name, f"status={res.status}")
            self.expect(not self.contains_sensitive_error(res), f"{name} does not leak internals")

        bad_goal = self.request(
            "POST",
            "/api/goals",
            json_body={
                "type": "MAINTAIN",
                "dailyCalories": 999999,
                "dailyProteinG": -1,
                "role": "ADMIN",
            },
            token=token_a,
        )
        self.expect(bad_goal.status == 400, "goal invalid bounds and mass assignment rejected", f"status={bad_goal.status}")

        bad_meal = self.request(
            "POST",
            "/api/meals",
            json_body={
                "type": "LUNCH",
                "userId": "victim",
                "items": [
                    {
                        "name": "Heavy payload",
                        "portionG": -5,
                        "calories": 999999,
                        "proteinG": -1,
                        "carbsG": -1,
                        "fatG": -1,
                    }
                ],
            },
            token=token_a,
        )
        self.expect(bad_meal.status == 400, "meal invalid bounds and mass assignment rejected", f"status={bad_meal.status}")

        meal_logic_cases = [
            (
                "meal empty items rejected",
                {"type": "LUNCH", "items": []},
            ),
            (
                "meal negative quantity rejected",
                {
                    "type": "LUNCH",
                    "items": [
                        {
                            "name": "Negative quantity",
                            "portionG": 100,
                            "calories": 100,
                            "proteinG": 10,
                            "carbsG": 10,
                            "fatG": 10,
                            "quantity": -5,
                        }
                    ],
                },
            ),
            (
                "meal absurd aggregate rejected",
                {
                    "type": "LUNCH",
                    "items": [
                        {
                            "name": "Absurd aggregate",
                            "portionG": 100,
                            "calories": 5000,
                            "proteinG": 10,
                            "carbsG": 10,
                            "fatG": 10,
                            "quantity": 3,
                        }
                    ],
                },
            ),
            (
                "meal too many items rejected",
                {
                    "type": "LUNCH",
                    "items": [
                        {
                            "name": f"Item {idx}",
                            "portionG": 100,
                            "calories": 100,
                            "proteinG": 10,
                            "carbsG": 10,
                            "fatG": 10,
                        }
                        for idx in range(25)
                    ],
                },
            ),
            (
                "meal confidence bounds rejected",
                {
                    "type": "LUNCH",
                    "confidence": 99,
                    "items": [
                        {
                            "name": "Confidence abuse",
                            "portionG": 100,
                            "calories": 100,
                            "proteinG": 10,
                            "carbsG": 10,
                            "fatG": 10,
                        }
                    ],
                },
            ),
        ]
        for name, payload in meal_logic_cases:
            res = self.request("POST", "/api/meals", json_body=payload, token=token_a)
            self.expect(res.status == 400, name, f"status={res.status}")
            self.expect(not self.contains_sensitive_error(res), f"{name} no internals")

        no_file_scan = self.request("POST", "/api/meals/scan", token=token_a)
        self.expect(no_file_scan.status == 404, "legacy meal scan route removed", f"status={no_file_scan.status}")
        removed_limit = self.request("GET", "/api/meals/scan-limit", token=token_a)
        self.expect(removed_limit.status == 404, "legacy scan limit route removed", f"status={removed_limit.status}")

        huge_body = {
            "email": f"huge-{int(time.time() * 1000)}@example.com",
            "name": "A" * 250_000,
            "password": "Teste12345!",
        }
        huge = self.request("POST", "/api/auth/register", json_body=huge_body, timeout=15)
        self.expect(huge.status in (400, 413), "large invalid body rejected safely", f"status={huge.status}")
        self.expect(not self.contains_sensitive_error(huge), "large body error does not leak internals")

        weird_paths = [
            "/api/../api/users/me",
            "/api/users/%2e%2e/me",
            "/api/users/me%00",
            "/api/foods/search?q=<script>alert(1)</script>&limit=3",
        ]
        for path in weird_paths:
            res = self.request("GET", path, token=token_a)
            self.expect(res.status < 500, f"weird path handled {path}", f"status={res.status}")
            self.expect(not self.contains_sensitive_error(res), f"weird path no internals {path}")

        method_probes = [
            ("TRACE", "/api/health"),
            ("PUT", "/api/health"),
            ("DELETE", "/api/health"),
        ]
        for method, path in method_probes:
            res = self.request(method, path)
            self.expect(res.status in (404, 405), f"method probe {method} rejected", f"status={res.status}")

        limit_abuse = self.request("GET", "/api/foods/search?q=a&limit=100000&offset=0")
        self.expect(limit_abuse.status < 500, "large limit query does not 500", f"status={limit_abuse.status}")
        if limit_abuse.status == 200:
            try:
                payload = limit_abuse.json()
                data = payload.get("data", payload)
                limit = data.get("limit") if isinstance(data, dict) else None
                if isinstance(limit, int) and limit > 1000:
                    self.warn("large limit accepted", f"limit={limit}; consider server-side max page size")
            except Exception:
                pass

        food_query_cases = [
            ("food search invalid source rejected", "/api/foods/search?q=rice&source=ROOT"),
            ("food search negative limit rejected", "/api/foods/search?q=rice&limit=-1"),
            ("food search huge query rejected", f"/api/foods/search?q={'a' * 500}&limit=3"),
        ]
        for name, path in food_query_cases:
            res = self.request("GET", path)
            self.expect(res.status == 400, name, f"status={res.status}")
            self.expect(not self.contains_sensitive_error(res), f"{name} no internals")

    def run_heavy_token_tests(self, token_a: str | None) -> None:
        if not token_a:
            self.fail("heavy jwt setup", "missing token")
            return

        tampered_payload = self.tamper_jwt_payload(token_a, {"sub": "attacker"})
        if tampered_payload:
            res = self.request("GET", "/api/users/me", token=tampered_payload)
            self.expect(res.status == 401, "jwt tampered payload rejected", f"status={res.status}")

        parts = token_a.split(".")
        if len(parts) >= 2:
            alg_none = f"{self.b64url_json({'alg': 'none', 'typ': 'JWT'})}.{parts[1]}."
            res = self.request("GET", "/api/users/me", token=alg_none)
            self.expect(res.status == 401, "jwt alg none rejected", f"status={res.status}")

        old_refresh = self.cookie_value("nutriscan_refresh")
        fresh = self.request("POST", "/api/auth/refresh")
        self.expect(fresh.status == 200, "heavy refresh rotates token", f"status={fresh.status}")
        if old_refresh:
            replay = self.request(
                "POST",
                "/api/auth/refresh",
                headers={"Cookie": f"nutriscan_refresh={old_refresh}"},
                use_cookies=False,
            )
            self.expect(replay.status == 401, "old refresh token replay rejected", f"status={replay.status}")

    def run_heavy_idor_tests(self, token_a: str | None) -> None:
        if not token_a:
            self.fail("heavy idor setup", "missing token")
            return
        token_b, _email_b = self.register_user("heavy-b", use_cookies=False)
        if not token_b:
            return

        goal = self.request(
            "POST",
            "/api/goals",
            json_body={"type": "MAINTAIN", "dailyCalories": 2100},
            token=token_a,
        )
        goal_id = None
        try:
            data = goal.json().get("data", goal.json())
            goal_id = data.get("id") if isinstance(data, dict) else None
        except Exception:
            pass
        self.expect(goal.status == 201 and bool(goal_id), "heavy idor setup goal", f"status={goal.status}")
        if goal_id:
            other_patch = self.request(
                "PATCH",
                f"/api/goals/{goal_id}",
                json_body={"dailyCalories": 1200},
                token=token_b,
            )
            self.expect(other_patch.status in (403, 404), "idor other user cannot patch goal", f"status={other_patch.status}")

        b_meals = self.request("GET", "/api/meals?limit=20", token=token_b)
        if b_meals.status == 200:
            try:
                data = b_meals.json().get("data", b_meals.json())
                total = data.get("total") if isinstance(data, dict) else None
                self.expect(total == 0, "idor other user meal list isolated", f"total={total}")
            except Exception as exc:
                self.fail("idor other user meal list parse", str(exc))
        else:
            self.fail("idor other user meal list", f"status={b_meals.status}")

        self.cleanup_user(token_b, "heavy-b")

    def run_paranoid_response_shape_tests(self, token_a: str | None) -> None:
        if not token_a:
            self.fail("paranoid response shape setup", "missing token")
            return

        sensitive_keys = {
            "passwordHash",
            "refreshToken",
            "refreshTokens",
            "deletedAt",
        }
        endpoints = [
            ("GET", "/api/users/me"),
            ("GET", "/api/billing/status"),
            ("GET", "/api/referrals/me"),
            ("GET", "/api/notification-preferences"),
            ("GET", "/api/streaks"),
            ("GET", "/api/achievements"),
        ]
        for method, path in endpoints:
            res = self.request(method, path, token=token_a)
            self.expect(res.status == 200, f"response shape {method} {path}", f"status={res.status}")
            text = res.text()
            leaked = [key for key in sensitive_keys if f'"{key}"' in text]
            self.expect(not leaked, f"response omits sensitive fields {path}", ",".join(leaked))

    def run_paranoid_cache_privacy_tests(self, token_a: str | None) -> None:
        if not token_a:
            self.fail("paranoid cache setup", "missing token")
            return

        private_paths = [
            "/api/users/me",
            "/api/billing/status",
            "/api/meals?limit=1",
            "/api/daily-log/today",
        ]
        for path in private_paths:
            res = self.request("GET", path, token=token_a)
            cache_control = (res.header("cache-control") or "").lower()
            self.expect(
                "no-store" in cache_control,
                f"private response no-store {path}",
                cache_control or "missing",
            )

    def run_paranoid_billing_tests(self, token_a: str | None) -> None:
        if not token_a:
            self.fail("paranoid billing setup", "missing token")
            return

        status = self.request("GET", "/api/billing/status", token=token_a)
        self.expect(status.status == 200, "billing status authenticated", f"status={status.status}")
        webhook_no_signature = self.request(
            "POST",
            "/api/billing/apple/notifications",
            raw_body=b'{"signedPayload":"forged.apple.notification.payload"}',
            headers={"Content-Type": "application/json"},
            use_cookies=False,
        )
        self.expect(
            webhook_no_signature.status in (400, 401, 503),
            "purchase webhook without authentication rejected",
            f"status={webhook_no_signature.status}",
        )
        self.expect(
            not self.contains_sensitive_error(webhook_no_signature),
            "purchase webhook without authentication hides internals",
        )

        webhook_bad_signature = self.request(
            "POST",
            "/api/billing/apple/notifications",
            raw_body=b'{"signedPayload":"forged.apple.notification.payload"}',
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer invalid",
                "Origin": self.evil_origin,
            },
            use_cookies=False,
        )
        self.expect(
            webhook_bad_signature.status in (400, 401, 503),
            "purchase webhook bad signature rejected",
            f"status={webhook_bad_signature.status}",
        )
        self.expect(
            not self.contains_sensitive_error(webhook_bad_signature),
            "purchase webhook bad signature hides internals",
        )
        self.expect(
            webhook_bad_signature.header("access-control-allow-origin") is None,
            "purchase webhook does not allow evil cors origin",
        )

    def run_paranoid_business_logic_tests(self, token_a: str | None) -> None:
        if not token_a:
            self.fail("paranoid business setup", "missing token")
            return

        cases = [
            ("daily-log negative weight rejected", "POST", "/api/daily-log/weight", {"weightKg": -10}),
            ("daily-log huge weight rejected", "POST", "/api/daily-log/weight", {"weightKg": 9999}),
            ("daily-log negative water rejected", "POST", "/api/daily-log/water", {"amountMl": -500}),
            ("daily-log huge water rejected", "POST", "/api/daily-log/water", {"amountMl": 100000}),
            (
                "notification impossible time rejected",
                "PATCH",
                "/api/notification-preferences",
                {"breakfastTime": "99:99"},
            ),
            (
                "push subscription non-object rejected",
                "POST",
                "/api/notification-preferences/push-subscription",
                {"subscription": "not-object"},
            ),
            (
                "push subscription malformed shape rejected",
                "POST",
                "/api/notification-preferences/push-subscription",
                {"subscription": {"endpoint": "x", "keys": {"p256dh": "short", "auth": "x"}}},
            ),
        ]
        for name, method, path, payload in cases:
            res = self.request(method, path, json_body=payload, token=token_a)
            self.expect(res.status == 400, name, f"status={res.status}")
            self.expect(not self.contains_sensitive_error(res), f"{name} no internals")

        bad_date = self.request("GET", "/api/daily-log/not-a-date", token=token_a)
        self.expect(bad_date.status == 400, "daily-log invalid date rejected", f"status={bad_date.status}")

        huge_history = self.request("GET", "/api/daily-log/history?days=100000", token=token_a)
        self.expect(huge_history.status == 400, "daily-log huge history range rejected", f"status={huge_history.status}")

        bad_history = self.request("GET", "/api/daily-log/history?days=abc", token=token_a)
        self.expect(bad_history.status == 400, "daily-log invalid history range rejected", f"status={bad_history.status}")

        analytics_huge = self.request("GET", "/api/analytics/weight-trend?days=999999", token=token_a)
        self.expect(analytics_huge.status == 400, "analytics huge days rejected", f"status={analytics_huge.status}")

        public_tdee_abuse = self.request(
            "POST",
            "/api/goals/calculate-tdee",
            json_body={
                "gender": "MALE",
                "weightKg": 9999,
                "heightCm": 9999,
                "ageYears": 9999,
                "activityLevel": "ROOT",
                "goalType": "MAINTAIN",
            },
        )
        self.expect(public_tdee_abuse.status == 400, "public tdee abuse rejected", f"status={public_tdee_abuse.status}")

    def run_paranoid_upload_tests(self, token_a: str | None) -> None:
        if not token_a:
            self.fail("paranoid upload setup", "missing token")
            return

        malformed = self.request(
            "POST",
            "/api/meals/scan",
            raw_body=b"--bad",
            headers={"Content-Type": "multipart/form-data"},
            token=token_a,
        )
        self.expect(malformed.status == 404, "legacy multipart scan route removed", f"status={malformed.status}")

        boundary = "----SecurityE2E"
        body = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="image"; filename="fake.txt"\r\n'
            "Content-Type: text/plain\r\n\r\n"
            "this is not an image\r\n"
            f"--{boundary}--\r\n"
        ).encode("utf-8")
        fake_image = self.request(
            "POST",
            "/api/meals/scan",
            raw_body=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            token=token_a,
            timeout=20,
        )
        self.expect(fake_image.status == 404, "legacy fake-image scan route removed", f"status={fake_image.status}")

    def run_paranoid_session_lifecycle_tests(self) -> None:
        token_logout, _email_logout = self.register_user("logout")
        if token_logout:
            refresh_before_logout = self.cookie_value("nutriscan_refresh")
            logout = self.request("POST", "/api/auth/logout", token=token_logout)
            self.expect(logout.status == 204, "logout succeeds", f"status={logout.status}")
            if refresh_before_logout:
                replay = self.request(
                    "POST",
                    "/api/auth/refresh",
                    headers={"Cookie": f"nutriscan_refresh={refresh_before_logout}"},
                    use_cookies=False,
                )
                self.expect(replay.status == 401, "refresh after logout rejected", f"status={replay.status}")

        token_deleted, email_deleted = self.register_user("deleted-token")
        if token_deleted:
            refresh_before_delete = self.cookie_value("nutriscan_refresh")
            deleted = self.request("DELETE", "/api/users/me", token=token_deleted)
            self.expect(deleted.status == 204, "soft delete setup succeeds", f"status={deleted.status}")
            after_delete = self.request("GET", "/api/billing/status", token=token_deleted, use_cookies=False)
            self.expect(
                after_delete.status == 401,
                "deleted user access token rejected",
                f"status={after_delete.status}",
            )
            if refresh_before_delete:
                refresh_after_delete = self.request(
                    "POST",
                    "/api/auth/refresh",
                    headers={"Cookie": f"nutriscan_refresh={refresh_before_delete}"},
                    use_cookies=False,
                )
                self.expect(
                    refresh_after_delete.status == 401,
                    "deleted user refresh token rejected",
                    f"status={refresh_after_delete.status}",
                )
            login_after_delete = self.request(
                "POST",
                "/api/auth/login",
                json_body={"email": email_deleted, "password": "Teste12345!"},
                use_cookies=False,
            )
            self.expect(
                login_after_delete.status == 401,
                "deleted user login rejected",
                f"status={login_after_delete.status}",
            )

    def run_paranoid_bruteforce_tests(self) -> None:
        token_probe, email_probe = self.register_user("probe")
        if not token_probe:
            self.fail("paranoid brute force setup", "missing token")
            return

        unknown_login = self.request(
            "POST",
            "/api/auth/login",
            json_body={"email": "does-not-exist@example.com", "password": "WrongPass123!"},
            use_cookies=False,
        )
        wrong_login = self.request(
            "POST",
            "/api/auth/login",
            json_body={"email": email_probe, "password": "WrongPass123!"},
            use_cookies=False,
        )
        self.expect(unknown_login.status == 401, "login nonexistent email rejected", f"status={unknown_login.status}")
        self.expect(wrong_login.status == 401, "login wrong password rejected", f"status={wrong_login.status}")

        def one_wrong_attempt(_idx: int) -> int:
            res = self.request(
                "POST",
                "/api/auth/login",
                json_body={"email": email_probe, "password": "WrongPass123!"},
                use_cookies=False,
            )
            return res.status

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            statuses = list(executor.map(one_wrong_attempt, range(20)))

        counts = {status: statuses.count(status) for status in sorted(set(statuses))}
        self.expect(all(status in (401, 429) for status in statuses), "login brute force statuses bounded", str(counts))
        if 429 in counts:
            self.pass_("login brute force rate limited", str(counts))
        else:
            self.warn("login brute force no 429", str(counts))

        still_valid = self.request("GET", "/api/users/me", token=token_probe)
        self.expect(still_valid.status == 200, "account still usable after brute force", f"status={still_valid.status}")
        self.cleanup_user(token_probe, "probe")

    def run_heavy_cors_tests(self) -> None:
        candidate_origins = [
            "null",
            "https://localhost.evil.example",
            f"{self.allowed_origin}.evil.example",
            self.allowed_origin.replace("http://", "https://"),
        ]
        origins = [origin for origin in candidate_origins if origin != self.allowed_origin]
        for origin in origins:
            res = self.request("GET", "/api/health", headers={"Origin": origin})
            self.expect(
                res.header("access-control-allow-origin") is None,
                f"heavy cors rejects origin {origin}",
                f"status={res.status}",
            )

    def run_heavy_rate_limit_smoke(self) -> None:
        total = 60

        def one_request(_idx: int) -> int:
            res = self.request("GET", "/api/health", timeout=10, use_cookies=False)
            return res.status

        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
            statuses = list(executor.map(one_request, range(total)))

        counts = {status: statuses.count(status) for status in sorted(set(statuses))}
        server_errors = sum(1 for status in statuses if status >= 500 or status == 0)
        self.expect(server_errors == 0, "rate smoke no server/network errors", str(counts))
        if 429 in counts:
            self.pass_("rate smoke observed throttling", str(counts))
        else:
            self.warn("rate smoke did not observe 429", f"{counts}; API Gateway may still throttle over a longer window")

    def run(self) -> int:
        print(f"API_BASE_URL={self.api_base_url}")
        print(f"PROFILE={self.profile}")
        self.run_transport_and_headers()
        self.run_cors_tests()
        self.run_public_surface_tests()
        token_a, _email_a = self.run_auth_and_validation_tests()
        self.run_idor_tests(token_a)
        if self.profile_at_least_heavy():
            self.run_heavy_payload_tests(token_a)
            self.run_heavy_token_tests(token_a)
            self.run_heavy_idor_tests(token_a)
            self.run_heavy_cors_tests()
        if self.profile_is_paranoid():
            self.run_paranoid_public_probe_tests()
            self.run_paranoid_auth_matrix_tests()
            self.run_paranoid_auth_header_tests(token_a)
            self.run_paranoid_response_shape_tests(token_a)
            self.run_paranoid_cache_privacy_tests(token_a)
            self.run_paranoid_billing_tests(token_a)
            self.run_paranoid_business_logic_tests(token_a)
            self.run_paranoid_upload_tests(token_a)
            self.run_paranoid_session_lifecycle_tests()
            self.run_paranoid_bruteforce_tests()
        self.cleanup_user(token_a, "a")
        if self.profile_at_least_heavy():
            self.run_heavy_rate_limit_smoke()

        print("")
        print(f"SUMMARY failures={self.failures} warnings={self.warnings}")
        return 1 if self.failures else 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run non-destructive API security E2E checks.")
    parser.add_argument("--api-base-url", default=os.getenv("API_BASE_URL", DEFAULT_API_BASE_URL))
    parser.add_argument("--allowed-origin", default=os.getenv("ALLOWED_ORIGIN", DEFAULT_ALLOWED_ORIGIN))
    parser.add_argument("--evil-origin", default=os.getenv("EVIL_ORIGIN", DEFAULT_EVIL_ORIGIN))
    parser.add_argument("--direct-ec2-ip", default=os.getenv("EC2_IP"))
    parser.add_argument(
        "--profile",
        choices=["standard", "heavy", "paranoid"],
        default=os.getenv("SECURITY_E2E_PROFILE", "standard"),
    )
    parser.add_argument(
        "--allow-public-docs",
        action="store_true",
        default=os.getenv("SECURITY_ALLOW_PUBLIC_DOCS") == "1",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    runner = SecurityE2E(
        api_base_url=args.api_base_url,
        allowed_origin=args.allowed_origin,
        evil_origin=args.evil_origin,
        direct_ec2_ip=args.direct_ec2_ip,
        allow_public_docs=args.allow_public_docs,
        profile=args.profile,
    )
    return runner.run()


if __name__ == "__main__":
    sys.exit(main())
