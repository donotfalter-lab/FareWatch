from config import app, db
from models import PriceCheck, Recommendation, TripWatch, User


@app.route("/")
def index():
    return {"message": "FareWatch API running"}


if __name__ == "__main__":
    app.run(port=5555, debug=True)
