"""Flight price lookups, backed by SerpApi's Google Flights engine."""

import os
import random

import requests

SERPAPI_URL = "https://serpapi.com/search"
TIMEOUT_SECONDS = 20
ROUND_TRIP = 1

MOCK_AIRLINES = ("Delta", "United", "American", "JetBlue", "Southwest", "Alaska")
MOCK_MIN_BASE_PRICE = 180
MOCK_MAX_BASE_PRICE = 450
MOCK_MAX_CHANGE = 0.08


class PriceServiceError(Exception):
    """A failure the user should see, with the HTTP status the API should return."""

    def __init__(self, message, status_code=502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _settings():
    return {
        "api_key": os.environ.get("SERPAPI_KEY", "").strip(),
        "mock": os.environ.get("PRICE_MOCK", "").strip().lower() in ("1", "true", "yes"),
    }


def is_mock_mode():
    settings = _settings()
    return settings["mock"] or not settings["api_key"]


def _route_number(trip):
    # Python's hash() changes on every run. This gives each route the same number every time.
    return sum(ord(letter) for letter in trip.origin + trip.destination)


def _mock_price(trip, last_price):
    if last_price:
        change = random.uniform(-MOCK_MAX_CHANGE, MOCK_MAX_CHANGE)
        price = last_price * (1 + change)
    else:
        price_range = MOCK_MAX_BASE_PRICE - MOCK_MIN_BASE_PRICE + 1
        price = MOCK_MIN_BASE_PRICE + _route_number(trip) % price_range

    stops = random.choice((0, 0, 1))
    return {
        "lowest_price": max(round(price), 1),
        "currency": "USD",
        "provider": "mock",
        "details": {
            "airline": random.choice(MOCK_AIRLINES),
            "stops": stops,
            "duration_minutes": 90 + _route_number(trip) % 300 + stops * 75,
        },
    }


def _translate_api_error(status, message, api_key):
    text = (message or "").lower()

    if "returned any results" in text:
        return PriceServiceError("No flights found for this route and dates.", 404)
    if status in (401, 403) or "api key" in text:
        return PriceServiceError(
            "The flight price service rejected the API key. Check SERPAPI_KEY in server/.env."
        )
    if status == 429 or "run out of searches" in text:
        return PriceServiceError(
            "The flight price service is rate limited or out of searches. Try again later.", 429
        )
    if status >= 500:
        return PriceServiceError(
            "The flight price service is having problems right now. Please try again shortly."
        )
    safe_message = (message or f"status {status}").replace(api_key, "[hidden]")
    return PriceServiceError(f"The flight price service returned an error: {safe_message}")


def _fetch_flights(params):
    # Never show these exceptions' own text: it includes the URL, which has the API key in it.
    try:
        response = requests.get(SERPAPI_URL, params=params, timeout=TIMEOUT_SECONDS)
    except requests.Timeout:
        raise PriceServiceError(
            "The flight price service took too long to respond. Please try again.", 504
        )
    except requests.ConnectionError:
        raise PriceServiceError(
            "Couldn't connect to the flight price service. "
            "Check your internet connection and try again."
        )
    except requests.RequestException:
        raise PriceServiceError("The request to the flight price service failed. Please try again.")

    try:
        data = response.json()
    except ValueError:
        data = None
    if not isinstance(data, dict):
        raise PriceServiceError("The flight price service sent back an unreadable response.")

    # SerpApi reports "no results" as a 200 with an error message, so check for both.
    if response.status_code != 200 or data.get("error"):
        raise _translate_api_error(response.status_code, data.get("error"), params["api_key"])
    return data


def _cheapest_flight(data):
    flights = (data.get("best_flights") or []) + (data.get("other_flights") or [])
    priced = [flight for flight in flights if flight.get("price")]
    return min(priced, key=lambda flight: flight["price"]) if priced else None


def _live_price(trip):
    params = {
        "engine": "google_flights",
        "departure_id": trip.origin,
        "arrival_id": trip.destination,
        "outbound_date": trip.start_date.isoformat(),
        "return_date": trip.end_date.isoformat(),
        "type": ROUND_TRIP,
        "adults": trip.travelers,
        "currency": "USD",
        "hl": "en",
        "api_key": _settings()["api_key"],
    }
    data = _fetch_flights(params)

    cheapest = _cheapest_flight(data)
    if cheapest:
        # A round-trip search lists outbound flights only, so these describe the way there.
        legs = cheapest.get("flights") or [{}]
        lowest_price = cheapest["price"]
        details = {
            "airline": legs[0].get("airline"),
            "stops": len(legs) - 1,
            "duration_minutes": cheapest.get("total_duration"),
        }
    else:
        lowest_price = (data.get("price_insights") or {}).get("lowest_price")
        details = {"airline": None, "stops": None, "duration_minutes": None}

    if not lowest_price:
        raise PriceServiceError("No flights found for this route and dates.", 404)

    return {
        "lowest_price": lowest_price,
        "currency": "USD",
        "provider": "serpapi",
        "details": details,
    }


def check_price(trip, last_price=None):
    """Return the current lowest price for a trip, or raise PriceServiceError."""
    if is_mock_mode():
        return _mock_price(trip, last_price)
    return _live_price(trip)
