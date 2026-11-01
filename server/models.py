import math
from datetime import date, datetime, timezone

from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import validates

from config import bcrypt, db

VALID_TRIP_TYPES = ("flight", "hotel")
VERDICTS = ("BOOK NOW", "KEEP WATCHING", "NOT ENOUGH DATA")
MAX_PASSWORD_BYTES = 72  # bcrypt raises an error on anything longer


def utc_now():
    # SQLite drops timezone info, so we always store plain UTC datetimes.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def is_positive_number(value):
    # bool counts as an int in Python, and JSON can carry NaN and Infinity.
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and value > 0
    )


def parse_date(key, value):
    # The API receives dates as "YYYY-MM-DD" strings; the Date column needs date objects.
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        raise ValueError(f"{key} must be a date in YYYY-MM-DD format.")


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, unique=True, nullable=False)
    _password_hash = db.Column(db.String, nullable=False)

    trip_watches = db.relationship(
        "TripWatch", back_populates="user", cascade="all, delete-orphan"
    )

    @hybrid_property
    def password_hash(self):
        raise AttributeError("Password hashes may not be viewed.")

    @password_hash.setter
    def password_hash(self, password):
        encoded = password.encode("utf-8")
        if len(encoded) > MAX_PASSWORD_BYTES:
            raise ValueError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes")
        self._password_hash = bcrypt.generate_password_hash(encoded).decode("utf-8")

    def authenticate(self, password):
        encoded = password.encode("utf-8")
        if len(encoded) > MAX_PASSWORD_BYTES:
            return False
        return bcrypt.check_password_hash(self._password_hash, encoded)

    def to_dict(self):
        return {"id": self.id, "username": self.username}

    def __repr__(self):
        return f"<User {self.id} {self.username}>"


class TripWatch(db.Model):
    __tablename__ = "trip_watches"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    trip_type = db.Column(db.String, nullable=False, default="flight")
    origin = db.Column(db.String, nullable=False)
    destination = db.Column(db.String, nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date)
    travelers = db.Column(db.Integer, nullable=False, default=1)
    target_price = db.Column(db.Float)
    created_at = db.Column(db.DateTime, default=utc_now)

    user = db.relationship("User", back_populates="trip_watches")
    price_checks = db.relationship(
        "PriceCheck", back_populates="trip_watch", cascade="all, delete-orphan"
    )
    recommendations = db.relationship(
        "Recommendation", back_populates="trip_watch", cascade="all, delete-orphan"
    )

    @validates("origin", "destination")
    def validate_airport(self, key, value):
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{key} must not be empty.")
        return value.strip().upper()

    @validates("trip_type")
    def validate_trip_type(self, key, value):
        if value not in VALID_TRIP_TYPES:
            raise ValueError(f"trip_type must be one of: {', '.join(VALID_TRIP_TYPES)}.")
        return value

    @validates("start_date")
    def validate_start_date(self, key, value):
        if value is None:
            raise ValueError("start_date must not be empty.")
        start_date = parse_date(key, value)
        self.check_date_order(start_date, self.end_date)
        return start_date

    @validates("end_date")
    def validate_end_date(self, key, value):
        end_date = None if value is None else parse_date(key, value)
        self.check_date_order(self.start_date, end_date)
        return end_date

    def check_date_order(self, start_date, end_date):
        if start_date and end_date and end_date < start_date:
            raise ValueError("end_date cannot be before start_date.")

    @validates("travelers")
    def validate_travelers(self, key, value):
        if not isinstance(value, int) or isinstance(value, bool) or value < 1:
            raise ValueError("travelers must be a whole number of at least 1.")
        return value

    @validates("target_price")
    def validate_target_price(self, key, value):
        if value is not None and not is_positive_number(value):
            raise ValueError("target_price must be a positive number.")
        return value

    def latest_check(self):
        if not self.price_checks:
            return None
        return max(self.price_checks, key=lambda check: (check.checked_at, check.id))

    def latest_price(self):
        latest = self.latest_check()
        return latest.lowest_price if latest else None

    def to_dict(self):
        latest_price = self.latest_price()
        return {
            "id": self.id,
            "user_id": self.user_id,
            "trip_type": self.trip_type,
            "origin": self.origin,
            "destination": self.destination,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "travelers": self.travelers,
            "target_price": self.target_price,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "latest_price": latest_price,
            "price_check_count": len(self.price_checks),
            "at_or_below_target": (
                latest_price is not None
                and self.target_price is not None
                and latest_price <= self.target_price
            ),
        }

    def __repr__(self):
        return f"<TripWatch {self.id} {self.origin} to {self.destination}>"


class PriceCheck(db.Model):
    __tablename__ = "price_checks"

    id = db.Column(db.Integer, primary_key=True)
    trip_watch_id = db.Column(
        db.Integer, db.ForeignKey("trip_watches.id"), nullable=False
    )
    lowest_price = db.Column(db.Float, nullable=False)
    currency = db.Column(db.String, nullable=False, default="USD")
    provider = db.Column(db.String)
    details = db.Column(db.JSON)
    checked_at = db.Column(db.DateTime, default=utc_now)

    trip_watch = db.relationship("TripWatch", back_populates="price_checks")

    @validates("lowest_price")
    def validate_lowest_price(self, key, value):
        if not is_positive_number(value):
            raise ValueError("lowest_price must be a positive number.")
        return value

    def to_dict(self):
        return {
            "id": self.id,
            "trip_watch_id": self.trip_watch_id,
            "lowest_price": self.lowest_price,
            "currency": self.currency,
            "provider": self.provider,
            "details": self.details,
            "checked_at": self.checked_at.isoformat() if self.checked_at else None,
        }

    def __repr__(self):
        return f"<PriceCheck {self.id} {self.lowest_price} {self.currency}>"


class Recommendation(db.Model):
    __tablename__ = "recommendations"

    id = db.Column(db.Integer, primary_key=True)
    trip_watch_id = db.Column(
        db.Integer, db.ForeignKey("trip_watches.id"), nullable=False
    )
    prompt = db.Column(db.Text, nullable=False)
    generated_text = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)

    trip_watch = db.relationship("TripWatch", back_populates="recommendations")

    @validates("prompt", "generated_text")
    def validate_not_blank(self, key, value):
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{key} must not be empty.")
        return value.strip()

    def verdict(self):
        # Models sometimes bold their labels, as in "**BOOK NOW**".
        first_line = self.generated_text.splitlines()[0].strip(" *")
        return first_line if first_line in VERDICTS else None

    def to_dict(self):
        return {
            "id": self.id,
            "trip_watch_id": self.trip_watch_id,
            "prompt": self.prompt,
            "generated_text": self.generated_text,
            "verdict": self.verdict(),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Recommendation {self.id} for TripWatch {self.trip_watch_id}>"
