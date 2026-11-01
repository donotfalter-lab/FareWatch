"""AI book-now-or-wait recommendations for trip watches, backed by Google Gemini."""

import os
from datetime import date

import httpx
from google import genai
from google.genai import errors, types

DEFAULT_MODEL = "gemini-3.8-flash"
MAX_OUTPUT_TOKENS = 500
TIMEOUT_MS = 30_000

NEAR_LOWEST_MARGIN = 1.03
MIN_CHECKS_FOR_ADVICE = 3

SYSTEM_INSTRUCTION = (
    "You are a travel price advisor. Using ONLY the price history provided, tell the "
    "traveler whether to book now or keep watching. Start your answer with exactly one of "
    "these labels on its own line: BOOK NOW, KEEP WATCHING, or NOT ENOUGH DATA. Then give "
    "2 to 4 short sentences explaining why, referring to the actual prices and dates. "
    "Never claim to know future prices, never invent data, and say so when there are "
    "fewer than 3 price checks."
)

BLOCKED_FINISH_REASONS = {
    "SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "LANGUAGE",
}


class AIServiceError(Exception):
    """A failure the user should see, with the HTTP status the API should return."""

    def __init__(self, message, status_code=502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _settings():
    return {
        "api_key": os.environ.get("GEMINI_API_KEY", "").strip(),
        "model": os.environ.get("GEMINI_MODEL", "").strip() or DEFAULT_MODEL,
        "mock": os.environ.get("AI_MOCK", "").strip().lower() in ("1", "true", "yes"),
    }


def is_mock_mode():
    settings = _settings()
    return settings["mock"] or not settings["api_key"]


def _money(amount):
    return f"${amount:,.0f}"


def _price_stats(price_checks):
    """Stats for price checks listed oldest first."""
    prices = [check.lowest_price for check in price_checks]
    return {
        "lowest": min(prices),
        "highest": max(prices),
        "latest": prices[-1],
        "change": prices[-1] - prices[0],
    }


def _build_prompt(trip, price_checks, question):
    target = _money(trip.target_price) if trip.target_price is not None else "none"
    days_until_departure = (trip.start_date - date.today()).days

    if price_checks:
        history = "\n".join(
            f"{check.checked_at.date().isoformat()}: {_money(check.lowest_price)}"
            for check in price_checks
        )
        stats = _price_stats(price_checks)
        direction = "-" if stats["change"] < 0 else "+"
        summary = (
            f"Lowest: {_money(stats['lowest'])}\n"
            f"Highest: {_money(stats['highest'])}\n"
            f"Latest: {_money(stats['latest'])}\n"
            f"Change since the first check: {direction}{_money(abs(stats['change']))}"
        )
    else:
        history = "(no price checks yet)"
        summary = "(no stats yet)"

    return (
        f"Route: {trip.origin} to {trip.destination}\n"
        f"Dates: {trip.start_date.isoformat()} to {trip.end_date.isoformat()}\n"
        f"Travelers: {trip.travelers}\n"
        f"Target price: {target}\n"
        f"Days until departure: {days_until_departure}\n\n"
        f"Price checks (date: lowest price):\n{history}\n\n"
        f"Stats:\n{summary}\n\n"
        f"Traveler's question:\n{question}"
    )


def _not_enough_data_response(price_checks):
    count = len(price_checks)
    if count == 0:
        return (
            "NOT ENOUGH DATA\n"
            "There are no price checks for this trip yet, so there is no history to compare. "
            f"Run at least {MIN_CHECKS_FOR_ADVICE} price checks to get a recommendation."
        )
    checks = "is only 1 price check" if count == 1 else f"are only {count} price checks"
    return (
        "NOT ENOUGH DATA\n"
        f"There {checks} so far, and the latest price is "
        f"{_money(price_checks[-1].lowest_price)}. That is too few to see a trend. "
        f"Run at least {MIN_CHECKS_FOR_ADVICE} price checks to get a recommendation."
    )


def _mock_response(trip, price_checks):
    if len(price_checks) < MIN_CHECKS_FOR_ADVICE:
        return _not_enough_data_response(price_checks)

    stats = _price_stats(price_checks)
    latest = stats["latest"]
    lowest = stats["lowest"]
    target = trip.target_price

    if target is not None and latest <= target:
        return (
            "BOOK NOW\n"
            f"The latest price of {_money(latest)} is at or below your {_money(target)} target. "
            f"Across {len(price_checks)} checks, prices ranged from {_money(lowest)} to "
            f"{_money(stats['highest'])}. Future prices can't be known, but this already "
            "meets your goal."
        )
    if latest <= lowest * NEAR_LOWEST_MARGIN:
        position = (
            "the lowest price seen" if latest == lowest else f"within 3% of the {_money(lowest)} low"
        )
        return (
            "BOOK NOW\n"
            f"The latest price of {_money(latest)} is {position}. Across {len(price_checks)} "
            f"checks, prices ranged from {_money(lowest)} to {_money(stats['highest'])}. "
            "Future prices can't be known, but this is close to the best price seen so far."
        )

    target_note = (
        f" and {_money(latest - target)} above your {_money(target)} target"
        if target is not None
        else ""
    )
    return (
        "KEEP WATCHING\n"
        f"The latest price of {_money(latest)} is {_money(latest - lowest)} above the "
        f"{_money(lowest)} low seen so far{target_note}. Prices have already been lower on this "
        "route, so it is worth running more checks. Future prices can't be known, so book if "
        "the price gets close to that low."
    )


def _thinking_config(model):
    # "Thinking" tokens count against max_output_tokens, which can leave little or
    # nothing for the actual answer. Short drafts don't need much of it.
    if model.startswith("gemini-2.5-flash"):
        return types.ThinkingConfig(thinking_budget=0)
    if model.startswith(("gemini-3", "gemini-4")):
        return types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)
    return None


def _available_models(client):
    try:
        return sorted(
            m.name.removeprefix("models/")
            for m in client.models.list()
            if "generateContent" in (m.supported_actions or [])
        )
    except Exception:
        return []


def _translate_api_error(e, client, model):
    message = (e.message or "").lower()
    status = (e.status or "").upper()

    if e.code == 429 or status == "RESOURCE_EXHAUSTED":
        return AIServiceError(
            "The AI service is rate limited or out of quota. Wait a minute and try again "
            "(free-tier keys have low per-minute and daily limits).",
            429,
        )
    if e.code in (401, 403) or "api key" in message or status in ("UNAUTHENTICATED", "PERMISSION_DENIED"):
        return AIServiceError(
            "The AI service rejected the API key. Check GEMINI_API_KEY in server/.env."
        )
    if e.code == 404 or (status == "NOT_FOUND" and "model" in message):
        available = _available_models(client)
        hint = f" Available models: {', '.join(available)}." if available else ""
        reason = f" Google says: {e.message}" if e.message else ""
        return AIServiceError(
            f"The AI model '{model}' can't be used with this API key. "
            f"Set GEMINI_MODEL in server/.env to a valid model.{reason}{hint}"
        )
    if e.code == 504 or status == "DEADLINE_EXCEEDED":
        return AIServiceError("The AI service took too long to respond. Please try again.", 504)
    if isinstance(e, errors.ServerError):
        return AIServiceError("The AI service is having problems right now. Please try again shortly.")
    return AIServiceError(f"The AI service returned an error: {e.message or e.status or e.code}")


def generate_recommendation(trip, price_checks, question):
    """Return book-or-wait advice for price checks listed oldest first, or raise AIServiceError."""
    settings = _settings()
    if settings["mock"] or not settings["api_key"]:
        return _mock_response(trip, price_checks)

    model = settings["model"]
    client = genai.Client(
        api_key=settings["api_key"],
        http_options=types.HttpOptions(timeout=TIMEOUT_MS),
    )
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION,
        max_output_tokens=MAX_OUTPUT_TOKENS,
        thinking_config=_thinking_config(model),
    )

    try:
        response = client.models.generate_content(
            model=model,
            contents=_build_prompt(trip, price_checks, question),
            config=config,
        )
    except httpx.TimeoutException:
        raise AIServiceError("The AI service took too long to respond. Please try again.", 504)
    except httpx.TransportError:
        raise AIServiceError(
            "Couldn't connect to the AI service. Check your internet connection and try again."
        )
    except errors.APIError as e:
        raise _translate_api_error(e, client, model)

    feedback = response.prompt_feedback
    if feedback and feedback.block_reason:
        raise AIServiceError(
            "The AI service declined to answer this question. Try rephrasing it."
        )

    candidate = response.candidates[0] if response.candidates else None
    finish = candidate.finish_reason.name if candidate and candidate.finish_reason else None
    if finish in BLOCKED_FINISH_REASONS:
        raise AIServiceError(
            "The AI service declined to answer this question. Try rephrasing it."
        )

    text = (response.text or "").strip()
    if not text and finish == "MAX_TOKENS":
        raise AIServiceError(
            "The AI service used up its output limit before writing an answer. Please try again."
        )
    if not text:
        raise AIServiceError("The AI service returned an empty response. Please try again.")
    return text
