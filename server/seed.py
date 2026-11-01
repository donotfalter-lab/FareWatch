from datetime import date, timedelta

from app import app
from config import db
from models import PriceCheck, Recommendation, TripWatch, User, utc_now

SEED_PASSWORD = "password123"

# Dates are relative to today so the trips stay in the future whenever this is run.
# Each price is (days_ago, lowest_price, airline, stops).
SEED_DATA = {
    "demo": [
        {
            "origin": "ATL",
            "destination": "LAX",
            "departs_in_days": 45,
            "trip_length_days": 7,
            "travelers": 1,
            "target_price": 280,
            "duration_minutes": 290,
            "prices": [
                (14, 342, "Delta", 0),
                (11, 329, "United", 1),
                (9, 351, "Delta", 0),
                (6, 318, "American", 1),
                (4, 305, "Spirit", 1),
                (2, 322, "Delta", 0),
                (1, 297, "Frontier", 1),
            ],
            "recommendation": {
                "prompt": (
                    "Should I book ATL to LAX now or wait? My target price is $280. "
                    "The latest price is $297, and prices over the past two weeks "
                    "ranged from $297 to $351."
                ),
                "generated_text": (
                    "Wait a little longer. At $297 this is the lowest price in the past two "
                    "weeks and only $17 above your target, so the trend is in your favor. "
                    "Your trip is still more than six weeks away, which leaves time to watch "
                    "for a drop to $280. Run another check in a few days, and book if the "
                    "price reaches your target or starts climbing back above $320."
                ),
            },
        },
        {
            "origin": "ATL",
            "destination": "JFK",
            "departs_in_days": 30,
            "trip_length_days": 4,
            "travelers": 2,
            "target_price": 180,
            "duration_minutes": 145,
            "prices": [
                (14, 214, "Delta", 0),
                (10, 198, "JetBlue", 0),
                (7, 226, "Delta", 0),
                (4, 205, "American", 1),
                (1, 189, "JetBlue", 0),
            ],
        },
        {
            "origin": "ATL",
            "destination": "MIA",
            "departs_in_days": 60,
            "trip_length_days": 5,
            "travelers": 1,
            "target_price": 120,
            "duration_minutes": 125,
            "prices": [
                (13, 148, "American", 0),
                (10, 139, "Delta", 0),
                (8, 155, "American", 0),
                (5, 162, "Delta", 0),
                (3, 144, "Frontier", 0),
                (1, 131, "Spirit", 0),
            ],
        },
    ],
    # demo2 exists so later steps can test that one user can't reach another's records.
    "demo2": [
        {
            "origin": "ATL",
            "destination": "SEA",
            "departs_in_days": 40,
            "trip_length_days": 7,
            "travelers": 1,
            "target_price": 300,
            "duration_minutes": 335,
            "prices": [
                (8, 389, "Alaska", 0),
                (2, 364, "Delta", 0),
            ],
        },
    ],
}


def build_trip(trip_data, user):
    now = utc_now()
    start_date = date.today() + timedelta(days=trip_data["departs_in_days"])
    trip = TripWatch(
        user=user,
        origin=trip_data["origin"],
        destination=trip_data["destination"],
        start_date=start_date,
        end_date=start_date + timedelta(days=trip_data["trip_length_days"]),
        travelers=trip_data["travelers"],
        target_price=trip_data["target_price"],
        created_at=now - timedelta(days=15),
    )

    for days_ago, price, airline, stops in trip_data["prices"]:
        PriceCheck(
            trip_watch=trip,
            lowest_price=price,
            provider="mock",
            details={
                "airline": airline,
                "stops": stops,
                "duration_minutes": trip_data["duration_minutes"],
            },
            checked_at=now - timedelta(days=days_ago),
        )

    if "recommendation" in trip_data:
        Recommendation(trip_watch=trip, **trip_data["recommendation"])


def seed():
    print("Clearing existing data...")
    # Bulk deletes skip the ORM cascade, so children go first.
    Recommendation.query.delete()
    PriceCheck.query.delete()
    TripWatch.query.delete()
    User.query.delete()

    print("Creating users, trip watches, price checks, and recommendations...")
    for username, trips in SEED_DATA.items():
        user = User(username=username)
        user.password_hash = SEED_PASSWORD
        for trip_data in trips:
            build_trip(trip_data, user)
        # Adding the user also adds its trips and their children, through the cascade.
        db.session.add(user)

    db.session.commit()
    print(
        f"Done: {User.query.count()} users, {TripWatch.query.count()} trip watches, "
        f"{PriceCheck.query.count()} price checks, "
        f"{Recommendation.query.count()} recommendations."
    )


if __name__ == "__main__":
    with app.app_context():
        try:
            seed()
        except Exception:
            db.session.rollback()
            raise
