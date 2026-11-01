from flask import request
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from sqlalchemy.exc import IntegrityError

from config import app, db, jwt
from models import PriceCheck, Recommendation, TripWatch, User

MIN_PASSWORD_LENGTH = 8


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


# ---------- Error handlers ----------

@app.errorhandler(404)
def not_found(e):
    return error("Not found", 404)


@app.errorhandler(ValueError)
def handle_value_error(e):
    db.session.rollback()
    return error(str(e), 400)


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


if __name__ == "__main__":
    app.run(port=5555, debug=True)
