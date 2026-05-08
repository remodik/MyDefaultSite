from __future__ import annotations

PLAN_PRICES: dict[str, int] = {
    "1d": 19,
    "7d": 119,
    "30d": 529,
}

PLAN_DAYS: dict[str, int] = {
    "1d": 1,
    "7d": 7,
    "30d": 30,
}

PLAN_LABELS: dict[str, str] = {
    "1d": "1 день",
    "7d": "7 дней",
    "30d": "30 дней",
}


def is_valid_plan(plan: str) -> bool:
    return plan in PLAN_PRICES
