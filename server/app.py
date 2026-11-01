from flask import request
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from sqlalchemy.exc import IntegrityError

from config import app, db, jwt
from models import PriceCheck, Recommendation, TripWatch, User, parse_date

MIN_PASSWORD_LENGTH = 8
TRIP_FIELDS = (
    "trip_type", "origin", "destination", "start_date", "end_date", "travelers", "target_price",
)
REQUIRED_TRIP_FIELDS = ("origin", "destination", "start_date", "end_date")


def error(message, status):
    return {"error": message}, status


def auth_payload(user):
    token = create_access_token(identity=str(user.id))
    return {"user": user.to_dict(), "token": token}


def current_user_id():
    return int(get_jwt_identity())


def json_body():
    """Return the request's JSON object, or None if it is missing or not a JSON object."""
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def commit():
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise


def owned_trip(trip_id):
    return TripWatch.query.filter_by(id=trip_id, user_id=current_user_id()).first()


def parse_travelers(value):
    # int() alone would quietly turn 2.5 into 2 and True into 1.
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, str) and value.strip().isdecimal():
        return int(value)
    raise ValueError("travelers must be a whole number.")


def parse_target_price(value):
    if value is None:
        return None
    try:
        if isinstance(value, bool):
            raise ValueError
        return float(value)
    except (TypeError, ValueError):
        raise ValueError("target_price must be a number.")


def parse_trip_fields(data):
    """Return a copy of data with its values converted to the types the model expects."""
    fields = dict(data)
    for key in ("start_date", "end_date"):
        if key in fields:
            fields[key] = parse_date(key, fields[key])
    if "travelers" in fields:
        fields["travelers"] = parse_travelers(fields["travelers"])
    if "target_price" in fields:
        fields["target_price"] = parse_target_price(fields["target_price"])
    return fields


def update_trip_fields(trip, fields):
    # Each date is checked against the other as soon as it is set. Without this, moving
    # both dates later would fail, because the new start is compared to the old end.
    if "start_date" in fields and "end_date" in fields:
        trip.end_date = None
    for key in TRIP_FIELDS:
        if key in fields:
            setattr(trip, key, fields[key])


# ---------- Error handlers ----------

@app.errorhandler(404)
def not_found(e):
    return error("Not found", 404)


@app.errorhandler(405)
def method_not_allowed(e):
    return error("Method not allowed", 405)


@app.errorhandler(500)
def internal_error(e):
    db.session.rollback()
    return error("Something went wrong on the server", 500)


@app.errorhandler(ValueError)
def handle_value_error(e):
    db.session.rollback()
    return error(str(e), 400)


@app.errorhandler(OverflowError)
def handle_overflow_error(e):
    # SQLite integers are 64-bit, so a huge id or traveler count can't even be queried.
    db.session.rollback()
    return error("A number in the request is too large", 400)


@jwt.unauthorized_loader
def missing_token(reason):
    return error("Missing authorization token", 401)


@jwt.invalid_token_loader
def invalid_token(reason):
    return error("Invalid token", 401)


@jwt.expired_token_loader
def expired_token(jwt_header, jwt_payload):
    return error("Token has expired", 401)


# ---------- Routes ----------

@app.route("/")
def index():
    return {"message": "FareWatch API running"}


@app.post("/signup")
def signup():
    data = json_body()
    if data is None:
        return error("Request body must be a JSON object", 400)

    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or not username.strip():
        return error("Username is required", 400)
    if not isinstance(password, str) or not password:
        return error("Password is required", 400)
    if len(password) < MIN_PASSWORD_LENGTH:
        return error(f"Password must be at least {MIN_PASSWORD_LENGTH} characters", 400)

    username = username.strip()
    if User.query.filter_by(username=username).first():
        return error("Username is already taken", 409)

    user = User(username=username)
    user.password_hash = password
    try:
        db.session.add(user)
        db.session.commit()
    except IntegrityError:
        # Two signups can pass the check above at the same moment; the unique column catches it.
        db.session.rollback()
        return error("Username is already taken", 409)
    except Exception:
        db.session.rollback()
        raise

    return auth_payload(user), 201


@app.post("/login")
def login():
    data = json_body() or {}
    username = data.get("username")
    password = data.get("password")

    if isinstance(username, str) and isinstance(password, str):
        user = User.query.filter_by(username=username.strip()).first()
        if user and user.authenticate(password):
            return auth_payload(user), 200

    return error("Invalid username or password", 401)


@app.get("/me")
@jwt_required()
def me():
    user = db.session.get(User, current_user_id())
    if not user:
        return error("User not found", 404)
    return user.to_dict(), 200


@app.get("/trips")
@jwt_required()
def list_trips():
    trips = (
        TripWatch.query.filter_by(user_id=current_user_id())
        .order_by(TripWatch.created_at.desc(), TripWatch.id.desc())
        .all()
    )
    return [trip.to_dict() for trip in trips], 200


@app.post("/trips")
@jwt_required()
def create_trip():
    data = json_body()
    if data is None:
        return error("Request body must be a JSON object", 400)

    missing = [key for key in REQUIRED_TRIP_FIELDS if key not in data]
    if missing:
        return error(f"Missing required field(s): {', '.join(missing)}", 400)

    fields = parse_trip_fields({key: data[key] for key in TRIP_FIELDS if key in data})
    trip = TripWatch(**fields, user_id=current_user_id())
    db.session.add(trip)
    commit()
    return trip.to_dict(), 201


@app.get("/trips/<int:trip_id>")
@jwt_required()
def get_trip(trip_id):
    trip = owned_trip(trip_id)
    if not trip:
        return error("Not found", 404)

    price_checks = sorted(trip.price_checks, key=lambda check: (check.checked_at, check.id))
    recommendations = sorted(
        trip.recommendations, key=lambda rec: (rec.created_at, rec.id), reverse=True
    )
    return {
        **trip.to_dict(),
        "price_checks": [check.to_dict() for check in price_checks],
        "recommendations": [rec.to_dict() for rec in recommendations],
    }, 200


@app.patch("/trips/<int:trip_id>")
@jwt_required()
def update_trip(trip_id):
    trip = owned_trip(trip_id)
    if not trip:
        return error("Not found", 404)

    data = json_body()
    if data is None:
        return error("Request body must be a JSON object", 400)
    if not data:
        return error(f"Provide at least one of: {', '.join(TRIP_FIELDS)}", 400)

    disallowed = sorted(set(data) - set(TRIP_FIELDS))
    if disallowed:
        return error(f"Cannot update field(s): {', '.join(disallowed)}", 400)

    update_trip_fields(trip, parse_trip_fields(data))
    commit()
    return trip.to_dict(), 200


@app.delete("/trips/<int:trip_id>")
@jwt_required()
def delete_trip(trip_id):
    trip = owned_trip(trip_id)
    if not trip:
        return error("Not found", 404)

    db.session.delete(trip)
    commit()
    return "", 204


if __name__ == "__main__":
    app.run(port=5555, debug=True)
